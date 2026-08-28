const fs   = require('fs');
const path = require('path');

const DOCS_DIR    = path.join(__dirname, 'docs');
const PDF_DIR     = path.join(__dirname, 'procedures-pdf');
const OUT_FILE    = path.join(__dirname, 'api', 'kb.json');
const GITHUB_USER = 'aelysbijouterie';
const GITHUB_REPO = 'chatbot';
const GITHUB_BRANCH = 'main';

// Mots vides français : purement grammaticaux, sans valeur de recherche.
// Volontairement PAS de prépositions courtes comme "or", "sans", "avec", "sur" :
// dans ce métier elles distinguent des procédures différentes
// (ex: "or" = matière, "sans/avec remise" = deux procédures différentes).
const STOPWORDS = new Set([
  'le','la','les','un','une','des','du','de','au','aux','et','en','à',
  'que','qui','quoi','ce','se','si',
  'est','sont','ont','pas','plus','très','tout','tous','bien','même',
  'cette','cet','ces','leur','leurs','mon','ton','son','nos','vos',
  'on','il','ne','ma','sa','ta','tu','ci','car','donc','lui','eux','me','te','y','là','où',
  'the','and','for','this','that','with','from','into','your','you','are'
]);

function detectType(text) {
  const t = text.toLowerCase();
  const signals = [/étape/, /cliquer?/, /ouvrir/, /sélectionner/, /valider/, /saisir/, /^\d+\.\s/m, /^[-*]\s/m];
  return signals.filter(r => r.test(t)).length >= 2 ? 'procedure' : 'info';
}

function extractKeywords(titre, contenu) {
  const freq = {};
  const words = (titre + ' ' + contenu)
    .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter(w => w.length >= 2 && !STOPWORDS.has(w));
  words.forEach(w => freq[w] = (freq[w] || 0) + 1);
  titre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter(w => w.length >= 2 && !STOPWORDS.has(w))
    .forEach(w => freq[w] = (freq[w] || 0) + 3);
  return Object.entries(freq).sort((a,b) => b[1]-a[1]).slice(0, 12).map(([w]) => w);
}

function categorieFromDir(relDir) {
  if (!relDir) return 'Général';
  return relDir.split('/').pop().replace(/-/g,' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Alerte "nouvelle procédure" ────────────────────────────────────────────
// Envoyée à tous les magasins quand un déploiement en production ajoute au
// moins une fiche par rapport au docs-index.json précédemment commité.
async function notifyStoresOfNewDocs(newDocs) {
  const { sendMail } = require('./lib/mailer.js');
  const { emailShell, escapeHtml, BRAND } = require('./lib/email-template.js');

  let STORE_EMAILS;
  try {
    ({ STORE_EMAILS } = require('./lib/store-emails.js'));
  } catch (e) {
    console.warn('⚠ lib/store-emails.js introuvable — alerte non envoyée.');
    return;
  }

  const baseUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  if (!baseUrl) {
    console.warn('⚠ URL de production introuvable — alerte "nouvelle procédure" non envoyée.');
    return;
  }

  const plural = newDocs.length > 1 ? 's' : '';
  const subject = `AUREL'IA — ${newDocs.length} nouvelle${plural} procédure${plural} disponible${plural}`;

  const docCards = newDocs.map(d => `
    <tr><td style="padding-bottom:10px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.cream}; border-radius:10px;">
        <tr>
          <td style="width:4px; background:${BRAND.gold}; border-radius:10px 0 0 10px; font-size:0; line-height:0;">&nbsp;</td>
          <td style="padding:13px 16px;">
            <a href="${baseUrl}/api/pdf?id=${encodeURIComponent(d.id)}" style="font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif; font-size:14.5px; font-weight:600; color:${BRAND.navy}; text-decoration:none;">${escapeHtml(d.titre)}</a>
            <div style="font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif; font-size:12px; color:${BRAND.muted}; margin-top:3px;">${escapeHtml(d.categorie)}</div>
          </td>
          <td style="width:28px; text-align:center; color:${BRAND.gold}; font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif; font-size:16px;">&#8594;</td>
        </tr>
      </table>
    </td></tr>`).join('');

  const bodyHtml = `
    <p style="margin:0 0 18px;">${newDocs.length > 1 ? 'De nouvelles fiches sont disponibles' : 'Une nouvelle fiche est disponible'} dans la base documentaire d'AUREL'IA :</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${docCards}</table>
    <p style="margin:18px 0 0; font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif; font-size:12.5px; color:${BRAND.muted};">Cliquez sur une fiche pour l'ouvrir (connexion magasin demandée si besoin).</p>`;

  const html = emailShell({
    preheader: `${newDocs.length} nouvelle${plural} procédure${plural} vien${newDocs.length > 1 ? 'nent' : 't'} d'être publiée${plural} sur AUREL'IA.`,
    eyebrow: `Nouvelle${plural} procédure${plural}`,
    title: `${newDocs.length} nouvelle${plural} fiche${plural} ${newDocs.length > 1 ? 'sont disponibles' : 'est disponible'}`,
    bodyHtml,
    cta: { label: "Ouvrir AUREL'IA", url: baseUrl },
    accentColor: BRAND.gold,
    footerNote: 'Vous recevez cet e-mail automatiquement à chaque mise à jour de la base documentaire.',
  });

  // Mode test : tant que ALERT_TEST_EMAIL est définie (Vercel → Environment
  // Variables), l'alerte part uniquement vers cette adresse au lieu des 23
  // magasins — pratique pour vérifier que tout fonctionne avant d'ouvrir
  // l'envoi en vrai. Retirer la variable (ou la vider) pour repasser en
  // envoi réel à tous les magasins.
  const testEmail = process.env.ALERT_TEST_EMAIL;
  const entries = testEmail ? [['TEST', testEmail]] : Object.entries(STORE_EMAILS);
  if (testEmail) {
    console.log(`ℹ Mode test actif (ALERT_TEST_EMAIL) — envoi uniquement à ${testEmail} au lieu des ${Object.keys(STORE_EMAILS).length} magasins.`);
  }

  let sent = 0, failed = 0;
  for (const [code, email] of entries) {
    const r = await sendMail({ to: email, subject: testEmail ? `[TEST] ${subject}` : subject, html });
    if (r.ok) sent++; else { failed++; console.warn(`  ✗ magasin ${code} (${email}) : ${r.error}`); }
  }
  console.log(`✓ Alerte "nouvelle procédure" : ${sent} envoyé(s), ${failed} échec(s) sur ${entries.length} destinataire(s).`);
}

// ── Lecture des .md existants ─────────────────────────────────────────────────
function readDocsRecursive(dir, base = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const docs = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath  = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) { docs.push(...readDocsRecursive(fullPath, relPath)); continue; }
    if (!entry.name.endsWith('.md')) continue;
    const raw = fs.readFileSync(fullPath, 'utf8');

    // Frontmatter optionnel (---\nclé: valeur\n---) : utilisé par l'admin
    // ("Ajouter une procédure") pour fixer explicitement la catégorie/thème
    // choisi, indépendamment du dossier réel du fichier — tous les documents
    // publiés depuis l'admin vivent dans docs/admin/ mais gardent leur
    // propre thème grâce à ce champ.
    const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    let categorieOverride = null;
    if (fmMatch) {
      const catM = fmMatch[1].match(/^categorie:\s*(.+)$/m);
      if (catM) categorieOverride = catM[1].trim();
    }

    const body   = raw.replace(/^---[\s\S]*?---\r?\n?/, '').trim();
    const titleM = body.match(/^#\s+(.+)/m);
    const titre  = titleM ? titleM[1].trim() : entry.name.replace(/\.md$/, '');
    const contenu = body.replace(/^#\s+.+\r?\n?/, '').replace(/!\[.*?\]\(.*?\)/g, '').trim();
    const relDir  = path.dirname(relPath) === '.' ? '' : path.dirname(relPath);
    docs.push({
      id        : 'md-' + relPath.replace(/\.md$/, '').replace(/[\\/]/g, '-'),
      titre,
      categorie : categorieOverride || categorieFromDir(relDir),
      motsClefs : extractKeywords(titre, contenu),
      contenu,
      type      : detectType(body),
      pdfUrl    : null,
      // Chemin réel dans le dépôt (docs/...) : utilisé par l'admin pour
      // pouvoir modifier/supprimer cette fiche de façon fiable, sans avoir
      // à reconstituer un chemin à partir de l'id (l'id perd l'info exacte
      // du chemin en aplatissant les "/" en "-").
      path      : `docs/${relPath.replace(/\\/g, '/')}`,
      dateMAJ   : new Date().toISOString().slice(0, 10)
    });
  }
  return docs;
}

// ── Lecture des PDFs (extraction texte auto pour l'index de recherche
// uniquement — le fichier PDF original n'est jamais modifié ni réécrit) ───
async function readPdfsRecursive(dir, base = '') {
  let pdfParse;
  try { pdfParse = require('pdf-parse'); } catch(e) {
    console.warn('⚠ pdf-parse non installé — PDFs ignorés. Lance: npm install');
    return [];
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const docs = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath  = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      docs.push(...await readPdfsRecursive(fullPath, relPath));
      continue;
    }
    if (!entry.name.toLowerCase().endsWith('.pdf')) continue;

    // Métadonnées optionnelles déposées par l'admin à côté du PDF
    // (fichier.pdf.json : { "titre": "...", "categorie": "..." }).
    // Calculées AVANT toute tentative d'extraction de texte : le titre/thème
    // d'une fiche ne doit jamais dépendre du succès du parsing PDF.
    let metaOverride = null;
    const metaPath = fullPath + '.json';
    if (fs.existsSync(metaPath)) {
      try { metaOverride = JSON.parse(fs.readFileSync(metaPath, 'utf8')); }
      catch (e) { console.warn(`  ⚠ métadonnées invalides pour ${entry.name} (ignorées)`); }
    }

    // Titre = métadonnée admin si présente, sinon nom du fichier sans
    // extension et sans préfixe numérique "X - "
    const rawName = entry.name.replace(/\.pdf$/i, '');
    const titre = (metaOverride && metaOverride.titre)
      ? String(metaOverride.titre).trim()
      : rawName.replace(/^\d+\s*[-–]\s*/, '').trim();

    const relDir  = path.dirname(relPath) === '.' ? '' : path.dirname(relPath);
    const categorie = (metaOverride && metaOverride.categorie)
      ? String(metaOverride.categorie).trim()
      : (categorieFromDir(relDir) || 'Procédures');
    // Chemin réel dans le dépôt : sert à construire pdfUrl ET à ce que
    // l'admin puisse modifier/supprimer cette fiche de façon fiable
    // (contrairement à l'id, qui aplatit les "/" et perd l'info exacte).
    const filePath = `procedures-pdf/${relPath.replace(/\\/g, '/')}`;
    const pdfUrl  = `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${filePath}`;

    // Extraction du texte : sert UNIQUEMENT à la recherche par mots-clés,
    // jamais à afficher le PDF (le fichier original n'est jamais modifié).
    // Si l'extraction échoue (bibliothèque de parsing capricieuse sur
    // certains PDF, différence de version Node entre l'ordi et Vercel,
    // etc.), la fiche doit rester visible quand même : on ne perd JAMAIS
    // une procédure à cause d'un souci d'extraction de texte, seule sa
    // recherche plein texte sera moins bonne pour cette fiche précise.
    let contenu = '';
    try {
      const buf  = fs.readFileSync(fullPath);
      const data = await pdfParse(buf, { max: 0 });
      contenu = (data.text || '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 6000);
      console.log(`  PDF ✓ ${titre}`);
    } catch(e) {
      console.warn(`  PDF ⚠ ${entry.name} : texte non extrait (${e.message}) — fiche conservée quand même, sans indexation plein texte pour l'instant.`);
    }

    docs.push({
      id        : 'pdf-' + relPath.replace(/\.pdf$/i, '').replace(/[\\/\s]/g, '-'),
      titre,
      categorie,
      motsClefs : extractKeywords(titre, contenu),
      contenu,
      type      : 'procedure',
      pdfUrl,
      path      : filePath,
      dateMAJ   : new Date().toISOString().slice(0, 10)
    });
  }
  return docs;
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  const mdDocs  = readDocsRecursive(DOCS_DIR);
  const pdfDocs = fs.existsSync(PDF_DIR) ? await readPdfsRecursive(PDF_DIR) : [];

  // Dédupliquer : si un PDF a le même titre qu'un .md, le PDF gagne (plus le pdfUrl)
  const pdfTitles = new Set(pdfDocs.map(d => d.titre.toLowerCase().trim()));
  const filteredMd = mdDocs.filter(d => !pdfTitles.has(d.titre.toLowerCase().trim()));

  const docs = [...filteredMd, ...pdfDocs];

  // Garde-fou : si le build produit 0 fiche, quelque chose s'est cassé
  // silencieusement (ex. pdf-parse indisponible dans l'environnement de
  // build) — mieux vaut faire échouer le déploiement bruyamment que publier
  // un site vide à la place de l'ancien.
  if (docs.length === 0) {
    throw new Error('Build annulé : 0 fiche trouvée (docs/ + procedures-pdf/ vides ou illisibles). Ancien contenu conservé.');
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(docs, null, 2), 'utf8');
  console.log(`\n✓ kb.json : ${filteredMd.length} MD + ${pdfDocs.length} PDF = ${docs.length} docs total\n`);
  docs.forEach(d => console.log(`  [${d.categorie}] ${d.titre} (${d.type})${d.pdfUrl ? ' 📄' : ''}`));

  // ── Index public léger (id, titre, catégorie) ──────────────────────────
  // Utilisé par l'écran d'accueil du site pour lister les fiches par
  // catégorie, sans exposer le contenu complet des procédures.
  const DOCS_INDEX_FILE = path.join(__dirname, 'docs-index.json');

  // On lit l'index précédemment commité AVANT de le remplacer, pour savoir
  // quelles fiches sont nouvelles depuis le dernier déploiement.
  let previousIds = null;
  try {
    const prev = JSON.parse(fs.readFileSync(DOCS_INDEX_FILE, 'utf8'));
    previousIds = new Set(prev.map(d => d.id));
  } catch (e) {
    previousIds = null; // pas d'index précédent (premier build) : pas d'alerte
  }

  // "contenu" est inclus (déjà limité à 6000 caractères pour les PDF, voir
  // readPdfsRecursive) pour permettre la recherche par mot-clé côté magasin
  // (onglet "Bibliothèque" de index.html) sans exposer d'endpoint dédié —
  // le contenu complet et mis en forme reste uniquement accessible via
  // /api/pdf?id=..., cet index ne sert qu'à filtrer/rechercher.
  const docsIndex = docs.map(d => ({
    id: d.id,
    titre: d.titre,
    categorie: d.categorie,
    contenu: d.contenu || ''
  }));
  if (previousIds && docsIndex.length < previousIds.size * 0.7) {
    throw new Error(
      `Build annulé : ${docsIndex.length} fiches trouvées contre ${previousIds.size} précédemment ` +
      `(chute de plus de 30%). C'est presque certainement un build cassé/partiel, pas une vraie ` +
      `suppression en masse. Ancien docs-index.json conservé — publication bloquée.`
    );
  }

  fs.writeFileSync(DOCS_INDEX_FILE, JSON.stringify(docsIndex, null, 2), 'utf8');
  console.log(`✓ docs-index.json : ${docsIndex.length} fiches indexées\n`);

  // ── Alerte email "nouvelle procédure" ───────────────────────────────────
  if (previousIds) {
    const newDocs = docsIndex.filter(d => !previousIds.has(d.id));
    const NEW_DOCS_ALERT_CAP = 15; // au-delà, probable réorganisation de dossiers plutôt que du vrai contenu neuf
    if (newDocs.length > NEW_DOCS_ALERT_CAP) {
      console.log(`ℹ ${newDocs.length} fiches détectées comme "nouvelles" — probablement un renommage/réorganisation plutôt que du contenu neuf. Alerte non envoyée automatiquement (seuil : ${NEW_DOCS_ALERT_CAP}).`);
    } else if (newDocs.length > 0) {
      if (process.env.VERCEL_ENV === 'production') {
        console.log(`\n📣 ${newDocs.length} nouvelle(s) fiche(s) détectée(s) — envoi de l'alerte aux magasins…`);
        await notifyStoresOfNewDocs(newDocs);
      } else {
        console.log(`ℹ ${newDocs.length} nouvelle(s) fiche(s) détectée(s) — alerte non envoyée (build hors production, VERCEL_ENV=${process.env.VERCEL_ENV || 'non défini'}).`);
      }
    }
  }
})().catch(err => {
  console.error('\n✗ Build échoué :', err.message);
  process.exit(1);
});
