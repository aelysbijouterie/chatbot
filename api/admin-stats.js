const { getMagasin } = require('../lib/stores.js');

// ── Statistiques d'usage ────────────────────────────────────────────────
// Source des données : le Google Sheet de logs (voir GUIDE-LOGS.md), publié
// sur le web au format CSV (Fichier → Partager → Publier sur le Web → CSV).
// Aucune base de données à héberger : on relit simplement ce CSV public à
// chaque appel et on calcule les agrégats à la volée.
//
// Configuration requise (Vercel → Settings → Environment Variables) :
//   STATS_SHEET_CSV_URL = https://docs.google.com/spreadsheets/d/.../pub?output=csv
//
// Colonnes attendues (dans cet ordre) : Date, Question, Type, Réponse, Magasin, Fiche
// (la colonne Fiche est optionnelle — ajoutée récemment, voir GUIDE-LOGS.md).

function requireAdmin(req, res) {
  if (getMagasin(req) !== 'ADMIN') {
    res.status(401).json({ ok: false, error: 'Non autorisé.' });
    return false;
  }
  return true;
}

// Parseur CSV minimal mais conforme RFC4180 : gère les champs entre
// guillemets contenant des virgules, des retours à la ligne et des
// guillemets échappés ("").
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  while (i < len) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    } else {
      if (c === '"') { inQuotes = true; i++; continue; }
      if (c === ',') { row.push(field); field = ''; i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
      field += c; i++; continue;
    }
  }
  // dernier champ / dernière ligne (fichier sans \n final)
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0] !== ''));
}

// "26/08/2026 14:23:05" (fr-FR, tel qu'écrit par api/log.js) -> Date | null
function parseFrDate(s) {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d));
  return isNaN(dt.getTime()) ? null : dt;
}

function normalizeQuestion(q) {
  return String(q || '')
    .toLowerCase()
    .trim()
    .replace(/\s*[?!.]+$/, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function topEntries(counts, limit) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

function computeStats(rows) {
  // rows[0] = en-têtes, on les ignore par position plutôt que par nom
  // (plus robuste si l'ordre des colonnes du Sheet a été modifié à la main).
  const dataRows = rows.slice(1);

  const byType = { reponse: 0, hors_base: 0, feedback_positif: 0, feedback_negatif: 0, autre: 0 };
  const horsBaseCounts = {};
  const horsBaseSample = {}; // question normalisée -> dernière question "vraie" (casse d'origine)
  const ficheCounts = {};
  const magasinCounts = {};
  const dailyCounts = {}; // 'YYYY-MM-DD' -> nb (tous types confondus)
  let total = 0;
  let earliestDate = null, latestDate = null;

  for (const r of dataRows) {
    const [dateStr, question, type, , magasin, fiche] = r;
    if (!dateStr && !question && !type) continue; // ligne vide
    total++;

    const t = (type || '').trim();
    if (byType[t] !== undefined) byType[t]++; else byType.autre++;

    const dt = parseFrDate(dateStr);
    if (dt) {
      if (!earliestDate || dt < earliestDate) earliestDate = dt;
      if (!latestDate || dt > latestDate) latestDate = dt;
      const key = dt.toISOString().slice(0, 10);
      dailyCounts[key] = (dailyCounts[key] || 0) + 1;
    }

    if (t === 'hors_base' && question) {
      const norm = normalizeQuestion(question);
      if (norm) {
        horsBaseCounts[norm] = (horsBaseCounts[norm] || 0) + 1;
        horsBaseSample[norm] = question.trim();
      }
    }

    if (t === 'reponse' && fiche && fiche.trim()) {
      ficheCounts[fiche.trim()] = (ficheCounts[fiche.trim()] || 0) + 1;
    }

    const mag = (magasin || '').trim();
    if (mag) magasinCounts[mag] = (magasinCounts[mag] || 0) + 1;
  }

  const feedbackTotal = byType.feedback_positif + byType.feedback_negatif;
  const horsBaseTop = topEntries(horsBaseCounts, 10).map(e => ({ label: horsBaseSample[e.label] || e.label, count: e.count }));

  // Tendance : nb de questions par jour sur les 14 derniers jours avec des données.
  const trend = Object.entries(dailyCounts)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-14)
    .map(([date, count]) => ({ date, count }));

  return {
    total,
    periode: {
      debut: earliestDate ? earliestDate.toISOString().slice(0, 10) : null,
      fin: latestDate ? latestDate.toISOString().slice(0, 10) : null,
    },
    reponses: byType.reponse,
    horsBase: byType.hors_base,
    horsBaseRate: total ? Math.round((byType.hors_base / total) * 1000) / 10 : 0,
    feedbackPositif: byType.feedback_positif,
    feedbackNegatif: byType.feedback_negatif,
    feedbackRate: feedbackTotal ? Math.round((byType.feedback_positif / feedbackTotal) * 1000) / 10 : null,
    topHorsBase: horsBaseTop,
    topFiches: topEntries(ficheCounts, 10),
    parMagasin: topEntries(magasinCounts, 50),
    tendance: trend,
    ficheDataDisponible: Object.keys(ficheCounts).length > 0,
  };
}

module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAdmin(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  const csvUrl = process.env.STATS_SHEET_CSV_URL;
  if (!csvUrl) {
    return res.status(500).json({ ok: false, error: "STATS_SHEET_CSV_URL non configuré côté serveur." });
  }

  try {
    const r = await fetch(csvUrl);
    if (!r.ok) throw new Error(`Lecture du Google Sheet impossible (${r.status}).`);
    const text = await r.text();
    const rows = parseCSV(text);
    if (!rows.length) {
      return res.status(200).json({ ok: true, stats: computeStats([]), vide: true });
    }
    const stats = computeStats(rows);
    return res.status(200).json({ ok: true, stats });
  } catch (e) {
    console.error('admin-stats error:', e);
    return res.status(500).json({ ok: false, error: e.message || 'Erreur serveur.' });
  }
};

module.exports._internal = { parseCSV, computeStats, parseFrDate, normalizeQuestion };
