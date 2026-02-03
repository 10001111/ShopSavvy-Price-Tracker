-- =============================================
-- OfertaRadar - Data Analysis Functions & Views
-- Migration: 003_add_data_analysis_functions
-- Purpose: Enable real-time price analysis and deal detection
-- =============================================

-- Function to get average price for a tracked product
CREATE OR REPLACE FUNCTION get_average_price(p_tracked_product_id BIGINT, p_days INTEGER DEFAULT 30)
RETURNS DECIMAL AS $$
  SELECT ROUND(AVG(price)::numeric, 2)
  FROM price_history
  WHERE tracked_product_id = p_tracked_product_id
    AND recorded_at >= NOW() - (p_days || ' days')::INTERVAL;
$$ LANGUAGE SQL STABLE;

-- Function to get minimum price for a tracked product
CREATE OR REPLACE FUNCTION get_min_price(p_tracked_product_id BIGINT, p_days INTEGER DEFAULT 30)
RETURNS DECIMAL AS $$
  SELECT MIN(price)
  FROM price_history
  WHERE tracked_product_id = p_tracked_product_id
    AND recorded_at >= NOW() - (p_days || ' days')::INTERVAL;
$$ LANGUAGE SQL STABLE;

-- Function to get maximum price for a tracked product
CREATE OR REPLACE FUNCTION get_max_price(p_tracked_product_id BIGINT, p_days INTEGER DEFAULT 30)
RETURNS DECIMAL AS $$
  SELECT MAX(price)
  FROM price_history
  WHERE tracked_product_id = p_tracked_product_id
    AND recorded_at >= NOW() - (p_days || ' days')::INTERVAL;
$$ LANGUAGE SQL STABLE;

-- View for tracked products with their latest price stats
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
  CASE
    WHEN stats.avg_price_30d > 0 THEN
      ROUND(((stats.avg_price_30d - tp.current_price) / stats.avg_price_30d * 100)::numeric, 2)
    ELSE 0
  END as savings_percent
FROM tracked_products tp
JOIN v_tracked_products_with_stats stats ON tp.id = stats.id
WHERE stats.avg_price_30d > 0
  AND stats.price_history_count >= 2
  AND (
    tp.current_price <= stats.min_price_30d
    OR tp.current_price < (stats.avg_price_30d * 0.95)
  )
ORDER BY savings_percent DESC;

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

-- Add helpful comments
COMMENT ON FUNCTION get_average_price IS 'Calculate average price for a product over specified days (default 30)';
COMMENT ON FUNCTION get_min_price IS 'Get minimum price for a product over specified days (default 30)';
COMMENT ON FUNCTION get_max_price IS 'Get maximum price for a product over specified days (default 30)';
COMMENT ON VIEW v_tracked_products_with_stats IS 'Tracked products with calculated price statistics';
COMMENT ON VIEW v_highlighted_deals IS 'Products currently at good prices or best prices based on historical data';
COMMENT ON FUNCTION clean_old_price_history IS 'Remove price history older than 90 days to keep database size manageable';
COMMENT ON FUNCTION clean_expired_sessions IS 'Remove expired user sessions from the database';

-- Create indexes for price_history to improve query performance
CREATE INDEX IF NOT EXISTS idx_price_history_product_id ON price_history(tracked_product_id);
CREATE INDEX IF NOT EXISTS idx_price_history_recorded_at ON price_history(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_history_product_time ON price_history(tracked_product_id, recorded_at DESC);

-- Verify functions and views were created
SELECT
  routine_name as function_name,
  routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name LIKE '%price%' OR routine_name LIKE '%session%'
ORDER BY routine_name;

SELECT
  table_name as view_name,
  table_type
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'VIEW'
ORDER BY table_name;
