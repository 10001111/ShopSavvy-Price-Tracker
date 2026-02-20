# Hashtag System - Quick Setup Guide

## Current Status ✅
The code is ready and deployed with **automatic fallback**:
- ✅ Code changes deployed
- ✅ Fallback to title search if hashtags not ready
- ✅ Categories work immediately (using old search method)
- ⏳ Database migrations needed for full hashtag filtering

## Why Categories Still Work Now
The system automatically falls back to title search when:
1. The `hashtags` column doesn't exist yet, OR
2. Products don't have hashtags populated yet

**You'll see this in server logs:**
```
[Hashtag Filter] No products with #phone tag, trying title search as fallback...
[Hashtag Filter] Fallback found 15 products via title search
⚠️ REMINDER: Run migrations 012 & 013 to enable proper hashtag filtering!
```

## How to Enable Full Hashtag Filtering

### Step 1: Run Database Migrations

Go to **Supabase Dashboard** → **SQL Editor** → **New Query**

#### Migration 1: Add hashtags column
```sql
-- Copy from: supabase/migrations/012_add_hashtags_column.sql
-- Or paste directly:

ALTER TABLE public.product_cache 
ADD COLUMN IF NOT EXISTS hashtags TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_product_cache_hashtags 
ON public.product_cache USING GIN (hashtags);

SELECT 'Migration 012: hashtags column created!' AS status;
```

Click **RUN** ▶️

#### Migration 2: Generate hashtags for existing products
```sql
-- Copy from: supabase/migrations/013_backfill_hashtags.sql
-- This script is longer, copy the entire file and paste it

-- It will:
-- 1. Create a function to generate hashtags
-- 2. Update all existing products
-- 3. Show statistics
-- 4. Clean up
```

Click **RUN** ▶️

### Step 2: Verify It Worked

Check if products now have hashtags:
```sql
SELECT product_title, hashtags, source
FROM product_cache
WHERE hashtags IS NOT NULL AND hashtags != '{}'
LIMIT 10;
```

You should see products with tags like:
```
product_title: "iPhone 15 Pro Max"
hashtags: {phone,electronics}
```

### Step 3: Test Categories

1. Restart your server (if running locally)
2. Go to homepage
3. Click "Phones" category
4. Server logs should now show:
   ```
   [Hashtag Filter] Getting products with hashtag: #phone
   [Hashtag Filter] Found 25 products with #phone
   ```
   (No more "fallback" messages!)

## What Happens After Migration

### Before (Fallback Mode)
- ❌ "iPhone charger" shows in Phones category (wrong!)
- ❌ "Gaming headset" shows in Computers category (wrong!)
- ⚠️ Uses title search (slower, less accurate)

### After (Hashtag Mode)
- ✅ "iPhone charger" → NO #phone tag → doesn't show in Phones
- ✅ "Gaming headset" → #gaming + #electronics → shows correctly
- ✅ Fast PostgreSQL array queries with GIN index
- ✅ Accurate filtering with exclusion rules

## Troubleshooting

### "Column 'hashtags' does not exist"
→ Run Migration 012 first

### "Products still showing in wrong categories"
→ Run Migration 013 to backfill hashtags for existing products

### "No products show in any category"
→ Check if migration 013 completed successfully:
```sql
SELECT COUNT(*) as total_products,
       COUNT(*) FILTER (WHERE array_length(hashtags, 1) > 0) as tagged_products
FROM product_cache;
```

### "New scraped products don't have hashtags"
→ Restart the server after running migrations (code auto-generates hashtags for new products)

## Summary

**Right Now**: Categories work via fallback (title search)  
**After Migrations**: Categories use fast, accurate hashtag filtering  

No rush - the system works either way! Run migrations when ready to get the benefits of precise filtering.
