// ── Adresses email des magasins ────────────────────────────────────────────
// Utilisées pour l'alerte "nouvelle procédure" envoyée par build.js.
// Source unique : data/magasins.json (modifiable depuis l'admin, onglet
// "Magasins"). Ne plus éditer ce fichier à la main.

const MAGASINS = require('../data/magasins.json');
const STORE_EMAILS = {};
MAGASINS.forEach(m => { STORE_EMAILS[m.code] = m.email; });

module.exports = { STORE_EMAILS };
