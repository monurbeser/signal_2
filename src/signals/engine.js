// src/signals/engine.js
const config = require('../config');
const { weights, thresholds } = config;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function scoreRSI(rsi) {
  if (rsi === null || rsi === undefined) return 0;
  if (rsi <= 20) return 1.0;
  if (rsi <= 32) return 0.80;
  if (rsi <= 42) return 0.45;
  if (rsi <= 58) return 0.0;
  if (rsi <= 68) return -0.45;
  if (rsi <= 80) return -0.80;
  return -1.0;
}

function scoreMACD(histogram) {
  if (histogram === null || histogram === undefined) return 0;
  if (histogram >= 2) return 1.0;
  if (histogram >= 0.5) return 0.7;
  if (histogram >= 0.1) return 0.3;
  if (histogram >= -0.1) return 0.0;
  if (histogram >= -0.5) return -0.3;
  if (histogram >= -2) return -0.7;
  return -1.0;
}

function scoreBB(bbPos) {
  if (bbPos === null || bbPos === undefined) return 0;
  if (bbPos <= 5) return 1.0;
  if (bbPos <= 15) return 0.8;
  if (bbPos <= 25) return 0.5;
  if (bbPos <= 45) return 0.1;
  if (bbPos <= 55) return 0.0;
  if (bbPos <= 75) return -0.3;
  if (bbPos <= 85) return -0.7;
  return -1.0;
}

function scoreFearGreed(fg) {
  if (fg === null || fg === undefined) return 0;
  if (fg <= 10) return 1.0;
  if (fg <= 25) return 0.7;
  if (fg <= 40) return 0.3;
  if (fg <= 60) return 0.0;
  if (fg <= 75) return -0.3;
  if (fg <= 90) return -0.7;
  return -1.0;
}

function scoreVolume(volChange) {
  if (volChange === null || volChange === undefined) return 0;
  if (volChange >= 150) return 1.0;
  if (volChange >= 80) return 0.8;
  if (volChange >= 40) return 0.6;
  if (volChange >= 20) return 0.4;
  if (volChange >= 0) return 0.1;
  return -0.2;
}

function scoreStochRSI(stoch) {
  if (!stoch || stoch.k === null || stoch.k === undefined) return 0;
  const k = stoch.k;
  if (k <= 10) return 1.0;
  if (k <= 20) return 0.7;
  if (k <= 40) return 0.2;
  if (k <= 60) return 0.0;
  if (k <= 80) return -0.4;
  if (k <= 90) return -0.7;
  return -1.0;
}

function calcSignalPower(confidence, direction) {
  if (direction === 'LONG') return confidence;
  if (direction === 'SHORT') return 100 - confidence;
  return 0;
}

function calcAtrStops(price, direction, atrPct) {
  const atrCfg = config.atr;

  const rawSlPct = atrPct * atrCfg.slMult;
  const slPct = clamp(rawSlPct, atrCfg.minSlPct, atrCfg.maxSlPct);
  const tpPct = slPct * (atrCfg.tpMult / atrCfg.slMult);

  if (direction === 'LONG') {
    return {
      tp: +(price * (1 + tpPct)).toFixed(8),
      sl: +(price * (1 - slPct)).toFixed(8),
      tpPct: +(tpPct * 100).toFixed(3),
      slPct: +(slPct * 100).toFixed(3),
    };
  }

  if (direction === 'SHORT') {
    return {
      tp: +(price * (1 - tpPct)).toFixed(8),
      sl: +(price * (1 + slPct)).toFixed(8),
      tpPct: +(tpPct * 100).toFixed(3),
      slPct: +(slPct * 100).toFixed(3),
    };
  }

  return null;
}

function calcRiskBasedLeverage({ symbol, group, signalPower, stopPct }) {
  const maxLev = config.risk.maxLeverageByGroup[group] || config.risk.maxLeverageByGroup.OTHER || 1;

  if (!stopPct || stopPct <= 0) {
    return {
      leverage: 1,
      positionNotionalPct: config.risk.accountRiskPct,
      accountRiskPct: config.risk.accountRiskPct,
    };
  }

  const baseNotional = config.risk.accountRiskPct / stopPct;

  let qualityMultiplier = 1;
  if (signalPower >= 90) qualityMultiplier = 1.15;
  else if (signalPower >= 80) qualityMultiplier = 1.05;
  else if (signalPower < 75) qualityMultiplier = 0.85;

  const positionNotionalPct = Math.min(baseNotional * qualityMultiplier, maxLev);
  const leverage = +positionNotionalPct.toFixed(2);

  return {
    leverage,
    positionNotionalPct: +positionNotionalPct.toFixed(4),
    accountRiskPct: config.risk.accountRiskPct,
  };
}

function applyBtcRegime(direction, signalPower, marketContext) {
  if (!config.regime.enabled || !marketContext || !marketContext.btcRegime) {
    return { allowed: true, reason: 'BTC rejim filtresi kapalı veya veri yok' };
  }

  const regime = marketContext.btcRegime;

  if (regime === 'BULL' && direction === 'LONG') {
    return { allowed: true, reason: 'BTC rejimi yukarı, LONG uyumlu' };
  }

  if (regime === 'BEAR' && direction === 'SHORT') {
    return { allowed: true, reason: 'BTC rejimi aşağı, SHORT uyumlu' };
  }

  if (signalPower >= config.regime.counterTrendMinPower) {
    return { allowed: true, reason: 'Ters rejim ama sinyal gücü yüksek' };
  }

  return { allowed: false, reason: `BTC rejimi ${regime}, ters yönde sinyal gücü yetersiz` };
}

function evaluate({ symbol, group, rsi, macd, bbPos, fearGreed, volChange, stoch, price, atr, atrPct, marketContext }) {
  const weightedScores = {
    rsi: scoreRSI(rsi) * weights.rsi,
    macd: scoreMACD(macd) * weights.macd,
    bb: scoreBB(bbPos) * weights.bb,
    fearGreed: scoreFearGreed(fearGreed) * weights.fearGreed,
    volume: scoreVolume(volChange) * weights.volume,
    stoch: scoreStochRSI(stoch) * weights.stoch,
  };

  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  const raw = Object.values(weightedScores).reduce((a, b) => a + b, 0) / totalWeight;
  const confidence = Math.round(((raw + 1) / 2) * 100);

  let direction = 'HOLD';
  if (confidence >= config.signal.longThreshold) direction = 'LONG';
  else if (confidence <= config.signal.shortThreshold) direction = 'SHORT';

  const signalPower = calcSignalPower(confidence, direction);

  let tpsl = null;
  let leverage = null;
  let risk = null;
  let regime = { allowed: true, reason: 'HOLD' };

  if (direction !== 'HOLD' && price && atrPct) {
    regime = applyBtcRegime(direction, signalPower, marketContext);

    tpsl = calcAtrStops(price, direction, atrPct);
    const stopPct = tpsl ? tpsl.slPct / 100 : null;

    risk = calcRiskBasedLeverage({
      symbol,
      group,
      signalPower,
      stopPct,
    });

    leverage = risk.leverage;

    if (tpsl && leverage) {
      tpsl.estimatedPnlPct = +(tpsl.tpPct * leverage).toFixed(2);
      tpsl.estimatedLossPct = +(tpsl.slPct * leverage).toFixed(2);
    }
  }

  const reasons = buildReasons({ rsi, macd, bbPos, fearGreed, volChange, stoch, atrPct, marketContext, regime });

  return {
    direction,
    confidence,
    signalPower,
    leverage,
    tpsl,
    risk,
    regime,
    reasons,
    rawScores: weightedScores,
  };
}

function buildReasons({ rsi, macd, bbPos, fearGreed, volChange, stoch, atrPct, marketContext, regime }) {
  const r = [];

  if (rsi !== null && rsi !== undefined) {
    if (rsi < thresholds.rsi.oversold) r.push(`RSI ${rsi.toFixed(1)} aşırı satım`);
    else if (rsi > thresholds.rsi.overbought) r.push(`RSI ${rsi.toFixed(1)} aşırı alım`);
    else r.push(`RSI ${rsi.toFixed(1)} nötr`);
  }

  if (macd !== null && macd !== undefined) {
    r.push(`MACD ${macd >= 0 ? '+' : ''}${macd.toFixed(4)} ${macd > 0 ? 'yukarı momentum' : 'aşağı momentum'}`);
  }

  if (bbPos !== null && bbPos !== undefined) {
    if (bbPos < thresholds.bb.lower) r.push(`BB yüzde ${bbPos} alt banda yakın`);
    else if (bbPos > thresholds.bb.upper) r.push(`BB yüzde ${bbPos} üst banda yakın`);
    else r.push(`BB yüzde ${bbPos} orta bölge`);
  }

  if (stoch) {
    r.push(`StochRSI K ${stoch.k?.toFixed(1)} D ${stoch.d?.toFixed(1)}`);
  }

  if (fearGreed !== null && fearGreed !== undefined) {
    const lbl = fearGreed < 25 ? 'aşırı korku' : fearGreed > 75 ? 'açgözlülük' : 'nötr';
    r.push(`Fear Greed ${fearGreed} ${lbl}`);
  }

  if (volChange !== null && volChange !== undefined) {
    r.push(`Hacim ${volChange >= 0 ? '+' : ''}${volChange}%`);
  }

  if (atrPct) {
    r.push(`ATR yüzde ${(atrPct * 100).toFixed(2)}`);
  }

  if (marketContext?.btcRegime) {
    r.push(`BTC rejimi ${marketContext.btcRegime}`);
  }

  if (regime?.reason) {
    r.push(regime.reason);
  }

  return r;
}

module.exports = { evaluate, calcSignalPower };