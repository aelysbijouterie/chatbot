const { getMagasin } = require('../lib/stores.js');

// ── Détail d'une fiche pour l'admin (édition) ────────────────────────────
// Renvoie les informations nécessaires pour pré-remplir le formulaire
// "Modifier la fiche" : titre, thème, et soit le contenu texte (fiche .md),
// soit le nom du fichier PDF actuel (fiche PDF — le contenu n'est jamais
// affiché/modifiable directement, seul le fichier peut être remplacé).

module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (getMagasin(req) !== 'ADMIN') return res.status(401).json({ ok: false, error: 'Non autorisé.' });
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  try {
    const id = (req.query && req.query.id) || '';
    if (!id) return res.status(400).json({ ok: false, error: 'Paramètre id manquant.' });

    const docs = require('./kb.json');
    const doc = (Array.isArray(docs) ? docs : []).find(d => d.id === id);
    if (!doc) return res.status(404).json({ ok: false, error: 'Fiche introuvable (rafraîchis la bibliothèque).' });

    const isPdf = !!doc.pdfUrl;
    return res.status(200).json({
      ok: true,
      doc: {
        id: doc.id,
        titre: doc.titre,
        categorie: doc.categorie,
        type: isPdf ? 'pdf' : 'md',
        contenu: isPdf ? null : (doc.contenu || ''),
        fileName: isPdf && doc.path ? doc.path.split('/').pop() : null,
      },
    });
  } catch (e) {
    console.error('admin-doc error:', e);
    return res.status(500).json({ ok: false, error: e.message || 'Erreur serveur.' });
  }
};
