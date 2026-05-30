// src/scheduler/index.js
const WebSocket = require('ws');
const { analyzeSymbol } = require('../signals/runner');
const { sendSignal } = require('../telegram/bot');
const db = require('../db');
const config = require('../config');

const lastSignalTime = new Map();

function isOnCooldown(symbol) {
  const last = lastSignalTime.get(symbol);
  if (!last) return false;
  return (Date.now() - last) / 1000 / 60 < config.signal.cooldownMinutes;
}

function streamName(symbol) {
  return symbol.replace('/', '').toLowerCase() + '@kline_' + config.timeframe;
}

function buildStreamUrl() {
  const streams = config.symbols.map(streamName).join('/');
  return `wss://fstream.binance.com/stream?streams=${streams}`;
}

let ws = null;
let reconnectTimer = null;
let reconnectDelay = 3000;
let pingInterval = null;

async function shouldBlockByPortfolio(signal) {
  try {
    const summary = await db.getOpenRiskSummary();

    if (summary.totalOpen >= config.risk.maxOpenSignals) {
      return `Maksimum açık sinyal limiti dolu: ${summary.totalOpen}`;
    }

    if (signal.direction === 'LONG' && summary.longOpen >= config.risk.maxSameDirection) {
      return `LONG açık sinyal limiti dolu: ${summary.longOpen}`;
    }

    if (signal.direction === 'SHORT' && summary.shortOpen >= config.risk.maxSameDirection) {
      return `SHORT açık sinyal limiti dolu: ${summary.shortOpen}`;
    }

    if (signal.group === 'MEME' && summary.memeOpen >= config.risk.maxMemeOpen) {
      return `MEME açık sinyal limiti dolu: ${summary.memeOpen}`;
    }

    const newRisk = signal.risk?.accountRiskPct || config.risk.accountRiskPct;
    if (summary.totalRiskPct + newRisk > config.risk.maxTotalOpenRiskPct) {
      return `Toplam açık risk limiti aşılır: ${((summary.totalRiskPct + newRisk) * 100).toFixed(2)}%`;
    }

    return null;
  } catch (err) {
    console.error('[Portfolio] Kontrol hatası:', err.message);
    return null;
  }
}

async function handleKlineClose(symbol) {
  console.log(`[WS] ${symbol} mum kapandı`);

  if (isOnCooldown(symbol)) {
    console.log('  cooldown aktif');
    return;
  }

  let signal;

  try {
    signal = await analyzeSymbol(symbol);
  } catch (err) {
    console.error(`  analiz hatası: ${err.message}`);
    return;
  }

  const { direction, confidence, signalPower, leverage } = signal;
  console.log(`  ${direction} confidence ${confidence}/100 power ${signalPower}/100 ${leverage ? leverage + 'x' : ''}`);

  await db.saveAnalysisSnapshot(signal).catch(err => {
    console.error('  analiz snapshot kayıt hatası:', err.message);
  });

  if (direction === 'HOLD') return;

  if (!signal.regime?.allowed) {
    console.log(`  rejim filtresi engelledi: ${signal.regime?.reason}`);
    return;
  }

  if (signalPower < config.signal.minSignalPower) {
    console.log(`  sinyal gücü düşük: ${signalPower}`);
    return;
  }

  const portfolioBlockReason = await shouldBlockByPortfolio(signal);
  if (portfolioBlockReason) {
    console.log(`  portföy filtresi engelledi: ${portfolioBlockReason}`);
    return;
  }

  let saved;

  try {
    saved = await db.saveSignal(signal);
  } catch (err) {
    console.error(`  DB kayıt hatası: ${err.message}`);
  }

  const sent = await sendSignal(signal);

  if (sent) {
    lastSignalTime.set(symbol, Date.now());
    if (saved?.id) db.markSent(saved.id).catch(() => { });
  }
}

function connect() {
  const url = buildStreamUrl();

  console.log('[WS] Binance Futures stream bağlanıyor...');
  ws = new WebSocket(url);

  ws.on('open', () => {
    console.log('[WS] Binance Futures bağlandı');
    reconnectDelay = 3000;

    if (pingInterval) clearInterval(pingInterval);

    pingInterval = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) ws.ping();
    }, 180000);
  });

  ws.on('message', raw => {
    try {
      const msg = JSON.parse(raw);
      const kline = msg?.data?.k;

      if (!kline) return;
      if (!kline.x) return;

      const rawSym = kline.s;
      const symbol = config.symbols.find(s => s.replace('/', '') === rawSym);

      if (!symbol) return;

      handleKlineClose(symbol);
    } catch (err) {
      console.error('[WS] Parse hatası:', err.message);
    }
  });

  ws.on('error', err => {
    console.error('[WS] Hata:', err.message);
  });

  ws.on('close', code => {
    console.warn(`[WS] Kapandı ${code}, yeniden bağlanılıyor`);

    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }

    scheduleReconnect();
  });
}

function scheduleReconnect() {
  if (reconnectTimer) return;

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    reconnectDelay = Math.min(reconnectDelay * 2, 60000);
    connect();
  }, reconnectDelay);
}

function start() {
  console.log('[WS] Binance Futures V2 sinyal servisi başlatılıyor');
  console.log(`     ${config.symbols.length} sembol | ${config.timeframe} | cooldown ${config.signal.cooldownMinutes}dk`);
  connect();
}

function stop() {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (ws) {
    ws.terminate();
    ws = null;
  }
}

module.exports = { start, stop };