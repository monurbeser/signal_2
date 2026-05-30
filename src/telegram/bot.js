// src/telegram/bot.js — Futures signal message
const TelegramBot = require('node-telegram-bot-api');
const config = require('../config');

let bot;
function getBot() {
  if (!bot && config.telegram.token) {
    bot = new TelegramBot(config.telegram.token, { polling: false });
  }
  return bot;
}

function fmtPrice(p, symbol) {
  if (!p) return '—';
  // Küçük coinler için daha fazla ondalık
  const decimals = p < 0.01 ? 6 : p < 1 ? 4 : p < 100 ? 3 : 2;
  return '$' + parseFloat(p).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatSignalMessage(signal) {
  const { symbol, direction, confidence, price, change24h, indicators, reasons, leverage, tpsl } = signal;

  const dirEmoji = direction === 'LONG' ? '🟢' : '🔴';
  const dirLabel = direction === 'LONG' ? 'LONG (AL)' : 'SHORT (SAT)';
  const confBar  = buildConfBar(confidence);
  const priceStr = fmtPrice(price, symbol);
  const changeStr = change24h != null
    ? ` (${change24h >= 0 ? '+' : ''}${parseFloat(change24h).toFixed(2)}%)`
    : '';

  const lines = [
    `${dirEmoji} *FUTURES ${dirLabel} — ${symbol}*`,
    ``,
    `💰 Fiyat: *${priceStr}*${changeStr}`,
    `⏱ ${config.timeframe.toUpperCase()} | 🎯 Güven: *${confidence}/100*`,
    confBar,
  ];

  if (leverage && tpsl) {
    lines.push(``, `⚡ *Kaldıraç: ${leverage}x*`);
    lines.push(`✅ TP: *${fmtPrice(tpsl.tp)}*  (+${tpsl.tpPct}%)`);
    lines.push(`🛑 SL: *${fmtPrice(tpsl.sl)}*  (-${tpsl.slPct}%)`);
    lines.push(`💸 Tahmini Kazanç: *+${tpsl.estimatedPnlPct}%*`);
  }

  lines.push(``, `📊 *İndikatörler*`);
  reasons.forEach(r => lines.push(`  • ${r}`));
  lines.push(``, `🕐 ${new Date().toLocaleString('tr-TR', { timeZone: 'Asia/Dubai' })}`);
  lines.push(`⚠️ _Bu bir sinyal aracıdır, yatırım tavsiyesi değildir._`);

  return lines.join('\n');
}

function buildConfBar(confidence) {
  const filled = Math.round(confidence / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled) + ` ${confidence}%`;
}

async function sendSignal(signal) {
  const b = getBot();
  if (!b) { console.warn('[TG] Token eksik'); return false; }
  try {
    await b.sendMessage(config.telegram.chatId, formatSignalMessage(signal), { parse_mode: 'Markdown' });
    console.log(`[TG] Gönderildi: ${signal.symbol} ${signal.direction} ${signal.confidence} | ${signal.leverage}x`);
    return true;
  } catch (err) {
    console.error('[TG] Hata:', err.message);
    return false;
  }
}

async function sendTestMessage() {
  const b = getBot();
  if (!b) throw new Error('Token yok');
  await b.sendMessage(config.telegram.chatId,
    '✅ *CryptoSignal Futures Bot aktif!*\n\n📊 49 coin izleniyor\n⚡ Futures sinyalleri: LONG/SHORT + Kaldıraç + TP/SL',
    { parse_mode: 'Markdown' });
}

module.exports = { sendSignal, sendTestMessage, formatSignalMessage };
