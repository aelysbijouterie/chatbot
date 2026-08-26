const crypto = require('crypto');

// Répertoire des magasins Aélys — code interne -> nom affiché.
// Source unique : data/magasins.json (modifiable depuis l'admin, onglet
// "Magasins"). Ne plus éditer STORE_NAMES à la main ici.
const MAGASINS = require('../data/magasins.json');
const STORE_NAMES = {};
MAGASINS.forEach(m => { STORE_NAMES[m.code] = m.nom; });

// ── Session de connexion ────────────────────────────────────────────────
// Le middleware Vercel (Basic Auth) ne se déclenchait pas de façon fiable
// sur ce projet ; on gère donc la connexion nous-mêmes avec une page de
// login (login.html) + un cookie de session signé, vérifié par chaque
// endpoint api/*.js. Aucun service externe, aucune base de données : tout
// repose sur AUTH_SECRET (signature) côté magasins, et ADMIN_PASSWORD côté
// admin, deux variables d'environnement Vercel.
//
// Le code de session "ADMIN" est réservé au compte administrateur : il ne
// peut jamais correspondre à un vrai code magasin (tous à 3 chiffres).
const SECRET = process.env.AUTH_SECRET || 'aurelia-secret-a-changer';
const SESSION_COOKIE = 'aurelia_session';
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 90; // 90 jours
const ADMIN_CODE = 'ADMIN';

function signSession(code) {
  const expiry = Date.now() + SESSION_DURATION_MS;
  const payload = `${code}.${expiry}`;
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function verifySession(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [code, expiry, sig] = parts;
  const payload = `${code}.${expiry}`;
  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (Date.now() > Number(expiry)) return null;
  return code;
}

function getCookie(req, name) {
  const header = req.headers && (req.headers.cookie || req.headers.Cookie);
  if (!header) return null;
  const parts = header.split(';');
  for (const p of parts) {
    const trimmed = p.trim();
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    if (trimmed.slice(0, eq) === name) return decodeURIComponent(trimmed.slice(eq + 1));
  }
  return null;
}

// Retrouve le code magasin (ou "ADMIN") à partir du cookie de session posé
// par /api/login. Renvoie null si pas connecté / session expirée / cookie invalide.
function getMagasin(req) {
  const token = getCookie(req, SESSION_COOKIE);
  return verifySession(token);
}

function getMagasinNom(code) {
  if (code === ADMIN_CODE) return 'Administration';
  return STORE_NAMES[code] || null;
}

module.exports = {
  MAGASINS,
  STORE_NAMES,
  ADMIN_CODE,
  getMagasin,
  getMagasinNom,
  signSession,
  verifySession,
  getCookie,
  SESSION_COOKIE,
  SESSION_DURATION_MS
};
