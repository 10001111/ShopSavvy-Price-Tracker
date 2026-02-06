-- =============================================
-- Cleanup Script: Remove Auto-Tracked Products
-- Run this in Supabase SQL Editor AFTER applying migration 007
-- =============================================

-- STEP 1: Check current state
-- =============================================

-- Check user_id 1 (system account - used by old auto-tracking bug)
SELECT
  'Auto-tracked products (user_id = 1)' as description,
  COUNT(*) as count
FROM public.tracked_products
WHERE user_id = 1;

-- Check how many products each user is tracking
SELECT
  u.email,
  COUNT(tp.id) as tracked_count
FROM public.users u
LEFT JOIN public.tracked_products tp ON tp.user_id = u.id
GROUP BY u.email
ORDER BY tracked_count DESC;

-- =============================================
-- STEP 2: DELETE Auto-Tracked Products
-- =============================================

-- This deletes ALL products tracked by user_id = 1
-- (These are products that were auto-added during searches)
DELETE FROM public.tracked_products
WHERE user_id = 1;

-- =============================================
-- STEP 3: Verify cleanup
-- =============================================

-- Should return 0 for user_id = 1
SELECT
  'Remaining auto-tracked products' as description,
  COUNT(*) as count
FROM public.tracked_products
WHERE user_id = 1;

-- Check remaining tracked products per user
SELECT
  u.email,
  COUNT(tp.id) as tracked_count
FROM public.users u
LEFT JOIN public.tracked_products tp ON tp.user_id = u.id
GROUP BY u.email
ORDER BY tracked_count DESC;

-- Success message
SELECT '✅ Cleanup complete! Auto-tracked products removed.' AS status;
