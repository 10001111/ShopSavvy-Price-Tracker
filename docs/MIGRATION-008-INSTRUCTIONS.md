# Migration 008: Add Product Quantity Fields

## ⚠️ CRITICAL - ACTION REQUIRED

Your application is currently **FAILING** to store products in the database because of missing columns. This migration **MUST** be run immediately to fix the issue.

## Current Problem

**Error**: `PGRST204 - Could not find the 'sold_quantity' column of 'product_cache' in the schema cache`

**Impact**:
- ❌ ALL products showing $0.00 price
- ❌ ALL products showing "Out of Stock"
- ❌ Deal sections are empty
- ❌ Search results incomplete
- ❌ Category pages show no products

**Root Cause**: The code tries to insert `sold_quantity` and `available_quantity` columns, but they don't exist in your Supabase database.

## Solution: Run Migration 008

### Step 1: Access Supabase Dashboard

1. Go to: https://supabase.com/dashboard
2. Select your project
3. Click **SQL Editor** in the left sidebar

### Step 2: Run the Migration

1. Copy the SQL below
2. Paste into the SQL Editor
3. Click **Run** (or press Ctrl+Enter)

```sql
-- Migration 008: Add quantity fields to product_cache table
-- This fixes the PGRST204 error where sold_quantity and available_quantity columns don't exist

-- Add available_quantity column (stock count)
ALTER TABLE product_cache 
ADD COLUMN IF NOT EXISTS available_quantity INTEGER DEFAULT 0;

-- Add sold_quantity column (number of units sold)
ALTER TABLE product_cache 
ADD COLUMN IF NOT EXISTS sold_quantity INTEGER DEFAULT 0;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_product_cache_available_quantity ON product_cache(available_quantity);
CREATE INDEX IF NOT EXISTS idx_product_cache_sold_quantity ON product_cache(sold_quantity);

-- Add comment explaining the columns
COMMENT ON COLUMN product_cache.available_quantity IS 'Number of units currently in stock';
COMMENT ON COLUMN product_cache.sold_quantity IS 'Total number of units sold (from seller data)';

-- Update existing rows to have non-null values
UPDATE product_cache 
SET available_quantity = 0 
WHERE available_quantity IS NULL;

UPDATE product_cache 
SET sold_quantity = 0 
WHERE sold_quantity IS NULL;
```

### Step 3: Verify Migration Success

Run this verification query in the SQL Editor:

```sql
-- Check if columns were added successfully
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'product_cache'
  AND column_name IN ('sold_quantity', 'available_quantity');
```

**Expected result**: You should see 2 rows:

| column_name         | data_type | is_nullable | column_default |
|---------------------|-----------|-------------|----------------|
| available_quantity  | integer   | YES         | 0              |
| sold_quantity       | integer   | YES         | 0              |

### Step 4: Restart Your Application

```bash
# Stop the server (Ctrl+C in terminal)

# Start fresh
npm start
```

### Step 5: Test Everything

1. **Search for a product** (e.g., "laptop")
   - Check terminal - should see: `✅ [CACHE] Successfully stored product!`
   - Product should show **real price** (not $0.00)
   - Product should show **stock status** (not "Out of Stock")

2. **Click a category** (e.g., "Electronics")
   - Check terminal - should see: `🚀 [CATEGORY] Triggering Apify scraping`
   - Wait 10-15 seconds
   - Refresh page - should see **new products**

3. **Check homepage deal sections**
   - "Highlighted Deals" should show products
   - "Popular Products" should show products
   - All prices should be **> $0.00**

## Debug Console Output

After running the migration, you should see output like this:

### ✅ SUCCESS (After Migration)
```
💾 [CACHE] ========== STORING PRODUCT ==========
💾 [CACHE] Title: "Apple MacBook Pro 14-inch M3 Chip..."
💾 [CACHE] Source: amazon
💾 [CACHE] Product ID: B0CM5JV268
📝 [CACHE] Data being inserted: {
  product_id: 'B0CM5JV268',
  price: 1999.99,
  currency: 'USD',
  rating: 4.8,
  available_quantity: 15,
  sold_quantity: 243,
  images_count: 7
}
✅ [CACHE] Successfully stored product!
✅ [CACHE] Product ID: B0CM5JV268
✅ [CACHE] Price: USD 1999.99
✅ [CACHE] Stock: 15
💾 [CACHE] ==========================================
```

### ❌ FAILURE (Before Migration)
```
💾 [CACHE] ========== STORING PRODUCT ==========
💾 [CACHE] Title: "Apple MacBook Pro 14-inch M3 Chip..."
💾 [CACHE] Source: amazon
💾 [CACHE] Product ID: B0CM5JV268
📝 [CACHE] Data being inserted: {
  product_id: 'B0CM5JV268',
  price: 1999.99,
  currency: 'USD',
  rating: 4.8,
  available_quantity: 15,
  sold_quantity: 243,
  images_count: 7
}

❌ [CACHE] ========== DATABASE ERROR ==========
❌ [CACHE] Failed to store product: B0CM5JV268
❌ [CACHE] Error message: Could not find the 'sold_quantity' column of 'product_cache'
❌ [CACHE] Error code: PGRST204

💡 [CACHE] SOLUTION: Column not found in database schema
💡 [CACHE] This means the database table is missing required columns.
💡 [CACHE] ACTION REQUIRED: Run migration 008 to add missing columns:
💡 [CACHE]   1. Go to Supabase Dashboard > SQL Editor
💡 [CACHE]   2. Run: migrations/008_add_product_quantity_fields.sql
💡 [CACHE]   3. Restart the server
❌ [CACHE] ==========================================
```

## Category Scraping Debug Output

After the migration, when you click a category, you should see:

```
🏷️  [CATEGORY] ========== CATEGORY PAGE ==========
🏷️  [CATEGORY] User accessed: "electronics" (Electronics)
🏷️  [CATEGORY] Language: en
🏷️  [CATEGORY] Authenticated: Yes
🚀 [CATEGORY] Triggering Apify scraping for keywords: [smartphone, laptop, headphones, tablet, smartwatch]
⏳ [CATEGORY] Background scraping initiated (5 searches)
📦 [CATEGORY] Found 12 cached products in electronics
🏷️  [CATEGORY] ======================================

🕷️  [CATEGORY] Scraping keyword 1/5: "smartphone"

🕷️  [APIFY] ========== SCRAPING REQUEST ==========
🕷️  [APIFY] Source: all
🕷️  [APIFY] Query: "smartphone"
🕷️  [APIFY] Product URLs: none
🕷️  [APIFY] Max Results: 10
🕷️  [APIFY] Cache Key: apify:search:all:smartphone
⚠️  [APIFY] Cache miss - starting fresh scrape
🚀 [APIFY] Calling Apify Actor ID: f5pjkmpD15S3cqunX
🕷️  [APIFY] Actor run finished in 12.34s
🕷️  [APIFY] Run ID: abc123def456
🕷️  [APIFY] Status: SUCCEEDED
✅ [APIFY] Successfully scraped 10 products
📦 [APIFY] Sample product: {
  id: 'B0BDJ3N3P8',
  title: 'Apple iPhone 15 Pro Max, 256GB, Natural Titan...',
  price: 1199.99,
  source: 'amazon',
  available_quantity: 25,
  sold_quantity: 1543,
  rating: 4.7
}
💾 [APIFY] Cached 10 products (TTL: 1800s)
🕷️  [APIFY] ========================================

✅ [CATEGORY] Scraped 10 products for "smartphone"
💾 [CATEGORY] Stored 10/10 products from "smartphone"
```

## Troubleshooting

### Issue: "Column already exists"
**Solution**: The migration is idempotent (safe to run multiple times) due to `IF NOT EXISTS` clause. If columns already exist, the migration will skip adding them.

### Issue: Still getting $0.00 prices after migration
**Possible causes**:
1. Server not restarted - Stop and restart with `npm start`
2. Browser cache - Clear cache or hard refresh (Ctrl+F5)
3. Apify actor not returning data - Check Apify dashboard for failed runs

### Issue: Categories still not triggering scraping
**Check**:
1. Look for `🚀 [CATEGORY] Triggering Apify scraping` in terminal
2. Verify Apify credentials in `.env`:
   ```
   Apify_Token=your_token_here
   ```
3. Check Apify dashboard for active actor runs

### Issue: Permission denied on ALTER TABLE
**Solution**: Make sure you're using the service_role key in `.env`:
```
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

## Additional Notes

- **No data loss**: This migration only adds columns, doesn't delete anything
- **Backward compatible**: Old code will continue to work (new columns default to 0)
- **Automatic**: Existing products will be updated with `available_quantity = 0` and `sold_quantity = 0`
- **Fresh data**: New scraped products will have real stock/sold quantities

## Success Indicators

After running the migration, you should see:

✅ Products show real prices (e.g., $299.99, $1,499.00)  
✅ Products show stock status (e.g., "15 available")  
✅ Products show sold count (e.g., "243+ sold")  
✅ Deal sections populated with products  
✅ Categories trigger Apify scraping  
✅ Console shows detailed debug messages  
✅ No PGRST204 errors in terminal  

## Files Involved

- **Migration file**: `migrations/008_add_product_quantity_fields.sql`
- **Database module**: `src/backend/supabase-db.js` (already updated)
- **Server**: `src/backend/server.js` (already updated with category scraping)
- **Apify module**: `src/backend/apify.js` (already updated with debugging)

## Support

If you encounter any issues:

1. Check terminal output for error messages
2. Look for `❌` emoji indicators showing failures
3. Read the `💡 [CACHE] SOLUTION` messages for guidance
4. Verify Supabase connection with: `SELECT COUNT(*) FROM product_cache;`

---

**Last updated**: 2026-02-06  
**Migration version**: 008  
**Priority**: 🔴 CRITICAL - Run immediately
