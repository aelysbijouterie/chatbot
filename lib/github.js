// ── Backend local (remplace l'API GitHub) ────────────────────────────────────
// En mode local, tous les fichiers sont lus/écrits directement sur le disque.
// Le "sha" est simulé avec un hash md5 du contenu (pour compatibilité des appels).
// Après chaque écriture/suppression, build.js est relancé automatiquement.

const fs   = require('fs');
const path = require('path');
const { exec } = require('child_process');

const ROOT = path.join(__dirname, '..');

function fullPath(filePath) {
  // Sécurité : on refuse les chemins qui sortent du dossier projet
  const resolved = path.resolve(ROOT, filePath);
  if (!resolved.startsWith(ROOT + path.sep) && resolved !== ROOT) {
    throw new Error(`Chemin non autorisé : ${filePath}`);
  }
  return resolved;
}

function fakeSha(content) {
  // SHA factice basé sur la taille — suffit pour la compatibilité des appels
  return Buffer.from(String(content.length)).toString('hex').padStart(40, '0');
}

function rebuildAsync() {
  exec('node build.js', { cwd: ROOT }, (err, stdout, stderr) => {
    if (err) console.error('[rebuild] Erreur :', stderr);
    else {
      // Vider le cache kb.json
      try { delete require.cache[require.resolve(path.join(ROOT, 'api', 'kb.json'))]; } catch (_) {}
      console.log('[rebuild] OK');
    }
  });
}

async function getFile(filePath) {
  const fp = fullPath(filePath);
  if (!fs.existsSync(fp)) {
    throw new Error(`Fichier introuvable : ${filePath}`);
  }
  const content = fs.readFileSync(fp, 'utf8');
  return { content, sha: fakeSha(content) };
}

async function putFile(filePath, content, _sha, _message) {
  const fp = fullPath(filePath);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  if (Buffer.isBuffer(content)) {
    fs.writeFileSync(fp, content);
  } else {
    fs.writeFileSync(fp, content, 'utf8');
  }
  rebuildAsync();
  return { ok: true };
}

async function deleteFile(filePath, _sha, _message) {
  const fp = fullPath(filePath);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
  rebuildAsync();
  return { ok: true };
}

module.exports = { getFile, putFile, deleteFile, GITHUB_USER: 'local', GITHUB_REPO: 'local', GITHUB_BRANCH: 'local' };
