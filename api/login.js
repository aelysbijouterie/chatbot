const { signSession, SESSION_COOKIE, SESSION_DURATION_MS } = require('../lib/stores.js');

function loadStores() {
  try { return JSON.parse(process.env.STORE_CREDENTIALS || '{}'); }
  catch (e) { return {}; }
}

module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { code, password } = req.body || {};
  const creds = loadStores();

  if (!code || !password || !creds[code] || creds[code] !== password) {
    return res.status(401).json({ ok: false, error: 'Identifiant ou mot de passe incorrect.' });
  }

  const token = signSession(code);
  const maxAge = Math.floor(SESSION_DURATION_MS / 1000);
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`
  );
  return res.status(200).json({ ok: true });
};
