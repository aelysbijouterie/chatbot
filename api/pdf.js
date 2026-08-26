// ── Génération de PJ à la volée ────────────────────────────────────────────
// Pour les fiches qui n'ont pas de PDF source (rédigées en .md), ce endpoint
// génère un PDF simple (titre + texte) à partir du contenu de la fiche, pour
// qu'une pièce jointe soit toujours disponible dans le chat.
// Aucune dépendance externe : le PDF est écrit "à la main" (format PDF 1.4,
// police standard Helvetica) pour éviter tout problème d'installation de
// police lors du déploiement sur Vercel.

const PAGE_W = 595, PAGE_H = 842; // A4 en points
const MARGIN = 50;
const FONT_SIZE_TITLE = 16;
const FONT_SIZE_META = 9;
const FONT_SIZE_BODY = 11;
const LEADING_TITLE = 20;
const LEADING_BODY = 15;
const PARA_GAP = 8;

// Table de correspondance pour les caractères hors Latin-1 courants
// (guillemets/tirets "intelligents", flèches, puces, émojis utilisés dans les fiches)
const SPECIAL_CHARS = {
  '‘': "'", '’': "'", '“': '"', '”': '"',
  '–': '-', '—': '-', '−': '-',
  '…': '...',
  '•': '-', '■': '-', '□': '-', '▪': '-',
  '●': '-', '○': '-', '✓': '-', '✗': '-',
  '→': '->', '←': '<-', '➔': '->', '⇒': '=>', '↔': '<->',
  '≥': '>=', '≤': '<=',
  '✅': '[OK]', '❌': '[X]', '⚠': '[!]', 'ℹ': '[i]',
  '\u{1f4c4}': '[doc]', '\u{1f3a5}': '[video]',
  '️': '', '\u{f0c4}': '',
  '€': String.fromCharCode(0x80), // symbole euro -> octet 0x80 en WinAnsi/cp1252
  ' ': ' ',
};

function toWinAnsi(str) {
  let out = '';
  for (const ch of String(str)) {
    const code = ch.codePointAt(0);
    if (SPECIAL_CHARS[ch]) { out += SPECIAL_CHARS[ch]; continue; }
    if (code <= 0xFF) { out += ch; continue; }
    out += '?';
  }
  return out;
}

function escapePdfText(str) {
  return str.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function asciiSlug(str) {
  return String(str)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'document';
}

// Largeur moyenne approximative d'un caractère Helvetica (en fraction de la taille de police)
const AVG_CHAR_WIDTH_RATIO = 0.56;

function wrapText(text, maxWidth, fontSize) {
  const maxChars = Math.max(4, Math.floor(maxWidth / (fontSize * AVG_CHAR_WIDTH_RATIO)));
  const lines = [];
  const words = text.split(/\s+/).filter(Boolean);
  let current = '';
  for (const word of words) {
    const candidate = current ? current + ' ' + word : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
    // mot isolé trop long pour une ligne : on le coupe brutalement
    while (current.length > maxChars) {
      lines.push(current.slice(0, maxChars));
      current = current.slice(maxChars);
    }
  }
  if (current) lines.push(current);
  return lines;
}

function buildSimplePdf(titre, contenu, dateMAJ) {
  const maxWidth = PAGE_W - MARGIN * 2;
  const titreClean = toWinAnsi(titre || 'Procédure');
  const contenuClean = toWinAnsi(contenu || '');

  const titleLines = wrapText(titreClean, maxWidth, FONT_SIZE_TITLE);
  const metaLine = dateMAJ ? `Mise à jour : ${dateMAJ}` : null;
  const paragraphs = contenuClean.split(/\n{2,}/).map(p => p.replace(/\s+/g, ' ').trim()).filter(Boolean);

  // Construction de la liste des lignes à dessiner, page par page
  const pages = [];
  let page = [];
  let y = PAGE_H - MARGIN;

  function pushLine(text, font, size, leading, gapBefore) {
    if (gapBefore) y -= gapBefore;
    if (y - leading < MARGIN + 20) {
      pages.push(page);
      page = [];
      y = PAGE_H - MARGIN;
    }
    page.push({ text, font, size, y });
    y -= leading;
  }

  titleLines.forEach((line, i) => pushLine(line, 'F2', FONT_SIZE_TITLE, LEADING_TITLE, 0));
  if (metaLine) pushLine(metaLine, 'F1', FONT_SIZE_META, LEADING_BODY, 6);
  y -= PARA_GAP;

  paragraphs.forEach((para, idx) => {
    const lines = wrapText(para, maxWidth, FONT_SIZE_BODY);
    lines.forEach((line, i) => pushLine(line, 'F1', FONT_SIZE_BODY, LEADING_BODY, 0));
    if (idx < paragraphs.length - 1) y -= PARA_GAP;
  });

  if (page.length) pages.push(page);
  if (pages.length === 0) pages.push([]);

  // ── Assemblage des objets PDF ──────────────────────────────────────────
  const objects = [];
  const fontF1Idx = objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>') ;
  const fontF2Idx = objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

  const pageObjIndexes = [];
  const contentObjIndexes = [];

  pages.forEach((pageLines, pageNum) => {
    let stream = 'BT\n';
    let firstLine = true;
    let lastY = null;
    for (const line of pageLines) {
      stream += `/${line.font} ${line.size} Tf\n`;
      if (firstLine) {
        stream += `${MARGIN} ${line.y} Td\n`;
        firstLine = false;
      } else {
        stream += `0 ${line.y - lastY} Td\n`;
      }
      stream += `(${escapePdfText(line.text)}) Tj\n`;
      lastY = line.y;
    }
    stream += 'ET\n';
    // pied de page
    stream += `BT\n/F1 8 Tf\n${MARGIN} ${MARGIN - 25} Td\n(AUREL'IA - document genere automatiquement - page ${pageNum + 1}/${pages.length}) Tj\nET\n`;

    const contentIdx = objects.push(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}endstream`);
    contentObjIndexes.push(contentIdx);
  });

  contentObjIndexes.forEach((contentIdx) => {
    const pageIdx = objects.push('__PAGE_PLACEHOLDER__');
    pageObjIndexes.push(pageIdx);
  });

  const pagesKids = pageObjIndexes.map(i => `${i} 0 R`).join(' ');
  const pagesObjIdx = objects.push(`<< /Type /Pages /Kids [${pagesKids}] /Count ${pageObjIndexes.length} >>`);

  pageObjIndexes.forEach((pageIdx, i) => {
    objects[pageIdx - 1] = `<< /Type /Page /Parent ${pagesObjIdx} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${fontF1Idx} 0 R /F2 ${fontF2Idx} 0 R >> >> /Contents ${contentObjIndexes[i]} 0 R >>`;
  });

  const catalogIdx = objects.push(`<< /Type /Catalog /Pages ${pagesObjIdx} 0 R >>`);

  // ── Écriture finale avec table xref ────────────────────────────────────
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefStart = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogIdx} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(pdf, 'latin1');
}

const { getMagasin } = require('./../lib/stores.js');

module.exports = async function(req, res) {
  try {
    if (!getMagasin(req)) return res.status(401).send('Non authentifié');

    const id = (req.query && req.query.id) || '';
    if (!id) return res.status(400).send('Paramètre id manquant');

    const docs = require('./kb.json');
    const doc = (Array.isArray(docs) ? docs : []).find(d => d.id === id);
    if (!doc) return res.status(404).send('Document introuvable');

    const titre = doc.titre || doc.title || 'Procédure';
    const contenuRaw = doc.contenu || doc.content || '';
    const contenu = contenuRaw
      .replace(/!\[.*?\]\(.*?\)\n?/g, '')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1')
      .replace(/`([^`]*)`/g, '$1')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    const dateMAJ = doc.dateMAJ || null;

    const pdfBuffer = buildSimplePdf(titre, contenu, dateMAJ);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${asciiSlug(titre)}.pdf"`);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).send(pdfBuffer);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
