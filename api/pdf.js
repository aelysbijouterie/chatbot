// ── Génération de PJ à la volée ────────────────────────────────────────────
// Pour les fiches qui n'ont pas de PDF source (rédigées en .md), ce endpoint
// génère un PDF (titre + étapes en cartes numérotées) à partir du contenu de
// la fiche, pour qu'une pièce jointe lisible soit toujours disponible dans
// le chat. Aucune dépendance externe : le PDF est écrit "à la main" (format
// PDF 1.4, police standard Helvetica) pour éviter tout problème d'installation
// de police lors du déploiement sur Vercel.

const PAGE_W = 595, PAGE_H = 842; // A4 en points
const MARGIN = 50;
const FONT_TITLE = 17;
const FONT_META = 8.5;
const FONT_EYEBROW = 7.5;
const FONT_BODY = 10.5;
const FONT_FOOTER = 7.5;
const LEADING_BODY = 14.5;

// Palette (RGB 0..1, reprise du thème AUREL'IA)
const C = {
  navy:      [0.067, 0.125, 0.200],
  gold:      [0.659, 0.482, 0.153],
  goldLight: [0.788, 0.627, 0.290],
  ink:       [0.110, 0.110, 0.118],
  inkMuted:  [0.478, 0.439, 0.408],
  cardBg:    [0.961, 0.945, 0.933],
  white:     [1, 1, 1],
  calloutBg: [1.000, 0.969, 0.925],
  calloutText:[0.357, 0.290, 0.141],
};

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
  ' ': ' ',
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
const AVG_CHAR_WIDTH_RATIO_BOLD = 0.60;

function wrapText(text, maxWidth, fontSize, bold) {
  const ratio = bold ? AVG_CHAR_WIDTH_RATIO_BOLD : AVG_CHAR_WIDTH_RATIO;
  const maxChars = Math.max(4, Math.floor(maxWidth / (fontSize * ratio)));
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
    while (current.length > maxChars) {
      lines.push(current.slice(0, maxChars));
      current = current.slice(maxChars);
    }
  }
  if (current) lines.push(current);
  return lines;
}

function textWidth(text, fontSize, bold) {
  const ratio = bold ? AVG_CHAR_WIDTH_RATIO_BOLD : AVG_CHAR_WIDTH_RATIO;
  return text.length * fontSize * ratio;
}

// Mots-clés qui font basculer un paragraphe en encart "à retenir" plutôt
// qu'en étape numérotée.
const CALLOUT_PATTERNS = /^(\[!\]|attention|important|n\.?b\.?\s*:|à noter|a noter|remarque)/i;

// ── Constructeur de flux PDF (une page à la fois) ──────────────────────────
function PageBuilder() {
  let ops = '';
  return {
    rect(x, y, w, h, color) {
      ops += `${color[0]} ${color[1]} ${color[2]} rg\n${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re\nf\n`;
    },
    circle(cx, cy, r, color) {
      const k = r * 0.5523;
      ops += `${color[0]} ${color[1]} ${color[2]} rg\n`;
      ops += `${(cx + r).toFixed(2)} ${cy.toFixed(2)} m\n`;
      ops += `${(cx + r).toFixed(2)} ${(cy + k).toFixed(2)} ${(cx + k).toFixed(2)} ${(cy + r).toFixed(2)} ${cx.toFixed(2)} ${(cy + r).toFixed(2)} c\n`;
      ops += `${(cx - k).toFixed(2)} ${(cy + r).toFixed(2)} ${(cx - r).toFixed(2)} ${(cy + k).toFixed(2)} ${(cx - r).toFixed(2)} ${cy.toFixed(2)} c\n`;
      ops += `${(cx - r).toFixed(2)} ${(cy - k).toFixed(2)} ${(cx - k).toFixed(2)} ${(cy - r).toFixed(2)} ${cx.toFixed(2)} ${(cy - r).toFixed(2)} c\n`;
      ops += `${(cx + k).toFixed(2)} ${(cy - r).toFixed(2)} ${(cx + r).toFixed(2)} ${(cy - k).toFixed(2)} ${(cx + r).toFixed(2)} ${cy.toFixed(2)} c\n`;
      ops += 'h\nf\n';
    },
    text(x, y, str, font, size, color) {
      ops += `${color[0]} ${color[1]} ${color[2]} rg\nBT\n/${font} ${size} Tf\n${x.toFixed(2)} ${y.toFixed(2)} Td\n(${escapePdfText(str)}) Tj\nET\n`;
    },
    textCentered(cx, y, str, font, size, color, bold) {
      const w = textWidth(str, size, bold);
      this.text(cx - w / 2, y, str, font, size, color);
    },
    stream() { return ops; },
  };
}

function buildSimplePdf(titre, contenu, dateMAJ, categorie) {
  const contentW = PAGE_W - MARGIN * 2;
  const titreClean = toWinAnsi(titre || 'Procédure');
  const contenuClean = toWinAnsi(contenu || '');
  const categorieClean = toWinAnsi(categorie || 'Procédure').toUpperCase();

  const paragraphs = contenuClean.split(/\n{2,}/).map(p => p.replace(/\s+/g, ' ').trim()).filter(Boolean);

  // ── Construction des blocs (étape numérotée ou encart "à retenir") ──────
  const CARD_PAD_X = 13, CARD_PAD_Y = 10;
  const BADGE_R = 8.5;
  const BADGE_GAP = 9;
  const CARD_GAP = 9;
  const stepTextX = MARGIN + CARD_PAD_X + BADGE_R * 2 + BADGE_GAP;
  const stepTextW = contentW - CARD_PAD_X * 2 - BADGE_R * 2 - BADGE_GAP;
  const ACCENT_W = 3;
  const calloutTextX = MARGIN + CARD_PAD_X + ACCENT_W + 8;
  const calloutTextW = contentW - CARD_PAD_X * 2 - ACCENT_W - 8;

  let stepNum = 0;
  const blocks = paragraphs.map(p => {
    const isCallout = CALLOUT_PATTERNS.test(p);
    const clean = isCallout ? p.replace(CALLOUT_PATTERNS, '').replace(/^[:\s]+/, '') : p;
    const maxW = isCallout ? calloutTextW : stepTextW;
    const lines = wrapText(clean, maxW, FONT_BODY, false);
    const height = CARD_PAD_Y * 2 + lines.length * LEADING_BODY - (LEADING_BODY - FONT_BODY);
    if (!isCallout) stepNum++;
    return { type: isCallout ? 'callout' : 'step', num: isCallout ? null : stepNum, lines, height, maxW };
  });

  // ── Pagination ────────────────────────────────────────────────────────
  const pages = [];
  let page = PageBuilder();
  let y = PAGE_H - MARGIN;

  function newPage() {
    pages.push(page);
    page = PageBuilder();
    y = PAGE_H - MARGIN;
  }

  function drawHeader() {
    page.rect(MARGIN, y - 14, 14, 14, C.navy);
    page.text(MARGIN + 20, y - 10, 'AUREL\'IA  ·  ' + categorieClean, 'F1', FONT_EYEBROW, C.gold);
    y -= 30;
    const titleLines = wrapText(titreClean, contentW, FONT_TITLE, true);
    titleLines.forEach(line => {
      page.text(MARGIN, y - FONT_TITLE, line, 'F2', FONT_TITLE, C.navy);
      y -= FONT_TITLE + 5;
    });
    if (dateMAJ) {
      page.text(MARGIN, y - FONT_META, 'Mise à jour : ' + toWinAnsi(dateMAJ), 'F1', FONT_META, C.inkMuted);
      y -= FONT_META + 10;
    } else {
      y -= 6;
    }
    page.rect(MARGIN, y, contentW, 1.4, C.goldLight);
    y -= 18;
  }

  drawHeader();

  blocks.forEach(block => {
    const boldLead = block.lines.length === 1;
    let idx = 0;

    // Une carte peut s'étaler sur plusieurs pages si elle est plus longue que
    // l'espace disponible (ex: paragraphe source très long, sans coupures) :
    // on découpe ses lignes en fragments qui tiennent chacun sur une page,
    // plutôt que de dessiner une carte qui déborde et perd du contenu.
    while (idx < block.lines.length) {
      if (y - (CARD_PAD_Y * 2 + LEADING_BODY) < MARGIN + 26) {
        newPage();
        drawHeader();
      }
      const available = y - (MARGIN + 26);
      const maxLines = Math.max(1, Math.floor((available - CARD_PAD_Y * 2 + (LEADING_BODY - FONT_BODY)) / LEADING_BODY));
      const chunkLines = block.lines.slice(idx, idx + maxLines);
      const chunkHeight = CARD_PAD_Y * 2 + chunkLines.length * LEADING_BODY - (LEADING_BODY - FONT_BODY);
      const isFirstChunk = idx === 0;

      const cardTop = y;
      const cardBottom = y - chunkHeight;

      if (block.type === 'step') {
        page.rect(MARGIN, cardBottom, contentW, chunkHeight, C.cardBg);
        if (isFirstChunk) {
          const badgeCx = MARGIN + CARD_PAD_X + BADGE_R;
          const badgeCy = cardTop - CARD_PAD_Y - BADGE_R + 2;
          page.circle(badgeCx, badgeCy, BADGE_R, C.gold);
          page.textCentered(badgeCx, badgeCy - 3, String(block.num), 'F2', 9, C.white, true);
        }
        let ty = cardTop - CARD_PAD_Y - FONT_BODY;
        chunkLines.forEach((line, i) => {
          const globalI = idx + i;
          page.text(stepTextX, ty, line, (boldLead && globalI === 0) ? 'F2' : 'F1', FONT_BODY, C.ink);
          ty -= LEADING_BODY;
        });
      } else {
        page.rect(MARGIN, cardBottom, contentW, chunkHeight, C.calloutBg);
        page.rect(MARGIN, cardBottom, ACCENT_W, chunkHeight, C.gold);
        let ty = cardTop - CARD_PAD_Y - FONT_BODY;
        chunkLines.forEach((line, i) => {
          const globalI = idx + i;
          const prefix = globalI === 0 ? '! ' : '';
          page.text(calloutTextX, ty, prefix + line, (boldLead && globalI === 0) ? 'F2' : 'F1', FONT_BODY, C.calloutText);
          ty -= LEADING_BODY;
        });
      }

      idx += chunkLines.length;
      y = cardBottom - CARD_GAP;

      if (idx < block.lines.length) {
        newPage();
        drawHeader();
      }
    }
  });

  pages.push(page);

  // pieds de page
  pages.forEach((p, i) => {
    p.text(MARGIN, MARGIN - 24, `AUREL'IA - document genere automatiquement - page ${i + 1}/${pages.length}`, 'F1', FONT_FOOTER, C.inkMuted);
  });

  // ── Assemblage des objets PDF ──────────────────────────────────────────
  const objects = [];
  const fontF1Idx = objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const fontF2Idx = objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

  const pageObjIndexes = [];
  const contentObjIndexes = [];

  pages.forEach((p) => {
    const stream = p.stream();
    const contentIdx = objects.push(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}endstream`);
    contentObjIndexes.push(contentIdx);
  });

  contentObjIndexes.forEach(() => {
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
    if (!getMagasin(req)) {
      // Permet aux liens directs (ex: alerte email "nouvelle procédure") de
      // fonctionner même si le magasin n'est pas encore connecté sur cet appareil :
      // on renvoie vers la connexion, avec retour automatique sur la fiche demandée.
      const next = encodeURIComponent(req.url || '/');
      res.writeHead(302, { Location: `/login.html?next=${next}` });
      return res.end();
    }

    const id = (req.query && req.query.id) || '';
    if (!id) return res.status(400).send('Paramètre id manquant');

    const docs = require('./kb.json');
    const doc = (Array.isArray(docs) ? docs : []).find(d => d.id === id);
    if (!doc) return res.status(404).send('Document introuvable');

    const titre = doc.titre || doc.title || 'Procédure';
    const contenuRaw = doc.contenu || doc.content || '';
    const contenu = contenuRaw
      .replace(/!\[.*?\]\(.*?\)\n?/g, '')
      .replace(/<summary>[\s\S]*?<\/summary>\n?/gi, '')
      .replace(/<\/?details>\n?/gi, '')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1')
      .replace(/`([^`]*)`/g, '$1')
      .replace(/^\s*-{3,}\s*$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    const dateMAJ = doc.dateMAJ || null;
    const categorie = doc.categorie || null;

    const pdfBuffer = buildSimplePdf(titre, contenu, dateMAJ, categorie);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${asciiSlug(titre)}.pdf"`);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).send(pdfBuffer);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

module.exports._buildSimplePdf = buildSimplePdf; // exposé pour tests locaux
