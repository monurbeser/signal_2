// src/index.js
require('dotenv').config();
const db = require('./db');
const scheduler = require('./scheduler');
const api = require('./api/server');
const { sendTestMessage } = require('./telegram/bot');

async function main() {
  console.log('🚀 CryptoSignal başlatılıyor...');
  console.log(`   Semboller : ${require('./config').symbols.join(', ')}`);
  console.log(`   Timeframe : ${require('./config').timeframe}`);
  console.log(`   Cooldown  : ${require('./config').signal.cooldownMinutes} dk`);
  console.log(`   Min conf. : ${require('./config').signal.minConfidence}`);

  // DB init
  try {
    await db.init();
  } catch (err) {
    console.error('[DB] Bağlantı hatası — DB olmadan devam edilecek:', err.message);
  }

  // API server
  api.start();

  // Telegram test mesajı (opsiyonel)
  if (process.env.SEND_TEST_ON_START === 'true') {
    try {
      await sendTestMessage();
    } catch (err) {
      console.warn('[Telegram] Test mesajı gönderilemedi:', err.message);
    }
  }

  // Scheduler başlat
  scheduler.start();
}

main().catch(err => {
  console.error('Fatal hata:', err);
  process.exit(1);
});
