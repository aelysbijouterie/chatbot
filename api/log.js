const { getMagasin, getMagasinNom } = require('../lib/stores.js');

module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const WEBHOOK = process.env.GOOGLE_SHEET_WEBHOOK;
  if (!WEBHOOK) return res.status(200).json({ skipped: true });

  try {
    const { question, reponse, type } = req.body;
    const magasinCode = getMagasin(req);
    const magasinNom = magasinCode ? getMagasinNom(magasinCode) : null;
    await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }),
        question,
        type,
        reponse: reponse || '',
        magasin: magasinNom ? `${magasinNom} (${magasinCode})` : (magasinCode || '')
      })
    });
    return res.status(200).json({ ok: true });
  } catch(e) {
    return res.status(200).json({ error: e.message });
  }
};
