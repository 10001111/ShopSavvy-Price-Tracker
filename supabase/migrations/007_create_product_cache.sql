-- =============================================
-- Migration 007: Create product_cache table
-- Separates search results from tracked products
-- =============================================

-- Create product_cache table for storing scraped product data
-- This is NOT the same as tracked_products (which requires user action)
CREATE TABLE IF NOT EXISTS public.product_cache (
  id BIGSERIAL PRIMARY KEY,
  product_id TEXT NOT NULL,
  product_title TEXT,
  product_url TEXT,
  source TEXT NOT NULL,
  current_price DECIMAL(10,2),
  thumbnail TEXT,
  images JSONB DEFAULT '[]'::jsonb,
  description TEXT,
  seller TEXT,
  rating NUMERIC(3,1),
  condition TEXT DEFAULT 'new',
  currency TEXT DEFAULT 'MXN',
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_checked TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(product_id, source)
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_product_cache_product_id ON public.product_cache(product_id);
CREATE INDEX IF NOT EXISTS idx_product_cache_source ON public.product_cache(source);
CREATE INDEX IF NOT EXISTS idx_product_cache_scraped_at ON public.product_cache(scraped_at);

-- Enable Row Level Security
ALTER TABLE public.product_cache ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Allow read access to everyone (public search results)
DROP POLICY IF EXISTS "Anyone can read product_cache" ON public.product_cache;
CREATE POLICY "Anyone can read product_cache"
  ON public.product_cache
  FOR SELECT
  USING (true);

-- RLS Policy: Service role can manage cache
DROP POLICY IF EXISTS "Service role has full access to product_cache" ON public.product_cache;
CREATE POLICY "Service role has full access to product_cache"
  ON public.product_cache
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Success message
SELECT 'Migration 007: product_cache table created successfully!' AS status;
