// Répertoire des magasins Aélys — code interne -> nom affiché.
// Utilisé pour enrichir les alertes email, les logs et la réponse /api/whoami.
// Les mots de passe eux-mêmes ne sont PAS ici : ils vivent uniquement dans
// la variable d'environnement Vercel STORE_CREDENTIALS (voir middleware.mjs).
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

// Décode l'en-tête HTTP Basic Auth (déjà validé par middleware.mjs) pour
// retrouver le code magasin qui a fait la requête. Le navigateur renvoie
// automatiquement cet en-tête sur tous les appels /api/* du même site
// une fois que l'utilisateur s'est connecté une première fois.
function getMagasin(req) {
  const header = req.headers && (req.headers.authorization || req.headers.Authorization);
  if (!header || !header.startsWith('Basic ')) return null;
  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const sep = decoded.indexOf(':');
    if (sep === -1) return null;
    return decoded.slice(0, sep) || null;
  } catch (e) {
    return null;
  }
}

function getMagasinNom(code) {
  return STORE_NAMES[code] || null;
}

module.exports = { STORE_NAMES, getMagasin, getMagasinNom };
