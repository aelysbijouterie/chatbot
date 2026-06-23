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
    const MIN_SCORE = 4;
    let topDocs;
    if (!scored.length || scored[0].s < MIN_SCORE) {
      topDocs = [];
    } else if (scored[0].s >= 10 && scored[0].s >= (scored[1]?.s || 0) * 1.8) {
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
        const content = stripped.length > 3000
          ? stripped.slice(0, 3000) + '\n[...suite disponible — reformulez si besoin]'
          : stripped;
        return `## [SOURCE: ${doc.titre}]\n${content}`;
      })
      .join('\n\n---\n\n');

    const systemPrompt = `Tu es COUSSI IA, l'assistant interne d'Aélys Nouvelle-Aquitaine spécialisé en bijouterie.

Tu dois UNIQUEMENT répondre à partir de la base de connaissance fournie ci-dessous.

RÈGLES ABSOLUES :
1. Tu réponds UNIQUEMENT à partir du contenu fourni dans la BASE DE CONNAISSANCE ci-dessous. Jamais depuis ta mémoire ou tes connaissances générales.
2. Avant de répondre, vérifie que la BASE DE CONNAISSANCE répond DIRECTEMENT à la question posée. Si le document trouvé traite d'un autre sujet et que le mot-clé n'apparaît que de façon accessoire → {"hors_base":true}.
3. Si le sujet est bien abordé dans la base → réponds de façon COURTE et CLAIRE, structurée en Markdown (##, listes -, **gras**), en français. Cite uniquement ce qui est écrit. Va à l'essentiel, pas de paraphrase longue. Termine par : 📄 *Source : [nom exact du document entre crochets SOURCE]*
4. Si le sujet n'est PAS du tout abordé dans la base → réponds UNIQUEMENT avec ce JSON exact sur une seule ligne : {"hors_base":true}
5. N'invente JAMAIS une information, un prix, un délai ou une référence qui n'est pas écrit noir sur blanc dans la base de connaissance.

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
        model: 'llama-3.1-8b-instant',
        max_tokens: 800,
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
    return res.status(500).json({ error: error.message });
  }
};
