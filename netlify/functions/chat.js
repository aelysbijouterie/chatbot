exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { messages } = JSON.parse(event.body);
    // messages = tableau [{role:'user'|'assistant', content:'...'}]
    // La dernière entrée est toujours la question actuelle
    const userQuestion = messages[messages.length - 1].content;
    const apiKey = process.env.GROQ_API_KEY;

    const docs = require('./kb.json');

    // ── Sélection intelligente des documents pertinents ──────────────
    function tokenize(text) {
      return text
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 3);
    }

    function score(question, doc) {
      const qWords = new Set(tokenize(question));
      const dWords = tokenize(doc.title + ' ' + doc.content);
      let hits = 0;
      for (const w of qWords) {
        if (dWords.includes(w)) hits++;
      }
      const titleWords = tokenize(doc.title);
      for (const w of qWords) {
        if (titleWords.includes(w)) hits += 2;
      }
      return hits;
    }

    const scored = docs
      .map(doc => ({ doc, s: score(userQuestion, doc) }))
      .sort((a, b) => b.s - a.s);

    // Max 3 docs + troncature à 3000 caractères chacun pour rester sous 12 000 TPM
    const topDocs = scored[0].s > 0
      ? scored.slice(0, 3).filter(x => x.s > 0).map(x => x.doc)
      : docs.slice(0, 3);

    // Suggestions = les docs pertinents non utilisés en premier (pour "Voir aussi")
    const suggestions = scored
      .filter(x => x.s > 0)
      .slice(0, 6)
      .map(x => x.doc.title);

    // Tronquer chaque doc à 3 000 caractères max pour éviter les dépassements TPM
    const context = topDocs
      .map(doc => {
        const content = doc.content.length > 3000
          ? doc.content.slice(0, 3000) + '\n[...suite disponible — reformulez si besoin]'
          : doc.content;
        return `## [SOURCE: ${doc.title}]\n${content}`;
      })
      .join('\n\n---\n\n');
    // ─────────────────────────────────────────────────────────────────

    const systemPrompt = `Tu es COUSSI IA, l'assistant interne d'Aélys Nouvelle-Aquitaine spécialisé en bijouterie.

Tu dois UNIQUEMENT répondre à partir de la base de connaissance fournie ci-dessous.

RÈGLES ABSOLUES :
1. Si la réponse est présente dans la base → réponds de façon claire et structurée en Markdown (##, listes -, **gras**), en français. Termine TOUJOURS ta réponse par une ligne : 📄 *Source : [nom exact du document entre crochets SOURCE]*
2. Si la réponse N'EST PAS dans la base → réponds UNIQUEMENT avec ce JSON exact sur une seule ligne, sans rien d'autre : {"hors_base":true}

N'improvise jamais. N'invente aucune procédure. Ne complète pas avec tes connaissances générales.

BASE DE CONNAISSANCE :
${context}`;

    // ── Construction des messages avec mémoire (max 6 échanges) ──────
    // Historique limité aux 2 derniers messages (1 échange) pour économiser les tokens
    const historyMessages = messages.slice(-2).map(m => ({
      role: m.role,
      content: m.content
    }));
    // ─────────────────────────────────────────────────────────────────

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 500,
        messages: [
          { role: 'system', content: systemPrompt },
          ...historyMessages
        ]
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Erreur Groq');

    const text = (data.choices?.[0]?.message?.content || '').trim();
    if (!text) throw new Error('Réponse vide');

    if (text.includes('"hors_base":true') || text.includes('"hors_base": true')) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ hors_base: true })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ text, suggestions })
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: error.message })
    };
  }
};
