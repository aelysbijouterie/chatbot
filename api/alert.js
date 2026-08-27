const { getMagasin, getMagasinNom } = require('../lib/stores.js');
const { sendMail } = require('../lib/mailer.js');
const { emailShell, escapeHtml, BRAND } = require('../lib/email-template.js');

module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { question, date } = req.body;

    const magasinCode = getMagasin(req);
    const magasinNom = magasinCode ? getMagasinNom(magasinCode) : null;
    const magasinLabel = magasinNom ? `${magasinNom} (${magasinCode})` : (magasinCode || 'Magasin inconnu');

    const baseUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);

    const bodyHtml = `
      <p style="margin:0 0 18px;">Une question posée à AUREL'IA n'a pas pu être répondue depuis la base documentaire. La personne a été invitée à contacter l'équipe du bureau.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.cream}; border-radius:10px; margin-bottom:16px;">
        <tr>
          <td style="width:4px; background:${BRAND.alert}; border-radius:10px 0 0 10px; font-size:0; line-height:0;">&nbsp;</td>
          <td style="padding:16px 18px;">
            <p style="margin:0 0 6px; font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif; font-size:11px; font-weight:700; letter-spacing:0.8px; text-transform:uppercase; color:${BRAND.navy};">Question posée</p>
            <p style="margin:0; font-family:Georgia,'Times New Roman',Times,serif; font-size:15.5px; font-style:italic; color:${BRAND.text}; line-height:1.5;">&laquo;&nbsp;${escapeHtml(question)}&nbsp;&raquo;</p>
          </td>
        </tr>
      </table>
      <table role="presentation" cellpadding="0" cellspacing="0" style="font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif; font-size:13px; color:${BRAND.navy};">
        <tr>
          <td style="padding-right:22px; padding-bottom:4px;"><strong>Magasin&nbsp;:</strong> ${escapeHtml(magasinLabel)}</td>
        </tr>
        <tr>
          <td style="color:${BRAND.muted}; font-size:12px;">${escapeHtml(date)}</td>
        </tr>
      </table>`;

    const html = emailShell({
      preheader: `Question hors base posée par ${magasinLabel} : "${question}"`,
      eyebrow: 'Alerte',
      title: 'Question hors base documentaire',
      bodyHtml,
      cta: baseUrl ? { label: "Ouvrir AUREL'IA", url: baseUrl } : null,
      accentColor: BRAND.alert,
      footerNote: 'Vous recevez cet e-mail automatiquement quand AUREL\'IA ne trouve pas de réponse dans sa base.',
    });

    const result = await sendMail({
      to: 'manon.mignot@aelys.fr',
      subject: `⚠️ AUREL'IA — Question hors base [${magasinLabel}]`,
      html
    });
    if (!result.ok) console.warn('Alerte "hors base" non envoyée :', result.error);

    return res.status(200).json({ sent: result.ok });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
