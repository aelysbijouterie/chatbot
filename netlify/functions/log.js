// Enregistre chaque question + réponse dans un Google Sheet via Apps Script webhook
exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const WEBHOOK = process.env.GOOGLE_SHEET_WEBHOOK;
  if (!WEBHOOK) return { statusCode: 200, body: JSON.stringify({ skipped: true }) };

  try {
    const { question, reponse, type, magasin } = JSON.parse(event.body);
    await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }),
        question,
        type,        // "reponse" | "hors_base" | "feedback_positif" | "feedback_negatif"
        reponse: reponse || '',
        magasin: magasin || ''
      })
    });
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch(e) {
    return { statusCode: 200, body: JSON.stringify({ error: e.message }) };
  }
};
