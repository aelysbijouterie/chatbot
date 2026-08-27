const {
  getMagasin, getMagasinNom,
  signSession, SESSION_COOKIE, SESSION_DURATION_MS, STORE_NAMES, ADMIN_CODE,
} = require('../lib/stores.js');

// ── Authentification : connexion / déconnexion / qui suis-je ────────────
// Un seul fichier pour ces trois opérations (limite Vercel Hobby : 12
// fonctions serverless max, voir GUIDE-ADMIN.md) :
//   GET  /api/auth                     → qui suis-je (magasin courant, ou rien)
//   POST /api/auth { code, password }  → connexion (admin ou magasin)
//   POST /api/auth?action=logout       → déconnexion
//
// Connexion unifiée : une seule page (login.html), un seul endpoint.
// - Code "admin" (insensible à la casse) + ADMIN_PASSWORD  -> session admin.
// - Un code magasin à 3 chiffres existant dans data/magasins.json, avec le
//   mot de passe magasin (= le code lui-même, règle fixée par Aélys) -> session magasin.
//
// Configuration requise (Vercel → Settings → Environment Variables) :
//   ADMIN_PASSWORD = Occitania-64   (ou le mot de passe de ton choix)

function handleWhoami(req, res) {
  const magasin = getMagasin(req);
  const nom = magasin ? getMagasinNom(magasin) : null;
  return res.status(200).json({ magasin, nom });
}

function handleLogout(req, res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
  return res.status(200).json({ ok: true });
}

function handleLogin(req, res) {
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
}

module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') return handleWhoami(req, res);

  if (req.method === 'POST') {
    const action = (req.query && req.query.action) || '';
    if (action === 'logout') return handleLogout(req, res);
    return handleLogin(req, res);
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
};
