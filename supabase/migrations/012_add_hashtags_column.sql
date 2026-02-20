-- =============================================
-- Migration 012: Add hashtags column for tag-based filtering
-- Replaces category-based filtering with hashtag system
-- =============================================

-- Add hashtags column to product_cache (array of text)
ALTER TABLE public.product_cache
ADD COLUMN IF NOT EXISTS hashtags TEXT[] DEFAULT '{}';

-- Create GIN index for fast array containment queries (@> operator)
CREATE INDEX IF NOT EXISTS idx_product_cache_hashtags
ON public.product_cache USING GIN (hashtags);

-- Success message
SELECT 'Migration 012: hashtags column and GIN index created successfully!' AS status;

-- Migration notes:
-- - hashtags is an array of lowercase strings (e.g., ['phone', 'electronics', 'laptop'])
-- - Use @> operator for filtering: WHERE hashtags @> ARRAY['phone']
-- - Use && operator for OR queries: WHERE hashtags && ARRAY['phone', 'laptop']
-- - GIN index makes array queries very fast
