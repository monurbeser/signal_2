// src/db.js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function init() {
  await pool.query(`
    CREATE SEQUENCE IF NOT EXISTS signals_seq START 1;

    CREATE TABLE IF NOT EXISTS signals (
      id INTEGER PRIMARY KEY DEFAULT nextval('signals_seq'),
      signal_id VARCHAR(20) UNIQUE,
      symbol VARCHAR(30) NOT NULL,
      direction VARCHAR(10) NOT NULL,
      entry_price NUMERIC(20,8) NOT NULL,
      tp_price NUMERIC(20,8),
      sl_price NUMERIC(20,8),
      leverage NUMERIC(8,2),
      confidence INTEGER,
      outcome VARCHAR(10) DEFAULT 'OPEN',
      pnl_pct NUMERIC(10,2),
      close_price NUMERIC(20,8),
      closed_at TIMESTAMPTZ,
      rsi NUMERIC(6,2),
      macd NUMERIC(14,8),
      bb_pos NUMERIC(6,2),
      fear_greed INTEGER,
      vol_change NUMERIC(8,2),
      sent BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    ALTER TABLE signals ADD COLUMN IF NOT EXISTS signal_power INTEGER;
    ALTER TABLE signals ADD COLUMN IF NOT EXISTS engine_version VARCHAR(20);
    ALTER TABLE signals ADD COLUMN IF NOT EXISTS timeframe VARCHAR(10);
    ALTER TABLE signals ADD COLUMN IF NOT EXISTS symbol_group VARCHAR(30);
    ALTER TABLE signals ADD COLUMN IF NOT EXISTS atr NUMERIC(20,8);
    ALTER TABLE signals ADD COLUMN IF NOT EXISTS atr_pct NUMERIC(12,8);
    ALTER TABLE signals ADD COLUMN IF NOT EXISTS account_risk_pct NUMERIC(12,8);
    ALTER TABLE signals ADD COLUMN IF NOT EXISTS position_notional_pct NUMERIC(12,8);
    ALTER TABLE signals ADD COLUMN IF NOT EXISTS btc_regime VARCHAR(20);
    ALTER TABLE signals ADD COLUMN IF NOT EXISTS btc_ema_distance_pct NUMERIC(10,4);
    ALTER TABLE signals ADD COLUMN IF NOT EXISTS regime_reason TEXT;

    CREATE TABLE IF NOT EXISTS analysis_snapshots (
      id BIGSERIAL PRIMARY KEY,
      symbol VARCHAR(30) NOT NULL,
      direction VARCHAR(10) NOT NULL,
      confidence INTEGER,
      signal_power INTEGER,
      price NUMERIC(20,8),
      timeframe VARCHAR(10),
      engine_version VARCHAR(20),
      symbol_group VARCHAR(30),
      rsi NUMERIC(6,2),
      macd NUMERIC(14,8),
      bb_pos NUMERIC(6,2),
      fear_greed INTEGER,
      vol_change NUMERIC(8,2),
      atr NUMERIC(20,8),
      atr_pct NUMERIC(12,8),
      btc_regime VARCHAR(20),
      btc_ema_distance_pct NUMERIC(10,4),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_signals_created ON signals (created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_signals_outcome ON signals (outcome);
    CREATE INDEX IF NOT EXISTS idx_signals_symbol ON signals (symbol);
    CREATE INDEX IF NOT EXISTS idx_snapshots_created ON analysis_snapshots (created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_snapshots_symbol ON analysis_snapshots (symbol);
  `);

  console.log('[DB] V2 tablolar hazır, mevcut veriler korundu');
}

async function nextSignalId() {
  const { rows } = await pool.query(`SELECT nextval('signals_seq') AS n`);
  return rows[0].n.toString().padStart(7, '0');
}

async function saveSignal(signal) {
  const signalId = await nextSignalId();
  const tpsl = signal.tpsl || {};
  const risk = signal.risk || {};
  const indicators = signal.indicators || {};
  const marketContext = signal.marketContext || {};

  const { rows } = await pool.query(
    `INSERT INTO signals
      (
        signal_id, symbol, direction, entry_price, tp_price, sl_price,
        leverage, confidence, signal_power, rsi, macd, bb_pos, fear_greed,
        vol_change, sent, engine_version, timeframe, symbol_group, atr, atr_pct,
        account_risk_pct, position_notional_pct, btc_regime, btc_ema_distance_pct,
        regime_reason
      )
     VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
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
      signal.signalPower,
      indicators.rsi,
      indicators.macd,
      indicators.bbPos,
      indicators.fearGreed,
      indicators.volChange,
      false,
      signal.engineVersion,
      signal.timeframe,
      signal.group,
      indicators.atr,
      indicators.atrPct,
      risk.accountRiskPct,
      risk.positionNotionalPct,
      marketContext.btcRegime || null,
      marketContext.btcEmaDistancePct || null,
      signal.regime?.reason || null,
    ]
  );

  return rows[0];
}

async function saveAnalysisSnapshot(signal) {
  const indicators = signal.indicators || {};
  const marketContext = signal.marketContext || {};

  await pool.query(
    `INSERT INTO analysis_snapshots
      (
        symbol, direction, confidence, signal_power, price, timeframe,
        engine_version, symbol_group, rsi, macd, bb_pos, fear_greed,
        vol_change, atr, atr_pct, btc_regime, btc_ema_distance_pct
      )
     VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
    [
      signal.symbol,
      signal.direction,
      signal.confidence,
      signal.signalPower,
      signal.price,
      signal.timeframe,
      signal.engineVersion,
      signal.group,
      indicators.rsi,
      indicators.macd,
      indicators.bbPos,
      indicators.fearGreed,
      indicators.volChange,
      indicators.atr,
      indicators.atrPct,
      marketContext.btcRegime || null,
      marketContext.btcEmaDistancePct || null,
    ]
  );
}

async function getOpenSignals() {
  const { rows } = await pool.query(
    `SELECT * FROM signals WHERE outcome = 'OPEN' ORDER BY created_at ASC`
  );

  return rows;
}

async function getOpenRiskSummary() {
  const { rows } = await pool.query(`
    SELECT
      COUNT(*)::int AS total_open,
      COUNT(*) FILTER (WHERE direction = 'LONG')::int AS long_open,
      COUNT(*) FILTER (WHERE direction = 'SHORT')::int AS short_open,
      COUNT(*) FILTER (WHERE symbol_group = 'MEME')::int AS meme_open,
      COALESCE(SUM(account_risk_pct), 0)::float AS total_risk_pct
    FROM signals
    WHERE outcome = 'OPEN'
  `);

  const r = rows[0];

  return {
    totalOpen: parseInt(r.total_open || 0),
    longOpen: parseInt(r.long_open || 0),
    shortOpen: parseInt(r.short_open || 0),
    memeOpen: parseInt(r.meme_open || 0),
    totalRiskPct: parseFloat(r.total_risk_pct || 0),
  };
}

async function closeSignal(id, outcome, closePrice, pnlPct) {
  await pool.query(
    `UPDATE signals
     SET outcome=$1, close_price=$2, pnl_pct=$3, closed_at=NOW()
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
  await pool.query(`UPDATE signals SET sent=TRUE WHERE id=$1`, [parseInt(id)]);
}

module.exports = {
  init,
  saveSignal,
  saveAnalysisSnapshot,
  getOpenSignals,
  getOpenRiskSummary,
  closeSignal,
  getRecentSignals,
  getSignalCount,
  getAllSignals,
  markSent,
  pool,
};