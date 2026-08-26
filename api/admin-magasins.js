const { getMagasin } = require('../lib/stores.js');
const { getFile, putFile } = require('../lib/github.js');

const DATA_PATH = 'data/magasins.json';
const CODE_RE = /^[A-Za-z0-9]{2,6}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function requireAdmin(req, res) {
  if (getMagasin(req) !== 'ADMIN') {
    res.status(401).json({ ok: false, error: 'Non autorisé.' });
    return false;
  }
  return true;
}

module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAdmin(req, res)) return;

  try {
    if (req.method === 'GET') {
      const { content } = await getFile(DATA_PATH);
      return res.status(200).json({ ok: true, magasins: JSON.parse(content) });
    }

    if (req.method === 'POST') {
      const { code, nom, email, originalCode } = req.body || {};
      const trimCode = String(code || '').trim();
      const trimNom = String(nom || '').trim();
      const trimEmail = String(email || '').trim();

      if (!CODE_RE.test(trimCode)) {
        return res.status(400).json({ ok: false, error: 'Code magasin invalide (2 à 6 lettres/chiffres).' });
      }
      if (!trimNom) {
        return res.status(400).json({ ok: false, error: 'Le nom du magasin est requis.' });
      }
      if (!EMAIL_RE.test(trimEmail)) {
        return res.status(400).json({ ok: false, error: 'Adresse email invalide.' });
      }

      const { content, sha } = await getFile(DATA_PATH);
      const magasins = JSON.parse(content);

      const editing = originalCode && String(originalCode).trim();
      const dupIndex = magasins.findIndex(m => m.code === trimCode);
      if (dupIndex !== -1 && (!editing || magasins[dupIndex].code !== editing)) {
        return res.status(409).json({ ok: false, error: `Le code ${trimCode} est déjà utilisé par un autre magasin.` });
      }

      if (editing) {
        const idx = magasins.findIndex(m => m.code === editing);
        if (idx === -1) {
          return res.status(404).json({ ok: false, error: `Magasin ${editing} introuvable.` });
        }
        magasins[idx] = { code: trimCode, nom: trimNom, email: trimEmail };
      } else {
        magasins.push({ code: trimCode, nom: trimNom, email: trimEmail });
      }

      magasins.sort((a, b) => a.code.localeCompare(b.code, 'fr', { numeric: true }));

      await putFile(
        DATA_PATH,
        JSON.stringify(magasins, null, 2) + '\n',
        sha,
        editing ? `Admin : modification du magasin ${trimCode}` : `Admin : ajout du magasin ${trimCode}`
      );

      return res.status(200).json({ ok: true, magasins });
    }

    if (req.method === 'DELETE') {
      const { code } = req.body || {};
      const trimCode = String(code || '').trim();
      if (!trimCode) {
        return res.status(400).json({ ok: false, error: 'Code magasin manquant.' });
      }

      const { content, sha } = await getFile(DATA_PATH);
      const magasins = JSON.parse(content);
      const next = magasins.filter(m => m.code !== trimCode);
      if (next.length === magasins.length) {
        return res.status(404).json({ ok: false, error: `Magasin ${trimCode} introuvable.` });
      }

      await putFile(DATA_PATH, JSON.stringify(next, null, 2) + '\n', sha, `Admin : suppression du magasin ${trimCode}`);
      return res.status(200).json({ ok: true, magasins: next });
    }

    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  } catch (e) {
    console.error('admin-magasins error:', e);
    return res.status(500).json({ ok: false, error: e.message || 'Erreur serveur.' });
  }
};
