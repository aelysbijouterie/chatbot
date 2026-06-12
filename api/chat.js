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

    // Si le premier doc domine clairement (score >= 8 et 2x le suivant), n'envoyer que lui
    // Sinon envoyer les 2 premiers — jamais 3 pour éviter les mélanges de contexte
    let topDocs;
    if (scored[0].s <= 0) {
      topDocs = docs.slice(0, 2);
    } else if (scored[0].s >= 8 && scored[0].s >= scored[1].s * 1.8) {
      topDocs = [scored[0].doc];
    } else {
      topDocs = scored.slice(0, 2).filter(x => x.s > 0).map(x => x.doc);
    }

    const suggestions = scored
      .filter(x => x.s > 0)
      .slice(0, 6)
      .map(x => x.doc.title);

    const GITHUB_BASE = 'https://github.com/aelysbijouterie/chatbot/blob/main/docs';

    // Vérifie si un doc contient des images
    function hasImages(doc) {
      return /!\[.*?\]\(.*?\)/.test(doc.content);
    }

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
1. Tu réponds UNIQUEMENT à partir du contenu fourni dans la BASE DE CONNAISSANCE ci-dessous. Jamais depuis ta mémoire ou tes connaissances générales.
2. Si le sujet est abordé dans la base → réponds de façon claire et structurée en Markdown (##, listes -, **gras**), en français. Cite uniquement ce qui est écrit. Termine par : 📄 *Source : [nom exact du document entre crochets SOURCE]*
3. Si le sujet n'est PAS du tout abordé dans la base → réponds UNIQUEMENT avec ce JSON exact sur une seule ligne : {"hors_base":true}

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

    // Ajouter un lien vers la procédure complète si le doc principal contient des images
    let finalText = text;
    if (topDocs.length > 0 && hasImages(topDocs[0])) {
      const docPath = topDocs[0].id.replace(/\\/g, '/');
      const githubUrl = `${GITHUB_BASE}/${docPath}`;
      finalText += `\n\n📎 [Voir la procédure complète avec photos](${githubUrl})`;
    }

    return res.status(200).json({ text: finalText, suggestions });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
