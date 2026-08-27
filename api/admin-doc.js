const { getMagasin } = require('../lib/stores.js');
const { getFile, putFile, deleteFile } = require('../lib/github.js');
const { extractText } = require('./admin-publish.js')._internal;

// ── Fiche existante : lecture / modification / suppression ──────────────
// Un seul fichier pour ces trois opérations (limite Vercel Hobby : 12
// fonctions serverless max, voir GUIDE-ADMIN.md) :
//   GET  /api/admin-doc?id=...                     → détail (pré-remplissage du formulaire)
//   POST /api/admin-doc { id, action:'edit', ... }  → modification (même chemin, même id)
//   POST /api/admin-doc { id, action:'delete' }     → suppression
//
// Modification :
// - Fiche PDF (procedures-pdf/) : le titre/thème sont mis à jour via son
//   fichier de métadonnées (<path>.json) — le PDF original n'est JAMAIS
//   réécrit à cette occasion. Un nouveau fichier peut être fourni pour
//   remplacer le PDF (toujours au même chemin, donc même id/lien stable).
// - Fiche texte (docs/*.md) : le contenu/titre/thème sont réécrits au même
//   chemin (même id stable), avec extraction de texte si un fichier Word/
//   Excel est fourni à la place d'un texte collé.
// Toujours au même chemin qu'avant : l'id ne change jamais lors d'une
// modification, donc aucune alerte "nouvelle procédure" n'est déclenchée
// (build.js ne compare que les ids ajoutés depuis le déploiement précédent).
//
// Suppression :
// Supprime le fichier source (docs/*.md ou procedures-pdf/*.pdf) du dépôt.
// Pour une fiche PDF, supprime aussi son fichier de métadonnées associé
// (<path>.json) s'il existe — best-effort : une fiche PDF ajoutée avant que
// l'admin ne gère les métadonnées n'en a jamais eu, ce n'est pas une erreur.
// Le prochain build régénère kb.json/docs-index.json sans cette fiche —
// une suppression ne déclenche jamais l'alerte "nouvelle procédure".

const MAX_FILE_BYTES = 3 * 1024 * 1024;
const MAX_CONTENT_CHARS = 12000;

function requireAdmin(req, res) {
  if (getMagasin(req) !== 'ADMIN') {
    res.status(401).json({ ok: false, error: 'Non autorisé.' });
    return false;
  }
  return true;
}

async function handleGet(req, res) {
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
}

async function handleEdit(req, res) {
  const { id, title, theme, content, fileName, fileBase64 } = req.body || {};
  const trimTitle = String(title || '').trim();
  const trimTheme = String(theme || '').trim().replace(/[\r\n]+/g, ' ');

  if (!id) return res.status(400).json({ ok: false, error: 'Identifiant de fiche manquant.' });
  if (!trimTitle) return res.status(400).json({ ok: false, error: 'Le titre est requis.' });
  if (!trimTheme) return res.status(400).json({ ok: false, error: 'Le thème est requis.' });

  const docs = require('./kb.json');
  const doc = (Array.isArray(docs) ? docs : []).find(d => d.id === id);
  if (!doc || !doc.path) return res.status(404).json({ ok: false, error: 'Fiche introuvable (rafraîchis la bibliothèque).' });

  // ── Fiche PDF : métadonnées + remplacement de fichier optionnel ──────
  if (doc.pdfUrl) {
    let buffer = null;
    if (fileName && fileBase64) {
      const ext = (String(fileName).split('.').pop() || '').toLowerCase();
      if (ext !== 'pdf') {
        return res.status(400).json({ ok: false, error: 'Cette fiche est un PDF — remplace-la par un autre PDF, ou modifie seulement le titre/thème.' });
      }
      try { buffer = Buffer.from(fileBase64, 'base64'); }
      catch (e) { return res.status(400).json({ ok: false, error: 'Fichier invalide.' }); }
      if (buffer.length > MAX_FILE_BYTES) {
        return res.status(400).json({ ok: false, error: `Fichier trop volumineux (max ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} Mo).` });
      }
    }

    const metaPath = `${doc.path}.json`;
    let metaSha;
    try { metaSha = (await getFile(metaPath)).sha; } catch (e) { metaSha = undefined; }
    const meta = { titre: trimTitle, categorie: trimTheme };
    await putFile(metaPath, JSON.stringify(meta, null, 2), metaSha, `Admin : modification des métadonnées de "${trimTitle}"`);

    if (buffer) {
      let pdfSha;
      try { pdfSha = (await getFile(doc.path)).sha; } catch (e) { pdfSha = undefined; }
      await putFile(doc.path, buffer, pdfSha, `Admin : remplacement du fichier PDF de "${trimTitle}"`);
    }

    return res.status(200).json({ ok: true, path: doc.path, truncated: false });
  }

  // ── Fiche texte (.md) ────────────────────────────────────────────────
  let bodyText;
  if (fileName && fileBase64) {
    let buffer;
    try { buffer = Buffer.from(fileBase64, 'base64'); }
    catch (e) { return res.status(400).json({ ok: false, error: 'Fichier invalide.' }); }
    if (buffer.length > MAX_FILE_BYTES) {
      return res.status(400).json({ ok: false, error: `Fichier trop volumineux (max ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} Mo).` });
    }
    try { bodyText = await extractText(fileName, buffer); }
    catch (e) { return res.status(400).json({ ok: false, error: e.message }); }
    if (!bodyText) return res.status(400).json({ ok: false, error: "Aucun texte n'a pu être extrait de ce fichier." });
  } else {
    bodyText = String(content || '').trim();
    if (!bodyText) return res.status(400).json({ ok: false, error: 'Le contenu est requis.' });
  }

  let truncated = false;
  if (bodyText.length > MAX_CONTENT_CHARS) {
    bodyText = bodyText.slice(0, MAX_CONTENT_CHARS);
    truncated = true;
  }

  const mdContent = `---\ncategorie: ${trimTheme}\n---\n# ${trimTitle}\n\n${bodyText}\n`;
  let sha;
  try { sha = (await getFile(doc.path)).sha; } catch (e) { sha = undefined; }
  await putFile(doc.path, mdContent, sha, `Admin : modification de la fiche "${trimTitle}"`);

  return res.status(200).json({ ok: true, path: doc.path, truncated });
}

async function handleDelete(req, res) {
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
}

module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAdmin(req, res)) return;

  try {
    if (req.method === 'GET') return await handleGet(req, res);

    if (req.method === 'POST') {
      const action = (req.body && req.body.action) || 'edit';
      if (action === 'delete') return await handleDelete(req, res);
      return await handleEdit(req, res);
    }

    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  } catch (e) {
    console.error('admin-doc error:', e);
    return res.status(500).json({ ok: false, error: e.message || 'Erreur serveur.' });
  }
};
