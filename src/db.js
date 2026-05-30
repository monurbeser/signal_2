// src/db.js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function init() {
  await pool.query(`DROP TABLE IF EXISTS signals;`);
  await pool.query(`
    CREATE SEQUENCE IF NOT EXISTS signals_seq START 1;
    CREATE TABLE signals (
      id            INTEGER PRIMARY KEY DEFAULT nextval('signals_seq'),
      signal_id     VARCHAR(10) UNIQUE,
      symbol        VARCHAR(30) NOT NULL,
      direction     VARCHAR(10) NOT NULL,
      entry_price   NUMERIC(20,8) NOT NULL,
      tp_price      NUMERIC(20,8),
      sl_price      NUMERIC(20,8),
      leverage      INTEGER,
      confidence    INTEGER,
      outcome       VARCHAR(10) DEFAULT 'OPEN',
      pnl_pct       NUMERIC(8,2),
      close_price   NUMERIC(20,8),
      closed_at     TIMESTAMPTZ,
      rsi           NUMERIC(6,2),
      macd          NUMERIC(14,8),
      bb_pos        NUMERIC(6,2),
      fear_greed    INTEGER,
      vol_change    NUMERIC(8,2),
      sent          BOOLEAN DEFAULT FALSE,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX idx_signals_created ON signals (created_at DESC);
    CREATE INDEX idx_signals_outcome ON signals (outcome);
  `);
  console.log('[DB] Tables ready');
}

async function saveSignal(signal) {
  // signal_id: 0000001 formatı
  const countRes = await pool.query(`SELECT COUNT(*) FROM signals`);
  const count = parseInt(countRes.rows[0].count) + 1;
  const signalId = count.toString().padStart(7, '0');

  const tpsl = signal.tpsl || {};
  const { rows } = await pool.query(
    `INSERT INTO signals
      (signal_id, symbol, direction, entry_price, tp_price, sl_price, leverage,
       confidence, rsi, macd, bb_pos, fear_greed, vol_change, sent)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING id, signal_id`,
    [
      signalId,
      signal.symbol,
      signal.direction,
      signal.price,
      tpsl.tp || null,
      tpsl.sl || null,
      signal.leverage || null,
      signal.confidence,
      signal.indicators?.rsi,
      signal.indicators?.macd,
      signal.indicators?.bbPos,
      signal.indicators?.fearGreed,
      signal.indicators?.volChange,
      false,
    ]
  );
  return rows[0];
}

async function getOpenSignals() {
  const { rows } = await pool.query(
    `SELECT * FROM signals WHERE outcome = 'OPEN' ORDER BY created_at ASC`
  );
  return rows;
}

async function closeSignal(id, outcome, closePrice, pnlPct) {
  await pool.query(
    `UPDATE signals SET outcome=$1, close_price=$2, pnl_pct=$3, closed_at=NOW()
     WHERE id=$4`,
    [outcome, closePrice, pnlPct, id]
  );
}

async function getRecentSignals(limit = 100, offset = 0) {
  const { rows } = await pool.query(
    `SELECT * FROM signals ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return rows;
}

async function getSignalCount() {
  const { rows } = await pool.query(`SELECT COUNT(*) FROM signals`);
  return parseInt(rows[0].count);
}

async function getAllSignals() {
  const { rows } = await pool.query(`SELECT * FROM signals ORDER BY created_at DESC`);
  return rows;
}

async function markSent(id) {
  await pool.query(`UPDATE signals SET sent=TRUE WHERE id=$1`, [id]);
}

module.exports = {
  init, saveSignal, getOpenSignals, closeSignal,
  getRecentSignals, getSignalCount, getAllSignals, markSent, pool
};
