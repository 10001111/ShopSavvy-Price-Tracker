-- Clear all products with zero or null prices
-- These are corrupted from before schema was fixed
-- Run this in Supabase SQL Editor

DELETE FROM product_cache WHERE price = 0 OR price IS NULL;

-- Verify cleanup
SELECT
  COUNT(*) as total_products,
  MIN(price) as min_price,
  MAX(price) as max_price,
  AVG(price) as avg_price
FROM product_cache;
