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

function fmtPrice(p) {
  if (!p) return '—';

  const decimals = p < 0.01 ? 6 : p < 1 ? 4 : p < 100 ? 3 : 2;

  return '$' + parseFloat(p).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function buildPowerBar(power) {
  const filled = Math.round(power / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled) + ` ${power}%`;
}

function formatSignalMessage(signal) {
  const {
    symbol,
    group,
    direction,
    confidence,
    signalPower,
    price,
    change24h,
    reasons,
    leverage,
    tpsl,
    risk,
    marketContext,
    engineVersion,
  } = signal;

  const dirEmoji = direction === 'LONG' ? '🟢' : '🔴';
  const dirLabel = direction === 'LONG' ? 'LONG AL' : 'SHORT SAT';

  const changeStr = change24h != null
    ? ` (${change24h >= 0 ? '+' : ''}${parseFloat(change24h).toFixed(2)}%)`
    : '';

  const lines = [
    `${dirEmoji} *FUTURES ${dirLabel} — ${symbol}*`,
    ``,
    `💰 Fiyat: *${fmtPrice(price)}*${changeStr}`,
    `⏱ Zaman dilimi: *${config.timeframe.toUpperCase()}*`,
    `🧠 Motor: *${engineVersion || 'v2'}*`,
    `📦 Grup: *${group || 'OTHER'}*`,
    ``,
    `🎯 Sinyal gücü: *${signalPower}/100*`,
    `Ham confidence: ${confidence}/100`,
    buildPowerBar(signalPower),
  ];

  if (leverage && tpsl) {
    lines.push(``);
    lines.push(`⚡ Kaldıraç: *${leverage}x*`);
    lines.push(`✅ TP: *${fmtPrice(tpsl.tp)}*  (+${tpsl.tpPct}%)`);
    lines.push(`🛑 SL: *${fmtPrice(tpsl.sl)}*  (-${tpsl.slPct}%)`);
    lines.push(`📌 Beklenen TP etkisi: *+${tpsl.estimatedPnlPct}%*`);
    lines.push(`📌 Beklenen SL etkisi: *-${tpsl.estimatedLossPct}%*`);
  }

  if (risk) {
    lines.push(``);
    lines.push(`🧮 İşlem başı hesap riski: *${(risk.accountRiskPct * 100).toFixed(2)}%*`);
    lines.push(`📐 Pozisyon notional: *${(risk.positionNotionalPct * 100).toFixed(1)}%*`);
  }

  if (marketContext?.btcRegime) {
    lines.push(``);
    lines.push(`🌐 BTC rejimi: *${marketContext.btcRegime}*`);
    lines.push(`BTC EMA uzaklığı: *${marketContext.btcEmaDistancePct}%*`);
  }

  lines.push(``);
  lines.push(`📊 *Gerekçeler*`);
  reasons.forEach(r => lines.push(`• ${r}`));

  lines.push(``);
  lines.push(`🕐 ${new Date().toLocaleString('tr-TR', { timeZone: 'Asia/Dubai' })}`);
  lines.push(`⚠️ _Bu bir sinyal aracıdır, yatırım tavsiyesi değildir._`);

  return lines.join('\n');
}

async function sendSignal(signal) {
  const b = getBot();

  if (!b) {
    console.warn('[TG] Token eksik');
    return false;
  }

  try {
    await b.sendMessage(config.telegram.chatId, formatSignalMessage(signal), {
      parse_mode: 'Markdown',
    });

    console.log(`[TG] Gönderildi: ${signal.symbol} ${signal.direction} power ${signal.signalPower} | ${signal.leverage}x`);
    return true;
  } catch (err) {
    console.error('[TG] Hata:', err.message);
    return false;
  }
}

async function sendTestMessage() {
  const b = getBot();

  if (!b) throw new Error('Token yok');

  await b.sendMessage(
    config.telegram.chatId,
    '✅ *CryptoSignal V2 aktif!*\n\nRisk bazlı kaldıraç, ATR TP SL, BTC rejim filtresi ve signalPower mantığı devrede.',
    { parse_mode: 'Markdown' }
  );
}

module.exports = { sendSignal, sendTestMessage, formatSignalMessage };