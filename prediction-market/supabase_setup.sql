-- ============================================================
-- PredictFi — Supabase Database Setup
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1. market_metadata table
CREATE TABLE IF NOT EXISTS market_metadata (
  market_id   INTEGER PRIMARY KEY,
  image_url   TEXT,
  description TEXT,
  rules       TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE market_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read market_metadata"
  ON market_metadata FOR SELECT USING (true);

CREATE POLICY "Allow insert market_metadata"
  ON market_metadata FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow update market_metadata"
  ON market_metadata FOR UPDATE USING (true);


-- 2. market_odds_history table
CREATE TABLE IF NOT EXISTS market_odds_history (
  id          BIGSERIAL PRIMARY KEY,
  market_id   INTEGER       NOT NULL,
  yes_pool    TEXT          NOT NULL,
  no_pool     TEXT          NOT NULL,
  total_pool  TEXT          NOT NULL,
  recorded_at TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_odds_market_id   ON market_odds_history (market_id);
CREATE INDEX IF NOT EXISTS idx_odds_recorded_at ON market_odds_history (recorded_at);

ALTER TABLE market_odds_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read odds history"
  ON market_odds_history FOR SELECT USING (true);

CREATE POLICY "Allow insert odds history"
  ON market_odds_history FOR INSERT WITH CHECK (true);


-- ============================================================
-- Storage bucket setup (run separately or via Supabase UI)
-- Supabase Dashboard → Storage → New Bucket → "market-images"
-- Set bucket to PUBLIC so images are accessible without auth.
-- ============================================================
