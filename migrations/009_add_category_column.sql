-- Migration 009: Add category column to product_cache table
-- This allows filtering products by category on the homepage

-- Add category column
ALTER TABLE product_cache
ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'uncategorized';

-- Create index for faster category filtering
CREATE INDEX IF NOT EXISTS idx_product_cache_category ON product_cache(category);

-- Create index for category + price filtering
CREATE INDEX IF NOT EXISTS idx_product_cache_category_price ON product_cache(category, price);

-- Update comment
COMMENT ON COLUMN product_cache.category IS 'Product category: electronics, phones, computers, toys, clothing, home-kitchen, beauty, or uncategorized';
