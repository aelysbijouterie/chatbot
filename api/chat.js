module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { messages } = req.body;
    const userQuestion = messages[messages.length - 1].content;
    const apiKey = process.env.GROQ_API_KEY;

    // ── Base documentaire ──────────────────────────────────────
    // kb.json est généré automatiquement par build.js à partir des .md dans docs/
    // Schéma de chaque fiche :
    // {
    //   "id": "sav-creation-fiche-sav",
    //   "titre": "Création d'une fiche SAV",
    //   "categorie": "SAV",
    //   "motsClefs": ["sav", "fiche", "garantie", "réparation"],
    //   "contenu": "texte complet de la procédure...",
    //   "type": "procedure",        // "procedure" | "info" | "reference"
    //   "pdfUrl": "https://raw.githubusercontent.com/.../docs/sav/creation-fiche-sav.pdf",
    //   "dateMAJ": "2026-05-12"
    // }
    const docs = require('./kb.json');

    function tokenize(text) {
      return (text || '')
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 3);
    }

    // ── Normalisation des champs (supporte ancien format title/content ET nouveau titre/contenu) ──
    function normalize(doc) {
      return {
        ...doc,
        titre   : doc.titre    || doc.title   || '',
        contenu : doc.contenu  || doc.content  || '',
        motsClefs : doc.motsClefs || doc.keywords || [],
        type    : doc.type     || 'info',
        pdfUrl  : doc.pdfUrl   || doc.pdf      || null,
        dateMAJ : doc.dateMAJ  || null
      };
    }
    const normalizedDocs = (Array.isArray(docs) ? docs : []).map(normalize);

    // ── Scoring pondéré : mots-clés > titre > contenu ──────────
    function score(question, doc) {
      const qWords      = new Set(tokenize(question));
      const contentWords = new Set(tokenize(doc.contenu));
      const titleWords  = new Set(tokenize(doc.titre));
      const keywordWords = new Set(
        (doc.motsClefs || []).flatMap(k => tokenize(String(k)))
      );

      let hits = 0;
      for (const w of qWords) {
        if (keywordWords.has(w)) hits += 3;
        else if (titleWords.has(w))  hits += 2;
        else if (contentWords.has(w)) hits += 1;
      }
      return hits;
    }

    const scored = normalizedDocs
      .map(doc => ({ doc, s: score(userQuestion, doc) }))
      .sort((a, b) => b.s - a.s);

    // Score minimum requis pour considérer un doc comme pertinent
    const MIN_SCORE = 2;
    let topDocs;
    if (!scored.length || scored[0].s < MIN_SCORE) {
      topDocs = [];
    } else if (scored[0].s >= 6 && scored[0].s >= (scored[1]?.s || 0) * 1.5) {
      topDocs = [scored[0].doc];
    } else {
      topDocs = scored.slice(0, 2).filter(x => x.s >= MIN_SCORE).map(x => x.doc);
    }

    const suggestions = scored
      .filter(x => x.s > 0)
      .slice(0, 6)
      .map(x => x.doc.titre)
      .filter(Boolean);

    // Aucun doc pertinent → hors_base immédiat, sans appeler le LLM
    if (topDocs.length === 0) {
      return res.status(200).json({ hors_base: true });
    }

    const context = topDocs
      .map(doc => {
        const stripped = (doc.contenu || '')
          .replace(/!\[.*?\]\(.*?\)\n?/g, '')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
        const content = stripped.length > 2500
          ? stripped.slice(0, 2500)
          : stripped;
        return `## [SOURCE: ${doc.titre}]\n${content}`;
      })
      .join('\n\n---\n\n');

    const systemPrompt = `Tu es AUREL'IA, l'assistante interne d'Aélys Nouvelle-Aquitaine spécialisée en bijouterie.

Tu réponds UNIQUEMENT à partir de la BASE DE CONNAISSANCE fournie ci-dessous. Jamais depuis ta mémoire générale, jamais d'invention.

RÈGLES ABSOLUES :
1. Si le sujet n'est PAS dans la base → réponds uniquement : {"hors_base":true}
2. N'invente JAMAIS une info, un montant, un délai ou une distinction qui n'est pas écrit noir sur blanc dans la base.
3. Ignore les artefacts PDF : numéros de page, entêtes répétés, caractères parasites.
4. Reprends les étapes, distinctions et détails concrets EXACTEMENT tels qu'ils apparaissent dans le document source — ne fais pas un résumé vague, sois précis et actionnable.

FORMAT DE RÉPONSE (toujours ce format) :
→ Une phrase d'intro très courte (1 ligne) : à quoi sert cette procédure / dans quel cas l'utiliser.
→ Les étapes, cas de figure ou points clés en Markdown : liste numérotée (1. 2. 3.) si ce sont des étapes séquentielles, ou liste à puces (-) si ce sont des cas/critères. Utilise **gras** pour les termes ou valeurs importants (montants, délais, noms).
→ Ne raccourcis pas les distinctions importantes (ex: fabricant vs utilisation, fournisseur vs centrale) — donne bien CHAQUE cas avec son traitement.
→ Si et seulement si un document source dans la base a un lien PDF associé, termine par : "📄 Voir la procédure complète en PDF ci-dessous."  Sinon, ne mentionne aucun lien (ta réponse doit alors être complète en elle-même).

Exemple de bonne réponse (cas avec étapes/distinctions) :
"Pour traiter un bijou défectueux, distingue d'abord l'origine du défaut :
- **Défaut de fabrication** : OZ manquant avec griffes intactes, ou griffe sectionnée nette
- **Défaut d'utilisation** : griffe tirée, usure progressive, corps de bague sectionné

Selon la provenance du produit :
1. **Fournisseur direct** : [action et délai précis du document]
2. **Centrale** : [action et délai précis du document]"

BASE DE CONNAISSANCE :
${context}`;

    const historyMessages = messages.slice(-2).map(m => ({
      role: m.role,
      content: m.content
    }));

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-20b',
        max_completion_tokens: 800,
        reasoning_effort: 'low',
        messages: [
          { role: 'system', content: systemPrompt },
          ...historyMessages
        ]
      })
    });

    const data = await groqRes.json();
    if (!groqRes.ok) throw new Error(data.error?.message || 'Erreur Groq');

    const text = (data.choices?.[0]?.message?.content || '').trim();
    if (!text) throw new Error('Réponse vide');

    if (text.includes('"hors_base":true') || text.includes('"hors_base": true')) {
      return res.status(200).json({ hors_base: true });
    }

    // ── Fiche PDF associée ──────────────────────────────────────
    // On affiche le bouton PDF uniquement si :
    // - la fiche la mieux classée est de type "procedure"
    // - elle possède un champ pdfUrl renseigné
    const primaryDoc = topDocs[0];
    let pdf = null;
    if (primaryDoc.type === 'procedure' && primaryDoc.pdfUrl) {
      pdf = {
        titre: primaryDoc.titre,
        url: primaryDoc.pdfUrl,
        dateMAJ: primaryDoc.dateMAJ || null
      };
    }

    return res.status(200).json({ text, suggestions, pdf });

  } catch (error) {
    return res.status(500).json({
      error: error.message,
      cause: error.cause ? String(error.cause) : null
    });
  }
};
