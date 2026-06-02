exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { messages } = JSON.parse(event.body);
    const userQuestion = messages[0].content;
    const apiKey = process.env.GROQ_API_KEY;

    // Load knowledge base bundled at build time
    const docs = require('./kb.json');

    // ── Sélection intelligente des documents pertinents ──────────────
    // Normalise un texte en liste de mots significatifs (min 3 lettres)
    function tokenize(text) {
      return text
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '') // supprime accents
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 3);
    }

    // Calcule un score de pertinence entre la question et un document
    function score(question, doc) {
      const qWords = new Set(tokenize(question));
      const dWords = tokenize(doc.title + ' ' + doc.content);
      let hits = 0;
      for (const w of qWords) {
        if (dWords.includes(w)) hits++;
      }
      // Bonus si le titre contient un mot de la question
      const titleWords = tokenize(doc.title);
      for (const w of qWords) {
        if (titleWords.includes(w)) hits += 2;
      }
      return hits;
    }

    // Sélectionne les 4 documents les plus pertinents (min score 1)
    const scored = docs
      .map(doc => ({ doc, s: score(userQuestion, doc) }))
      .sort((a, b) => b.s - a.s);

    // Prendre les 4 meilleurs si score > 0, sinon tous (question très courte)
    const topDocs = scored[0].s > 0
      ? scored.slice(0, 4).filter(x => x.s > 0).map(x => x.doc)
      : docs;

    // Construire le contexte avec uniquement les docs sélectionnés
    const context = topDocs
      .map(doc => `## [SOURCE: ${doc.title}]\n${doc.content}`)
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

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 800,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userQuestion }
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
      body: JSON.stringify({ text })
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: error.message })
    };
  }
};
