const fs   = require('fs');
const path = require('path');

const DOCS_DIR    = path.join(__dirname, 'docs');
const OUT_FILE    = path.join(__dirname, 'api', 'kb.json');
const GITHUB_USER = 'aelysbijouterie';
const GITHUB_REPO = 'chatbot';
const GITHUB_BRANCH = 'main';

// ── Mots vides français/anglais à exclure des mots-clés auto ─────────────────
const STOPWORDS = new Set([
  'le','la','les','un','une','des','du','de','au','aux','et','en','à','par',
  'pour','sur','sous','dans','avec','sans','que','qui','quoi','ce','se','si',
  'est','sont','ont','une','pas','plus','très','tout','tous','bien','même',
  'cette','cet','ces','leur','leurs','mon','ton','son','nos','vos','its',
  'the','and','for','this','that','with','from','into','your','you','are'
]);

// ── Détection automatique du type selon les mots du contenu ──────────────────
function detectType(text) {
  const t = text.toLowerCase();
  const procedureSignals = [
    /\bétape[s]?\b/, /\bcliquer?\b/, /\bouvrir\b/, /\bsélectionner\b/,
    /\bvalider\b/, /\bsaisir\b/, /^\d+\.\s/m, /^[-*]\s/m
  ];
  const hits = procedureSignals.filter(r => r.test(t)).length;
  return hits >= 2 ? 'procedure' : 'info';
}

// ── Extraction des mots-clés depuis titre + contenu ──────────────────────────
function extractKeywords(titre, contenu) {
  const raw = (titre + ' ' + contenu)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !STOPWORDS.has(w));

  // Fréquence des mots
  const freq = {};
  raw.forEach(w => freq[w] = (freq[w] || 0) + 1);

  // Priorité aux mots du titre (×3)
  const titreWords = titre.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !STOPWORDS.has(w));
  titreWords.forEach(w => freq[w] = (freq[w] || 0) + 3);

  // Retourner les 10 mots les plus fréquents
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([w]) => w);
}

// ── Catégorie depuis le nom du dossier ───────────────────────────────────────
function categorieFromDir(relDir) {
  if (!relDir) return 'Général';
  return relDir
    .split('/').pop()
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

// ── URL GitHub raw du PDF si le fichier existe à côté du .md ─────────────────
function findPdfUrl(mdFullPath, relPath) {
  const pdfPath = mdFullPath.replace(/\.md$/, '.pdf');
  if (!fs.existsSync(pdfPath)) return null;
  const relPdf = relPath.replace(/\.md$/, '.pdf');
  return `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/${GITHUB_BRANCH}/docs/${relPdf}`;
}

function readDocsRecursive(dir, base = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const docs = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath  = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      docs.push(...readDocsRecursive(fullPath, relPath));
      continue;
    }
    if (!entry.name.endsWith('.md')) continue;

    const raw = fs.readFileSync(fullPath, 'utf8');

    // Retirer le front-matter --- ... --- s'il existe (fichiers legacy)
    const body = raw.replace(/^---[\s\S]*?---\r?\n?/, '').trim();

    // Titre : premier # du fichier ou nom du fichier
    const titleMatch = body.match(/^#\s+(.+)/m);
    const titre = titleMatch ? titleMatch[1].trim() : entry.name.replace(/\.md$/, '');

    // Contenu : tout sauf le H1
    const contenu = body.replace(/^#\s+.+\r?\n?/, '').trim();

    const relDir  = path.dirname(relPath) === '.' ? '' : path.dirname(relPath);
    const id      = relPath.replace(/\.md$/, '').replace(/[\\/]/g, '-');

    docs.push({
      id,
      titre,
      categorie : categorieFromDir(relDir),
      motsClefs : extractKeywords(titre, contenu),
      contenu,
      type      : detectType(body),
      pdfUrl    : findPdfUrl(fullPath, relPath),
      dateMAJ   : new Date().toISOString().slice(0, 10)
    });
  }
  return docs;
}

const docs = readDocsRecursive(DOCS_DIR);
fs.writeFileSync(OUT_FILE, JSON.stringify(docs, null, 2), 'utf8');
console.log(`✓ kb.json généré avec ${docs.length} document(s)`);
docs.forEach(d => {
  const pdf = d.pdfUrl ? ' [PDF]' : '';
  console.log(`  - [${d.categorie}] ${d.titre} (${d.type})${pdf}`);
});
