const crypto = require('crypto');

// Répertoire des magasins Aélys — code interne -> nom affiché.
const STORE_NAMES = {
  '200': 'Aélys Pau Est',
  '300': 'Aélys Montauban Nord',
  '302': 'Aélys Castres',
  '303': 'Aélys Saint-André',
  '304': 'Aélys Marsac',
  '305': 'Aélys Ibos',
  '306': 'Aélys Boé',
  '309': 'Aélys Bouliac',
  '310': 'Aélys Lescar',
  '312': 'Aélys Dax',
  '313': 'Aélys Le Pian Médoc',
  '401': 'Aélys Tinqueux',
  '402': 'Aélys Nemours',
  '404': 'Aélys Longeville Les Saint Avold',
  '408': 'Aélys Alès',
  '409': 'Aélys Villers Semeuse',
  '411': 'Aélys Cherbourg',
  '413': 'Aélys Vitrolles',
  '414': 'Aélys Saint Nazaire',
  '420': 'Aélys Colmar',
  '421': 'Aélys Cabriès',
  '422': 'Aélys La Valette du Var',
  '423': 'Aélys Collégien'
};

// ── Session de connexion ────────────────────────────────────────────────
// Le middleware Vercel (Basic Auth) ne se déclenchait pas de façon fiable
// sur ce projet ; on gère donc la connexion nous-mêmes avec une page de
// login (login.html) + un cookie de session signé, vérifié par chaque
// endpoint api/*.js. Aucun service externe, aucune base de données : tout
// repose sur STORE_CREDENTIALS (identifiants) et AUTH_SECRET (signature),
// deux variables d'environnement Vercel.
const SECRET = process.env.AUTH_SECRET || 'aurelia-secret-a-changer';
const SESSION_COOKIE = 'aurelia_session';
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 90; // 90 jours

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

// Retrouve le code magasin à partir du cookie de session posé par /api/login.
// Renvoie null si pas connecté / session expirée / cookie invalide.
function getMagasin(req) {
  const token = getCookie(req, SESSION_COOKIE);
  return verifySession(token);
}

function getMagasinNom(code) {
  return STORE_NAMES[code] || null;
}

module.exports = {
  STORE_NAMES,
  getMagasin,
  getMagasinNom,
  signSession,
  SESSION_COOKIE,
  SESSION_DURATION_MS
};
