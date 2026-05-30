// src/scheduler/index.js — Bybit Futures WebSocket (tick bazlı)
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

// Bybit linear futures WS
const BYBIT_WS_URL = 'wss://stream.bybit.com/v5/public/linear';

// Futures sembol formatı: BTC/USDT → BTCUSDT
function futuresSym(symbol) {
  return symbol.replace('/', '');
}

// Bybit kline topic: kline.5.BTCUSDT
function topicName(symbol) {
  return `kline.${config.timeframe.replace('m','')}.${futuresSym(symbol)}`;
}

let ws = null;
let reconnectTimer = null;
let reconnectDelay = 3000;
let pingInterval = null;

async function handleKlineClose(symbol) {
  console.log(`[WS] ▶ ${symbol} mum kapandı`);
  if (isOnCooldown(symbol)) {
    console.log(`  ⏸ cooldown`);
    return;
  }

  let signal;
  try {
    signal = await analyzeSymbol(symbol);
  } catch (err) {
    console.error(`  ✗ analiz hatası: ${err.message}`);
    return;
  }

  const { direction, confidence, leverage } = signal;
  const levStr = leverage ? ` ${leverage}x` : '';
  console.log(`  → ${direction} ${confidence}/100${levStr}`);

  if (direction === 'HOLD') return;
  if (confidence < config.signal.minConfidence) return;

  let signalId;
  try { signalId = await db.saveSignal(signal); } catch {}

  const sent = await sendSignal(signal);
  if (sent) {
    lastSignalTime.set(symbol, Date.now());
    if (signalId) db.markSent(signalId).catch(() => {});
  }
}

function subscribeAll() {
  // Bybit 10 topic/mesaj limiti var — batch'le gönder
  const topics = config.symbols.map(topicName);
  const batchSize = 10;
  for (let i = 0; i < topics.length; i += batchSize) {
    ws.send(JSON.stringify({
      op: 'subscribe',
      args: topics.slice(i, i + batchSize),
    }));
  }
  console.log(`[WS] ${topics.length} sembol subscribe edildi`);
}

function connect() {
  console.log('[WS] Bybit Futures stream bağlanıyor...');
  ws = new WebSocket(BYBIT_WS_URL);

  ws.on('open', () => {
    console.log('[WS] ✓ Bybit Futures bağlandı');
    reconnectDelay = 3000;
    subscribeAll();

    if (pingInterval) clearInterval(pingInterval);
    pingInterval = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ op: 'ping' }));
      }
    }, 20_000);
  });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.op) return; // pong/sub response

      if (!msg.topic?.startsWith('kline.')) return;
      const data = msg.data?.[0];
      if (!data?.confirm) return; // confirm=true → mum kapandı

      // "kline.5.BTCUSDT" → BTCUSDT → BTC/USDT
      const rawSym = msg.topic.split('.')[2];
      const symbol = config.symbols.find(s => s.replace('/', '') === rawSym);
      if (!symbol) return;

      handleKlineClose(symbol);
    } catch (err) {
      console.error('[WS] Parse hatası:', err.message);
    }
  });

  ws.on('error', err => console.error('[WS] Hata:', err.message));

  ws.on('close', code => {
    console.warn(`[WS] Kapandı (${code}) — ${reconnectDelay/1000}s sonra yeniden bağlanılıyor`);
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
  console.log(`[WS] Futures sinyal servisi başlatılıyor`);
  console.log(`     ${config.symbols.length} sembol | ${config.timeframe} | cooldown ${config.signal.cooldownMinutes}dk`);
  connect();
}

function stop() {
  if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (ws) { ws.terminate(); ws = null; }
}

module.exports = { start, stop };
