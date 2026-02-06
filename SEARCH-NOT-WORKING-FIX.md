# Search/Scraping Not Working - Issue & Fix

## Problem

When searching for products (e.g., "tv"), you're seeing:

1. **Error in console**: `supabaseDb.upsertScrapedProduct is not a function`
2. **"Product not found"** page after search completes

## Root Causes

### Issue 1: Using Deleted Function ✅ FIXED

**Problem**: The scrape endpoint (`/api/scrape`) was calling `upsertScrapedProduct()`, but this function was deleted earlier to fix the auto-tracking bug.

**Fix Applied**: Changed line 6178 in `server.js`:
```javascript
// OLD (broken):
const row = await supabaseDb.upsertScrapedProduct(product);

// NEW (fixed):
const row = await supabaseDb.cacheScrapedProduct(product);
```

### Issue 2: Missing Migration 007 ⚠️ ACTION REQUIRED

**Problem**: The `product_cache` table doesn't exist in your Supabase database yet. This table is essential for storing and retrieving search results.

**Status**: Migration file exists at `supabase/migrations/007_create_product_cache.sql`, but hasn't been applied to your database yet.

## How to Fix

### Step 1: Apply Migration 007 to Supabase

You need to run the migration to create the `product_cache` table:

**Option A - Using Supabase Dashboard (Recommended)**:
1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Click **New Query**
4. Copy and paste the contents of `supabase/migrations/007_create_product_cache.sql`
5. Click **Run**

**Option B - Using Supabase CLI**:
```bash
supabase db push
```

### Step 2: Verify Migration Applied

After applying the migration, restart your server. You should see in the console:

✅ **Success**:
```
[Supabase] ✅ All required columns present
```

❌ **Still missing**:
```
[Supabase] ⚠️ Some migrations may not be applied:
  - Migration 007 (product_cache table) may not be applied - REQUIRED FOR SEARCH
```

### Step 3: Test Search

1. Search for a product (e.g., "tv")
2. Click the **"Discover New Products"** button (this triggers Apify scrape)
3. Wait for scraping to complete
4. Results should now appear

## How It Works Now

### Search Flow:

1. **User searches** for "tv"
2. **System checks** `product_cache` table for existing results
3. **If cache HIT** (results found):
   - Show cached results immediately
   - Refresh cache in background for next time
4. **If cache MISS** (no results):
   - Run Apify scrape synchronously
   - Store results in `product_cache` table
   - Display fresh results

### Data Storage:

- **product_cache**: Shared search results (temporary, 30-min cache)
  - All users see the same scraped results for "tv"
  - Automatically refreshed when users search
  
- **tracked_products**: Personal watchlist (permanent, per-user)
  - Only products user explicitly clicks "Track Price"
  - Used for price drop alerts

## Verification Checklist

After applying the fix, verify:

- [ ] Migration 007 applied successfully in Supabase
- [ ] Server restart shows no migration warnings
- [ ] Search for "tv" triggers scrape
- [ ] Results appear after scrape completes
- [ ] Searching again for "tv" shows cached results instantly
- [ ] No errors in browser console
- [ ] No errors in server logs

## Common Issues

### "Product not found" after search

**Cause**: Migration 007 not applied yet
**Fix**: Apply migration as described in Step 1 above

### "supabaseDb.upsertScrapedProduct is not a function"

**Cause**: Code was calling deleted function
**Fix**: Already fixed in this commit - function changed to `cacheScrapedProduct()`

### Scrape works but products don't persist

**Cause**: `product_cache` table doesn't exist
**Fix**: Apply Migration 007

### Search is slow

**Cause**: Cache miss - scraping synchronously
**Expected**: First search for a term is slow (scraping). Subsequent searches should be instant (cached).

## Files Modified

1. ✅ `src/backend/server.js` (line 6178) - Changed to use `cacheScrapedProduct()`
2. ✅ `src/backend/supabase-db.js` (lines 229-243) - Added Migration 007 verification check
3. ⚠️ `supabase/migrations/007_create_product_cache.sql` - **YOU NEED TO RUN THIS**

## Next Steps

1. **Apply Migration 007** to your Supabase database
2. **Restart your server**
3. **Test searching** for products
4. If still having issues, check server logs for the specific error message
