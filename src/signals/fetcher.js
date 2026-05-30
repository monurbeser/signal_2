// src/signals/fetcher.js — Bybit FUTURES (linear perpetual)
const ccxt = require('ccxt');
const config = require('../config');

let exchange;

function getExchange() {
  if (!exchange) {
    exchange = new ccxt.bybit({
      apiKey: config.exchange.apiKey,
      secret: config.exchange.secret,
      enableRateLimit: true,
      options: { defaultType: 'linear' }, // FUTURES (USDT perpetual)
    });
  }
  return exchange;
}

async function fetchOHLCV(symbol, timeframe, limit) {
  const ex = getExchange();
  const ohlcv = await ex.fetchOHLCV(symbol, timeframe, undefined, limit);
  return ohlcv.map(([ts, o, h, l, c, v]) => ({
    timestamp: ts, open: o, high: h, low: l, close: c, volume: v,
  }));
}

async function fetchTicker(symbol) {
  const ex = getExchange();
  const ticker = await ex.fetchTicker(symbol);
  return {
    price:     ticker.last,
    change24h: ticker.percentage,
    volume24h: ticker.quoteVolume,
  };
}

async function fetchFearGreed() {
  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=1');
    const json = await res.json();
    return parseInt(json.data[0].value);
  } catch {
    return 50;
  }
}

module.exports = { fetchOHLCV, fetchTicker, fetchFearGreed };
