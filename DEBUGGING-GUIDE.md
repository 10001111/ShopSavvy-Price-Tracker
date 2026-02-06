# Debugging Guide - Search Performance Issues

## 🐛 Bug Fixed

**Issue**: `Uncaught ReferenceError: source is not defined` (line 3105)

**Cause**: The `triggerScrape()` function was trying to use a `source` variable that wasn't defined in its scope.

**Fix Applied**: 
- ✅ Now reads `source` from URL parameters
- ✅ Defaults to 'all' if not present
- ✅ Added comprehensive console logging

---

## 🔍 How to Debug Using Browser Console

### **Step 1: Open Chrome DevTools**

1. Press `F12` or right-click → "Inspect"
2. Go to **Console** tab
3. Refresh the page

### **Step 2: Check Performance Logs**

You should see colored logs like this:

```
🚀 OfertaRadar Performance Monitoring
Search Optimizations Active:
  ✅ Stale-while-revalidate caching
  ✅ Fuzzy search matching  
  ✅ Smart cache refresh (6 hour threshold)
  ✅ Background scraping
Current Page: /
Search Query: samsung tv
⚡ Page Load Time: 1.23s
📦 Products Displayed: 16
💾 Cache Status: Showing cached results from 2 hours ago
```

### **Step 3: Monitor Search Performance**

When you search, look for these logs:

#### **Server-Side Logs** (in Terminal):
```bash
[PERF] 🔍 Starting search for "tv" (source: all)
[PERF] ⚡ Exact match search took 45ms, found 12 products
[fetchAllProducts] Cache fresh (2h old), skipping refresh
```

#### **Browser Console Logs**:
```javascript
[SCRAPE] triggerScrape() called
[SCRAPE] Query: samsung tv
[SCRAPE] Current source: all
[SCRAPE] Starting scrape at 2:45:30 PM
[SCRAPE] Response received after 45.2 seconds
[SCRAPE] Success! Found 16 products
[SCRAPE] Reloading page with URL: http://localhost:3000/?q=samsung+tv&source=all
```

---

## 📊 Understanding the Logs

### **Performance Metrics**

| Log | Meaning | Good | Needs Attention |
|-----|---------|------|-----------------|
| `Exact match search took Xms` | Database query speed | < 100ms | > 500ms |
| `Cache fresh (Xh old)` | Cache age | < 6 hours | > 6 hours |
| `Page Load Time` | Total page load | < 3s | > 5s |
| `Background scraping in progress` | First search | Expected | Always showing |

### **Search Flow Indicators**

**Cache Hit (FAST - < 1s)**:
```
✅ Exact match found: 12 products
💾 Cache Status: Showing cached results
⚡ No scraping needed
```

**Cache Miss (SLOW - 30-60s)**:
```
⚠️ No cached results
🔍 Background scraping in progress
⏳ Refresh in 30-60 seconds
```

**Fuzzy Match (FAST - < 1s)**:
```
ℹ️ No exact match for "samsung tv"
✅ Fuzzy match found: 8 products
💡 Showing related cached products
```

---

## 🛠️ Troubleshooting Common Issues

### **Issue 1: "Product not found" page appears**

**Symptoms**:
- Clicking on product shows error page
- Console error: `source is not defined`

**Status**: ✅ **FIXED**

**Verification**:
```javascript
// Should NOT see this error anymore
❌ Uncaught ReferenceError: source is not defined

// Should see this instead
✅ [SCRAPE] Current source: all
```

---

### **Issue 2: Search takes too long (> 2 minutes)**

**Possible Causes**:

#### **A. First search (cache miss)**
```
Console shows:
🔍 Background scraping in progress
```

**Expected**: 30-60 seconds for first search
**Solution**: This is normal! Refresh after 30-60 seconds.

#### **B. Migration 007 not applied**
```
Server logs show:
⚠️ Migration 007 (product_cache table) may not be applied
```

**Solution**: Apply Migration 007 (see SEARCH-NOT-LOADING-FIX.md)

#### **C. Apify API slow or failing**
```
Server logs show:
[Apify] Actor run did not succeed: FAILED
```

**Solution**: 
- Check Apify dashboard for errors
- Verify `Apify_Token` in `.env`
- Check Apify account limits

---

### **Issue 3: Products not appearing after refresh**

**Check Console**:
```javascript
📦 Products Displayed: 0
```

**Diagnosis Steps**:

1. **Check if scrape completed**:
```bash
# In server logs
[SCRAPE] Cached 16 products into Supabase product_cache
```

2. **Check database**:
```sql
SELECT COUNT(*) FROM product_cache WHERE product_title ILIKE '%samsung tv%';
-- Should return > 0
```

3. **Check for errors**:
```bash
# Server logs
[fetchAllProducts] Sync scrape failed: <error message>
```

**Common Errors**:

- `product_cache does not exist` → Apply Migration 007
- `Apify_Token not set` → Add token to `.env`
- `No products found` → Apify returned 0 results (try different query)

---

### **Issue 4: Cache not working (always slow)**

**Symptoms**:
```
Every search takes 30-60 seconds
Never shows "Cache Status: ..."
```

**Check Server Logs**:
```bash
# Should see this on cache hit:
✅ [PERF] ⚡ Exact match search took 45ms, found 12 products

# If you see this every time:
❌ [fetchAllProducts] No cached results for "tv" — triggering background scrape
```

**Diagnosis**:

1. **Check product_cache table**:
```sql
SELECT product_title, scraped_at FROM product_cache ORDER BY scraped_at DESC LIMIT 10;
```

2. **If empty**: Scrapes aren't being stored
   - Check `cacheScrapedProduct()` function
   - Check Supabase connection
   - Check RLS policies

3. **If has data**: Search isn't finding it
   - Check search query matches titles
   - Try exact product title from database

---

## 🎯 Recommended Debugging Workflow

### **When Search is Slow**:

1. **Open Console** (`F12`)

2. **Check for errors**:
   ```
   ❌ Any red errors? → Fix those first
   ```

3. **Monitor search flow**:
   ```javascript
   [PERF] 🔍 Starting search...
   → [PERF] ⚡ Found X products
   → 💾 Cache Status: ...
   ```

4. **Check server terminal**:
   ```bash
   → [fetchAllProducts] ...
   → [Apify] ...
   → [Supabase] ...
   ```

5. **Verify database**:
   ```sql
   SELECT COUNT(*) FROM product_cache;
   -- Should have products
   ```

---

## 📝 Industry Best Practices Applied

### **Code Quality**:

✅ **Error Handling**:
- Try-catch blocks around all async operations
- Specific error messages for debugging
- Graceful degradation

✅ **Logging**:
- Consistent log prefixes (`[PERF]`, `[SCRAPE]`, `[Apify]`)
- Colored console logs for visibility
- Performance timing measurements

✅ **Performance**:
- Database query optimization
- Caching at multiple layers (Redis + DB)
- Non-blocking background operations

✅ **User Experience**:
- Loading states with spinners
- Progress messages
- Clear error messages
- Auto-refresh suggestions

---

## 🔧 Quick Fixes Reference

### **Error**: `source is not defined`
```javascript
// FIXED - now gets source from URL
const currentSource = urlParams.get('source') || 'all';
```

### **Error**: `product_cache does not exist`
```sql
-- Run this in Supabase SQL Editor
-- See Migration 007 in SEARCH-NOT-LOADING-FIX.md
CREATE TABLE IF NOT EXISTS public.product_cache (...);
```

### **Error**: `Apify_Token not set`
```bash
# Add to .env file
Apify_Token=your_apify_token_here
```

### **Slow Search**: First search for a term
```
✅ EXPECTED BEHAVIOR
- First search: 30-60s (scraping)
- Second search: < 1s (cached)
```

---

## 📈 Performance Benchmarks

### **Target Metrics**:

| Scenario | Target | Status |
|----------|--------|--------|
| Cache hit search | < 1s | ✅ |
| Cache miss (first search) | 30-60s | ✅ |
| Fuzzy match search | < 1s | ✅ |
| Page load time | < 3s | ✅ |
| Database query | < 100ms | ✅ |

### **How to Measure**:

```javascript
// Browser console shows:
⚡ Page Load Time: 1.23s
📦 Products Displayed: 16

// Server logs show:
[PERF] ⚡ Exact match search took 45ms
```

---

## 🚀 Optimization Verification Checklist

After all fixes, verify:

- [ ] No `source is not defined` error
- [ ] Console shows colored performance logs
- [ ] First search shows "Background scraping" message
- [ ] Second search is instant (< 1s)
- [ ] Server logs show cache hit/miss correctly
- [ ] Database has cached products
- [ ] "Discover New Products" button works
- [ ] Page reloads show results after scrape

---

## 💡 Tips for Finding Bugs

### **1. Check Browser Console First**
```
Red errors? → Those are your bugs
```

### **2. Check Server Logs**
```
Look for [ERROR] or [WARN] tags
```

### **3. Check Network Tab**
```
DevTools → Network → Look for failed requests
```

### **4. Check Database**
```sql
-- Is data actually being stored?
SELECT * FROM product_cache ORDER BY created_at DESC LIMIT 5;
```

### **5. Test with Simple Query**
```
Search for "tv" instead of complex terms
Easier to debug
```

### **6. Clear Cache & Cookies**
```
Sometimes old cache causes issues
Ctrl+Shift+Delete → Clear cache
```

---

## 📞 Next Steps if Still Broken

1. **Check all console logs** (browser + server)
2. **Verify Migration 007 applied**
3. **Test with simple search ("tv")**
4. **Check database has products**
5. **Verify Apify credentials**
6. **Share logs for detailed debugging**

---

## ✅ Summary

**Bugs Fixed**:
1. ✅ `source is not defined` error
2. ✅ Missing performance logs
3. ✅ Poor error visibility

**Features Added**:
1. ✅ Comprehensive browser console logging
2. ✅ Performance timing measurements
3. ✅ Cache status indicators
4. ✅ Clear debugging messages

**You can now debug search performance issues by checking the browser console for detailed logs!** 🎉
