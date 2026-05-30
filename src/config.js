// src/config.js
require('dotenv').config();

const SYMBOLS = [
  'BTC/USDT','ETH/USDT','BNB/USDT','SOL/USDT','XRP/USDT',
  'DOGE/USDT','ADA/USDT','AVAX/USDT','LINK/USDT','TRX/USDT',
  'LTC/USDT','BCH/USDT','DOT/USDT','NEAR/USDT','ATOM/USDT',
  'FIL/USDT','ETC/USDT','APT/USDT','ARB/USDT','OP/USDT',
  'SUI/USDT','SEI/USDT','TIA/USDT','INJ/USDT','RUNE/USDT',
  'WLD/USDT','FET/USDT','RENDER/USDT','TAO/USDT','JUP/USDT',
  '1000PEPE/USDT','WIF/USDT','1000BONK/USDT','1000FLOKI/USDT','1000SHIB/USDT',
  'DOGS/USDT','PNUT/USDT','POPCAT/USDT','MEME/USDT','TURBO/USDT',
  'UNI/USDT','AAVE/USDT','CRV/USDT','DYDX/USDT','GMX/USDT',
  'GALA/USDT','SAND/USDT','MANA/USDT','ENA/USDT','PENDLE/USDT',
];

module.exports = {
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
  },

  exchange: {
    id: 'bybit',
    apiKey: process.env.BYBIT_API_KEY || '',
    secret: process.env.BYBIT_SECRET || '',
  },

  symbols: SYMBOLS,
  timeframe: '5m',       // 5 dakikaya düşürdük — daha hızlı sinyal
  candleLimit: 120,

signal: {
  longThreshold:  70,
  shortThreshold: 30,
  minConfidence:  parseInt(process.env.SIGNAL_MIN_CONFIDENCE  || '70'),
  cooldownMinutes:parseInt(process.env.SIGNAL_COOLDOWN_MINUTES || '60'),
},

  // Kaldıraç tablosu: güven skoru → kaldıraç
  leverage: [
    { minConf: 90, lev: 20 },
    { minConf: 82, lev: 15 },
    { minConf: 75, lev: 10 },
    { minConf: 68, lev: 7  },
    { minConf: 65, lev: 5  },
  ],

  // TP / SL oranları (kaldıraca göre)
  tpsl: {
    tpPct: 0.025,   // %2.5 TP (fiyattan)
    slPct: 0.012,   // %1.2 SL (fiyattan)
  },

  weights: {
    rsi:       0.28,
    macd:      0.25,
    bb:        0.20,
    fearGreed: 0.12,
    volume:    0.10,
    stoch:     0.05,  // Stochastic RSI eklendi
  },

  thresholds: {
    rsi:       { oversold: 32, overbought: 68 },
    bb:        { lower: 20, upper: 80 },
    fearGreed: { extreme_fear: 25, extreme_greed: 75 },
    volume:    { spike: 25 },
  },
};
