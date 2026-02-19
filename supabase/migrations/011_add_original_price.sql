-- Migration 011: Add original_price column to product_cache
-- Stores the crossed-out list price scraped from Amazon so cards can show discount %

ALTER TABLE public.product_cache
  ADD COLUMN IF NOT EXISTS original_price DECIMAL(10,2) DEFAULT NULL;

SELECT '011: original_price column added to product_cache' AS status;
