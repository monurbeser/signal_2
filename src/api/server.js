// src/api/server.js
const express = require('express');
const path    = require('path');
const db      = require('../db');
const { analyzeSymbol } = require('../signals/runner');
const { getLivePrices } = require('../signals/outcome');
const config  = require('../config');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../public')));

app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

app.get('/api/live', (req, res) => {
  res.json({ ok: true, data: getLivePrices() });
});

app.get('/api/signals', async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit  || '100'), 500);
    const offset = parseInt(req.query.offset || '0');
    const [rows, total] = await Promise.all([
      db.getRecentSignals(limit, offset),
      db.getSignalCount(),
    ]);
    res.json({ ok: true, data: rows, total, limit, offset });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/signals/export', async (req, res) => {
  try {
    const rows = await db.getAllSignals();
    const header = 'Sinyal ID,Coin,Yön,Giriş Fiyatı,Stop Loss,Take Profit,Sonuç,Kar/Zarar %,Kapanış Fiyatı,Tarih\n';
    const csv = rows.map(r => [
      r.signal_id, r.symbol, r.direction, r.entry_price,
      r.sl_price || '', r.tp_price || '', r.outcome,
      r.pnl_pct != null ? r.pnl_pct + '%' : '',
      r.close_price || '',
      new Date(r.created_at).toLocaleString('tr-TR', { timeZone: 'Asia/Dubai' }),
    ].join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="signals_${Date.now()}.csv"`);
    res.send('\uFEFF' + header + csv);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/analyze/:symbol', async (req, res) => {
  const symbol = decodeURIComponent(req.params.symbol).toUpperCase();
  if (!config.symbols.includes(symbol))
    return res.status(400).json({ ok: false, error: 'Bilinmeyen sembol' });
  try {
    const signal = await analyzeSymbol(symbol);
    res.json({ ok: true, data: signal });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

function start(port = process.env.PORT || 3000) {
  app.listen(port, () => console.log(`[API] http://localhost:${port}`));
}

module.exports = { start };
