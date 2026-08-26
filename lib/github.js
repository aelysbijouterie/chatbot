// ── Client minimal pour l'API "Contents" de GitHub ──────────────────────────
// Les fonctions Vercel tournent sur un système de fichiers en lecture seule :
// on ne peut donc pas modifier data/magasins.json ou contacts.json sur le
// disque du serveur. Pour que les écritures de l'admin (magasins, annuaire,
// bientôt les procédures) soient réellement persistées, on les commite
// directement dans le dépôt GitHub via cette API — ce qui déclenche ensuite
// le redéploiement automatique Vercel (~1-2 min) et rend le changement live.
//
// Configuration requise (Vercel → Settings → Environment Variables) :
//   GITHUB_TOKEN = <personal access token, fine-grained, scope "chatbot", permission Contents: Read & write>

const GITHUB_USER   = 'aelysbijouterie';
const GITHUB_REPO   = 'chatbot';
const GITHUB_BRANCH = 'main';

function authHeaders() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    const err = new Error("GITHUB_TOKEN non configuré côté serveur — impossible d'enregistrer la modification.");
    err.code = 'NO_GITHUB_TOKEN';
    throw err;
  }
  return {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'aurelia-admin',
  };
}

// Lit un fichier du dépôt. Renvoie { content: <texte utf8>, sha: <sha du blob> }.
// Le sha est requis par GitHub pour tout PUT ultérieur (évite d'écraser une
// modification concurrente).
async function getFile(filePath) {
  const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${filePath}?ref=${GITHUB_BRANCH}`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    throw new Error(`Lecture GitHub de ${filePath} impossible (${res.status} ${res.statusText}).`);
  }
  const data = await res.json();
  const content = Buffer.from(data.content, 'base64').toString('utf8');
  return { content, sha: data.sha };
}

// Écrit (crée ou met à jour) un fichier du dépôt.
async function putFile(filePath, content, sha, message) {
  const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${filePath}`;
  const body = {
    message,
    content: Buffer.from(content, 'utf8').toString('base64'),
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

module.exports = { getFile, putFile, GITHUB_USER, GITHUB_REPO, GITHUB_BRANCH };
