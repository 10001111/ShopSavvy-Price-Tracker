# 🔧 Category System: Complete Fix & Data Flow

## The Core Problem

When you click a category link, **NO scraping happens**. Here's why:

### Current Category Links
```html
<a href="/?category=electronics">Electronics</a>
<a href="/?category=phones">Phones</a>
<a href="/?category=computers">Computers</a>
```

### What Happens When Clicked

```javascript
// server.js - Line 2260
if (category && !query) {
  // ❌ ONLY filters existing database
  const categoryProducts = await supabaseDb.getProductsByCategory(category);
  // NO SCRAPING! If database is empty, you get 0 results
}
```

**Problem**: This assumes the database already has products in that category. But the database only gets populated when users perform text searches.

---

## 💡 The Solution: Hybrid Approach

You need categories to **BOTH**:
1. Filter existing database products (fast)
2. Trigger scraping with category-specific keywords (populate database)

---

## 🛠️ Complete Fix Implementation

### Option 1: Category Links Trigger Smart Searches (Recommended)

#### Step 1: Map Categories to Search Keywords
```javascript
// server.js - Add this mapping
const CATEGORY_TO_SEARCH = {
  "electronics": "electronics deals",
  "phones": "smartphone celular",
  "computers": "laptop computadora",
  "tvs": "television smart tv",
  "appliances": "electrodomesticos appliances",
  "toys": "juguetes toys",
  "clothing": "ropa clothing",
  "sports-outdoors": "deportes sports",
  "home-kitchen": "hogar cocina",
  "beauty": "belleza beauty"
};
```

#### Step 2: Modify Category Click Handling
```javascript
// server.js - Line ~2747
if (category && !query) {
  console.log(`[Category] User clicked "${category}"`);
  
  // OPTION A: Set query to category keywords (triggers scraping)
  query = CATEGORY_TO_SEARCH[category] || category;
  console.log(`[Category] Converted to search: "${query}"`);
  
  // Then proceed with normal search flow (checks DB first, scrapes if needed)
}
```

**How This Works**:
1. User clicks "Electronics" → `/?category=electronics`
2. Server converts to query: `query = "electronics deals"`
3. System checks database for existing "electronics deals" results
4. If empty or old (> 6 hours), triggers Apify scraping
5. Apify scrapes Amazon/ML for "electronics deals"
6. Results are stored with `category: "electronics"` field
7. Future clicks on "Electronics" will show cached results

---

### Option 2: Category Links Trigger Direct Scraping (Aggressive)

```javascript
// server.js - fetchAllProducts()
if (category && !query) {
  console.log(`[Category] Checking database for "${category}"`);
  
  // Try database first
  let categoryProducts = await supabaseDb.getProductsByCategory(category, {
    limit: pageSize,
    minPrice,
    maxPrice,
    source
  });
  
  // If empty or very few results, trigger scraping
  if (categoryProducts.length < 5) {
    console.log(`[Category] Only ${categoryProducts.length} products found. Triggering scrape...`);
    
    const searchQuery = CATEGORY_TO_SEARCH[category] || category;
    await runScrapeAndStore(searchQuery);
    
    // Re-query database after scraping
    categoryProducts = await supabaseDb.getProductsByCategory(category, {
      limit: pageSize,
      minPrice,
      maxPrice,
      source
    });
  }
  
  results.products = mapRows(categoryProducts);
  results.total = categoryProducts.length;
}
```

**How This Works**:
1. User clicks "Electronics"
2. System checks database for `category = "electronics"`
3. If < 5 products, triggers scraping with "electronics deals"
4. Waits for scraping to complete
5. Re-queries database to show fresh results

---

## 📦 Current Database State

### Check What's Actually in Your Database

Run this to see current data:

```javascript
// Create: check-categories.js
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function checkCategories() {
  // Check product_cache table
  const { data: products } = await supabase
    .from('product_cache')
    .select('category, product_title, price, source')
    .limit(100);
  
  // Group by category
  const byCategory = {};
  products?.forEach(p => {
    const cat = p.category || 'uncategorized';
    byCategory[cat] = (byCategory[cat] || 0) + 1;
  });
  
  console.log('=== Products by Category ===');
  console.log(byCategory);
  
  console.log('\n=== Sample Products ===');
  products?.slice(0, 10).forEach(p => {
    console.log(`${p.category}: ${p.product_title.substring(0, 50)}`);
  });
}

checkCategories();
```

Run: `node check-categories.js`

**Expected Output if Empty**:
```
=== Products by Category ===
{ uncategorized: 118 }  // ❌ All products uncategorized
// OR
{}  // ❌ No products at all
```

**Expected Output if Working**:
```
=== Products by Category ===
{
  phones: 45,
  computers: 32,
  electronics: 28,
  toys: 13
}  // ✅ Products properly categorized
```

---

## 🔍 Why Your Database Might Be Empty

### Scenario 1: No Searches Performed Yet
- `product_cache` table is empty
- Category clicks show 0 results
- **Fix**: Perform a text search first (e.g., "laptop") to populate database

### Scenario 2: Old Scraper Version
- Products were scraped before category field existed
- All products have `category: null` or `category: "uncategorized"`
- **Fix**: Re-scrape products with new actor build 1.0.5

### Scenario 3: Actor Not Deployed
- Code changes to actor aren't live
- Scraper still using old version without category detection
- **Fix**: Deploy actor build 1.0.5 to Apify

---

## ✅ Recommended Implementation

### Step-by-Step Fix

#### 1. Update Category Click Handler (server.js ~line 2747)

```javascript
// Category-to-search mapping
const CATEGORY_TO_SEARCH = {
  "electronics": "electronics",
  "phones": "smartphone",
  "computers": "laptop",
  "tvs": "television",
  "appliances": "electrodomesticos",
  "toys": "toys",
  "clothing": "ropa",
  "sports-outdoors": "deportes",
  "home-kitchen": "hogar cocina",
  "beauty": "belleza"
};

// When user clicks category
if (category && !query) {
  console.log(`[Category] User clicked "${category}"`);
  
  // Convert category to search query
  query = CATEGORY_TO_SEARCH[category] || category;
  console.log(`[Category] → Triggering search: "${query}"`);
  
  // Now proceed with normal search flow
  // (will check DB first, scrape if needed)
}
```

#### 2. Update fetchAllProducts to Handle Category + Query

```javascript
// server.js - fetchAllProducts()
async function fetchAllProducts({ query, category, ... }) {
  // If both category and query, filter results by category after fetching
  if (USE_SUPABASE && query) {
    // ... existing search logic ...
    
    let existing = await supabaseDb.searchProductCache(query, { limit: pageSize });
    
    // If category specified, filter results
    if (category && existing.length > 0) {
      existing = existing.filter(p => p.category === category);
      console.log(`[Category Filter] Filtered to ${existing.length} products in "${category}"`);
    }
    
    // ... rest of logic ...
  }
}
```

#### 3. Update Category Links to Include Query

```html
<!-- Option A: Use query parameter (triggers search) -->
<a href="/?q=smartphone&category=phones">Phones</a>
<a href="/?q=laptop&category=computers">Computers</a>

<!-- Option B: Just category (relies on server-side conversion) -->
<a href="/?category=phones">Phones</a>
```

---

## 🎯 Final Data Flow (After Fix)

### User Clicks "Electronics" Category

```
1. Browser → GET /?category=electronics

2. Server (server.js line 2747):
   - Detects category=electronics, query=""
   - Converts: query = "electronics"
   - Proceeds to fetchAllProducts(query="electronics", category="electronics")

3. fetchAllProducts() (server.js line 2188):
   - Checks database: searchProductCache("electronics")
   - If results exist (< 6 hours old): Return cached
   - If results empty/old: Trigger Apify scraping

4. Apify Actor (actor/main.js):
   - Scrapes Amazon for "electronics"
   - For each product: category = detectCategory(title)
   - Stores in Supabase product_cache with category field

5. Server Response:
   - Gets products from database
   - Filters by category="electronics"
   - Renders Bento Grid with products

6. Future Clicks:
   - Returns instant results from database (stale-while-revalidate)
```

---

## 🚨 Critical Fix Needed

### The Duplicate Function Issue

You have **TWO** `getProductsByCategory()` functions in `supabase-db.js`:

**Line 1126** (Correct - uses category field):
```javascript
async function getProductsByCategory(category, options = {}) {
  return getSupabase()
    .from("product_cache")  // ✅ Correct table
    .select("*")
    .eq("category", category);  // ✅ Uses DB field
}
```

**Line 1657** (Wrong - uses keyword matching):
```javascript
async function getProductsByCategory(categoryKey, options = {}) {
  const products = await getSupabase()
    .from("tracked_products")  // ❌ Wrong table
    .select("*");
  
  return products.filter(/* keyword matching */);  // ❌ Inefficient
}
```

**Fix**: Delete the second function (line 1657-1830) or rename it to `getTrackedProductsByCategory()`

---

## 📝 Implementation Checklist

- [ ] Add `CATEGORY_TO_SEARCH` mapping to server.js
- [ ] Update category click handler to set query variable
- [ ] Remove duplicate `getProductsByCategory()` function
- [ ] Test: Click "Electronics" → Should trigger search
- [ ] Verify: Check database after search → Should have category field
- [ ] Test: Click "Electronics" again → Should return cached results
- [ ] Deploy: Actor build 1.0.5 to Apify (if not already)
- [ ] Verify: New products have proper categories

---

## 🎯 Expected Behavior After Fix

### First Click on "Electronics"
```
1. User clicks "Electronics"
2. Server converts to search: "electronics"
3. Checks database → 0 results (first time)
4. Triggers Apify scraping
5. Apify scrapes 20 products
6. Products stored with category="electronics"
7. Returns 20 products
```

### Second Click on "Electronics"
```
1. User clicks "Electronics"
2. Server converts to search: "electronics"
3. Checks database → 20 results (cached < 6 hours)
4. Returns instant results (no scraping)
```

### After 6+ Hours
```
1. User clicks "Electronics"
2. Server converts to search: "electronics"
3. Checks database → 20 results (but > 6 hours old)
4. Returns cached results FIRST (instant)
5. Triggers background scraping to refresh
6. Future requests get fresh data
```

---

## 🔧 Quick Fix Code

Here's the minimal code change needed:

### File: `src/backend/server.js` (Line ~2747)

**BEFORE**:
```javascript
if (category && !query) {
  console.log(`[Category] User clicked "${category}" → filtering database by category field`);
  // Don't set query - we'll filter by category in fetchAllProducts
}
```

**AFTER**:
```javascript
// Category-to-search mapping
const CATEGORY_TO_SEARCH = {
  "electronics": "electronics",
  "phones": "smartphone",
  "computers": "laptop",
  "tvs": "television",
  "appliances": "electrodomesticos",
  "toys": "toys",
  "clothing": "ropa",
  "sports-outdoors": "deportes",
  "home-kitchen": "hogar cocina",
  "beauty": "belleza"
};

if (category && !query) {
  // Convert category click to search query
  query = CATEGORY_TO_SEARCH[category] || category;
  console.log(`[Category] User clicked "${category}" → triggering search: "${query}"`);
  // Now proceeds with normal search flow (checks DB, scrapes if needed)
}
```

That's it! This one change makes categories trigger scraping.

---

## 📊 Testing the Fix

### Test 1: Empty Database
```bash
# Clear database
# Then click "Electronics" category
# Expected: Scraping triggered, 20 products returned
```

### Test 2: Populated Database
```bash
# Click "Electronics" again
# Expected: Instant results from cache (no scraping)
```

### Test 3: Category Filtering
```bash
# Search for "laptop" (general search)
# Then click "Computers" category
# Expected: Only laptop products with category="computers"
```

---

## Summary

**The Root Issue**: Category clicks only filtered the database, never populated it.

**The Fix**: Make category clicks trigger searches with category-specific keywords.

**Why This Works**: 
- First click → scrapes and populates database
- Subsequent clicks → instant results from cache
- Background refresh keeps data fresh
- Stale-while-revalidate pattern for best UX

**Next Steps**: Implement the code changes above and test!
