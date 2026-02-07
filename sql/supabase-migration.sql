-- ShopSavvy Price Tracker - Supabase Database Schema
-- Run this SQL in your Supabase SQL Editor to create all required tables

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT,
  verified BOOLEAN DEFAULT FALSE,
  verification_token TEXT,
  auth_provider VARCHAR(50) DEFAULT 'local', -- 'local', 'google', 'amazon'
  login_count INTEGER DEFAULT 0,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_auth_provider ON users(auth_provider);

-- ============================================
-- LOGIN HISTORY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS login_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  success BOOLEAN NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  auth_method VARCHAR(50), -- 'password', 'google', 'amazon'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_history_user ON login_history(user_id);
CREATE INDEX IF NOT EXISTS idx_login_history_created ON login_history(created_at DESC);

-- ============================================
-- USER SESSIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  session_token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(session_token);

-- ============================================
-- TRACKED PRODUCTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS tracked_products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  product_id VARCHAR(255) NOT NULL, -- ML product ID (e.g., MLM123456789)
  product_title TEXT NOT NULL,
  product_url TEXT,
  source VARCHAR(50) DEFAULT 'mercadolibre', -- 'mercadolibre', 'amazon'
  target_price DECIMAL(10, 2), -- User's desired price
  current_price DECIMAL(10, 2) NOT NULL,
  last_checked TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tracked_products_user ON tracked_products(user_id);
CREATE INDEX IF NOT EXISTS idx_tracked_products_product_id ON tracked_products(product_id);
CREATE INDEX IF NOT EXISTS idx_tracked_products_source ON tracked_products(source);
CREATE INDEX IF NOT EXISTS idx_tracked_products_last_checked ON tracked_products(last_checked);

-- ============================================
-- PRICE HISTORY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS price_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tracked_product_id UUID REFERENCES tracked_products(id) ON DELETE CASCADE,
  price DECIMAL(10, 2) NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_history_tracked_product ON price_history(tracked_product_id);
CREATE INDEX IF NOT EXISTS idx_price_history_recorded ON price_history(recorded_at DESC);

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracked_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;

-- Users table policies
CREATE POLICY "Users can read their own data" ON users
  FOR SELECT USING (auth.uid()::text = id::text);

CREATE POLICY "Users can update their own data" ON users
  FOR UPDATE USING (auth.uid()::text = id::text);

-- Login history policies
CREATE POLICY "Users can read their own login history" ON login_history
  FOR SELECT USING (user_id::text = auth.uid()::text);

-- User sessions policies
CREATE POLICY "Users can read their own sessions" ON user_sessions
  FOR SELECT USING (user_id::text = auth.uid()::text);

-- Tracked products policies
CREATE POLICY "Users can read their own tracked products" ON tracked_products
  FOR SELECT USING (user_id::text = auth.uid()::text);

CREATE POLICY "Users can insert their own tracked products" ON tracked_products
  FOR INSERT WITH CHECK (user_id::text = auth.uid()::text);

CREATE POLICY "Users can update their own tracked products" ON tracked_products
  FOR UPDATE USING (user_id::text = auth.uid()::text);

CREATE POLICY "Users can delete their own tracked products" ON tracked_products
  FOR DELETE USING (user_id::text = auth.uid()::text);

-- Price history policies (read through tracked_products relationship)
CREATE POLICY "Users can read price history for their tracked products" ON price_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tracked_products
      WHERE tracked_products.id = price_history.tracked_product_id
      AND tracked_products.user_id::text = auth.uid()::text
    )
  );

-- ============================================
-- FUNCTIONS FOR DATA ANALYSIS
-- ============================================

-- Function to get average price for a tracked product
CREATE OR REPLACE FUNCTION get_average_price(p_tracked_product_id UUID, p_days INTEGER DEFAULT 30)
RETURNS DECIMAL AS $$
  SELECT ROUND(AVG(price)::numeric, 2)
  FROM price_history
  WHERE tracked_product_id = p_tracked_product_id
    AND recorded_at >= NOW() - (p_days || ' days')::INTERVAL;
$$ LANGUAGE SQL;

-- Function to get minimum price for a tracked product
CREATE OR REPLACE FUNCTION get_min_price(p_tracked_product_id UUID, p_days INTEGER DEFAULT 30)
RETURNS DECIMAL AS $$
  SELECT MIN(price)
  FROM price_history
  WHERE tracked_product_id = p_tracked_product_id
    AND recorded_at >= NOW() - (p_days || ' days')::INTERVAL;
$$ LANGUAGE SQL;

-- Function to get maximum price for a tracked product
CREATE OR REPLACE FUNCTION get_max_price(p_tracked_product_id UUID, p_days INTEGER DEFAULT 30)
RETURNS DECIMAL AS $$
  SELECT MAX(price)
  FROM price_history
  WHERE tracked_product_id = p_tracked_product_id
    AND recorded_at >= NOW() - (p_days || ' days')::INTERVAL;
$$ LANGUAGE SQL;

-- ============================================
-- SEED DATA (Optional - for testing)
-- ============================================

-- Create a demo user
INSERT INTO users (email, password_hash, verified, auth_provider)
VALUES (
  'demo@shopsavvy.com',
  '$2a$10$YourHashedPasswordHere', -- Replace with actual bcrypt hash
  TRUE,
  'local'
) ON CONFLICT (email) DO NOTHING;

-- ============================================
-- VIEWS FOR COMMON QUERIES
-- ============================================

-- View for products with their latest price stats
CREATE OR REPLACE VIEW v_tracked_products_with_stats AS
SELECT
  tp.id,
  tp.user_id,
  tp.product_id,
  tp.product_title,
  tp.product_url,
  tp.source,
  tp.target_price,
  tp.current_price,
  tp.last_checked,
  tp.created_at,
  get_average_price(tp.id, 30) as avg_price_30d,
  get_min_price(tp.id, 30) as min_price_30d,
  get_max_price(tp.id, 30) as max_price_30d,
  (SELECT COUNT(*) FROM price_history WHERE tracked_product_id = tp.id) as price_history_count
FROM tracked_products tp;

-- View for highlighted deals (products at good prices)
CREATE OR REPLACE VIEW v_highlighted_deals AS
SELECT
  tp.id,
  tp.product_id,
  tp.product_title,
  tp.product_url,
  tp.source,
  tp.current_price,
  stats.avg_price_30d,
  stats.min_price_30d,
  CASE
    WHEN tp.current_price <= stats.min_price_30d THEN TRUE
    ELSE FALSE
  END as is_best_price,
  CASE
    WHEN stats.avg_price_30d > 0 AND tp.current_price < (stats.avg_price_30d * 0.95) THEN TRUE
    ELSE FALSE
  END as is_good_deal,
  ROUND(((stats.avg_price_30d - tp.current_price) / stats.avg_price_30d * 100)::numeric, 2) as savings_percent
FROM tracked_products tp
JOIN v_tracked_products_with_stats stats ON tp.id = stats.id
WHERE stats.avg_price_30d > 0
  AND (
    tp.current_price <= stats.min_price_30d
    OR tp.current_price < (stats.avg_price_30d * 0.95)
  )
ORDER BY savings_percent DESC;

-- ============================================
-- MAINTENANCE
-- ============================================

-- Function to clean old price history (keep last 90 days)
CREATE OR REPLACE FUNCTION clean_old_price_history()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM price_history
  WHERE recorded_at < NOW() - INTERVAL '90 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to clean expired sessions
CREATE OR REPLACE FUNCTION clean_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM user_sessions
  WHERE expires_at < NOW();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- GRANTS (if using service role key, this is handled automatically)
-- ============================================

COMMENT ON TABLE users IS 'Application users with authentication data';
COMMENT ON TABLE login_history IS 'Audit log of login attempts';
COMMENT ON TABLE user_sessions IS 'Active user sessions';
COMMENT ON TABLE tracked_products IS 'Products being tracked for price changes';
COMMENT ON TABLE price_history IS 'Historical price data for tracked products';

COMMENT ON VIEW v_tracked_products_with_stats IS 'Tracked products with calculated price statistics';
COMMENT ON VIEW v_highlighted_deals IS 'Products currently at good prices or best prices';
