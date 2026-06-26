const express  = require('express');
const path     = require('path');
const { exec } = require('child_process');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ── Routes API ────────────────────────────────────────────────────────────────
app.post('/api/chat',  require('./api/chat'));
app.post('/api/alert', require('./api/alert'));
app.post('/api/log',   require('./api/log'));

// ── Rebuild : reconstruit kb.json depuis les PDFs et .md ─────────────────────
app.post('/api/rebuild', (req, res) => {
  console.log('Rebuild demandé…');
  exec('node build.js', { cwd: __dirname }, (err, stdout, stderr) => {
    if (err) {
      console.error('Erreur rebuild :', stderr);
      return res.status(500).json({ ok: false, error: stderr });
    }
    // Vider le cache du module kb.json pour que chat.js recharge le nouveau
    const kbPath = path.join(__dirname, 'api', 'kb.json');
    delete require.cache[require.resolve(kbPath)];
    console.log(stdout);
    res.json({ ok: true, log: stdout });
  });
});

// ── Démarrage ─────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ AUREL'IA démarrée → http://localhost:${PORT}`);
  console.log(`   Réseau local       → http://[ip-serveur]:${PORT}\n`);
});
