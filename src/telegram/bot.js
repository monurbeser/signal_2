// src/telegram/bot.js
const TelegramBot = require('node-telegram-bot-api');
const config = require('../config');

let bot;

function getBot() {
  if (!bot && config.telegram.token) {
    bot = new TelegramBot(config.telegram.token, { polling: false });
  }
  return bot;
}

/**
 * Sinyal mesajı formatlar
 */
function formatSignalMessage(signal) {
  const { symbol, direction, confidence, price, change24h, indicators, reasons } = signal;

  const dirEmoji = direction === 'BUY' ? '🟢' : direction === 'SELL' ? '🔴' : '🟡';
  const confBar  = buildConfBar(confidence);
  const priceStr = price < 1 ? price.toFixed(4) : price.toLocaleString('en-US', { maximumFractionDigits: 2 });
  const changeStr = change24h !== null
    ? ` (${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}%)`
    : '';

  const lines = [
    `${dirEmoji} *${direction} SİNYALİ — ${symbol}*`,
    ``,
    `💰 Fiyat: *$${priceStr}*${changeStr}`,
    `⏱ Timeframe: ${config.timeframe.toUpperCase()}`,
    ``,
    `📊 *Güven Skoru: ${confidence}/100*`,
    confBar,
    ``,
    `📈 *İndikatörler*`,
    ...reasons.map(r => `  • ${r}`),
    ``,
    `🕐 ${new Date().toLocaleString('tr-TR', { timeZone: 'Asia/Dubai' })}`,
  ];

  return lines.join('\n');
}

function buildConfBar(confidence) {
  const filled = Math.round(confidence / 10);
  const empty  = 10 - filled;
  return '█'.repeat(filled) + '░'.repeat(empty) + ` ${confidence}%`;
}

/**
 * Sinyal gönderir
 */
async function sendSignal(signal) {
  const b = getBot();
  if (!b) {
    console.warn('[Telegram] Bot token eksik — mesaj gönderilmedi');
    return false;
  }

  const text = formatSignalMessage(signal);
  try {
    await b.sendMessage(config.telegram.chatId, text, { parse_mode: 'Markdown' });
    console.log(`[Telegram] Gönderildi: ${signal.symbol} ${signal.direction} (${signal.confidence})`);
    return true;
  } catch (err) {
    console.error('[Telegram] Gönderme hatası:', err.message);
    return false;
  }
}

/**
 * Test mesajı — bot kurulumunu doğrular
 */
async function sendTestMessage() {
  const b = getBot();
  if (!b) throw new Error('TELEGRAM_BOT_TOKEN tanımlı değil');
  await b.sendMessage(
    config.telegram.chatId,
    '✅ *CryptoSignal Bot aktif!*\n\nSinyaller her 15 dakikada bir kontrol edilecek.',
    { parse_mode: 'Markdown' }
  );
}

module.exports = { sendSignal, sendTestMessage, formatSignalMessage };
