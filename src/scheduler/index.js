// src/scheduler/index.js — Binance USDT-M Futures WebSocket
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

// Binance futures stream adı: btcusdt@kline_5m
function streamName(symbol) {
  return symbol.replace('/', '').toLowerCase() + '@kline_' + config.timeframe;
}

function buildStreamUrl() {
  const streams = config.symbols.map(streamName).join('/');
  return `wss://fstream.binance.com/stream?streams=${streams}`;
}

let ws = null, reconnectTimer = null, reconnectDelay = 3000, pingInterval = null;

async function handleKlineClose(symbol) {
  console.log(`[WS] ▶ ${symbol} mum kapandı`);
  if (isOnCooldown(symbol)) { console.log(`  ⏸ cooldown`); return; }

  let signal;
  try {
    signal = await analyzeSymbol(symbol);
  } catch (err) {
    console.error(`  ✗ analiz hatası: ${err.message}`);
    return;
  }

  const { direction, confidence, leverage } = signal;
  console.log(`  → ${direction} ${confidence}/100${leverage ? ' ' + leverage + 'x' : ''}`);

  if (direction === 'HOLD') return;
  if (confidence < config.signal.minConfidence) return;

  let saved;
  try { saved = await db.saveSignal(signal); } catch (err) {
    console.error(`  ✗ DB kayıt hatası: ${err.message}`);
  }

  const sent = await sendSignal(signal);
  if (sent) {
    lastSignalTime.set(symbol, Date.now());
    if (saved?.id) db.markSent(saved.id).catch(() => {});
  }
}

function connect() {
  const url = buildStreamUrl();
  console.log('[WS] Binance Futures stream bağlanıyor...');
  ws = new WebSocket(url);

  ws.on('open', () => {
    console.log('[WS] ✓ Binance Futures bağlandı');
    reconnectDelay = 3000;

    if (pingInterval) clearInterval(pingInterval);
    pingInterval = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) ws.ping();
    }, 180_000);
  });

  ws.on('message', (raw) => {
    try {
      const msg   = JSON.parse(raw);
      const kline = msg?.data?.k;
      if (!kline) return;
      if (!kline.x) return; // x=true → mum kapandı

      // BTCUSDT → BTC/USDT
      const rawSym = kline.s;
      const symbol = config.symbols.find(s => s.replace('/', '') === rawSym);
      if (!symbol) return;

      handleKlineClose(symbol);
    } catch (err) {
      console.error('[WS] Parse hatası:', err.message);
    }
  });

  ws.on('error', err => console.error('[WS] Hata:', err.message));

  ws.on('close', code => {
    console.warn(`[WS] Kapandı (${code}) — yeniden bağlanılıyor`);
    if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
    scheduleReconnect();
  });
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    reconnectDelay = Math.min(reconnectDelay * 2, 60_000);
    connect();
  }, reconnectDelay);
}

function start() {
  console.log(`[WS] Binance Futures sinyal servisi başlatılıyor`);
  console.log(`     ${config.symbols.length} sembol | ${config.timeframe} | cooldown ${config.signal.cooldownMinutes}dk`);
  connect();
}

function stop() {
  if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (ws) { ws.terminate(); ws = null; }
}

module.exports = { start, stop };
