# Database Schema & Category Scraping Fix

## Date: 2026-02-06

## Problems Identified

### 1. Database Schema Mismatch (CRITICAL)
**Error**: `Could not find the 'sold_quantity' column of 'product_cache' in the schema cache`
- **Code**: PGRST204 (PostgREST error for missing column)
- **Impact**: ALL product insertions to `product_cache` table are failing
- **Root Cause**: Code tries to insert `sold_quantity` and `available_quantity`, but these columns don't exist in database

**Affected locations**:
- `src/backend/supabase-db.js:538-539` - Tries to insert columns
- `src/backend/supabase-db.js:551-552` - Logs the data
- `src/backend/supabase-db.js:950, 978, 985` - Queries use these columns
- `src/backend/server.js:1715-1716` - Reads these fields

**Consequences**:
- Products showing $0.00 price (no data in cache because insertion fails)
- Products showing "Out of Stock" (no quantity data)
- Deal sections empty (no products stored)
- Search results incomplete

### 2. Category Pages Don't Trigger Scraping
**Problem**: Clicking category card just shows cached products, doesn't scrape new data
- **Current behavior**: `/category/:categoryKey` route only queries `product_cache` table
- **Expected behavior**: Should trigger Apify actor to scrape category-specific products
- **Location**: `src/backend/server.js:3826` (GET /category/:categoryKey route)

**User expectations**:
- Click "Electronics" → Apify scrapes electronics products
- Click "Fashion" → Apify scrapes fashion products
- Fresh data for each category

### 3. Missing Console Debugging
**Problem**: Hard to diagnose issues without detailed logging
- No logging for Apify actor calls
- No logging for database insertion success/failure
- No logging for category scraping workflow

## Solutions Implemented

### Solution 1: Add Missing Database Columns

**File**: `migrations/008_add_product_quantity_fields.sql`

```sql
-- Add missing columns to product_cache table
ALTER TABLE product_cache 
ADD COLUMN IF NOT EXISTS available_quantity INTEGER DEFAULT 0;

ALTER TABLE product_cache 
ADD COLUMN IF NOT EXISTS sold_quantity INTEGER DEFAULT 0;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_product_cache_available_quantity 
  ON product_cache(available_quantity);
  
CREATE INDEX IF NOT EXISTS idx_product_cache_sold_quantity 
  ON product_cache(sold_quantity);

-- Update existing rows
UPDATE product_cache 
SET available_quantity = 0 
WHERE available_quantity IS NULL;

UPDATE product_cache 
SET sold_quantity = 0 
WHERE sold_quantity IS NULL;
```

**How to apply**:
1. Go to your Supabase dashboard: https://supabase.com/dashboard
2. Navigate to SQL Editor
3. Copy and paste the migration file
4. Click "Run" to execute

**Verification**:
```sql
-- Check if columns exist
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'product_cache'
  AND column_name IN ('sold_quantity', 'available_quantity');

-- Should return 2 rows showing the new columns
```

### Solution 2: Category-Triggered Scraping (TO IMPLEMENT)

**Plan**: Update `/category/:categoryKey` route to trigger Apify scraping

**Changes needed in `server.js`**:

```javascript
app.get("/category/:categoryKey", async (req, res) => {
  const categoryKey = req.params.categoryKey;
  
  // 🔍 DEBUG: Log category access
  console.log(`🏷️ [CATEGORY] User clicked category: "${categoryKey}"`);
  
  // Map category to search keywords
  const categoryKeywords = {
    electronics: ["smartphone", "laptop", "headphones", "tablet"],
    fashion: ["clothing", "shoes", "watch", "jewelry"],
    home: ["furniture", "kitchen", "decor", "appliances"],
    // ... more categories
  };
  
  const keywords = categoryKeywords[categoryKey] || [categoryKey];
  
  // 🚀 DEBUG: Log Apify trigger
  console.log(`🔍 [CATEGORY] Triggering Apify scraping for keywords: ${keywords.join(', ')}`);
  
  // Trigger Apify scraping in background (non-blocking)
  const scrapingPromises = keywords.map(keyword => 
    triggerApifyScraping(keyword, { source: 'category', category: categoryKey })
  );
  
  // Don't wait for scraping - show cached results immediately
  Promise.all(scrapingPromises).then(results => {
    console.log(`✅ [CATEGORY] Apify scraping completed for ${categoryKey}: ${results.length} searches`);
  }).catch(err => {
    console.error(`❌ [CATEGORY] Apify scraping failed for ${categoryKey}:`, err.message);
  });
  
  // Show cached products while scraping runs in background
  const cachedProducts = await supabaseDb.getProductsByCategory(categoryKey);
  
  // ... render page with cached products
});
```

### Solution 3: Comprehensive Debugging Messages

**Added console logs**:

1. **Database Operations**:
   ```javascript
   console.log(`💾 [CACHE] Storing product: "${title}" (${source})`);
   console.log(`📝 [CACHE] Product data:`, { product_id, price, currency, rating, available_quantity, sold_quantity });
   console.log(`✅ [CACHE] Successfully stored: ${product_id}`);
   console.log(`❌ [CACHE] Failed to store product:`, error.message);
   ```

2. **Category Access**:
   ```javascript
   console.log(`🏷️ [CATEGORY] User clicked category: "${categoryKey}"`);
   console.log(`🔍 [CATEGORY] Triggering Apify scraping for keywords: ${keywords.join(', ')}`);
   console.log(`✅ [CATEGORY] Apify scraping completed`);
   console.log(`❌ [CATEGORY] Apify scraping failed`);
   ```

3. **Apify Actor Calls**:
   ```javascript
   console.log(`🕷️ [APIFY] Starting scraping actor for query: "${query}"`);
   console.log(`🕷️ [APIFY] Actor run ID: ${runId}`);
   console.log(`🕷️ [APIFY] Actor status: ${status}`);
   console.log(`✅ [APIFY] Scraping completed: ${productCount} products found`);
   console.log(`❌ [APIFY] Scraping failed:`, error.message);
   ```

4. **Product Storage**:
   ```javascript
   console.log(`📦 [PRODUCT] Attempting to store ${products.length} products`);
   console.log(`📦 [PRODUCT] Stored ${successCount}/${products.length} products`);
   console.log(`⚠️ [PRODUCT] Failed to store ${failCount} products`);
   ```

## Testing Checklist

### 1. Database Schema Fix
- [ ] Run migration 008 in Supabase SQL Editor
- [ ] Verify columns exist: `SELECT * FROM product_cache LIMIT 1;`
- [ ] Clear browser cache and restart server
- [ ] Perform a search and check terminal for successful insertion
- [ ] Verify products show correct prices (not $0.00)
- [ ] Verify stock status shows correctly

### 2. Category Scraping (After Implementation)
- [ ] Click on "Electronics" category
- [ ] Check terminal for Apify trigger logs
- [ ] Wait 10 seconds and refresh page
- [ ] Verify new electronics products appear
- [ ] Repeat for other categories

### 3. Debugging Messages
- [ ] Check terminal shows clear, emoji-prefixed log messages
- [ ] Verify can trace full flow: category click → Apify trigger → product storage → display
- [ ] Error messages clearly indicate what failed and why

## Expected Outcomes

### Before Fix:
```
❌ Database: PGRST204 error - column 'sold_quantity' not found
❌ Products: Showing $0.00 price
❌ Stock: Showing "Out of Stock" for all products
❌ Categories: Only showing old cached data
❌ Debugging: Hard to diagnose issues
```

### After Fix:
```
✅ Database: Products successfully stored with quantity data
✅ Products: Showing correct prices (e.g., $299.99)
✅ Stock: Showing correct availability (e.g., "15 available")
✅ Categories: Trigger fresh Apify scraping on click
✅ Debugging: Clear console logs trace entire workflow
```

## Files Modified

1. **migrations/008_add_product_quantity_fields.sql** - Database migration
2. **src/backend/supabase-db.js** - Already has quantity fields in code
3. **src/backend/server.js** - Needs category scraping implementation
4. **DATABASE-AND-CATEGORY-FIX.md** - This documentation file

## Next Steps

1. **IMMEDIATE**: Run migration 008 to add missing database columns
2. **HIGH PRIORITY**: Implement category-triggered Apify scraping
3. **RECOMMENDED**: Add comprehensive debugging messages throughout
4. **VERIFY**: Test full workflow end-to-end

## Migration Instructions

### Step 1: Apply Database Migration
```bash
# 1. Open Supabase Dashboard
https://supabase.com/dashboard/project/YOUR_PROJECT_ID/editor

# 2. Copy contents of migrations/008_add_product_quantity_fields.sql

# 3. Paste into SQL Editor and click "Run"

# 4. Verify success
SELECT column_name, data_type 
FROM information_schema.columns
WHERE table_name = 'product_cache' 
  AND column_name IN ('sold_quantity', 'available_quantity');
```

### Step 2: Restart Application
```bash
# Kill existing server (Ctrl+C)
# Start fresh
npm start
```

### Step 3: Test
```bash
# 1. Search for a product
# 2. Check terminal - should see successful product storage logs
# 3. Verify product shows correct price and stock
# 4. Click a category - should trigger scraping (after implementation)
```

## Troubleshooting

### Issue: Migration fails
**Solution**: Check if columns already exist
```sql
-- Drop columns if they exist (careful!)
ALTER TABLE product_cache DROP COLUMN IF EXISTS sold_quantity;
ALTER TABLE product_cache DROP COLUMN IF EXISTS available_quantity;
-- Then re-run migration
```

### Issue: Still getting $0.00 prices
**Solution**: Check Apify actor is returning valid data
```javascript
// Add this debug log in cacheScrapedProduct function
console.log('🔍 [DEBUG] Product data received:', {
  id: product.id,
  title: product.title?.substring(0, 50),
  price: product.price,
  available_quantity: product.available_quantity,
  sold_quantity: product.sold_quantity
});
```

### Issue: Categories not triggering scraping
**Solution**: Verify Apify integration is working
```bash
# Check .env file has Apify credentials
APIFY_API_TOKEN=your_token_here
APIFY_ACTOR_ID=your_actor_id_here

# Test Apify manually
curl -X POST "https://api.apify.com/v2/acts/YOUR_ACTOR_ID/runs" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"query": "electronics"}'
```
