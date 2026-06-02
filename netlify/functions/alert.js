exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { question, date } = JSON.parse(event.body);
    const RESEND_API_KEY = process.env.RESEND_API_KEY;

    if (!RESEND_API_KEY) {
      console.warn('RESEND_API_KEY non configurée — alerte email désactivée');
      return { statusCode: 200, body: JSON.stringify({ skipped: true }) };
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: 'COUSSI IA <onboarding@resend.dev>',
        to: ['manon.mignot@aelys.fr'],
        subject: '⚠️ COUSSI IA — Question hors base documentaire',
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#F5F1EE;">
            <div style="background:#112033;padding:20px 24px;border-radius:12px 12px 0 0;">
              <h1 style="color:#A87B27;font-size:20px;margin:0;letter-spacing:1px;">COUSSI IA</h1>
              <p style="color:#EFE8E0;font-size:12px;margin:4px 0 0;opacity:0.8;">Assistant Aélys Nouvelle-Aquitaine</p>
            </div>
            <div style="background:#fff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #EFE8E0;">
              <h2 style="color:#B94040;font-size:16px;margin:0 0 12px;">⚠️ Question hors base documentaire</h2>
              <p style="color:#555;font-size:14px;margin:0 0 20px;line-height:1.6;">
                Une question posée à COUSSI IA n'a pas pu être répondue depuis la base documentaire. Le collaborateur a été invité à contacter l'équipe du bureau.
              </p>
              <div style="background:#FFF7F0;border-left:4px solid #A87B27;padding:14px 16px;border-radius:6px;margin-bottom:20px;">
                <p style="font-weight:600;color:#112033;margin:0 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">Question posée :</p>
                <p style="color:#333;margin:0;font-size:15px;font-style:italic;">"${question}"</p>
              </div>
              <p style="color:#999;font-size:12px;margin:0;">Le ${date}</p>
            </div>
          </div>
        `
      })
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ sent: res.ok })
    };

  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
