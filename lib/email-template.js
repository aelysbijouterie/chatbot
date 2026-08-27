// ── Gabarit d'e-mail AUREL'IA ──────────────────────────────────────────────
// Un seul gabarit visuel partagé par toutes les alertes envoyées par AUREL'IA
// (nouvelles procédures, question hors base, etc.), pour que chaque e-mail
// ait la même identité soignée. Basé sur des <table> (pas des <div>) car
// c'est ce qui s'affiche fidèlement dans le plus grand nombre de clients
// mail (Gmail, Outlook, Apple Mail, mail mobile) — les <div> + CSS moderne
// (border-radius, flex...) ne sont pas fiables dans Outlook desktop.
//
// Polices : on tente Georgia/Times pour les titres (proche de la serif de
// la charte Aélys) car les polices Google ne se chargent pas de façon
// fiable dans les e-mails — on ne dépend donc que de polices "système"
// déjà installées partout.

const BRAND = {
  navy:      '#112033',
  navyLight: '#1B2E48',
  gold:      '#A87B27',
  goldLight: '#C9A04A',
  cream:     '#F5F1EE',
  sand:      '#EFE8E0',
  text:      '#26313F',
  muted:     '#7A7068',
  alert:     '#B94040',
  white:     '#FFFFFF',
};

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const SERIF = "Georgia, 'Times New Roman', Times, serif";
const SANS  = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// eyebrow : petit libellé majuscule au-dessus du titre (ex. "NOUVELLE PROCÉDURE")
// title   : titre principal de l'e-mail (HTML déjà échappé si besoin)
// bodyHtml: contenu libre (paragraphes, encarts...) inséré tel quel
// cta     : { label, url } optionnel — bouton doré
// accentColor : couleur de la barre fine sous l'en-tête + de l'eyebrow (or par défaut, rouge pour une alerte)
// footerNote  : ligne de texte optionnelle sous la mention de pied de page standard
function emailShell({ preheader = '', eyebrow, title, bodyHtml, cta, accentColor = BRAND.gold, footerNote = '' }) {
  const ctaBlock = cta ? `
        <tr><td style="padding:4px 32px 34px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="border-radius:999px; background:${BRAND.gold};">
              <a href="${escapeHtml(cta.url)}" style="display:inline-block; padding:13px 28px; font-family:${SANS}; font-size:14px; font-weight:600; color:${BRAND.white}; text-decoration:none; letter-spacing:0.2px;">${escapeHtml(cta.label)} →</a>
            </td>
          </tr></table>
        </td></tr>` : `<tr><td style="padding-bottom:12px;"></td></tr>`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light" />
<meta name="x-apple-disable-message-reformatting" />
<title>AUREL'IA</title>
</head>
<body style="margin:0; padding:0; background:${BRAND.sand}; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; mso-hide:all;">${escapeHtml(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.sand};">
    <tr><td align="center" style="padding:36px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; background:${BRAND.white}; border-radius:18px; overflow:hidden;">

        <!-- en-tête -->
        <tr><td style="background:${BRAND.navy}; padding:30px 32px 26px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="width:42px; height:42px; border-radius:12px; background:${BRAND.goldLight}; text-align:center;">
              <span style="font-family:${SERIF}; font-size:21px; font-weight:700; color:${BRAND.navy}; line-height:42px;">A</span>
            </td>
            <td style="padding-left:14px; vertical-align:middle;">
              <div style="font-family:${SERIF}; font-size:19px; font-weight:700; color:${BRAND.goldLight}; letter-spacing:0.8px;">AUREL'IA</div>
              <div style="font-family:${SANS}; font-size:11.5px; color:#A9B3C2; margin-top:3px; letter-spacing:0.2px;">Assistante Aélys &middot; Nouvelle-Aquitaine</div>
            </td>
          </tr></table>
        </td></tr>

        <!-- filet d'accent -->
        <tr><td style="height:3px; background:${accentColor}; line-height:3px; font-size:0;">&nbsp;</td></tr>

        <!-- corps -->
        <tr><td style="padding:32px 32px 4px;">
          <p style="margin:0 0 10px; font-family:${SANS}; font-size:11.5px; font-weight:700; letter-spacing:1.2px; text-transform:uppercase; color:${accentColor};">${escapeHtml(eyebrow)}</p>
          <h1 style="margin:0 0 16px; font-family:${SERIF}; font-size:21px; line-height:1.35; font-weight:700; color:${BRAND.navy};">${title}</h1>
          <div style="font-family:${SANS}; font-size:14.5px; line-height:1.65; color:${BRAND.text};">
            ${bodyHtml}
          </div>
        </td></tr>

        ${ctaBlock}
      </table>

      <!-- pied de page -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td align="center" style="padding:20px 20px 0; font-family:${SANS}; font-size:11.5px; line-height:1.7; color:${BRAND.muted};">
          AUREL'IA — assistante interne Aélys Bijouterie${footerNote ? `<br/>${footerNote}` : ''}
        </td></tr>
      </table>

    </td></tr>
  </table>
</body>
</html>`;
}

module.exports = { emailShell, escapeHtml, BRAND, SERIF, SANS };
