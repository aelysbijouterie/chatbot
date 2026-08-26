const { getMagasin } = require('../lib/stores.js');
const { getFile, putFile } = require('../lib/github.js');

const DATA_PATH = 'contacts.json';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
