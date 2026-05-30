// src/signals/outcome.js — Açık sinyallerin TP/SL takibi
const { fetchTicker } = require('./fetcher');
const db = require('../db');

/**
 * Her 2 dakikada bir açık sinyalleri kontrol eder.
 * TP → WIN, SL → LOSS, 24s geçti → EXPIRED
 */
async function checkOutcomes() {
  let openSignals;
  try {
    openSignals = await db.getOpenSignals();
  } catch (err) {
    console.error('[Outcome] DB hatası:', err.message);
    return;
  }

  if (!openSignals.length) return;
  console.log(`[Outcome] ${openSignals.length} açık sinyal kontrol ediliyor...`);

  for (const signal of openSignals) {
    try {
      const now = Date.now();
      const age = (now - new Date(signal.created_at).getTime()) / 1000 / 3600; // saat

      // 24 saat geçtiyse expire et
      if (age >= 24) {
        const ticker = await fetchTicker(signal.symbol);
        const closePrice = ticker.price;
        const pnl = calcPnL(signal, closePrice);
        await db.closeSignal(signal.id, 'EXPIRED', closePrice, pnl);
        console.log(`  ⏰ EXPIRED: ${signal.signal_id} ${signal.symbol} PnL: ${pnl}%`);
        continue;
      }

      if (!signal.tp_price && !signal.sl_price) continue;

      const ticker = await fetchTicker(signal.symbol);
      const price = parseFloat(ticker.price);
      const tp = parseFloat(signal.tp_price);
      const sl = parseFloat(signal.sl_price);

      if (signal.direction === 'LONG') {
        if (price >= tp) {
          const pnl = calcPnL(signal, price);
          await db.closeSignal(signal.id, 'WIN', price, pnl);
          console.log(`  ✅ WIN: ${signal.signal_id} ${signal.symbol} @ ${price} PnL: +${pnl}%`);
        } else if (price <= sl) {
          const pnl = calcPnL(signal, price);
          await db.closeSignal(signal.id, 'LOSS', price, pnl);
          console.log(`  ❌ LOSS: ${signal.signal_id} ${signal.symbol} @ ${price} PnL: ${pnl}%`);
        }
      } else if (signal.direction === 'SHORT') {
        if (price <= tp) {
          const pnl = calcPnL(signal, price);
          await db.closeSignal(signal.id, 'WIN', price, pnl);
          console.log(`  ✅ WIN: ${signal.signal_id} ${signal.symbol} @ ${price} PnL: +${pnl}%`);
        } else if (price >= sl) {
          const pnl = calcPnL(signal, price);
          await db.closeSignal(signal.id, 'LOSS', price, pnl);
          console.log(`  ❌ LOSS: ${signal.signal_id} ${signal.symbol} @ ${price} PnL: ${pnl}%`);
        }
      }
    } catch (err) {
      console.error(`  [Outcome] ${signal.symbol} hata:`, err.message);
    }
  }
}

function calcPnL(signal, closePrice) {
  const entry = parseFloat(signal.entry_price);
  const lev = signal.leverage || 1;
  let pct;
  if (signal.direction === 'LONG') {
    pct = ((closePrice - entry) / entry) * 100 * lev;
  } else {
    pct = ((entry - closePrice) / entry) * 100 * lev;
  }
  return parseFloat(pct.toFixed(2));
}

function start() {
  console.log('[Outcome] Tracker başlatıldı — her 2 dakikada kontrol');
  checkOutcomes(); // ilk kontrol
  setInterval(checkOutcomes, 2 * 60 * 1000);
}

module.exports = { start, checkOutcomes };
