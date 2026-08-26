const { getMagasin, getMagasinNom } = require('../lib/stores.js');
const { sendMail } = require('../lib/mailer.js');

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

    const html = `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#F5F1EE;">
            <div style="background:#112033;padding:20px 24px;border-radius:12px 12px 0 0;">
              <h1 style="color:#A87B27;font-size:20px;margin:0;letter-spacing:1px;">AUREL'IA</h1>
              <p style="color:#EFE8E0;font-size:12px;margin:4px 0 0;opacity:0.8;">Assistante Aélys Nouvelle-Aquitaine</p>
            </div>
            <div style="background:#fff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #EFE8E0;">
              <h2 style="color:#B94040;font-size:16px;margin:0 0 12px;">⚠️ Question hors base documentaire</h2>
              <p style="color:#555;font-size:14px;margin:0 0 20px;line-height:1.6;">
                Une question posée à AUREL'IA n'a pas pu être répondue depuis la base documentaire. La personne a été invitée à contacter l'équipe du bureau.
              </p>
              <div style="background:#FFF7F0;border-left:4px solid #A87B27;padding:14px 16px;border-radius:6px;margin-bottom:12px;">
                <p style="font-weight:600;color:#112033;margin:0 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">Question posée :</p>
                <p style="color:#333;margin:0;font-size:15px;font-style:italic;">"${question}"</p>
              </div>
              <p style="color:#112033;font-size:13px;margin:0 0 6px;"><strong>Magasin :</strong> ${magasinLabel}</p>
              <p style="color:#999;font-size:12px;margin:0;">Le ${date}</p>
            </div>
          </div>
        `;

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
