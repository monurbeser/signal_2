// src/api/server.js
const express = require('express');
const db = require('../db');
const { analyzeSymbol } = require('../signals/runner');
const { formatSignalMessage } = require('../telegram/bot');
const config = require('../config');

const app = express();
app.use(express.json());

// Health check — Railway bu endpoint'i kullanır
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), ts: new Date() });
});

// Son sinyaller
app.get('/api/signals', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '50');
    const signals = await db.getRecentSignals(limit);
    res.json({ ok: true, data: signals });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Anlık analiz (manuel tetikleme)
app.get('/api/analyze/:symbol', async (req, res) => {
  const symbol = decodeURIComponent(req.params.symbol).toUpperCase();
  if (!config.symbols.includes(symbol)) {
    return res.status(400).json({ ok: false, error: 'Bilinmeyen sembol' });
  }
  try {
    const signal = await analyzeSymbol(symbol);
    res.json({ ok: true, data: signal });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Telegram mesaj önizleme
app.get('/api/preview/:symbol', async (req, res) => {
  const symbol = decodeURIComponent(req.params.symbol).toUpperCase();
  try {
    const signal = await analyzeSymbol(symbol);
    const text = formatSignalMessage(signal);
    res.json({ ok: true, message: text, signal });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

function start(port = process.env.PORT || 3000) {
  app.listen(port, () => {
    console.log(`[API] Çalışıyor: http://localhost:${port}`);
  });
}

module.exports = { start };
