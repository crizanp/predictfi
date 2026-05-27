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

-- ============================================================
-- 3. card_bg / card_text columns on market_metadata
-- ============================================================
ALTER TABLE market_metadata ADD COLUMN IF NOT EXISTS card_bg   TEXT;
ALTER TABLE market_metadata ADD COLUMN IF NOT EXISTS card_text TEXT;
ALTER TABLE market_metadata ADD COLUMN IF NOT EXISTS events_json TEXT;

-- ============================================================
-- 4. whitelist_applications table
-- ============================================================
CREATE TABLE IF NOT EXISTS whitelist_applications (
  id             BIGSERIAL PRIMARY KEY,
  wallet_address TEXT        UNIQUE NOT NULL,
  name           TEXT        NOT NULL,
  email          TEXT        NOT NULL,
  telegram       TEXT        NOT NULL,
  status         TEXT        NOT NULL DEFAULT 'pending',
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whitelist_wallet ON whitelist_applications (wallet_address);

ALTER TABLE whitelist_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read own whitelist application"
  ON whitelist_applications FOR SELECT USING (true);

CREATE POLICY "Allow insert whitelist application"
  ON whitelist_applications FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow update whitelist application"
  ON whitelist_applications FOR UPDATE USING (true);


-- ============================================================
-- 5. market_comments table (Discussion tab)
-- ============================================================
CREATE TABLE IF NOT EXISTS market_comments (
  id             BIGSERIAL PRIMARY KEY,
  market_id      INTEGER       NOT NULL,
  author_address TEXT          NOT NULL,
  content        TEXT          NOT NULL,
  parent_id      BIGINT        REFERENCES market_comments(id) ON DELETE CASCADE,
  likes          INTEGER       DEFAULT 0,
  created_at     TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_market_id ON market_comments (market_id);

ALTER TABLE market_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read comments"         ON market_comments FOR SELECT USING (true);
CREATE POLICY "Allow insert comments"        ON market_comments FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update comment likes"   ON market_comments FOR UPDATE USING (true);

-- Helper function to atomically increment likes
CREATE OR REPLACE FUNCTION increment_comment_likes(cid BIGINT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE market_comments SET likes = likes + 1 WHERE id = cid;
END;
$$;


-- ============================================================
-- 6. market_activity table (Activity / Holders tabs)
--    Mirrors on-chain PredictionPlaced events to Supabase
-- ============================================================
CREATE TABLE IF NOT EXISTS market_activity (
  id           BIGSERIAL PRIMARY KEY,
  market_id    INTEGER       NOT NULL,
  event_id     INTEGER,
  user_address TEXT          NOT NULL,
  choice       SMALLINT      NOT NULL,   -- 1 = YES, 2 = NO
  amount_eth   TEXT          NOT NULL,
  tx_hash      TEXT          UNIQUE NOT NULL,
  block_number BIGINT,
  created_at   TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_market_id  ON market_activity (market_id);
CREATE INDEX IF NOT EXISTS idx_activity_user_addr  ON market_activity (user_address);

ALTER TABLE market_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read activity"  ON market_activity FOR SELECT USING (true);
CREATE POLICY "Allow insert activity" ON market_activity FOR INSERT WITH CHECK (true);


-- ============================================================
-- 7. banner_ads table (Ads Management)
-- ============================================================
CREATE TABLE IF NOT EXISTS banner_ads (
  id              BIGSERIAL PRIMARY KEY,
  title           TEXT          NOT NULL,
  image_url       TEXT,
  link_url        TEXT,
  -- pages is an array: ['all'] OR any subset of
  -- ['home','markets','market_detail','portfolio','activity','leaderboard','whitelist']
  pages           TEXT[]        NOT NULL DEFAULT ARRAY['all'],
  start_date      TIMESTAMPTZ   NOT NULL,
  end_date        TIMESTAMPTZ   NOT NULL,
  is_active       BOOLEAN       NOT NULL DEFAULT true,
  contact_handle  TEXT          DEFAULT 'cixanp',
  created_at      TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_banner_ads_active     ON banner_ads (is_active);
CREATE INDEX IF NOT EXISTS idx_banner_ads_start_date ON banner_ads (start_date);
CREATE INDEX IF NOT EXISTS idx_banner_ads_end_date   ON banner_ads (end_date);

ALTER TABLE banner_ads ENABLE ROW LEVEL SECURITY;

-- Public can read active ads (needed by GlobalBanner component)
CREATE POLICY "Public read banner_ads"
  ON banner_ads FOR SELECT USING (true);

-- Only authenticated/admin can insert/update/delete
-- For now we allow open insert/update so the admin page works without auth.
-- Tighten this once you add admin authentication.
CREATE POLICY "Allow insert banner_ads"
  ON banner_ads FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow update banner_ads"
  ON banner_ads FOR UPDATE USING (true);

CREATE POLICY "Allow delete banner_ads"
  ON banner_ads FOR DELETE USING (true);


-- ============================================================
-- 8. user_profiles table (Public profile names + bio)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_profiles (
  wallet_address TEXT PRIMARY KEY,
  display_name   TEXT,
  bio            TEXT,
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_updated_at ON user_profiles (updated_at);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read user_profiles"
  ON user_profiles FOR SELECT USING (true);

CREATE POLICY "Allow upsert user_profiles"
  ON user_profiles FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow update user_profiles"
  ON user_profiles FOR UPDATE USING (true);

