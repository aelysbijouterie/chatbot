// ── Backend hybride : GitHub API (Vercel) ou filesystem local ────────────────
// Si GITHUB_TOKEN est défini → mode Vercel (API GitHub).
// Sinon                      → mode local (lecture/écriture disque).

const fs   = require('fs');
const path = require('path');
const { exec } = require('child_process');

const ROOT = path.join(__dirname, '..');

// ══════════════════════════════════════════════════════════════════════════════
// MODE LOCAL
// ══════════════════════════════════════════════════════════════════════════════

function fullPath(filePath) {
  const resolved = path.resolve(ROOT, filePath);
  if (!resolved.startsWith(ROOT + path.sep) && resolved !== ROOT) {
    throw new Error(`Chemin non autorisé : ${filePath}`);
  }
  return resolved;
}

function rebuildAsync() {
  exec('node build.js', { cwd: ROOT }, (err, stdout, stderr) => {
    if (err) console.error('[rebuild] Erreur :', stderr);
    else {
      try { delete require.cache[require.resolve(path.join(ROOT, 'api', 'kb.json'))]; } catch (_) {}
      console.log('[rebuild] OK');
    }
  });
}

async function getFileLocal(filePath) {
  const fp = fullPath(filePath);
  if (!fs.existsSync(fp)) throw new Error(`Fichier introuvable : ${filePath}`);
  const content = fs.readFileSync(fp, 'utf8');
  return { content, sha: Buffer.from(String(content.length)).toString('hex').padStart(40, '0') };
}

async function putFileLocal(filePath, content, _sha, _message) {
  const fp = fullPath(filePath);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  if (Buffer.isBuffer(content)) fs.writeFileSync(fp, content);
  else fs.writeFileSync(fp, content, 'utf8');
  rebuildAsync();
  return { ok: true };
}

async function deleteFileLocal(filePath, _sha, _message) {
  const fp = fullPath(filePath);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
  rebuildAsync();
  return { ok: true };
}

// ══════════════════════════════════════════════════════════════════════════════
// MODE GITHUB (Vercel)
// ══════════════════════════════════════════════════════════════════════════════

const GITHUB_USER   = 'aelysbijouterie';
const GITHUB_REPO   = 'chatbot';
const GITHUB_BRANCH = 'main';

function authHeaders() {
  return {
    'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'aurelia-admin',
  };
}

function encodePath(filePath) {
  return String(filePath).split('/').map(encodeURIComponent).join('/');
}

async function getFileGH(filePath) {
  const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${encodePath(filePath)}?ref=${GITHUB_BRANCH}`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Lecture GitHub de ${filePath} impossible (${res.status} ${res.statusText}).`);
  const data = await res.json();
  return { content: Buffer.from(data.content, 'base64').toString('utf8'), sha: data.sha };
}

async function putFileGH(filePath, content, sha, message) {
  const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${encodePath(filePath)}`;
  const body = {
    message,
    content: Buffer.isBuffer(content) ? content.toString('base64') : Buffer.from(content, 'utf8').toString('base64'),
    branch: GITHUB_BRANCH,
  };
  if (sha) body.sha = sha;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Écriture GitHub de ${filePath} impossible (${res.status} ${res.statusText}). ${errText}`.trim());
  }
  return res.json();
}

async function deleteFileGH(filePath, sha, message) {
  const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${encodePath(filePath)}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sha, branch: GITHUB_BRANCH }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Suppression GitHub de ${filePath} impossible (${res.status} ${res.statusText}). ${errText}`.trim());
  }
  return res.json();
}

// ══════════════════════════════════════════════════════════════════════════════
// EXPORT : choisit le bon mode automatiquement
// ══════════════════════════════════════════════════════════════════════════════

const isLocal = !process.env.GITHUB_TOKEN;

module.exports = {
  getFile    : isLocal ? getFileLocal  : getFileGH,
  putFile    : isLocal ? putFileLocal  : putFileGH,
  deleteFile : isLocal ? deleteFileLocal : deleteFileGH,
  GITHUB_USER, GITHUB_REPO, GITHUB_BRANCH,
};
