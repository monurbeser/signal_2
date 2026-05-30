// src/index.js
require('dotenv').config();
const db = require('./db');
const scheduler = require('./scheduler');
const outcome = require('./signals/outcome');
const api = require('./api/server');
const { sendTestMessage } = require('./telegram/bot');
const config = require('./config');

async function main() {
  console.log('🚀 CryptoSignal Futures başlatılıyor...');
  console.log(`   ${config.symbols.length} sembol | ${config.timeframe} | cooldown ${config.signal.cooldownMinutes}dk`);

  try { await db.init(); } catch (err) {
    console.error('[DB] Hata:', err.message);
  }

  api.start();

  if (process.env.SEND_TEST_ON_START === 'true') {
    try { await sendTestMessage(); } catch {}
  }

  scheduler.start();
  outcome.start(); // TP/SL tracker
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
