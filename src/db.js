// src/db.js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS signals (
      id          SERIAL PRIMARY KEY,
      symbol      VARCHAR(20) NOT NULL,
      direction   VARCHAR(10) NOT NULL,  -- BUY | SELL | HOLD
      confidence  INTEGER NOT NULL,
      price       NUMERIC(18,8) NOT NULL,
      rsi         NUMERIC(6,2),
      macd        NUMERIC(12,6),
      bb_pos      NUMERIC(6,2),
      fear_greed  INTEGER,
      vol_change  NUMERIC(8,2),
      sent        BOOLEAN DEFAULT FALSE,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_signals_symbol_created
      ON signals (symbol, created_at DESC);
  `);
  console.log('[DB] Tables ready');
}

async function saveSignal(signal) {
  const { rows } = await pool.query(
    `INSERT INTO signals
      (symbol, direction, confidence, price, rsi, macd, bb_pos, fear_greed, vol_change, sent)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING id`,
    [
      signal.symbol,
      signal.direction,
      signal.confidence,
      signal.price,
      signal.indicators.rsi,
      signal.indicators.macd,
      signal.indicators.bbPos,
      signal.indicators.fearGreed,
      signal.indicators.volChange,
      signal.sent || false,
    ]
  );
  return rows[0].id;
}

async function getLastSignal(symbol) {
  const { rows } = await pool.query(
    `SELECT * FROM signals
     WHERE symbol = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [symbol]
  );
  return rows[0] || null;
}

async function getRecentSignals(limit = 50) {
  const { rows } = await pool.query(
    `SELECT * FROM signals ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  return rows;
}

async function markSent(id) {
  await pool.query(`UPDATE signals SET sent = TRUE WHERE id = $1`, [id]);
}

module.exports = { init, saveSignal, getLastSignal, getRecentSignals, markSent, pool };
