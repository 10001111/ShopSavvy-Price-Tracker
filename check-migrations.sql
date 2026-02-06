-- =============================================
-- Migration Verification Script
-- Run this in Supabase SQL Editor to check if all migrations are applied
-- =============================================

-- Check Migration 001: Core tables exist
SELECT
  'Migration 001: Core Tables' as migration,
  CASE
    WHEN COUNT(*) = 5 THEN '✅ APPLIED'
    ELSE '❌ MISSING - Found ' || COUNT(*) || ' of 5 tables'
  END as status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('users', 'login_history', 'user_sessions', 'tracked_products', 'price_history');

-- Check Migration 002: Profile fields in users table
SELECT
  'Migration 002: Profile Fields' as migration,
  CASE
    WHEN COUNT(*) >= 2 THEN '✅ APPLIED'
    ELSE '❌ MISSING - Found ' || COUNT(*) || ' of 2+ profile columns'
  END as status
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'users'
  AND column_name IN ('username', 'profile_picture_url', 'preferences', 'timezone');

-- Check Migration 003: Data analysis functions exist
SELECT
  'Migration 003: Analysis Functions' as migration,
  CASE
    WHEN COUNT(*) >= 1 THEN '✅ APPLIED (at least ' || COUNT(*) || ' functions found)'
    ELSE '❌ MISSING - No analysis functions found'
  END as status
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name LIKE '%deal%' OR routine_name LIKE '%price%' OR routine_name LIKE '%discount%';

-- Check Migration 004: Product extended fields
SELECT
  'Migration 004: Product Images/Descriptions' as migration,
  CASE
    WHEN COUNT(*) = 7 THEN '✅ APPLIED'
    ELSE '❌ MISSING - Found ' || COUNT(*) || ' of 7 columns'
  END as status
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'tracked_products'
  AND column_name IN ('thumbnail', 'images', 'description', 'seller', 'rating', 'condition', 'currency');

-- Check Migration 005: Search history table
SELECT
  'Migration 005: Search History' as migration,
  CASE
    WHEN COUNT(*) = 1 THEN '✅ APPLIED'
    ELSE '❌ MISSING - search_history table not found'
  END as status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'search_history';

-- Check Migration 006: User roles
SELECT
  'Migration 006: User Roles' as migration,
  CASE
    WHEN COUNT(*) = 1 THEN '✅ APPLIED'
    ELSE '❌ MISSING - role column not found in users table'
  END as status
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'users'
  AND column_name = 'role';

-- Check if admin user exists with admin role
SELECT
  'Admin User Check' as migration,
  CASE
    WHEN COUNT(*) > 0 THEN '✅ ADMIN USER FOUND (' || string_agg(email, ', ') || ')'
    ELSE '⚠️  NO ADMIN USER - Run: UPDATE users SET role = ''admin'' WHERE email = ''your-email@example.com'''
  END as status
FROM public.users
WHERE role = 'admin';

-- Summary: List all columns in tracked_products
SELECT
  '--- tracked_products columns ---' as info,
  string_agg(column_name, ', ' ORDER BY ordinal_position) as columns
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'tracked_products';

-- Summary: List all columns in users
SELECT
  '--- users columns ---' as info,
  string_agg(column_name, ', ' ORDER BY ordinal_position) as columns
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'users';
