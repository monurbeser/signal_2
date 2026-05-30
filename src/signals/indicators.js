// src/signals/indicators.js
const ti = require('technicalindicators');

function calcRSI(candles, period = 14) {
  const closes = candles.map(c => c.close);
  const results = ti.RSI.calculate({ values: closes, period });
  return results.length ? results[results.length - 1] : null;
}

function calcMACD(candles, fast = 12, slow = 26, signal = 9) {
  const closes = candles.map(c => c.close);
  const results = ti.MACD.calculate({
    values: closes, fastPeriod: fast, slowPeriod: slow,
    signalPeriod: signal, SimpleMAOscillator: false, SimpleMASignal: false,
  });
  if (!results.length) return null;
  const last = results[results.length - 1];
  return { macd: last.MACD, signal: last.signal, histogram: last.histogram };
}

function calcBBPosition(candles, period = 20, stdDev = 2) {
  const closes = candles.map(c => c.close);
  const results = ti.BollingerBands.calculate({ values: closes, period, stdDev });
  if (!results.length) return null;
  const last = results[results.length - 1];
  const price = closes[closes.length - 1];
  const range = last.upper - last.lower;
  if (range === 0) return 50;
  return Math.max(0, Math.min(100, Math.round(((price - last.lower) / range) * 100)));
}

function calcVolumeChange(candles, lookback = 20) {
  if (candles.length < lookback + 2) return 0;
  const slice = candles.slice(-(lookback + 2), -1);
  const avgVol = slice.slice(0, lookback).reduce((s, c) => s + c.volume, 0) / lookback;
  const lastVol = slice[slice.length - 1].volume;
  if (avgVol === 0 || lastVol === 0) return 0;
  return Math.round(((lastVol - avgVol) / avgVol) * 100);
}

function calcStochRSI(candles, rsiPeriod = 14, stochPeriod = 14, kPeriod = 3, dPeriod = 3) {
  const closes = candles.map(c => c.close);
  const results = ti.StochasticRSI.calculate({
    values: closes, rsiPeriod, stochasticPeriod: stochPeriod, kPeriod, dPeriod,
  });
  if (!results.length) return null;
  const last = results[results.length - 1];
  return { k: last.k, d: last.d };
}

module.exports = { calcRSI, calcMACD, calcBBPosition, calcVolumeChange, calcStochRSI };
