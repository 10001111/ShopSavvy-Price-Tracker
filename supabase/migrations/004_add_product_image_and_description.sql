-- =============================================
-- Migration 004: Add image_url and description to tracked_products
-- Also add images (JSON array of all scraped image URLs) and seller
-- Run this in Supabase SQL Editor
-- =============================================

ALTER TABLE public.tracked_products
  ADD COLUMN IF NOT EXISTS thumbnail TEXT,
  ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS seller TEXT,
  ADD COLUMN IF NOT EXISTS rating NUMERIC(3,1),
  ADD COLUMN IF NOT EXISTS condition TEXT DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'MXN',
  ADD COLUMN IF NOT EXISTS scraped_at TIMESTAMPTZ;

-- Index on source for filtering by store
CREATE INDEX IF NOT EXISTS idx_tracked_products_source ON public.tracked_products(source);

-- Index on scraped_at for finding stale products
CREATE INDEX IF NOT EXISTS idx_tracked_products_scraped_at ON public.tracked_products(scraped_at);
