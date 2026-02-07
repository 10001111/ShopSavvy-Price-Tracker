# 🔍 Category System Diagnosis & Data Flow Analysis

## The Problem You Identified

You're correct! The category filtering system has **multiple disconnects** between what was implemented and what's actually working. Let me break down the entire data flow.

---

## 📊 Current Data Flow (What's Actually Happening)

### 1. **Data Entry Point: Apify Actor**
**File**: `src/backend/actor/main.js`

```javascript
// When actor scrapes products from Amazon/Mercado Libre
if (title && asin && price && price > 0) {
  const category = detectCategory(title);  // ✅ WORKING
  await dataset.pushData({
    source: "amazon",
    id: `AMZN-${asin}`,
    category,  // ✅ Category is set during scraping
    title,
    price,
    // ... other fields
  });
}
```

**Status**: ✅ **WORKING** - Products ARE being categorized during scraping

---

### 2. **Data Storage: Supabase `product_cache` Table**
**Function**: `cacheScrapedProduct()` in `supabase-db.js`

```javascript
// When actor results are stored in Supabase
async function cacheScrapedProduct(product) {
  await getSupabase()
    .from("product_cache")
    .upsert({
      product_id: product.id,
      product_title: product.title,
      price: product.price,
      category: product.category,  // ✅ Category IS stored
      source: product.source,
      // ... other fields
    });
}
```

**Status**: ✅ **WORKING** - Category field IS being stored in Supabase

---

### 3. **The Critical Issue: When Are Products Actually Scraped?**

#### Current Trigger Points:
```javascript
// server.js - fetchAllProducts()

// ❌ ISSUE #1: Category-only clicks DON'T trigger scraping
if (category && !query) {
  // Only reads existing database
  const categoryProducts = await supabaseDb.getProductsByCategory(category);
  // NO SCRAPING HAPPENS HERE!
}

// ✅ Search queries DO trigger scraping
else if (query) {
  // Checks database first, then scrapes if needed
  const existing = await supabaseDb.searchProductCache(query);
  if (existing.length === 0) {
    await runScrapeAndStore();  // ✅ Scraping happens
  }
}
```

**The Problem**: 
- When you click a category link (e.g., `/category/electronics`), it only filters **existing** products in the database
- If the database is empty (no previous searches), you get **zero results**
- **No new scraping is triggered** to populate that category

---

## 🔴 Root Cause Analysis

### Issue #1: Database is Empty on First Load
```sql
-- Check product_cache table
SELECT category, COUNT(*) FROM product_cache GROUP BY category;

-- Result: Probably 0 rows or only "uncategorized"
-- Why? Because no searches have been performed yet!
```

**The database only gets populated when**:
1. A user performs a **text search** (e.g., "laptop")
2. The actor runs and scrapes results
3. Results are stored in `product_cache` with categories

**Category filtering alone does NOT populate the database**

---

### Issue #2: Two Different `getProductsByCategory()` Functions

**Function #1** (Line 1126 - The one I added for v2.7):
```javascript
async function getProductsByCategory(category, options = {}) {
  // Filters product_cache by category FIELD
  return getSupabase()
    .from("product_cache")
    .select("*")
    .eq("category", category)  // Uses actual DB column
    .gt("price", 0);
}
```
**Status**: ✅ Correct approach (uses DB category field)

---

**Function #2** (Line 1657 - Pre-existing):
```javascript
async function getProductsByCategory(categoryKey, options = {}) {
  // Gets tracked_products and filters by keyword matching
  const products = await getSupabase()
    .from("tracked_products")  // ❌ Wrong table!
    .select("*");
  
  // Then filters by keywords in title
  return products.filter(p => {
    return categoryDefinitions[categoryKey].keywords.some(keyword =>
      p.product_title.toLowerCase().includes(keyword)
    );
  });
}
```
**Status**: ❌ Wrong table (`tracked_products` is user's dashboard, not search results)

---

### Issue #3: Category Links Structure

Let me check where category links point to:

<function_calls>
<invoke name="Grep">
<parameter name="pattern">href=.*category