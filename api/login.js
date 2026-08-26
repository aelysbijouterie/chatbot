const { signSession, SESSION_COOKIE, SESSION_DURATION_MS, STORE_NAMES, ADMIN_CODE } = require('../lib/stores.js');

// Connexion unifiée : une seule page (login.html), un seul endpoint.
// - Code "admin" (insensible à la casse) + ADMIN_PASSWORD  -> session admin.
// - Un code magasin à 3 chiffres existant dans data/magasins.json, avec le
//   mot de passe magasin (= le code lui-même, règle fixée par Aélys) -> session magasin.
//
// Configuration requise (Vercel → Settings → Environment Variables) :
//   ADMIN_PASSWORD = Occitania-64   (ou le mot de passe de ton choix)

module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { code, password } = req.body || {};
  if (!code || !password) {
    return res.status(401).json({ ok: false, error: 'Identifiant ou mot de passe incorrect.' });
  }

  const normalized = String(code).trim();

  // ── Connexion admin ──────────────────────────────────────────────────
  if (normalized.toLowerCase() === 'admin') {
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
    if (!ADMIN_PASSWORD) {
      return res.status(500).json({ ok: false, error: "ADMIN_PASSWORD non configuré côté serveur." });
    }
    if (password !== ADMIN_PASSWORD) {
      return res.status(401).json({ ok: false, error: 'Identifiant ou mot de passe incorrect.' });
    }
    const token = signSession(ADMIN_CODE);
    const maxAge = Math.floor(SESSION_DURATION_MS / 1000);
    res.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`
    );
    return res.status(200).json({ ok: true, isAdmin: true });
  }

  // ── Connexion magasin (mot de passe = code magasin) ──────────────────
  if (!STORE_NAMES[normalized] || password !== normalized) {
    return res.status(401).json({ ok: false, error: 'Identifiant ou mot de passe incorrect.' });
  }

  const token = signSession(normalized);
  const maxAge = Math.floor(SESSION_DURATION_MS / 1000);
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`
  );
  return res.status(200).json({ ok: true, isAdmin: false });
};
