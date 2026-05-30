// src/signals/runner.js
const { fetchOHLCV, fetchTicker, fetchFearGreed } = require('./fetcher');
const {
  calcRSI,
  calcMACD,
  calcBBPosition,
  calcVolumeChange,
  calcStochRSI,
  calcATR,
  calcEMA,
} = require('./indicators');
const { evaluate } = require('./engine');
const config = require('../config');

let fgCache = { value: 50, ts: 0 };
let btcRegimeCache = { value: null, ts: 0 };

async function getFearGreed() {
  if (Date.now() - fgCache.ts < 5 * 60 * 1000) return fgCache.value;

  const val = await fetchFearGreed();
  fgCache = { value: val, ts: Date.now() };
  return val;
}

async function getBtcRegime() {
  if (!config.regime.enabled) return null;
  if (Date.now() - btcRegimeCache.ts < 5 * 60 * 1000 && btcRegimeCache.value) {
    return btcRegimeCache.value;
  }

  try {
    const candles = await fetchOHLCV(
      config.regime.btcSymbol,
      config.regime.timeframe,
      Math.max(config.regime.emaPeriod + 20, 260)
    );

    const last = candles[candles.length - 1];
    const ema = calcEMA(candles, config.regime.emaPeriod);

    if (!last || !ema) return null;

    const distancePct = ((last.close - ema) / ema) * 100;
    const btcRegime = last.close >= ema ? 'BULL' : 'BEAR';

    const value = {
      btcRegime,
      btcPrice: last.close,
      btcEma: ema,
      btcEmaDistancePct: +distancePct.toFixed(3),
      timeframe: config.regime.timeframe,
    };

    btcRegimeCache = { value, ts: Date.now() };
    return value;
  } catch (err) {
    console.error('[Runner] BTC rejim hatası:', err.message);
    return null;
  }
}

async function analyzeSymbol(symbol) {
  const [candles, ticker, fearGreed, marketContext] = await Promise.all([
    fetchOHLCV(symbol, config.timeframe, config.candleLimit),
    fetchTicker(symbol),
    getFearGreed(),
    getBtcRegime(),
  ]);

  const rsi = calcRSI(candles);
  const macdData = calcMACD(candles);
  const bbPos = calcBBPosition(candles);
  const volChange = calcVolumeChange(candles);
  const stoch = calcStochRSI(candles);
  const atr = calcATR(candles, config.atr.period);
  const price = ticker.price;
  const atrPct = atr && price ? atr / price : null;
  const group = config.groupOf(symbol);

  const indicators = {
    rsi,
    macd: macdData?.histogram ?? null,
    bbPos,
    fearGreed,
    volChange,
    stoch,
    atr,
    atrPct,
    price,
  };

  const result = evaluate({
    symbol,
    group,
    ...indicators,
    marketContext,
  });

  return {
    symbol,
    group,
    price,
    change24h: ticker.change24h,
    indicators,
    marketContext,
    direction: result.direction,
    confidence: result.confidence,
    signalPower: result.signalPower,
    leverage: result.leverage,
    tpsl: result.tpsl,
    risk: result.risk,
    regime: result.regime,
    reasons: result.reasons,
    rawScores: result.rawScores,
    timestamp: new Date(),
    engineVersion: 'v2.0.0',
    timeframe: config.timeframe,
  };
}

async function analyzeAll() {
  const results = [];
  const batchSize = 10;

  for (let i = 0; i < config.symbols.length; i += batchSize) {
    const batch = config.symbols.slice(i, i + batchSize);
    const settled = await Promise.allSettled(batch.map(s => analyzeSymbol(s)));

    settled.forEach(r => {
      if (r.status === 'fulfilled') results.push(r.value);
      else console.error('[Runner] Hata:', r.reason?.message);
    });

    if (i + batchSize < config.symbols.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return results;
}

module.exports = { analyzeSymbol, analyzeAll, getBtcRegime };