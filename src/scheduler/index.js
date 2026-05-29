// src/scheduler/index.js
const cron = require('node-cron');
const { analyzeAll } = require('../signals/runner');
const { sendSignal } = require('../telegram/bot');
const db = require('../db');
const config = require('../config');

// Cooldown takibi: son sinyal zamanı (symbol → Date)
const lastSignalTime = new Map();

/**
 * Cooldown kontrolü — aynı sembol için çok sık sinyal göndermeyi engeller
 */
function isOnCooldown(symbol) {
  const last = lastSignalTime.get(symbol);
  if (!last) return false;
  const diffMinutes = (Date.now() - last) / 1000 / 60;
  return diffMinutes < config.signal.cooldownMinutes;
}

/**
 * Tek çalışma döngüsü
 */
async function runCycle() {
  console.log(`\n[Scheduler] Çalışıyor: ${new Date().toISOString()}`);

  let signals;
  try {
    signals = await analyzeAll();
  } catch (err) {
    console.error('[Scheduler] Analiz hatası:', err.message);
    return;
  }

  for (const signal of signals) {
    const { symbol, direction, confidence } = signal;
    console.log(`  ${symbol}: ${direction} @ ${confidence}/100`);

    // HOLD sinyallerini gönderme
    if (direction === 'HOLD') continue;

    // Minimum güven skoru filtresi
    if (confidence < config.signal.minConfidence) {
      console.log(`  → Güven skoru yetersiz (${confidence} < ${config.signal.minConfidence}), atlandı`);
      continue;
    }

    // Cooldown kontrolü
    if (isOnCooldown(symbol)) {
      console.log(`  → ${symbol} cooldown'da, atlandı`);
      continue;
    }

    // DB'ye kaydet
    let signalId;
    try {
      signalId = await db.saveSignal(signal);
    } catch (err) {
      console.error(`  → DB kayıt hatası (${symbol}):`, err.message);
    }

    // Telegram'a gönder
    const sent = await sendSignal(signal);

    if (sent) {
      lastSignalTime.set(symbol, Date.now());
      if (signalId) await db.markSent(signalId).catch(() => {});
    }
  }
}

/**
 * Cron başlatır — her 15 dakikada bir
 * "0,15,30,45 * * * *" = her saat başında ve 15, 30, 45. dakikalarda
 */
function start() {
  console.log('[Scheduler] Başlatıldı — her 15 dakikada bir çalışacak');

  // İlk çalıştırma hemen
  runCycle();

  // Sonraki çalıştırmalar cron ile
  cron.schedule('0,15,30,45 * * * *', runCycle);
}

module.exports = { start, runCycle };
