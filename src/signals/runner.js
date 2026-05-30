// src/signals/runner.js
const { fetchOHLCV, fetchTicker, fetchFearGreed } = require('./fetcher');
const { calcRSI, calcMACD, calcBBPosition, calcVolumeChange, calcStochRSI } = require('./indicators');
const { evaluate } = require('./engine');
const config = require('../config');

// Paylaşılan Fear&Greed — tüm coinler için aynı, 5 dk cache
let fgCache = { value: 50, ts: 0 };

async function getFearGreed() {
  if (Date.now() - fgCache.ts < 5 * 60 * 1000) return fgCache.value;
  const val = await fetchFearGreed();
  fgCache = { value: val, ts: Date.now() };
  return val;
}

async function analyzeSymbol(symbol) {
  const [candles, ticker, fearGreed] = await Promise.all([
    fetchOHLCV(symbol, config.timeframe, config.candleLimit),
    fetchTicker(symbol),
    getFearGreed(),
  ]);

  const rsi       = calcRSI(candles);
  const macdData  = calcMACD(candles);
  const bbPos     = calcBBPosition(candles);
  const volChange = calcVolumeChange(candles);
  const stoch     = calcStochRSI(candles);

  const indicators = {
    rsi,
    macd:      macdData?.histogram ?? null,
    bbPos,
    fearGreed,
    volChange,
    stoch,
    price:     ticker.price,
  };

  const result = evaluate(indicators);

  return {
    symbol,
    price:      ticker.price,
    change24h:  ticker.change24h,
    indicators,
    direction:  result.direction,
    confidence: result.confidence,
    leverage:   result.leverage,
    tpsl:       result.tpsl,
    reasons:    result.reasons,
    timestamp:  new Date(),
  };
}

async function analyzeAll() {
  // 49 coin'i 10'arlı batch'lere böl — rate limit aşmamak için
  const results = [];
  const batchSize = 10;
  for (let i = 0; i < config.symbols.length; i += batchSize) {
    const batch = config.symbols.slice(i, i + batchSize);
    const settled = await Promise.allSettled(batch.map(s => analyzeSymbol(s)));
    settled.forEach(r => {
      if (r.status === 'fulfilled') results.push(r.value);
      else console.error('[Runner] Hata:', r.reason?.message);
    });
    // Batch'ler arası kısa bekleme
    if (i + batchSize < config.symbols.length) await new Promise(r => setTimeout(r, 500));
  }
  return results;
}

module.exports = { analyzeSymbol, analyzeAll };
