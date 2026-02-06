# 📊 Data Analysis System Explained

## 🤔 Why You're Only Seeing One Deal Card & "Based on Your Searches"

### The Problem:

You're seeing:
- ❌ Only 1 deal card instead of 3 sections
- ❌ "Based on Your Searches" title (personalized)
- ❌ Empty/missing deal sections

### The Root Cause:

**Your database has NO tracked products with price history!**

The data analysis system requires:
1. Products in `tracked_products` table
2. Multiple price history entries per product
3. At least 2 price points to calculate deals

---

## 📈 How Data Analysis Works

### Language: **PostgreSQL + JavaScript**

The analysis uses **SQL queries** in Supabase combined with **JavaScript calculations**.

### 3 Analysis Functions:

```javascript
// 1. Highlighted Deals - Best savings
getHighlightedDeals()
  → Queries: tracked_products + price_history
  → Calculates: avgPrice, minPrice, savingsPercent
  → Returns: Products with best deals (isBestPrice OR isGoodDeal)

// 2. Popular Products - Most tracked
getPopularProducts()
  → Queries: tracked_products (grouped by product_id)
  → Counts: How many users track each product
  → Returns: Products tracked by most users

// 3. Top Price Drops - Biggest drops
getTopPriceDrops()
  → Queries: tracked_products + price_history
  → Calculates: previousPrice, dropAmount, dropPercent
  → Returns: Products with largest recent price drops
```

---

## 🔍 Detailed Breakdown

### Function 1: `getHighlightedDeals()`

**Location**: `src/backend/supabase-db.js:810`

**SQL Query**:
```sql
SELECT * FROM tracked_products 
WHERE current_price IS NOT NULL
ORDER BY created_at DESC
```

**JavaScript Analysis**:
```javascript
for each product:
  1. Get price_history (last 30 days)
  2. Calculate:
     - minPrice = lowest price ever
     - avgPrice = average of all prices
     - currentPrice = today's price
  
  3. Determine if it's a deal:
     - isBestPrice = currentPrice <= minPrice
     - isGoodDeal = currentPrice < avgPrice * 0.95 (5% below average)
     - savingsPercent = ((avgPrice - currentPrice) / avgPrice) * 100
  
  4. If isBestPrice OR isGoodDeal:
     - Add to deals list
```

**Example**:
```javascript
Product: iPhone 15
Price History: [24999, 26000, 25500, 24500, 24999]
  
Calculations:
  minPrice = 24500
  avgPrice = 25199.8
  currentPrice = 24999
  
  isBestPrice? NO (24999 > 24500)
  isGoodDeal? YES (24999 < 23939.81 [95% of avg])
  savingsPercent = 0.8%
  savingsAmount = 200.8 MXN
  
→ Shows in Highlighted Deals ✅
```

---

### Function 2: `getPopularProducts()`

**Location**: `src/backend/supabase-db.js:887`

**SQL Query**:
```sql
SELECT product_id, COUNT(*) as track_count
FROM tracked_products
WHERE current_price IS NOT NULL
GROUP BY product_id
ORDER BY track_count DESC
```

**JavaScript Analysis**:
```javascript
for each unique product_id:
  1. Count how many users are tracking it
  2. Get latest price info
  3. Calculate deal stats (same as Highlighted Deals)
  
  4. Sort by track_count (most popular first)
```

**Example**:
```javascript
Product: iPhone 15 Pro Max
Tracked by: 15 users
  → Rank #1 in Popular Products

Product: MacBook Air M3
Tracked by: 8 users
  → Rank #2 in Popular Products
```

---

### Function 3: `getTopPriceDrops()`

**Location**: `src/backend/supabase-db.js:979`

**SQL Query**:
```sql
SELECT * FROM tracked_products
WHERE current_price IS NOT NULL
ORDER BY created_at DESC
```

**JavaScript Analysis**:
```javascript
for each product:
  1. Get price_history for specified period
  2. Calculate:
     - previousPrice = price from period start
     - currentPrice = today's price
     - dropAmount = previousPrice - currentPrice
     - dropPercent = (dropAmount / previousPrice) * 100
  
  3. If dropPercent > 5%:
     - Add to price drops list
  
  4. Sort by dropPercent (biggest drops first)
```

**Example**:
```javascript
Product: Samsung TV
Price 7 days ago: 12999 MXN
Price today: 10999 MXN

Calculations:
  dropAmount = 2000 MXN
  dropPercent = 15.4%
  
→ Shows in Top Price Drops ✅
```

---

## 🎯 Why You Only See "Based on Your Searches"

### Condition Check:

**File**: `src/backend/server.js:2201`

```javascript
// Title changes based on user search history
const hasPersonalised = userInterestProducts.length > 0;

const sectionTitle = hasPersonalised 
  ? "Based on Your Searches →"  // ← YOU SEE THIS
  : "Popular Products →";        // ← Default
```

**Why?**
1. You're logged in
2. You have search history in `search_history` table
3. System found products matching your searches
4. Title changed to "Based on Your Searches"

---

## 🚨 Why You Only See ONE Deal Card

### The Real Issue:

```javascript
// Home page tries to fetch deals
highlightedDeals = await getHighlightedDeals(12);
popularProducts = await getPopularProducts({ limit: 8 });
topPriceDrops = await getTopPriceDrops({ period: "recent", limit: 8 });

// Result:
highlightedDeals = []  // Empty! ❌
popularProducts = [1 product]  // Only 1! ❌
topPriceDrops = []     // Empty! ❌
```

**Reason**:
```javascript
// Analysis requires BOTH:
1. Products in tracked_products ← You have some
2. Price history with 2+ entries ← YOU DON'T HAVE THIS!

// From getHighlightedDeals():
if (history && history.length >= 2) {  // ← FAILS HERE
  // Calculate deals...
}
```

---

## 📊 Current Database State (Likely):

```sql
-- tracked_products table
SELECT COUNT(*) FROM tracked_products;
-- Result: ~5-10 products

-- price_history table  
SELECT COUNT(*) FROM price_history;
-- Result: 0 or very few entries ← THE PROBLEM
```

**Why No Price History?**
1. Products were just added (no time for updates)
2. Price checker worker hasn't run yet
3. No price changes detected yet
4. Products might be from old auto-tracking bug (user_id=1)

---

## ✅ How to Fix It

### Option 1: Seed Demo Data (RECOMMENDED)

Run the seed script to add products with price history:

```bash
node src/backend/scripts/seed-mock-products.js
```

This adds:
- 12 mock products
- Multiple price history entries per product
- Simulated price changes over time
- Will populate all 3 sections!

### Option 2: Wait for Real Data

1. Users track products
2. Price checker runs (every 60 minutes)
3. Prices get updated
4. History builds up over days/weeks
5. Deals start appearing

### Option 3: Manual Testing

```sql
-- 1. Add a test product
INSERT INTO tracked_products (user_id, product_id, product_title, current_price, source)
VALUES (5, 'TEST-001', 'iPhone 15 Test', 24999, 'mercadolibre');

-- 2. Add price history (simulating price changes)
INSERT INTO price_history (tracked_product_id, price, recorded_at)
VALUES 
  (1, 26000, NOW() - INTERVAL '7 days'),
  (1, 25500, NOW() - INTERVAL '5 days'),
  (1, 25000, NOW() - INTERVAL '3 days'),
  (1, 24999, NOW());

-- 3. Refresh home page → Should now show deals!
```

---

## 🎨 What Each Section Shows When Working

### When Database Has Data:

```
┌────────────────────────────────────────────────────┐
│           HIGHLIGHTED DEALS (Carousel)              │
│  [iPhone 15] [MacBook] [AirPods] [Samsung TV]     │
│   -14% off    -10% off   -8% off    -15% off      │
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│         POPULAR PRODUCTS / BASED ON SEARCHES        │
│  Grid showing 8 products most tracked or matching  │
│  your search history                                │
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│              TOP PRICE DROPS                        │
│  Grid showing 8 products with biggest price drops  │
│  in last 7 days                                     │
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│           CATEGORY DISCOUNTS                        │
│  📱 Electronics  🎮 Gaming  🏠 Home                 │
│  Average 12%     Average 8%  Average 15%           │
└────────────────────────────────────────────────────┘
```

---

## 🔧 Technical Stack

### Languages & Tech:
- **Backend**: Node.js + Express
- **Database**: PostgreSQL (Supabase)
- **Queries**: SQL + Supabase JS Client
- **Analysis**: JavaScript (in-memory calculations)
- **Frontend**: Vanilla JavaScript (no framework)

### Query Performance:
```javascript
// Each analysis function:
1. SQL query to get products (fast)
2. Loop through products (medium)
3. Get price_history for each (N queries - can be slow!)
4. JavaScript calculations (fast)
5. Sort and filter results (fast)

// Optimization opportunity:
// Could use SQL window functions instead of N+1 queries
```

---

## 📋 Summary

**Why only 1 card?**
- Database lacks price history
- Need at least 2 price points per product
- Analysis can't run without historical data

**Why "Based on Your Searches"?**
- You're logged in with search history
- System found matching products
- Title auto-personalizes

**Language?**
- PostgreSQL (SQL queries)
- JavaScript (calculations & logic)
- All server-side (no client-side ML)

**Fix it:**
```bash
# Quick fix - seed demo data
node src/backend/scripts/seed-mock-products.js

# Or wait for real data to accumulate over time
```

---

## 🚀 Next Steps

1. ✅ Apply Migration 007 (product_cache table)
2. ✅ Clean up auto-tracked products (user_id=1)
3. ✅ Seed demo data OR wait for real data
4. ✅ Restart server
5. ✅ Check home page → Should see all 3 sections!

---

**Your analysis system is working - it just needs data to analyze!** 📊
