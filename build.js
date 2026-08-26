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
  const listHtml = newDocs.map(d => `
    <li style="margin-bottom:10px;">
      <a href="${baseUrl}/api/pdf?id=${encodeURIComponent(d.id)}" style="color:#A87B27;font-weight:600;text-decoration:none;">${d.titre}</a>
      <span style="color:#999;font-size:12px;"> — ${d.categorie}</span>
    </li>`).join('');
  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#F5F1EE;">
      <div style="background:#112033;padding:20px 24px;border-radius:12px 12px 0 0;">
        <h1 style="color:#A87B27;font-size:20px;margin:0;letter-spacing:1px;">AUREL'IA</h1>
        <p style="color:#EFE8E0;font-size:12px;margin:4px 0 0;opacity:0.8;">Assistante Aélys Nouvelle-Aquitaine</p>
      </div>
      <div style="background:#fff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #EFE8E0;">
        <h2 style="color:#112033;font-size:16px;margin:0 0 14px;">${newDocs.length} nouvelle${plural} procédure${plural} ${newDocs.length > 1 ? 'sont disponibles' : 'est disponible'} dans AUREL'IA</h2>
        <ul style="list-style:none;padding:0;margin:0 0 16px;">${listHtml}</ul>
        <p style="color:#999;font-size:12px;margin:0;">Cliquez sur une fiche pour l'ouvrir (connexion magasin demandée si besoin).</p>
      </div>
    </div>`;

  const entries = Object.entries(STORE_EMAILS);
  let sent = 0, failed = 0;
  for (const [code, email] of entries) {
    const r = await sendMail({ to: email, subject, html });
    if (r.ok) sent++; else { failed++; console.warn(`  ✗ magasin ${code} (${email}) : ${r.error}`); }
  }
  console.log(`✓ Alerte "nouvelle procédure" : ${sent} envoyé(s), ${failed} échec(s) sur ${entries.length} magasins.`);
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
    const raw    = fs.readFileSync(fullPath, 'utf8');
    const body   = raw.replace(/^---[\s\S]*?---\r?\n?/, '').trim();
    const titleM = body.match(/^#\s+(.+)/m);
    const titre  = titleM ? titleM[1].trim() : entry.name.replace(/\.md$/, '');
    const contenu = body.replace(/^#\s+.+\r?\n?/, '').replace(/!\[.*?\]\(.*?\)/g, '').trim();
    const relDir  = path.dirname(relPath) === '.' ? '' : path.dirname(relPath);
    docs.push({
      id        : 'md-' + relPath.replace(/\.md$/, '').replace(/[\\/]/g, '-'),
      titre,
      categorie : categorieFromDir(relDir),
      motsClefs : extractKeywords(titre, contenu),
      contenu,
      type      : detectType(body),
      pdfUrl    : null,
      dateMAJ   : new Date().toISOString().slice(0, 10)
    });
  }
  return docs;
}

// ── Lecture des PDFs (extraction texte auto) ──────────────────────────────────
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

    try {
      const buf  = fs.readFileSync(fullPath);
      const data = await pdfParse(buf, { max: 0 });

      // Titre = nom du fichier sans extension, sans préfixe numérique "X - "
      const rawName = entry.name.replace(/\.pdf$/i, '');
      const titre   = rawName.replace(/^\d+\s*[-–]\s*/, '').trim();

      // Contenu texte brut, limité à 6000 chars
      const contenu = (data.text || '')
        .replace(/\n{3,}/g, '\n\n').trim().slice(0, 6000);

      const relDir  = path.dirname(relPath) === '.' ? '' : path.dirname(relPath);
      const pdfUrl  = `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/${GITHUB_BRANCH}/procedures-pdf/${relPath.replace(/\\/g, '/')}`;

      docs.push({
        id        : 'pdf-' + relPath.replace(/\.pdf$/i, '').replace(/[\\/\s]/g, '-'),
        titre,
        categorie : categorieFromDir(relDir) || 'Procédures',
        motsClefs : extractKeywords(titre, contenu),
        contenu,
        type      : 'procedure',
        pdfUrl,
        dateMAJ   : new Date().toISOString().slice(0, 10)
      });
      console.log(`  PDF ✓ ${titre}`);
    } catch(e) {
      console.warn(`  PDF ✗ ${entry.name}: ${e.message}`);
    }
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

  const docsIndex = docs.map(d => ({
    id: d.id,
    titre: d.titre,
    categorie: d.categorie
  }));
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
})();
