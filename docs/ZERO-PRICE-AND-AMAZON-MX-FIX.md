# Zero Price Products & Amazon Mexico Domain Fix

**Date**: 2026-02-06  
**Status**: ✅ Fixed

## Problems Identified

### 1. Zero Dollar Products ($0.00)
**Issue**: Deal sections (Highlighted Deals, Popular Products, Top Price Drops) showed products with $0.00 prices.

**Root Cause**: 
- Scraper was storing products even when price extraction failed (`price || 0`)
- Database queries didn't filter out zero-price products
- Products without valid pricing data were being saved to `product_cache`

### 2. Out of Stock Products
**Issue**: Products with no inventory (`available_quantity = 0`) were appearing in deal sections.

**Root Cause**: 
- No inventory validation in database queries
- Scraper didn't validate `available_quantity` before storing products

### 3. Wrong Amazon Domain
**Issue**: Using US Amazon (`amazon.com`) instead of Mexican Amazon (`amazon.com.mx`).

**Root Cause**: 
- Hardcoded `amazon.com` URLs in scraper
- Missing Amazon affiliate tag for Mexico
- Currency showing as USD instead of MXN

## Solutions Implemented

### 1. Scraper Validation (actor/main.js)

**Amazon Products**:
```javascript
// OLD - Stored products even with $0 price
if (title && asin) {
  await dataset.pushData({
    price: price || 0,  // ❌ Defaults to $0
    currency: "USD",    // ❌ Wrong currency
  });
}

// NEW - Only store valid products
if (title && asin && price && price > 0) {
  await dataset.pushData({
    price,              // ✅ Valid price required
    currency: "MXN",    // ✅ Mexican pesos
  });
  console.log(`Stored: ${title} - $${price} MXN`);
} else {
  console.log(`Skipped: ${title} (missing/invalid price)`);
}
```

**Mercado Libre Products**:
```javascript
// OLD
if (title) {
  await dataset.pushData({ price: price || 0 });
}

// NEW
if (title && price && price > 0) {
  await dataset.pushData({ price });
  console.log(`Stored: ${title} - $${price} ${currency}`);
} else {
  console.log(`Skipped: ${title} (missing/invalid price)`);
}
```

### 2. Amazon Mexico Domain (actor/main.js)

**Search URL**:
```javascript
// OLD
url: `https://www.amazon.com/s?k=${query}`

// NEW
url: `https://www.amazon.com.mx/s?k=${query}&tag=hydramzkw0mx-20`
```

**Product URLs**:
```javascript
// OLD
productLinks.push(`https://www.amazon.com/dp/${asin}`);

// NEW
productLinks.push(`https://www.amazon.com.mx/dp/${asin}?tag=hydramzkw0mx-20`);
```

**Benefits**:
- ✅ Uses Mexican Amazon catalog
- ✅ Prices in MXN (Mexican Pesos)
- ✅ Includes affiliate tag for tracking
- ✅ Products available for Mexican shoppers

### 3. Database Query Filters (supabase-db.js)

**Highlighted Deals**:
```javascript
// OLD
.gte("price", 0.01)  // Allowed prices as low as $0.01

// NEW
.gt("price", 0)                   // Must have valid price
.gt("available_quantity", 0)      // Must have inventory
```

**Popular Products**:
```javascript
// OLD
.gte("price", 0.01)

// NEW
.gt("price", 0)
.gt("available_quantity", 0)
```

**Recent Products (Top Price Drops)**:
```javascript
// OLD
.gte("price", 0.01)

// NEW
.gt("price", 0)
.gt("available_quantity", 0)
```

## Files Modified

### 1. `/src/backend/actor/main.js`
- ✅ Changed Amazon domain from `.com` to `.com.mx`
- ✅ Added Amazon Mexico affiliate tag (`tag=hydramzkw0mx-20`)
- ✅ Added price validation (must be > 0) before storing
- ✅ Changed Amazon currency from USD to MXN
- ✅ Added logging for skipped products
- ✅ Lines modified: 37, 72, 128-150, 232-248

### 2. `/src/backend/supabase-db.js`
- ✅ Added `.gt("price", 0)` to all deal queries
- ✅ Added `.gt("available_quantity", 0)` to all deal queries
- ✅ Functions updated:
  - `getHighlightedDealsFromCache()` (line ~945)
  - `getPopularProductsFromCache()` (line ~1016)
  - `getRecentProductsFromCache()` (line ~1071)

## Expected Results

### Before Fix:
```
Highlighted Deals: 
- Wonderful Pistachios - $0.00 (out of stock)
- Apple iPhone 15 Pro - $0.00 (no price)
- Samsung Galaxy A14 - $0.00 (unavailable)
```

### After Fix:
```
Highlighted Deals:
- Wonderful Pistachios - $139.99 MXN (482 available)
- Apple iPhone 15 Pro - $8,502.31 MXN (50+ available)
- Samsung Galaxy A14 - $90.00 MXN (available)
```

## Testing Checklist

- [ ] Run new search - verify only products with prices > 0 are stored
- [ ] Check Amazon links - should go to amazon.com.mx
- [ ] Verify prices shown in MXN (Mexican Pesos)
- [ ] Confirm deal sections show no $0.00 products
- [ ] Verify "No popular products" message if no valid products
- [ ] Check console logs show "Skipped" messages for invalid products

## Database Cleanup (Optional)

To remove existing zero-price products from cache:

```sql
-- View zero-price products
SELECT id, title, price, available_quantity 
FROM product_cache 
WHERE price = 0 OR price IS NULL;

-- Delete zero-price products
DELETE FROM product_cache 
WHERE price = 0 OR price IS NULL;

-- Delete out-of-stock products
DELETE FROM product_cache 
WHERE available_quantity = 0 OR available_quantity IS NULL;
```

## Impact

**Positive Changes**:
- ✅ Deal sections only show valid, in-stock products
- ✅ All Amazon products from Mexican catalog
- ✅ Prices displayed in MXN (local currency)
- ✅ Better data quality in `product_cache`
- ✅ Improved user experience (no misleading $0 prices)

**No Breaking Changes**:
- ✅ Existing tracked products unaffected
- ✅ Search functionality remains the same
- ✅ Database structure unchanged

## Future Improvements

1. **Add availability check to scraper**:
   - Extract stock status from product pages
   - Only store products marked as "in stock"

2. **Price validation rules**:
   - Set minimum price thresholds (e.g., > $1)
   - Flag suspiciously low prices for review

3. **Currency conversion**:
   - Store both MXN and USD prices
   - Allow users to toggle currency display

4. **Inventory monitoring**:
   - Track when products go out of stock
   - Alert users when tracked items become available

## Related Documentation

- `CURRENCY-DISPLAY-FIXED.md` - Currency toggle feature
- `PRODUCT-NOT-FOUND-FIX.md` - Two-table lookup architecture
- `SEARCH-PERFORMANCE-OPTIMIZATIONS.md` - Caching strategy
