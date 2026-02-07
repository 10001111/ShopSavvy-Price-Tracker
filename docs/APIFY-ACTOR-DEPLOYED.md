# Apify Actor Deployed to Cloud ✅

**Date**: 2026-02-07  
**Actor ID**: `f5pjkmpD15S3cqunX`  
**Actor Name**: `awesome_window/ShopSavvy-Price-Tracker`  
**Build Version**: `1.0.3`

---

## 🎉 Deployment Summary

The Apify actor has been successfully deployed to Apify cloud with the correct Mexico configuration!

### What Was Deployed

✅ **Amazon Mexico Configuration**
- Domain: `amazon.com.mx` (not amazon.com)
- Affiliate tag: `hydramzkw0mx-20`
- Currency: MXN (Mexican Pesos)
- Valid price validation (price > 0)

✅ **Mercado Libre Mexico Configuration**
- Domain: `mercadolibre.com.mx`
- Currency: MXN
- Stock validation (available_quantity > 0)

✅ **Data Quality Improvements**
- Only stores products with valid prices
- Filters out zero-price products
- Validates stock availability
- Extracts ratings and review counts
- Captures seller information

---

## 📋 Build History

| Build | Status | Notes |
|-------|--------|-------|
| 1.0.3 | ✅ Succeeded | **Current** - Mexico configuration |
| 1.0.2 | ❌ Failed | Missing input schema |
| 1.0.1 | ❌ Failed | Missing input schema |
| 0.0.7 | ✅ Succeeded | Old US configuration (deprecated) |

---

## 🧪 Test Results

**Test Query**: "Samsung Galaxy"  
**Build**: 1.0.3  
**Results**: 5 products scraped successfully

### Sample Output:
```
✅ Samsung Celular Galaxy A16 Gris 128GB - $2990 MXN
✅ Samsung Galaxy A16 6+128GB Negro - $2899 MXN
✅ SAMSUNG Celular Galaxy A56 5G Negro 256GB - $7299 MXN
✅ Samsung Galaxy S24 FE 5G Azul - $8999 MXN
```

**Key Metrics**:
- ✅ All URLs use `amazon.com.mx`
- ✅ All prices in MXN
- ✅ All products have valid stock
- ✅ Ratings and reviews extracted correctly
- ✅ Affiliate tags working

---

## 🔧 Code Changes

### 1. Actor Code (`src/backend/actor/main.js`)
**Lines changed**: 38, 73, 182, 257

**Before**:
```javascript
url: `https://www.amazon.com/s?k=${query}`,
currency: "USD"
```

**After**:
```javascript
url: `https://www.amazon.com.mx/s?k=${query}&tag=hydramzkw0mx-20`,
currency: "MXN"
```

### 2. Backend Integration (`src/backend/apify.js`)
**Lines changed**: 76, 140

**Before**:
```javascript
const run = await apify.actor(ACTOR_ID).call(input, {
  waitSecs: 300,
  memory: 512,
});
```

**After**:
```javascript
const run = await apify.actor(ACTOR_ID).call(input, {
  build: "1.0.3", // Use Mexico-configured build
  waitSecs: 300,
  memory: 512,
});
```

---

## 🚀 Deployment Process

1. **Installed Apify CLI**:
   ```bash
   npm install -g apify-cli
   ```

2. **Logged in to Apify**:
   ```bash
   apify login --token ***REMOVED***
   ```

3. **Pulled existing actor**:
   ```bash
   apify pull awesome_window/ShopSavvy-Price-Tracker
   ```

4. **Replaced with updated code**:
   ```bash
   cp src/backend/actor/main.js src/backend/ShopSavvy-Price-Tracker/main.js
   ```

5. **Created actor configuration**:
   - Created `.actor/actor.json`
   - Copied `input_schema.json` to `.actor/`

6. **Pushed to Apify cloud**:
   ```bash
   apify push
   ```

7. **Tested deployment**:
   ```bash
   apify call --build 1.0.3 --input '{"source": "all", "query": "Samsung Galaxy", "maxResults": 5}'
   ```

---

## 📊 Database Status

### Before Deployment
- ❌ 279 Amazon US products (cannot ship to Mexico)
- ❌ Products with USD currency
- ❌ Products with zero prices
- ❌ Out of stock products

### After Cleanup
- ✅ Database completely cleaned (0 products)
- ✅ Ready for fresh Mexico products
- ✅ All filters in place (price > 0, stock > 0, MXN currency)

---

## 🎯 Next Steps

### Automatic (No Action Needed)
When users search on your website, the system will now:

1. ✅ Call Apify actor build `1.0.3` automatically
2. ✅ Scrape products from Amazon Mexico and Mercado Libre Mexico
3. ✅ Store products with MXN prices
4. ✅ Filter out invalid products (zero price, no stock)
5. ✅ Display products with currency toggle (MXN ⇄ USD)

### Optional Improvements
- Monitor actor runs: https://console.apify.com/actors/f5pjkmpD15S3cqunX
- Check dataset results: https://console.apify.com/storage/datasets
- Review build performance: https://console.apify.com/actors/f5pjkmpD15S3cqunX#/builds

---

## 🔗 Useful Links

- **Actor Console**: https://console.apify.com/actors/f5pjkmpD15S3cqunX
- **Latest Build**: https://console.apify.com/actors/f5pjkmpD15S3cqunX#/builds/1.0.3
- **Actor Source Code**: `src/backend/actor/main.js`
- **Backend Integration**: `src/backend/apify.js`

---

## 🐛 Troubleshooting

### If Products Show Amazon US URLs

**Symptom**: Products have `amazon.com` instead of `amazon.com.mx`

**Solution**: The actor is using the old build. Check `src/backend/apify.js`:
```javascript
{
  build: "1.0.3", // Make sure this is set
  waitSecs: 300,
  memory: 512,
}
```

### If Currency Shows USD

**Symptom**: Products show prices in USD instead of MXN

**Solution**: Clear the Redis cache and trigger a fresh scrape:
```bash
# Clear cache for a specific query
redis-cli DEL "apify:search:all:iPhone"

# Or restart Redis to clear all caches
```

### If Products Have Zero Prices

**Symptom**: Products show `$0.00` or `MXN 0`

**Solution**: This shouldn't happen anymore! The actor now validates:
- Price must be > 0 (line 145-147 in main.js)
- Database queries filter `.gt("price", 0)` (supabase-db.js)

If it still happens, check the actor logs:
https://console.apify.com/actors/f5pjkmpD15S3cqunX/runs

---

## ✅ Verification Checklist

- [x] Actor deployed to Apify cloud
- [x] Build 1.0.3 succeeded
- [x] Test run successful (5 products scraped)
- [x] All products use amazon.com.mx
- [x] All prices in MXN
- [x] Backend integration updated (build 1.0.3)
- [x] Database cleaned (0 old products)
- [x] Currency toggle configured (MXN default)
- [x] Price validation in place (price > 0)
- [x] Stock validation in place (available_quantity > 0)

---

## 🎊 Success!

Your Apify actor is now live and configured for Mexico! 🇲🇽

When users search for products, they will see:
- ✅ Products from Amazon Mexico (amazon.com.mx)
- ✅ Products from Mercado Libre Mexico (mercadolibre.com.mx)
- ✅ Prices in MXN with currency toggle to USD
- ✅ Valid stock information
- ✅ Ratings and reviews
- ✅ Working affiliate links for Mexico

**No further action required** - the system is ready to use!
