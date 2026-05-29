// src/signals/indicators.js
const ti = require('technicalindicators');

/**
 * RSI hesapla (14 periyot)
 * Dönüş: 0-100 arası son değer
 */
function calcRSI(candles, period = 14) {
  const closes = candles.map(c => c.close);
  const results = ti.RSI.calculate({ values: closes, period });
  return results.length > 0 ? results[results.length - 1] : null;
}

/**
 * MACD hesapla
 * Dönüş: { macd, signal, histogram } — son değer
 */
function calcMACD(candles, fast = 12, slow = 26, signal = 9) {
  const closes = candles.map(c => c.close);
  const results = ti.MACD.calculate({
    values: closes,
    fastPeriod: fast,
    slowPeriod: slow,
    signalPeriod: signal,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });
  if (!results.length) return null;
  const last = results[results.length - 1];
  return {
    macd: last.MACD,
    signal: last.signal,
    histogram: last.histogram,
  };
}

/**
 * Bollinger Bands hesapla
 * Dönüş: fiyatın bantlar içindeki % pozisyonu (0=alt, 100=üst)
 */
function calcBBPosition(candles, period = 20, stdDev = 2) {
  const closes = candles.map(c => c.close);
  const results = ti.BollingerBands.calculate({
    values: closes,
    period,
    stdDev,
  });
  if (!results.length) return null;
  const last = results[results.length - 1];
  const range = last.upper - last.lower;
  if (range === 0) return 50;
  return Math.round(((last.middle - last.lower) / range) * 100);
  // Not: last.middle = son fiyata yakın, daha doğrusu:
  // Son kapanış fiyatının bant içindeki yeri:
  const lastClose = closes[closes.length - 1];
  return Math.round(((lastClose - last.lower) / range) * 100);
}

/**
 * Hacim değişimi (son mum vs son 20 mumun ortalama hacmi)
 * Dönüş: % fark
 */
function calcVolumeChange(candles, lookback = 20) {
  if (candles.length < lookback + 1) return 0;
  const recent = candles.slice(-lookback - 1);
  const avgVol = recent.slice(0, lookback).reduce((s, c) => s + c.volume, 0) / lookback;
  const lastVol = recent[recent.length - 1].volume;
  if (avgVol === 0) return 0;
  return Math.round(((lastVol - avgVol) / avgVol) * 100);
}

module.exports = { calcRSI, calcMACD, calcBBPosition, calcVolumeChange };
