const { signSession, SESSION_COOKIE, SESSION_DURATION_MS } = require('../lib/stores.js');

// Session admin : même mécanisme de cookie signé que les magasins, mais avec
// un code réservé "ADMIN" qui ne peut jamais correspondre à un vrai code
// magasin (tous à 3 chiffres). Un seul compte admin pour l'instant.
//
// Configuration requise (Vercel → Settings → Environment Variables) :
//   ADMIN_PASSWORD = Occitania-64   (ou le mot de passe de ton choix)
//
// Identifiant fixe : "admin" (pas un secret, seul le mot de passe l'est).

const ADMIN_CODE = 'ADMIN';

module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { username, password } = req.body || {};
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

  if (!ADMIN_PASSWORD) {
    return res.status(500).json({ ok: false, error: "ADMIN_PASSWORD non configuré côté serveur." });
  }
  if (username !== 'admin' || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ ok: false, error: 'Identifiant ou mot de passe incorrect.' });
  }

  const token = signSession(ADMIN_CODE);
  const maxAge = Math.floor(SESSION_DURATION_MS / 1000);
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`);
  return res.status(200).json({ ok: true });
};
