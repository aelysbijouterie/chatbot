const { getMagasin } = require('../lib/stores.js');
const { getFile, deleteFile } = require('../lib/github.js');

// ── Suppression d'une fiche ───────────────────────────────────────────────
// Supprime le fichier source (docs/*.md ou procedures-pdf/*.pdf) du dépôt.
// Pour une fiche PDF, supprime aussi son fichier de métadonnées associé
// (<path>.json) s'il existe — best-effort : une fiche PDF ajoutée avant que
// l'admin ne gère les métadonnées n'en a jamais eu, ce n'est pas une erreur.
// Le prochain build régénère kb.json/docs-index.json sans cette fiche —
// une suppression ne déclenche jamais l'alerte "nouvelle procédure".

module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (getMagasin(req) !== 'ADMIN') return res.status(401).json({ ok: false, error: 'Non autorisé.' });
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  try {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ ok: false, error: 'Identifiant de fiche manquant.' });

    const docs = require('./kb.json');
    const doc = (Array.isArray(docs) ? docs : []).find(d => d.id === id);
    if (!doc || !doc.path) return res.status(404).json({ ok: false, error: 'Fiche introuvable (rafraîchis la bibliothèque).' });

    const existing = await getFile(doc.path);
    await deleteFile(doc.path, existing.sha, `Admin : suppression de la fiche "${doc.titre}"`);

    if (doc.pdfUrl) {
      try {
        const metaPath = `${doc.path}.json`;
        const metaExisting = await getFile(metaPath);
        await deleteFile(metaPath, metaExisting.sha, `Admin : suppression des métadonnées de "${doc.titre}"`);
      } catch (e) {
        // Pas de fichier de métadonnées pour cette fiche (PDF historique) — rien à faire.
      }
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('admin-delete error:', e);
    return res.status(500).json({ ok: false, error: e.message || 'Erreur serveur.' });
  }
};
