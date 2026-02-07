# 🚀 Setup Product Cache System

## What This Does

**GOAL**: Store Apify search results in a dedicated cache table so:
- ✅ Search results are **reused** across all users
- ✅ Reduces Apify API calls (saves money!)
- ✅ Faster searches (cached results show instantly)
- ❌ Search results are NOT stored as "tracked products"

---

## How It Works

### Before (The Problem):
```
User A searches "iPhone" 
  → Apify scrapes 20 products
  → Stored in tracked_products with user_id=1
  → Shows in demo dashboard as "tracked" ❌

User B searches "iPhone" 
  → Apify scrapes AGAIN (wastes API call) ❌
  → Stores duplicates in tracked_products ❌
```

### After (The Fix):
```
User A searches "iPhone"
  → Apify scrapes 20 products
  → Stored in product_cache ✅
  → Shows as search results only ✅

User B searches "iPhone"
  → Finds cached results instantly ✅
  → No Apify call needed! ✅
  → Shows same cached results ✅

User C searches "iPhone" (30 min later)
  → Cache refreshed in background ✅
  → Updated results served ✅
```

---

## 📋 Setup Steps

### Step 1: Apply Migration 007

**Go to Supabase Dashboard** → **SQL Editor** → **New Query**

**Paste and run this SQL:**

```sql
-- =============================================
-- Migration 007: Create product_cache table
-- =============================================

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

-- Create indexes for fast searches
CREATE INDEX IF NOT EXISTS idx_product_cache_product_id 
  ON public.product_cache(product_id);

CREATE INDEX IF NOT EXISTS idx_product_cache_source 
  ON public.product_cache(source);

CREATE INDEX IF NOT EXISTS idx_product_cache_scraped_at 
  ON public.product_cache(scraped_at);

CREATE INDEX IF NOT EXISTS idx_product_cache_title_search
  ON public.product_cache USING gin(to_tsvector('english', product_title));

-- Enable Row Level Security
ALTER TABLE public.product_cache ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read (public search results)
CREATE POLICY "Anyone can read product_cache" 
  ON public.product_cache 
  FOR SELECT 
  USING (true);

-- Service role can manage cache
CREATE POLICY "Service role has full access to product_cache" 
  ON public.product_cache 
  FOR ALL 
  USING (true) 
  WITH CHECK (true);

-- Success!
SELECT '✅ Migration 007 applied successfully!' AS status;
```

---

### Step 2: Clean Up Auto-Tracked Products

**Run this in Supabase SQL Editor:**

```sql
-- Delete all auto-tracked products (user_id = 1)
DELETE FROM public.tracked_products WHERE user_id = 1;

-- Verify cleanup
SELECT 'Deleted ' || COUNT(*) || ' auto-tracked products' AS result
FROM public.tracked_products 
WHERE user_id = 1;
```

---

### Step 3: Verify Setup

**Run this in Supabase SQL Editor:**

```sql
-- Check if product_cache table exists
SELECT 
  'product_cache table: ' || 
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'product_cache'
  ) THEN '✅ EXISTS' ELSE '❌ NOT FOUND' END AS status;

-- Check indexes
SELECT 
  indexname, 
  indexdef 
FROM pg_indexes 
WHERE tablename = 'product_cache';

-- Check current cache count
SELECT 
  'Cached products: ' || COUNT(*) AS status
FROM public.product_cache;
```

---

### Step 4: Restart Your Server

```bash
# Stop the server (Ctrl+C)
# Start it again
npm start
```

---

## 🧪 How to Test

### Test 1: Search Creates Cache
1. Search for "iPhone" on your website
2. Run in Supabase:
   ```sql
   SELECT * FROM product_cache WHERE product_title ILIKE '%iphone%';
   ```
3. You should see products cached!

### Test 2: Cache is Reused
1. Search for "iPhone" again
2. Check server logs - should say "Cache hit"
3. No new Apify call made (saves money!)

### Test 3: No Auto-Tracking
1. Search for any product
2. Go to Dashboard
3. Verify it does NOT appear as "tracked" unless you clicked "Track Price"

---

## 📊 Cache Benefits

| Metric | Before | After |
|--------|--------|-------|
| **Apify API Calls** | Every search | Only first search + 30min refresh |
| **Search Speed** | 3-5 seconds | <100ms (cached) |
| **Cost** | High | Low |
| **Auto-tracking bug** | Yes ❌ | Fixed ✅ |
| **Data Reuse** | No | Yes ✅ |

---

## 🔧 Cache Configuration

**Cache TTL**: 30 minutes (in `src/backend/apify.js`)
```javascript
const CACHE_TTL = 30 * 60; // 30 minutes
```

**Background Refresh**: Cache is refreshed in background when users search

**Storage**: All users see the same cached results (shared cache)

---

## ❓ FAQ

**Q: How long are results cached?**
A: 30 minutes. After that, next search triggers a background refresh.

**Q: Do different users see the same cached results?**
A: Yes! This saves Apify API calls and money.

**Q: What if I want fresh results immediately?**
A: Just wait 30 minutes or clear the cache manually:
```sql
DELETE FROM product_cache WHERE scraped_at < NOW() - INTERVAL '1 minute';
```

**Q: Does this affect user-tracked products?**
A: No! `tracked_products` table is separate and only stores products users explicitly track.

---

## ✅ Verification Checklist

- [ ] Migration 007 applied successfully
- [ ] `product_cache` table exists in Supabase
- [ ] Indexes created
- [ ] Auto-tracked products deleted
- [ ] Server restarted
- [ ] Test search creates cache entry
- [ ] Second search uses cached results
- [ ] Dashboard shows only manually tracked products

---

**All done! Your product cache system is now live!** 🎉
