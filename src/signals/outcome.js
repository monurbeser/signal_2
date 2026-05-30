// src/signals/outcome.js
const { fetchTicker } = require('./fetcher');
const db = require('../db');

const livePrices = new Map();

function calcPnL(signal, currentPrice) {
  const entry = parseFloat(signal.entry_price);
  const lev   = signal.leverage || 1;
  const pct   = signal.direction === 'LONG'
    ? ((currentPrice - entry) / entry) * 100 * lev
    : ((entry - currentPrice) / entry) * 100 * lev;
  return parseFloat(pct.toFixed(2));
}

async function checkOutcomes() {
  let openSignals;
  try {
    openSignals = await db.getOpenSignals();
  } catch (err) {
    console.error('[Outcome] DB hatası:', err.message);
    return;
  }

  if (!openSignals.length) return;

  for (const signal of openSignals) {
    try {
      const ticker = await fetchTicker(signal.symbol);
      const price  = parseFloat(ticker.price);
      const pnl    = calcPnL(signal, price);
      const age    = (Date.now() - new Date(signal.created_at).getTime()) / 3600000;

      livePrices.set(signal.id, {
        symbol:     signal.symbol,
        signalId:   signal.signal_id,
        direction:  signal.direction,
        entryPrice: parseFloat(signal.entry_price),
        tpPrice:    parseFloat(signal.tp_price),
        slPrice:    parseFloat(signal.sl_price),
        leverage:   signal.leverage,
        price,
        pnlPct:     pnl,
        updatedAt:  new Date(),
      });

      const tp = parseFloat(signal.tp_price);
      const sl = parseFloat(signal.sl_price);
      let outcome = null;

      if (age >= 24) {
        outcome = 'EXPIRED';
      } else if (signal.direction === 'LONG') {
        if (price >= tp) outcome = 'WIN';
        else if (price <= sl) outcome = 'LOSS';
      } else if (signal.direction === 'SHORT') {
        if (price <= tp) outcome = 'WIN';
        else if (price >= sl) outcome = 'LOSS';
      }

      if (outcome) {
        await db.closeSignal(signal.id, outcome, price, pnl);
        livePrices.delete(signal.id);
        const icon = outcome === 'WIN' ? '✅' : outcome === 'LOSS' ? '❌' : '⏰';
        console.log(`[Outcome] ${icon} ${outcome}: ${signal.signal_id} ${signal.symbol} @ ${price} | PnL: ${pnl > 0 ? '+' : ''}${pnl}%`);
      }
    } catch (err) {
      console.error(`[Outcome] ${signal.symbol} hata:`, err.message);
    }
  }
}

function getLivePrices() {
  return Array.from(livePrices.values());
}

function start() {
  console.log('[Outcome] Tracker başlatıldı — her 30 saniyede güncelleniyor');
  checkOutcomes();
  setInterval(checkOutcomes, 30_000);
}

module.exports = { start, checkOutcomes, getLivePrices };
