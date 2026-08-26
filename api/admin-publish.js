const { getMagasin } = require('../lib/stores.js');
const { putFile } = require('../lib/github.js');

// ── Publication réelle d'une fiche depuis l'admin ───────────────────────
// Toute fiche publiée ici (texte collé ou fichier importé) devient un
// fichier .md dans docs/admin/, avec le thème choisi fixé explicitement en
// frontmatter (voir build.js). Le prochain build (déclenché automatiquement
// par ce commit) l'indexe dans kb.json/docs-index.json et envoie l'alerte
// "nouvelle procédure" aux magasins — aucun code supplémentaire n'est
// nécessaire pour ça, c'est le pipeline existant qui s'en charge.

const MAX_FILE_BYTES = 3 * 1024 * 1024; // 3 Mo décodés — reste sous la limite de charge utile de Vercel une fois encodé en base64
const MAX_CONTENT_CHARS = 12000;

function requireAdmin(req, res) {
  if (getMagasin(req) !== 'ADMIN') {
    res.status(401).json({ ok: false, error: 'Non autorisé.' });
    return false;
  }
  return true;
}

function slugify(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'fiche';
}

async function extractText(fileName, buffer) {
  const ext = (String(fileName).split('.').pop() || '').toLowerCase();

  if (ext === 'pdf') {
    let pdfParse;
    try { pdfParse = require('pdf-parse'); }
    catch (e) { throw new Error('Extraction PDF indisponible sur le serveur.'); }
    try {
      const data = await pdfParse(buffer, { max: 0 });
      return (data.text || '').replace(/\n{3,}/g, '\n\n').trim();
    } catch (e) {
      throw new Error("Ce PDF n'a pas pu être lu (fichier corrompu, protégé, ou scanné en image sans texte).");
    }
  }

  if (ext === 'docx') {
    let mammoth;
    try { mammoth = require('mammoth'); }
    catch (e) { throw new Error('Extraction Word indisponible sur le serveur.'); }
    try {
      const result = await mammoth.extractRawText({ buffer });
      return (result.value || '').replace(/\n{3,}/g, '\n\n').trim();
    } catch (e) {
      throw new Error("Ce fichier Word n'a pas pu être lu (format non valide ou fichier corrompu).");
    }
  }

  if (ext === 'xlsx') {
    let ExcelJS;
    try { ExcelJS = require('exceljs'); }
    catch (e) { throw new Error('Extraction Excel indisponible sur le serveur.'); }
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const parts = [];
      workbook.eachSheet(worksheet => {
        const lines = [];
        worksheet.eachRow(row => {
          const values = Array.isArray(row.values) ? row.values.slice(1) : [];
          const cells = values.map(v => {
            if (v == null) return '';
            if (typeof v === 'object' && v.text != null) return String(v.text); // texte enrichi / hyperlien
            if (typeof v === 'object' && v.result != null) return String(v.result); // formule
            return String(v);
          });
          if (cells.some(c => c.trim())) lines.push(cells.join(', '));
        });
        if (lines.length) parts.push(`### ${worksheet.name}\n${lines.join('\n')}`);
      });
      return parts.join('\n\n').trim();
    } catch (e) {
      throw new Error("Ce fichier Excel n'a pas pu être lu (format non valide ou fichier corrompu).");
    }
  }

  if (ext === 'xls' || ext === 'doc') {
    throw new Error(`L'ancien format ".${ext}" n'est pas pris en charge — réenregistre le fichier au format ${ext === 'xls' ? '.xlsx' : '.docx'} et réessaie.`);
  }

  throw new Error(`Format ".${ext}" non pris en charge (PDF, Word .docx et Excel .xlsx uniquement pour le moment).`);
}

module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAdmin(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  try {
    const { method, title, theme, content, fileName, fileBase64 } = req.body || {};
    const trimTitle = String(title || '').trim();
    const trimTheme = String(theme || '').trim().replace(/[\r\n]+/g, ' ');

    if (!trimTitle) return res.status(400).json({ ok: false, error: 'Le titre est requis.' });
    if (!trimTheme) return res.status(400).json({ ok: false, error: 'Le thème est requis.' });

    let bodyText = '';

    if (method === 'file') {
      if (!fileName || !fileBase64) {
        return res.status(400).json({ ok: false, error: 'Fichier manquant.' });
      }
      let buffer;
      try { buffer = Buffer.from(fileBase64, 'base64'); }
      catch (e) { return res.status(400).json({ ok: false, error: 'Fichier invalide.' }); }

      if (buffer.length > MAX_FILE_BYTES) {
        return res.status(400).json({ ok: false, error: `Fichier trop volumineux (max ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} Mo).` });
      }

      try {
        bodyText = await extractText(fileName, buffer);
      } catch (e) {
        return res.status(400).json({ ok: false, error: e.message });
      }

      if (!bodyText) {
        return res.status(400).json({ ok: false, error: "Aucun texte n'a pu être extrait de ce fichier." });
      }
    } else {
      bodyText = String(content || '').trim();
      if (!bodyText) {
        return res.status(400).json({ ok: false, error: 'Le contenu est requis.' });
      }
    }

    let truncated = false;
    if (bodyText.length > MAX_CONTENT_CHARS) {
      bodyText = bodyText.slice(0, MAX_CONTENT_CHARS);
      truncated = true;
    }

    const slug = `${slugify(trimTitle)}-${Date.now().toString(36)}`;
    const filePath = `docs/admin/${slug}.md`;
    const mdContent = `---\ncategorie: ${trimTheme}\n---\n# ${trimTitle}\n\n${bodyText}\n`;

    await putFile(filePath, mdContent, undefined, `Admin : ajout de la fiche "${trimTitle}"`);

    return res.status(200).json({ ok: true, path: filePath, truncated });
  } catch (e) {
    console.error('admin-publish error:', e);
    return res.status(500).json({ ok: false, error: e.message || 'Erreur serveur.' });
  }
};

module.exports._internal = { slugify, extractText };
