// src/config.js
require('dotenv').config();

module.exports = {
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
  },

  exchange: {
    id: 'binance',
    apiKey: process.env.BINANCE_API_KEY || '',
    secret: process.env.BINANCE_SECRET || '',
  },

  symbols: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT'],
  timeframe: '15m',
  candleLimit: 100, // RSI/MACD için yeterli mum

  signal: {
    buyThreshold: 65,
    sellThreshold: 35,
    minConfidence: parseInt(process.env.SIGNAL_MIN_CONFIDENCE || '60'),
    cooldownMinutes: parseInt(process.env.SIGNAL_COOLDOWN_MINUTES || '30'),
  },

  weights: {
    rsi: 0.30,
    macd: 0.25,
    bb: 0.20,
    fearGreed: 0.15,
    volume: 0.10,
  },

  thresholds: {
    rsi: { oversold: 30, overbought: 70 },
    bb: { lower: 20, upper: 80 },   // % band position
    fearGreed: { extreme_fear: 25, extreme_greed: 75 },
    volume: { spike: 30 },          // % artış eşiği
  },
};
