-- =============================================
-- CLEANUP SCRIPT: Remove All Tracked Products
-- This script provides safe, step-by-step cleanup for tracked products
-- Run this in Supabase SQL Editor
-- =============================================

-- =============================================
-- STEP 1: ANALYZE - See what we're dealing with
-- =============================================

-- Total tracked products in database
SELECT
  '📊 TOTAL TRACKED PRODUCTS' as info,
  COUNT(*) as total_count
FROM public.tracked_products;

-- Breakdown by user
SELECT
  '👥 TRACKED PRODUCTS BY USER' as info,
  u.id as user_id,
  u.email,
  COUNT(tp.id) as tracked_count,
  MIN(tp.created_at) as oldest_tracked,
  MAX(tp.created_at) as newest_tracked
FROM public.users u
LEFT JOIN public.tracked_products tp ON tp.user_id = u.id
GROUP BY u.id, u.email
ORDER BY tracked_count DESC;

-- Breakdown by source (Amazon vs Mercado Libre)
SELECT
  '🏪 TRACKED PRODUCTS BY SOURCE' as info,
  source,
  COUNT(*) as count
FROM public.tracked_products
GROUP BY source
ORDER BY count DESC;

-- Check for orphaned price history (will be deleted when tracked_products are deleted)
SELECT
  '💾 RELATED PRICE HISTORY RECORDS' as info,
  COUNT(*) as price_history_count
FROM public.price_history;

-- =============================================
-- STEP 2: BACKUP (Optional but recommended)
-- =============================================

-- Create a backup of tracked_products before deletion
-- Uncomment if you want to keep a backup:

-- CREATE TABLE IF NOT EXISTS public.tracked_products_backup AS
-- SELECT * FROM public.tracked_products;

-- =============================================
-- STEP 3: CLEANUP OPTIONS
-- Choose ONE of the following options
-- =============================================

-- ---------------------------------------------
-- OPTION A: Delete ONLY auto-tracked products (user_id = 1)
-- This is the safest option - only removes the bug-caused entries
-- ---------------------------------------------
/*
DELETE FROM public.tracked_products
WHERE user_id = 1;

SELECT '✅ Deleted auto-tracked products only (user_id = 1)' as status;
*/

-- ---------------------------------------------
-- OPTION B: Delete tracked products for SPECIFIC demo accounts
-- Useful if you want to clean up test accounts only
-- ---------------------------------------------
/*
DELETE FROM public.tracked_products
WHERE user_id IN (
  SELECT id FROM public.users
  WHERE email IN ('demo@ofertaradar.com', 'test@example.com')
);

SELECT '✅ Deleted tracked products for demo accounts' as status;
*/

-- ---------------------------------------------
-- OPTION C: Delete tracked products for a SINGLE specific user
-- Replace 'user@example.com' with the actual email
-- ---------------------------------------------
/*
DELETE FROM public.tracked_products
WHERE user_id = (
  SELECT id FROM public.users
  WHERE email = 'demo@ofertaradar.com'
  LIMIT 1
);

SELECT '✅ Deleted tracked products for specified user' as status;
*/

-- ---------------------------------------------
-- OPTION D: Delete ALL tracked products from ALL users
-- ⚠️ WARNING: This removes EVERYTHING. Use with caution!
-- ---------------------------------------------
/*
DELETE FROM public.tracked_products;

SELECT '✅ Deleted ALL tracked products from ALL users' as status;
*/

-- ---------------------------------------------
-- OPTION E: Delete tracked products older than X days
-- Useful for cleaning up old/stale tracking data
-- ---------------------------------------------
/*
DELETE FROM public.tracked_products
WHERE created_at < NOW() - INTERVAL '90 days';

SELECT '✅ Deleted tracked products older than 90 days' as status;
*/

-- =============================================
-- STEP 4: VERIFY CLEANUP
-- Run this after choosing an option above
-- =============================================

-- Check remaining tracked products
SELECT
  '📊 REMAINING TRACKED PRODUCTS' as info,
  COUNT(*) as total_remaining
FROM public.tracked_products;

-- Remaining products by user
SELECT
  '👥 REMAINING BY USER' as info,
  u.email,
  COUNT(tp.id) as tracked_count
FROM public.users u
LEFT JOIN public.tracked_products tp ON tp.user_id = u.id
GROUP BY u.email
ORDER BY tracked_count DESC;

-- Check price history (should be auto-cleaned by CASCADE)
SELECT
  '💾 REMAINING PRICE HISTORY' as info,
  COUNT(*) as count
FROM public.price_history;

-- =============================================
-- STEP 5: VACUUM (Optional - reclaim disk space)
-- =============================================

-- Uncomment to reclaim disk space after large deletions:
-- VACUUM ANALYZE public.tracked_products;
-- VACUUM ANALYZE public.price_history;

-- =============================================
-- QUICK REFERENCE: Common Cleanup Commands
-- =============================================

-- Delete auto-tracked only (RECOMMENDED):
-- DELETE FROM public.tracked_products WHERE user_id = 1;

-- Delete for demo account:
-- DELETE FROM public.tracked_products WHERE user_id = (SELECT id FROM public.users WHERE email = 'demo@ofertaradar.com');

-- Delete everything:
-- DELETE FROM public.tracked_products;

-- =============================================
-- 🎯 RECOMMENDED CLEANUP SEQUENCE
-- =============================================
/*
Step 1: Run STEP 1 (ANALYZE) to see what you have
Step 2: Choose and uncomment ONE option from STEP 3
Step 3: Run STEP 4 (VERIFY) to confirm cleanup
Step 4: Celebrate! 🎉
*/
