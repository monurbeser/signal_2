// src/signals/engine.js — Futures signal engine with TP/SL/Leverage
const config = require('../config');
const { weights, thresholds } = config;

function scoreRSI(rsi) {
  if (rsi === null) return 0;
  if (rsi <= 20) return 1.0;
  if (rsi <= 32) return 0.80;
  if (rsi <= 42) return 0.45;
  if (rsi <= 58) return 0.0;
  if (rsi <= 68) return -0.45;
  if (rsi <= 80) return -0.80;
  return -1.0;
}

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

function scoreVolume(volChange) {
  if (volChange >= 150) return 1.0;
  if (volChange >= 80)  return 0.8;
  if (volChange >= 40)  return 0.6;
  if (volChange >= 20)  return 0.4;
  if (volChange >= 0)   return 0.1;
  return -0.2;
}

function scoreStochRSI(stoch) {
  if (!stoch) return 0;
  const k = stoch.k;
  if (k <= 10) return 1.0;
  if (k <= 20) return 0.7;
  if (k <= 40) return 0.2;
  if (k <= 60) return 0.0;
  if (k <= 80) return -0.4;
  if (k <= 90) return -0.7;
  return -1.0;
}

/**
 * Güven skoruna göre kaldıraç hesapla
 */
function calcLeverage(confidence, direction) {
  const table = config.leverage;
  // LONG için yüksek confidence, SHORT için düşük (ters)
  const adjustedConf = direction === 'LONG' ? confidence : 100 - confidence;
  for (const row of table) {
    if (adjustedConf >= row.minConf) return row.lev;
  }
  return 5; // default
}

/**
 * TP / SL fiyat hedefleri
 */
function calcTPSL(price, direction, leverage) {
  const { tpPct, slPct } = config.tpsl;
  // Kaldıraç arttıkça TP/SL biraz daralır (risk yönetimi)
  const adjTp = tpPct * (1 - (leverage - 5) * 0.005);
  const adjSl = slPct * (1 + (leverage - 5) * 0.003);

  if (direction === 'LONG') {
    return {
      tp: +(price * (1 + adjTp)).toFixed(6),
      sl: +(price * (1 - adjSl)).toFixed(6),
      tpPct: +(adjTp * 100).toFixed(2),
      slPct: +(adjSl * 100).toFixed(2),
      estimatedPnlPct: +(adjTp * leverage * 100).toFixed(1),
    };
  } else {
    return {
      tp: +(price * (1 - adjTp)).toFixed(6),
      sl: +(price * (1 + adjSl)).toFixed(6),
      tpPct: +(adjTp * 100).toFixed(2),
      slPct: +(adjSl * 100).toFixed(2),
      estimatedPnlPct: +(adjTp * leverage * 100).toFixed(1),
    };
  }
}

function evaluate({ rsi, macd, bbPos, fearGreed, volChange, stoch, price }) {
  const scores = {
    rsi:       scoreRSI(rsi)              * weights.rsi,
    macd:      scoreMACD(macd)            * weights.macd,
    bb:        scoreBB(bbPos)             * weights.bb,
    fearGreed: scoreFearGreed(fearGreed)  * weights.fearGreed,
    volume:    scoreVolume(volChange)     * weights.volume,
    stoch:     scoreStochRSI(stoch)       * weights.stoch,
  };

  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  const raw = Object.values(scores).reduce((a, b) => a + b, 0) / totalWeight;
  const confidence = Math.round(((raw + 1) / 2) * 100);

  let direction;
  if (confidence >= config.signal.longThreshold)  direction = 'LONG';
  else if (confidence <= config.signal.shortThreshold) direction = 'SHORT';
  else direction = 'HOLD';

  let leverage = null;
  let tpsl = null;

  if (direction !== 'HOLD' && price) {
    leverage = calcLeverage(confidence, direction);
    tpsl = calcTPSL(price, direction, leverage);
  }

  const reasons = buildReasons({ rsi, macd, bbPos, fearGreed, volChange, stoch });

  return { direction, confidence, leverage, tpsl, reasons };
}

function buildReasons({ rsi, macd, bbPos, fearGreed, volChange, stoch }) {
  const r = [];
  if (rsi !== null) {
    if (rsi < thresholds.rsi.oversold)       r.push(`RSI ${rsi.toFixed(1)} — aşırı satım`);
    else if (rsi > thresholds.rsi.overbought) r.push(`RSI ${rsi.toFixed(1)} — aşırı alım`);
    else                                      r.push(`RSI ${rsi.toFixed(1)} — nötr`);
  }
  if (macd !== null)
    r.push(`MACD ${macd >= 0 ? '+' : ''}${macd.toFixed(4)} — ${macd > 0 ? '⬆ yukarı' : '⬇ aşağı'}`);
  if (bbPos !== null) {
    if (bbPos < thresholds.bb.lower)       r.push(`BB %${bbPos} — alt banda yakın`);
    else if (bbPos > thresholds.bb.upper)  r.push(`BB %${bbPos} — üst banda yakın`);
    else                                   r.push(`BB %${bbPos} — orta bölge`);
  }
  if (stoch)
    r.push(`StochRSI K:${stoch.k?.toFixed(1)} D:${stoch.d?.toFixed(1)}`);
  if (fearGreed !== null) {
    const lbl = fearGreed < 25 ? 'aşırı korku' : fearGreed > 75 ? 'açgözlülük' : 'nötr';
    r.push(`F&G ${fearGreed} — ${lbl}`);
  }
  if (volChange !== null)
    r.push(`Hacim ${volChange >= 0 ? '+' : ''}${volChange}%`);
  return r;
}

module.exports = { evaluate };
