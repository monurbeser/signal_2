// src/signals/fetcher.js — Tüm veri Binance USDT-M Futures
const ccxt = require('ccxt');
const config = require('../config');

let exchange;

function getExchange() {
  if (!exchange) {
    exchange = new ccxt.binance({
      enableRateLimit: true,
      options: { defaultType: 'future' }, // USDT-M Futures
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
  try {
    // Binance USDT-M Futures fiyatı
    const pair = symbol.replace('/', '');
    const res  = await fetch(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${pair}`);
    const json = await res.json();
    return {
      price:     parseFloat(json.lastPrice),
      change24h: parseFloat(json.priceChangePercent),
      volume24h: parseFloat(json.quoteVolume),
    };
  } catch (err) {
    // Fallback: CCXT
    const ex = getExchange();
    const ticker = await ex.fetchTicker(symbol);
    return {
      price:     ticker.last,
      change24h: ticker.percentage,
      volume24h: ticker.quoteVolume,
    };
  }
}

async function fetchFearGreed() {
  try {
    const res  = await fetch('https://api.alternative.me/fng/?limit=1');
    const json = await res.json();
    return parseInt(json.data[0].value);
  } catch {
    return 50;
  }
}

module.exports = { fetchOHLCV, fetchTicker, fetchFearGreed };
