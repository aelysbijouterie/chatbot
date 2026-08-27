const { getMagasin } = require('../lib/stores.js');
const { getFile, putFile } = require('../lib/github.js');
const { slugify } = require('./admin-publish.js')._internal;

const DATA_PATH = 'contacts.json';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const ALLOWED_PHOTO_EXT = ['jpg', 'jpeg', 'png', 'webp'];

// ── Photo d'un contact ────────────────────────────────────────────────
// Les photos déjà déposées manuellement dans photos/ ne sont JAMAIS
// touchées tant que personne n'en dépose une nouvelle pour ce contact.
// Quand un fichier est fourni (photoFileName + photoBase64), il est
// commité sous photos/<nom-slugifié>.<ext> — au même chemin que la photo
// existante si elle a la même extension (remplacement propre), sinon à
// un nouveau chemin (l'ancien fichier reste, simplement plus référencé).
async function uploadContactPhoto(nom, fileName, fileBase64) {
  const ext = (String(fileName).split('.').pop() || '').toLowerCase();
  if (!ALLOWED_PHOTO_EXT.includes(ext)) {
    throw new Error('Format de photo non pris en charge — utilise JPG, PNG ou WEBP.');
  }
  let buffer;
  try { buffer = Buffer.from(fileBase64, 'base64'); }
  catch (e) { throw new Error('Photo invalide.'); }
  if (buffer.length > MAX_PHOTO_BYTES) {
    throw new Error(`Photo trop volumineuse (max ${Math.round(MAX_PHOTO_BYTES / (1024 * 1024))} Mo).`);
  }

  const photoPath = `photos/${slugify(nom)}.${ext}`;
  let sha;
  try { sha = (await getFile(photoPath)).sha; } catch (e) { sha = undefined; }
  await putFile(photoPath, buffer, sha, `Admin : photo de ${nom}`);
  return `/${photoPath}`;
}

function requireAdmin(req, res) {
  if (getMagasin(req) !== 'ADMIN') {
    res.status(401).json({ ok: false, error: 'Non autorisé.' });
    return false;
  }
  return true;
}

function sanitizeContact(body) {
  const nom = String(body.nom || '').trim();
  const poste = String(body.poste || '').trim();
  const service = String(body.service || '').trim();
  const email = String(body.email || '').trim();
  const telephone = String(body.telephone || '').trim();
  const photo = String(body.photo || '').trim() || null;
  const quiFaitQuoi = Array.isArray(body.quiFaitQuoi)
    ? body.quiFaitQuoi.map(s => String(s).trim()).filter(Boolean)
    : String(body.quiFaitQuoi || '')
        .split('\n').map(s => s.trim()).filter(Boolean);

  if (!nom) return { error: 'Le nom est requis.' };
  if (!service) return { error: 'Le service est requis.' };
  if (email && !EMAIL_RE.test(email)) return { error: 'Adresse email invalide.' };

  return { contact: { nom, poste, service, email, telephone, photo, quiFaitQuoi } };
}

module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAdmin(req, res)) return;

  try {
    if (req.method === 'GET') {
      const { content } = await getFile(DATA_PATH);
      return res.status(200).json({ ok: true, contacts: JSON.parse(content) });
    }

    if (req.method === 'POST') {
      const nom = String((req.body || {}).nom || '').trim();
      if (!nom) return res.status(400).json({ ok: false, error: 'Le nom est requis.' });
      if (req.body && req.body.photoFileName && req.body.photoBase64) {
        try { req.body.photo = await uploadContactPhoto(nom, req.body.photoFileName, req.body.photoBase64); }
        catch (e) { return res.status(400).json({ ok: false, error: e.message }); }
      }

      const { contact, error } = sanitizeContact(req.body || {});
      if (error) return res.status(400).json({ ok: false, error });

      const { content, sha } = await getFile(DATA_PATH);
      const contacts = JSON.parse(content);
      contacts.push(contact);

      await putFile(DATA_PATH, JSON.stringify(contacts, null, 2) + '\n', sha, `Admin : ajout du contact ${contact.nom}`);
      return res.status(200).json({ ok: true, contacts });
    }

    if (req.method === 'PUT') {
      const { index } = req.body || {};
      const idx = Number(index);
      const nom = String((req.body || {}).nom || '').trim();
      if (!nom) return res.status(400).json({ ok: false, error: 'Le nom est requis.' });
      if (req.body && req.body.photoFileName && req.body.photoBase64) {
        try { req.body.photo = await uploadContactPhoto(nom, req.body.photoFileName, req.body.photoBase64); }
        catch (e) { return res.status(400).json({ ok: false, error: e.message }); }
      }
      const { contact, error } = sanitizeContact(req.body || {});
      if (error) return res.status(400).json({ ok: false, error });

      const { content, sha } = await getFile(DATA_PATH);
      const contacts = JSON.parse(content);
      if (!Number.isInteger(idx) || idx < 0 || idx >= contacts.length) {
        return res.status(404).json({ ok: false, error: 'Contact introuvable.' });
      }
      contacts[idx] = contact;

      await putFile(DATA_PATH, JSON.stringify(contacts, null, 2) + '\n', sha, `Admin : modification du contact ${contact.nom}`);
      return res.status(200).json({ ok: true, contacts });
    }

    if (req.method === 'DELETE') {
      const { index } = req.body || {};
      const idx = Number(index);

      const { content, sha } = await getFile(DATA_PATH);
      const contacts = JSON.parse(content);
      if (!Number.isInteger(idx) || idx < 0 || idx >= contacts.length) {
        return res.status(404).json({ ok: false, error: 'Contact introuvable.' });
      }
      const removed = contacts[idx];
      contacts.splice(idx, 1);

      await putFile(DATA_PATH, JSON.stringify(contacts, null, 2) + '\n', sha, `Admin : suppression du contact ${removed.nom}`);
      return res.status(200).json({ ok: true, contacts });
    }

    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  } catch (e) {
    console.error('admin-contacts error:', e);
    return res.status(500).json({ ok: false, error: e.message || 'Erreur serveur.' });
  }
};
