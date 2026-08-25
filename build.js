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
})();
