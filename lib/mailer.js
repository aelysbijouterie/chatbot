// ── Envoi d'email via Gmail SMTP ───────────────────────────────────────────
// Utilise le compte Gmail existant (aelys.bijouterie@gmail.com) plutôt qu'un
// service tiers comme Resend : pas de domaine à vérifier, pas de DNS à
// toucher — juste un mot de passe d'application Google. Gratuit, sans carte.
// Limite d'envoi Gmail (compte personnel) : 500 emails / jour, largement
// suffisant pour les 23 magasins.
//
// Configuration requise (variables d'environnement Vercel, Settings →
// Environment Variables) :
//   GMAIL_USER          = aelys.bijouterie@gmail.com
//   GMAIL_APP_PASSWORD  = mot de passe d'application à 16 caractères
//
// Pour générer ce mot de passe : sur le compte Google aelys.bijouterie@gmail.com,
// activer la validation en 2 étapes (si ce n'est pas déjà fait), puis
// myaccount.google.com/apppasswords → créer un mot de passe pour "AUREL'IA".
// C'est un code à 16 caractères différent du mot de passe Gmail habituel.

let nodemailer;
try { nodemailer = require('nodemailer'); } catch (e) { nodemailer = null; }

let cachedTransport = null;

function getTransport() {
  if (!nodemailer) return null;
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  if (!cachedTransport) {
    cachedTransport = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });
  }
  return cachedTransport;
}

// sendMail({ to, subject, html }) -> { ok: true } ou { ok: false, error }
// Ne lève jamais d'exception : un envoi raté ne doit jamais casser un build
// ou une requête API (même logique que l'ancienne intégration Resend).
async function sendMail({ to, subject, html }) {
  const transport = getTransport();
  if (!transport) {
    return { ok: false, error: 'GMAIL_USER / GMAIL_APP_PASSWORD non configurés (ou nodemailer non installé).' };
  }
  try {
    await transport.sendMail({
      from: `"AUREL'IA" <${process.env.GMAIL_USER}>`,
      to,
      subject,
      html,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { sendMail };
