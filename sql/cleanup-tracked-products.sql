-- =============================================
-- Cleanup Script: Remove Auto-Tracked Products
-- Run this in Supabase SQL Editor
-- =============================================

-- First, let's see what we have
-- Check user_id 1 (system account)
SELECT COUNT(*) as count_user_1
FROM public.tracked_products
WHERE user_id = 1;

-- Check demo account user_id
SELECT id, email
FROM public.users
WHERE email = 'demo@ofertaradar.com';

-- See how many products the demo account is tracking
SELECT u.email, COUNT(tp.id) as tracked_count
FROM public.users u
LEFT JOIN public.tracked_products tp ON tp.user_id = u.id
WHERE u.email IN ('demo@ofertaradar.com', 'test@example.com', 'admin@ofertaradar.com')
GROUP BY u.email;

-- =============================================
-- CLEANUP OPTIONS - Choose one:
-- =============================================

-- Option 1: Delete ALL tracked products for user_id = 1 (system/scraper account)
-- DELETE FROM public.tracked_products WHERE user_id = 1;

-- Option 2: Delete tracked products for specific demo account email
-- DELETE FROM public.tracked_products
-- WHERE user_id IN (
--   SELECT id FROM public.users WHERE email = 'demo@ofertaradar.com'
-- );

-- Option 3: Delete ALL tracked products from ALL demo accounts
-- DELETE FROM public.tracked_products
-- WHERE user_id IN (
--   SELECT id FROM public.users
--   WHERE email IN ('demo@ofertaradar.com', 'test@example.com', 'admin@ofertaradar.com')
-- );

-- =============================================
-- After cleanup, verify:
-- =============================================
-- SELECT COUNT(*) FROM public.tracked_products;
