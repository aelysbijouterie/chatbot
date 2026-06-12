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

    const docs = require('./kb.json');

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

    const topDocs = scored[0].s > 0
      ? scored.slice(0, 3).filter(x => x.s > 0).map(x => x.doc)
      : docs.slice(0, 3);

    const suggestions = scored
      .filter(x => x.s > 0)
      .slice(0, 6)
      .map(x => x.doc.title);

    const context = topDocs
      .map(doc => {
        // Supprimer les lignes d'images markdown (inutiles pour le LLM, consomment des tokens)
        const stripped = doc.content
          .replace(/!\[.*?\]\(.*?\)\n?/g, '')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
        const content = stripped.length > 3000
          ? stripped.slice(0, 3000) + '\n[...suite disponible — reformulez si besoin]'
          : stripped;
        return `## [SOURCE: ${doc.title}]\n${content}`;
      })
      .join('\n\n---\n\n');

    const systemPrompt = `Tu es COUSSI IA, l'assistant interne d'Aélys Nouvelle-Aquitaine spécialisé en bijouterie.

Tu dois UNIQUEMENT répondre à partir de la base de connaissance fournie ci-dessous.

RÈGLES ABSOLUES :
1. Si la réponse est présente dans la base → réponds de façon claire et structurée en Markdown (##, listes -, **gras**), en français. Termine TOUJOURS ta réponse par une ligne : 📄 *Source : [nom exact du document entre crochets SOURCE]*
2. Si la réponse N'EST PAS dans la base → réponds UNIQUEMENT avec ce JSON exact sur une seule ligne, sans rien d'autre : {"hors_base":true}

N'improvise jamais. N'invente aucune procédure. Ne complète pas avec tes connaissances générales.

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
        model: 'llama-3.3-70b-versatile',
        max_tokens: 500,
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

    return res.status(200).json({ text, suggestions });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
