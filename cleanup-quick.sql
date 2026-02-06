-- =============================================
-- QUICK CLEANUP: Remove All Tracked Products
-- Run this in Supabase SQL Editor
-- =============================================

-- 🔍 STEP 1: See what you have
SELECT
  u.email,
  COUNT(tp.id) as tracked_products,
  COUNT(DISTINCT tp.source) as sources
FROM public.users u
LEFT JOIN public.tracked_products tp ON tp.user_id = u.id
GROUP BY u.email
ORDER BY tracked_products DESC;

-- ⚠️ STEP 2: Choose your cleanup action (uncomment ONE):

-- Option 1: Delete auto-tracked products (user_id = 1) - RECOMMENDED
-- DELETE FROM public.tracked_products WHERE user_id = 1;

-- Option 2: Delete for demo account only
-- DELETE FROM public.tracked_products
-- WHERE user_id = (SELECT id FROM public.users WHERE email = 'demo@ofertaradar.com');

-- Option 3: Delete ALL tracked products (⚠️ Nuclear option)
-- DELETE FROM public.tracked_products;

-- ✅ STEP 3: Verify cleanup
SELECT
  'Remaining tracked products: ' || COUNT(*) as result
FROM public.tracked_products;
