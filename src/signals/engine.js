// src/signals/engine.js
const config = require('../config');

const { weights, thresholds } = config;

/**
 * RSI → -1.0 to +1.0 skor
 */
function scoreRSI(rsi) {
  if (rsi === null) return 0;
  if (rsi <= 20) return 1.0;
  if (rsi <= 30) return 0.85;
  if (rsi <= 40) return 0.55;
  if (rsi <= 60) return 0.0;
  if (rsi <= 70) return -0.55;
  if (rsi <= 80) return -0.85;
  return -1.0;
}

/**
 * MACD histogram → -1.0 to +1.0 skor
 */
function scoreMACD(histogram) {
  if (histogram === null) return 0;
  if (histogram >= 2)    return 1.0;
  if (histogram >= 0.5)  return 0.7;
  if (histogram >= 0.1)  return 0.3;
  if (histogram >= -0.1) return 0.0;
  if (histogram >= -0.5) return -0.3;
  if (histogram >= -2)   return -0.7;
  return -1.0;
}

/**
 * Bollinger Band pozisyonu → -1.0 to +1.0 skor
 * Düşük pozisyon (alt banda yakın) = alım sinyali
 */
function scoreBB(bbPos) {
  if (bbPos === null) return 0;
  if (bbPos <= 5)  return 1.0;
  if (bbPos <= 15) return 0.8;
  if (bbPos <= 25) return 0.5;
  if (bbPos <= 45) return 0.1;
  if (bbPos <= 55) return 0.0;
  if (bbPos <= 75) return -0.3;
  if (bbPos <= 85) return -0.7;
  return -1.0;
}

/**
 * Fear & Greed → -1.0 to +1.0 skor
 * Düşük = extreme fear = contrarian alım fırsatı
 */
function scoreFearGreed(fg) {
  if (fg === null) return 0;
  if (fg <= 10) return 1.0;
  if (fg <= 25) return 0.7;
  if (fg <= 40) return 0.3;
  if (fg <= 60) return 0.0;
  if (fg <= 75) return -0.3;
  if (fg <= 90) return -0.7;
  return -1.0;
}

/**
 * Hacim değişimi → 0 to +1.0 skor (onay indikatörü)
 * Negatif hacim sinyali zayıflatır
 */
function scoreVolume(volChange) {
  if (volChange >= 150) return 1.0;
  if (volChange >= 80)  return 0.8;
  if (volChange >= 40)  return 0.6;
  if (volChange >= 20)  return 0.4;
  if (volChange >= 0)   return 0.1;
  return -0.2; // hacim düşüşü zayıf negatif
}

/**
 * Ana sinyal motoru
 * Tüm indikatörleri ağırlıklı ortalama ile birleştirir
 * Confidence: 0-100, Direction: BUY | SELL | HOLD
 */
function evaluate({ rsi, macd, bbPos, fearGreed, volChange }) {
  const scores = {
    rsi:       scoreRSI(rsi)         * weights.rsi,
    macd:      scoreMACD(macd)       * weights.macd,
    bb:        scoreBB(bbPos)        * weights.bb,
    fearGreed: scoreFearGreed(fearGreed) * weights.fearGreed,
    volume:    scoreVolume(volChange)    * weights.volume,
  };

  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  const raw = Object.values(scores).reduce((a, b) => a + b, 0) / totalWeight;

  // raw: -1.0..+1.0 → confidence: 0..100
  const confidence = Math.round(((raw + 1) / 2) * 100);

  let direction;
  if (confidence >= config.signal.buyThreshold) direction = 'BUY';
  else if (confidence <= config.signal.sellThreshold) direction = 'SELL';
  else direction = 'HOLD';

  // Kural bazlı açıklama
  const reasons = buildReasons({ rsi, macd, bbPos, fearGreed, volChange });

  return { direction, confidence, scores, reasons };
}

function buildReasons({ rsi, macd, bbPos, fearGreed, volChange }) {
  const r = [];
  if (rsi !== null) {
    if (rsi < thresholds.rsi.oversold)  r.push(`RSI ${rsi.toFixed(1)} — aşırı satım`);
    else if (rsi > thresholds.rsi.overbought) r.push(`RSI ${rsi.toFixed(1)} — aşırı alım`);
    else r.push(`RSI ${rsi.toFixed(1)} — nötr`);
  }
  if (macd !== null) {
    r.push(`MACD hist. ${macd >= 0 ? '+' : ''}${macd.toFixed(3)} — ${macd > 0 ? 'yukarı momentum' : 'aşağı momentum'}`);
  }
  if (bbPos !== null) {
    if (bbPos < thresholds.bb.lower)  r.push(`BB %${bbPos} — alt banda yakın`);
    else if (bbPos > thresholds.bb.upper) r.push(`BB %${bbPos} — üst banda yakın`);
    else r.push(`BB %${bbPos} — orta bölge`);
  }
  if (fearGreed !== null) {
    const label = fearGreed < 25 ? 'aşırı korku' : fearGreed > 75 ? 'aşırı açgözlülük' : 'nötr';
    r.push(`F&G ${fearGreed} — ${label}`);
  }
  if (volChange !== null) {
    r.push(`Hacim ${volChange >= 0 ? '+' : ''}${volChange}% — ${Math.abs(volChange) > 30 ? 'güçlü' : 'zayıf'} onay`);
  }
  return r;
}

module.exports = { evaluate };
