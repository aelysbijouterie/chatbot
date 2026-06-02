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

    // Build context with source citation markers
    const context = docs
      .map(doc => `## [SOURCE: ${doc.title}]\n${doc.content}`)
      .join('\n\n---\n\n');

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
        max_tokens: 1000,
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

    // Detect hors_base response
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
