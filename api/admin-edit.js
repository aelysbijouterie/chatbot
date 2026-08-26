const { getMagasin } = require('../lib/stores.js');
const { getFile, putFile } = require('../lib/github.js');
const { extractText } = require('./admin-publish.js')._internal;

// ── Modification d'une fiche existante ───────────────────────────────────
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

const MAX_FILE_BYTES = 3 * 1024 * 1024;
const MAX_CONTENT_CHARS = 12000;

function requireAdmin(req, res) {
  if (getMagasin(req) !== 'ADMIN') {
    res.status(401).json({ ok: false, error: 'Non autorisé.' });
    return false;
  }
  return true;
}

module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAdmin(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  try {
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
  } catch (e) {
    console.error('admin-edit error:', e);
    return res.status(500).json({ ok: false, error: e.message || 'Erreur serveur.' });
  }
};
