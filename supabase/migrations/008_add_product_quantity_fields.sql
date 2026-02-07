-- Migration 008: Add quantity fields to product_cache table
-- This fixes the PGRST204 error where sold_quantity and available_quantity columns don't exist

-- Add available_quantity column (stock count)
ALTER TABLE product_cache
ADD COLUMN IF NOT EXISTS available_quantity INTEGER DEFAULT 0;

-- Add sold_quantity column (number of units sold)
ALTER TABLE product_cache
ADD COLUMN IF NOT EXISTS sold_quantity INTEGER DEFAULT 0;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_product_cache_available_quantity ON product_cache(available_quantity);
CREATE INDEX IF NOT EXISTS idx_product_cache_sold_quantity ON product_cache(sold_quantity);

-- Add comment explaining the columns
COMMENT ON COLUMN product_cache.available_quantity IS 'Number of units currently in stock';
COMMENT ON COLUMN product_cache.sold_quantity IS 'Total number of units sold (from seller data)';

-- Update existing rows to have non-null values
UPDATE product_cache
SET available_quantity = 0
WHERE available_quantity IS NULL;

UPDATE product_cache
SET sold_quantity = 0
WHERE sold_quantity IS NULL;

-- Migration complete
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/YOUR_PROJECT/editor
