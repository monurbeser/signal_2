// src/config.js
require('dotenv').config();

const SYMBOLS = [
  'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'XRP/USDT',
  'DOGE/USDT', 'ADA/USDT', 'AVAX/USDT', 'LINK/USDT', 'TRX/USDT',
  'LTC/USDT', 'BCH/USDT', 'DOT/USDT', 'NEAR/USDT', 'ATOM/USDT',
  'FIL/USDT', 'ETC/USDT', 'APT/USDT', 'ARB/USDT', 'OP/USDT',
  'SUI/USDT', 'SEI/USDT', 'TIA/USDT', 'INJ/USDT', 'RUNE/USDT',
  'WLD/USDT', 'FET/USDT', 'RENDER/USDT', 'TAO/USDT', 'JUP/USDT',
  '1000PEPE/USDT', 'WIF/USDT', '1000BONK/USDT', '1000FLOKI/USDT', '1000SHIB/USDT',
  'DOGS/USDT', 'PNUT/USDT', 'POPCAT/USDT', 'MEME/USDT', 'TURBO/USDT',
  'UNI/USDT', 'AAVE/USDT', 'CRV/USDT', 'DYDX/USDT', 'GMX/USDT',
  'GALA/USDT', 'SAND/USDT', 'MANA/USDT', 'ENA/USDT', 'PENDLE/USDT',
];

const GROUPS = {
  MAJOR: ['BTC/USDT', 'ETH/USDT'],
  LARGE_ALT: ['BNB/USDT', 'SOL/USDT', 'XRP/USDT', 'ADA/USDT', 'AVAX/USDT', 'LINK/USDT', 'TRX/USDT', 'LTC/USDT', 'BCH/USDT', 'DOT/USDT', 'NEAR/USDT', 'ATOM/USDT'],
  AI: ['WLD/USDT', 'FET/USDT', 'RENDER/USDT', 'TAO/USDT'],
  MEME: ['DOGE/USDT', '1000PEPE/USDT', 'WIF/USDT', '1000BONK/USDT', '1000FLOKI/USDT', '1000SHIB/USDT', 'DOGS/USDT', 'PNUT/USDT', 'POPCAT/USDT', 'MEME/USDT', 'TURBO/USDT'],
  DEFI: ['UNI/USDT', 'AAVE/USDT', 'CRV/USDT', 'DYDX/USDT', 'GMX/USDT', 'PENDLE/USDT'],
  GAMING: ['GALA/USDT', 'SAND/USDT', 'MANA/USDT'],
};

function groupOf(symbol) {
  for (const [group, symbols] of Object.entries(GROUPS)) {
    if (symbols.includes(symbol)) return group;
  }
  return 'OTHER';
}

module.exports = {
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
  },

  exchange: {
    id: 'binance',
    defaultType: 'future',
  },

  symbols: SYMBOLS,
  groups: GROUPS,
  groupOf,

  timeframe: process.env.SIGNAL_TIMEFRAME || '5m',
  candleLimit: parseInt(process.env.CANDLE_LIMIT || '200'),

  signal: {
    longThreshold: parseInt(process.env.LONG_THRESHOLD || '70'),
    shortThreshold: parseInt(process.env.SHORT_THRESHOLD || '30'),
    minSignalPower: parseInt(process.env.MIN_SIGNAL_POWER || '70'),
    cooldownMinutes: parseInt(process.env.SIGNAL_COOLDOWN_MINUTES || '60'),
  },

  weights: {
    rsi: 0.28,
    macd: 0.25,
    bb: 0.20,
    volume: 0.12,
    stoch: 0.10,
    fearGreed: 0.05,
  },

  thresholds: {
    rsi: { oversold: 32, overbought: 68 },
    bb: { lower: 20, upper: 80 },
    fearGreed: { extreme_fear: 25, extreme_greed: 75 },
    volume: { spike: 25 },
  },

  atr: {
    period: 14,
    slMult: parseFloat(process.env.ATR_SL_MULT || '1.2'),
    tpMult: parseFloat(process.env.ATR_TP_MULT || '1.8'),
    minSlPct: parseFloat(process.env.MIN_SL_PCT || '0.004'),
    maxSlPct: parseFloat(process.env.MAX_SL_PCT || '0.025'),
  },

  risk: {
    accountRiskPct: parseFloat(process.env.ACCOUNT_RISK_PCT || '0.005'),
    maxLeverageByGroup: {
      MAJOR: 3,
      LARGE_ALT: 2,
      AI: 1.5,
      MEME: 1,
      DEFI: 1.5,
      GAMING: 1.5,
      OTHER: 1,
    },
    maxOpenSignals: parseInt(process.env.MAX_OPEN_SIGNALS || '5'),
    maxSameDirection: parseInt(process.env.MAX_SAME_DIRECTION || '3'),
    maxMemeOpen: parseInt(process.env.MAX_MEME_OPEN || '1'),
    maxTotalOpenRiskPct: parseFloat(process.env.MAX_TOTAL_OPEN_RISK_PCT || '0.02'),
  },

  regime: {
    enabled: process.env.BTC_REGIME_FILTER !== 'false',
    btcSymbol: 'BTC/USDT',
    emaPeriod: 200,
    timeframe: '1h',
    counterTrendMinPower: parseInt(process.env.COUNTER_TREND_MIN_POWER || '85'),
  },

  outcome: {
    checkIntervalMs: parseInt(process.env.OUTCOME_CHECK_INTERVAL_MS || '30000'),
    expireHours: parseInt(process.env.SIGNAL_EXPIRE_HOURS || '24'),
  },
};