const { getMagasin, getMagasinNom } = require('../lib/stores.js');

// Petit endpoint pour que la page sache dans quel magasin elle tourne
// (utilisé pour afficher le nom du magasin et pour cloisonner l'historique
// de discussion par magasin dans le navigateur).
module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const magasin = getMagasin(req);
  const nom = magasin ? getMagasinNom(magasin) : null;

  return res.status(200).json({ magasin, nom });
};
