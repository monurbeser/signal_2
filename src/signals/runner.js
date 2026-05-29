// src/signals/runner.js
const { fetchOHLCV, fetchTicker, fetchFearGreed } = require('./fetcher');
const { calcRSI, calcMACD, calcBBPosition, calcVolumeChange } = require('./indicators');
const { evaluate } = require('./engine');
const config = require('../config');

/**
 * Bir sembol için tam analiz döngüsü çalıştırır
 */
async function analyzeSymbol(symbol) {
  const [candles, ticker, fearGreed] = await Promise.all([
    fetchOHLCV(symbol, config.timeframe, config.candleLimit),
    fetchTicker(symbol),
    fetchFearGreed(),
  ]);

  const rsi       = calcRSI(candles);
  const macdData  = calcMACD(candles);
  const bbPos     = calcBBPosition(candles);
  const volChange = calcVolumeChange(candles);

  const indicators = {
    rsi,
    macd: macdData?.histogram ?? null,
    bbPos,
    fearGreed,
    volChange,
  };

  const result = evaluate(indicators);

  return {
    symbol,
    price: ticker.price,
    change24h: ticker.change24h,
    indicators,
    direction:  result.direction,
    confidence: result.confidence,
    reasons:    result.reasons,
    timestamp:  new Date(),
  };
}

/**
 * Tüm semboller için analiz çalıştırır
 */
async function analyzeAll() {
  const results = await Promise.allSettled(
    config.symbols.map(s => analyzeSymbol(s))
  );

  return results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value);
}

module.exports = { analyzeSymbol, analyzeAll };
