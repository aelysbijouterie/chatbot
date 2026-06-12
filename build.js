const fs = require('fs');
const path = require('path');

const DOCS_DIR = path.join(__dirname, 'docs');
const OUT_FILE = path.join(__dirname, 'api', 'kb.json');

function readDocsRecursive(dir, base = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const docs = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      docs.push(...readDocsRecursive(fullPath, relPath));
    } else if (entry.name.endsWith('.md')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const titleMatch = content.match(/^#\s+(.+)/m);
      const title = titleMatch ? titleMatch[1].trim() : relPath;
      docs.push({ id: relPath, title, content });
    }
  }
  return docs;
}

const docs = readDocsRecursive(DOCS_DIR);
fs.writeFileSync(OUT_FILE, JSON.stringify(docs, null, 2), 'utf8');
console.log(`✓ kb.json généré avec ${docs.length} document(s)`);
docs.forEach(d => console.log(`  - ${d.title} (${d.id})`));
