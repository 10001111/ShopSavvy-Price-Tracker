# Search Not Loading Products - Quick Fix

## 🔴 Problem

You're seeing:
- "Discovering new products... Refresh in 30 seconds for results"
- Spinner showing "Searching for products..."
- But NO products appear, even after refreshing

## ✅ Solution

### **Step 1: Apply Migration 007** (REQUIRED)

The `product_cache` table doesn't exist yet. You MUST create it:

1. Go to **Supabase Dashboard** → **SQL Editor**
2. Click **New Query**
3. Copy and paste this SQL:

```sql
-- Migration 007: Create product_cache table
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
CREATE INDEX IF NOT EXISTS idx_product_cache_title ON public.product_cache USING GIN(to_tsvector('spanish', product_title));

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
```

4. Click **Run**
5. You should see: "Success. No rows returned"

### **Step 2: Restart Your Server**

```bash
# Stop the server (Ctrl+C)
# Start it again
npm start
```

Check the console for:
```
✅ [Supabase] All required columns present
```

If you see:
```
⚠️ Migration 007 (product_cache table) may not be applied - REQUIRED FOR SEARCH
```

Then the migration didn't apply correctly. Go back to Step 1.

### **Step 3: Seed Initial Data** (Optional but Recommended)

Run the seed endpoint to populate some products:

```bash
curl -X POST http://localhost:3000/api/admin/seed-cache \
  -H "Content-Type: application/json" \
  -d '{"maxProducts": 50}'
```

Or visit in your browser (while logged in as admin):
```
http://localhost:3000/api/admin/seed-cache
```

This will scrape popular searches and cache results.

### **Step 4: Test**

1. Refresh your homepage
2. Should see "Featured Deals" with products
3. Search for "tv" → Should either:
   - Show cached results instantly (if seed ran)
   - Show "discovering" message, then products after 30-60 seconds

---

## 🔍 What Was Fixed

### Issue 1: Missing `product_cache` Table
- **Problem**: Migration 007 not applied
- **Fix**: Apply the migration above

### Issue 2: Homepage Showing "Discovering" Forever
- **Problem**: Homepage was using async scraping (returns empty, scrapes in background)
- **Fix**: Homepage now uses `forceSynchronous: true` to always scrape and show products

### Issue 3: Poor Error Handling
- **Problem**: If scrape failed, no error message shown
- **Fix**: Added try-catch with proper error messages

---

## 🧪 Verification Steps

After applying the fix:

**Test 1: Check Table Exists**
```sql
SELECT COUNT(*) FROM product_cache;
-- Should return 0 (or > 0 if seeded)
```

**Test 2: Check Server Logs**
```
[Supabase] ✅ All required columns present
[Home] No cached results for "ofertas" — scraping synchronously (featured products)
[fetchAllProducts] After sync scrape, found 12 products
```

**Test 3: Check Homepage**
- Should show "Featured Deals" section
- Should have products displayed
- NO "discovering" message on homepage

**Test 4: Check Search**
```
1. Search for "tv"
2. If cache EMPTY: Shows "discovering" → Refresh after 30s → Shows products
3. If cache HAS products: Shows instantly
```

---

## 🐛 Troubleshooting

### Still seeing "discovering" on homepage?

**Check server logs** for:
```
[fetchAllProducts] Sync scrape failed: <error message>
```

Common errors:

1. **"Apify_Token not set"**
   ```bash
   # Add to .env
   Apify_Token=your_token_here
   ```

2. **"product_cache does not exist"**
   - Migration 007 not applied
   - Go back to Step 1

3. **"No products found"**
   - Apify scrape returned 0 results
   - Try different search term
   - Check Apify Actor logs

### Products still not appearing after refresh?

1. **Check if scrape completed**:
   ```sql
   SELECT product_title, scraped_at 
   FROM product_cache 
   ORDER BY scraped_at DESC 
   LIMIT 10;
   ```

2. **If empty table**: Scrape failed or didn't run
   - Check server logs
   - Check Apify dashboard for run history

3. **If table has products**: Cache lookup issue
   - Check search query matches cached titles
   - Try fuzzy search (should work automatically)

### Search returns empty but cache has products?

```sql
-- Check what's in cache
SELECT product_title, source, scraped_at 
FROM product_cache 
LIMIT 20;
```

If you see products but search doesn't find them:
- Check search query spelling
- Fuzzy search should catch similar terms
- Try exact product title from cache

---

## 📊 Expected Behavior After Fix

### Homepage (No Search):
```
Load page → Scrapes "ofertas" (1-2 min first time) → Shows products ✅
Next visit → Instant (cached) ✅
```

### Search Page (User searches "tv"):
```
First search → Shows "discovering" (instant) → Background scrape (30-60s) → Refresh → Shows products ✅
Second search → Instant (cached) ✅
```

### Search with Fuzzy Match:
```
Search "samsung tv" → No exact match → Fuzzy finds "tv" cache → Instant ✅
```

---

## 🎯 Summary

**You need to**:
1. ✅ Apply Migration 007 (create `product_cache` table)
2. ✅ Restart server
3. ✅ (Optional) Seed initial data
4. ✅ Test homepage and search

**After this**:
- Homepage will always show products
- Search will show discovering state, then products after scrape
- Subsequent searches will be instant (cached)

---

## 📝 Files Changed (Already Done)

1. ✅ `src/backend/server.js`
   - Added `forceSynchronous` flag
   - Homepage uses sync scraping
   - Better error handling

2. ✅ `src/backend/supabase-db.js`
   - Added Migration 007 verification
   - Fuzzy search support

3. ⚠️ **YOU NEED TO RUN** Migration 007 in Supabase

---

## ✅ Quick Checklist

- [ ] Applied Migration 007 in Supabase SQL Editor
- [ ] Restarted server
- [ ] Checked server logs (no migration warnings)
- [ ] Homepage shows "Featured Deals" with products
- [ ] Search works (shows discovering, then products after refresh)
- [ ] (Optional) Ran seed endpoint to populate cache

**Once all checked, your search will work perfectly!** 🚀
