// src/scheduler/index.js
// Bybit WebSocket kline stream — her mum kapandığında analiz tetiklenir
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

// Bybit WS topic: "kline.15.BTCUSDT"
function topicName(symbol) {
  const pair = symbol.replace('/', '');
  const tf = config.timeframe.replace('m', '');
  return `kline.${tf}.${pair}`;
}

const BYBIT_WS_URL = 'wss://stream.bybit.com/v5/public/spot';

let ws = null;
let reconnectTimer = null;
let reconnectDelay = 3000;
let pingInterval = null;

async function handleKlineClose(symbol) {
  console.log(`[WS] Mum kapandı: ${symbol} — analiz başlatılıyor`);

  let signal;
  try {
    signal = await analyzeSymbol(symbol);
  } catch (err) {
    console.error(`[WS] Analiz hatası (${symbol}):`, err.message);
    return;
  }

  const { direction, confidence } = signal;
  console.log(`  → ${symbol}: ${direction} @ ${confidence}/100`);

  if (direction === 'HOLD') return;
  if (confidence < config.signal.minConfidence) {
    console.log(`  → Güven yetersiz (${confidence} < ${config.signal.minConfidence}), atlandı`);
    return;
  }
  if (isOnCooldown(symbol)) {
    console.log(`  → ${symbol} cooldown'da, atlandı`);
    return;
  }

  let signalId;
  try {
    signalId = await db.saveSignal(signal);
  } catch (err) {
    console.error(`  → DB kayıt hatası:`, err.message);
  }

  const sent = await sendSignal(signal);
  if (sent) {
    lastSignalTime.set(symbol, Date.now());
    if (signalId) await db.markSent(signalId).catch(() => {});
  }
}

function subscribe() {
  const topics = config.symbols.map(topicName);
  ws.send(JSON.stringify({
    op: 'subscribe',
    args: topics,
  }));
  console.log('[WS] Subscribe:', topics.join(', '));
}

function connect() {
  console.log('[WS] Bybit stream bağlanıyor...');
  ws = new WebSocket(BYBIT_WS_URL);

  ws.on('open', () => {
    console.log('[WS] Bybit bağlantısı kuruldu');
    reconnectDelay = 3000;
    subscribe();

    // Bybit her 20s'te ping bekliyor
    if (pingInterval) clearInterval(pingInterval);
    pingInterval = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ op: 'ping' }));
      }
    }, 20_000);
  });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);

      // Pong / op response — yoksay
      if (msg.op) return;

      // Kline verisi
      if (!msg.topic || !msg.topic.startsWith('kline.')) return;
      const data = msg.data?.[0];
      if (!data || !data.confirm) return; // confirm=true → mum kapandı

      // Topic: "kline.15.BTCUSDT" → symbol "BTC/USDT"
      const rawSym = msg.topic.split('.')[2]; // BTCUSDT
      const symbol = config.symbols.find(
        s => s.replace('/', '') === rawSym
      );
      if (!symbol) return;

      handleKlineClose(symbol);
    } catch (err) {
      console.error('[WS] Parse hatası:', err.message);
    }
  });

  ws.on('error', (err) => {
    console.error('[WS] Hata:', err.message);
  });

  ws.on('close', (code) => {
    console.warn(`[WS] Kapandı (${code}). Yeniden bağlanılacak...`);
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
  console.log('[WS] Bybit WebSocket sinyal servisi başlatılıyor');
  console.log(`     Semboller : ${config.symbols.join(', ')}`);
  console.log(`     Timeframe : ${config.timeframe}`);
  connect();
}

function stop() {
  if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (ws) { ws.terminate(); ws = null; }
  console.log('[WS] Durduruldu');
}

module.exports = { start, stop };
