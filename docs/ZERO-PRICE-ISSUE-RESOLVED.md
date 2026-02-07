# Zero-Price Issue - Root Cause & Resolution

## Problem
Products displaying "USD 0.00" on homepage deal sections (Highlighted Deals, Popular Products, Top Price Drops).

## Root Cause Analysis

### Investigation Steps
1. Added comprehensive debug logging to trace data flow
2. Created cleanup script to delete zero-price products
3. Checked for duplicate database tables using Supabase CLI
4. Analyzed terminal output from scraping operations

### Discovered Issues

#### 1. Duplicate/Unused Tables in Supabase
Found **5 product-related tables**, but only 1 is actively used:
- ✅ `product_cache` (76 rows) - **ACTIVE TABLE**
- ❌ `products` (empty) - UNUSED
- ❌ `cached_products` (empty) - UNUSED
- ❌ `product_data` (empty) - UNUSED
- ❌ `product_categories` (empty) - UNUSED
- ❌ `user_tracked_products` (empty) - UNUSED

**Action Taken:** Documented for manual deletion via Supabase dashboard

#### 2. Products Being Scraped with Zero Prices
Apify scraper returns `price: 0` for certain Amazon products where price isn't displayed without selecting options:
- Clothing items (sizes/colors)
- Jewelry items
- Products with variants

**Examples:**
```
AMZN-B01L8JJY5I - Hanes EcoSmart Hoodie (price: 0)
AMZN-B07JBS59X1 - Gildan Men's Crew T-Shirts (price: 0)
AMZN-B0DNJZKGFT - Women Synthetic Diamond Earrings (price: 0)
```

### Why Cleanup Didn't Work
1. Deleted 190 zero-price products from database ✅
2. Server restarted and scraped new products
3. Zero-price products were **re-inserted** from Apify ❌
4. Problem persisted because root cause wasn't addressed

## Solution Implemented

### Filter Zero-Price Products Before Storage
**File:** `src/backend/server.js` (lines 8967-8979)

```javascript
// Filter out products with zero or invalid prices BEFORE storing
const validProducts = products.filter(p => {
  const price = parseFloat(p.price);
  if (!price || price <= 0 || isNaN(price)) {
    console.log(`⏭️  [SCRAPE] Skipping product with zero/invalid price: ${p.id} - "${p.title?.substring(0, 50)}..." (price: ${p.price})`);
    return false;
  }
  return true;
});

console.log(`📦 [SCRAPE] Filtered ${products.length} products → ${validProducts.length} valid products (skipped ${products.length - validProducts.length} zero-price items)`);
```

### Database Cleanup
Deleted 4 remaining zero-price products:
```
✅ Successfully deleted 4 products with zero/null prices
```

### Verification
After cleanup, 72 valid products remain with proper prices:
```
Apple iPhone 16 Pro Max - USD 807.50
Samsung Galaxy S25 FE - USD 649.90
Apple iPhone 15 Pro Max - USD 577.18
```

## Impact

### Before Fix
- Products displayed as "USD 0.00"
- Homepage deal sections showed invalid prices
- Database contained 190+ zero-price entries
- Zero-price products kept getting re-inserted

### After Fix
- ✅ Zero-price products filtered at scraping stage
- ✅ Only valid products stored in database
- ✅ Homepage displays correct prices
- ✅ No more re-insertion of zero-price items

## Technical Details

### Data Flow
```
Apify Scraper
    ↓
Filter (NEW) → Reject price ≤ 0
    ↓
cacheScrapedProduct()
    ↓
product_cache table
    ↓
getHighlightedDeals() / getPopularProducts()
    ↓
Homepage Rendering
```

### Redis Not Involved
Redis is only used for:
- Caching Apify API responses (scrape results)
- Caching price history queries

It does NOT affect product_cache table or homepage data.

## Files Modified

1. **src/backend/server.js** (line 8967)
   - Added filter to reject products with price ≤ 0 before storage

2. **check-duplicate-tables.js** (NEW)
   - Script to check for duplicate/conflicting tables

3. **fix-database-issues.js** (NEW)
   - Script to clean zero-price products and verify data integrity

## Next Steps (Optional)

1. **Drop unused tables** via Supabase dashboard:
   ```sql
   DROP TABLE IF EXISTS products, cached_products, product_data, 
                        user_tracked_products, product_categories;
   ```

2. **Monitor scraping logs** for filtered products:
   ```
   ⏭️  [SCRAPE] Skipping product with zero/invalid price: ...
   ```

## Lessons Learned

1. ❌ **Don't clean data after insertion** → Filter at source
2. ✅ **Validate data before storage** → Prevents bad data entry
3. ✅ **Check for duplicate tables** → Can cause conflicts
4. ✅ **Add comprehensive logging** → Helps identify root cause
5. ✅ **Test scraping flow end-to-end** → Verify fixes work

---

**Issue Status:** ✅ **RESOLVED**  
**Date:** 2026-02-06  
**Author:** Claude (ShopSavvy Price Tracker Team)
