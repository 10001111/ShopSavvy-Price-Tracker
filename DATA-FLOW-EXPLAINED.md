# 🔄 Data Flow: How Your Website Stores Data

## 📊 Two Separate Systems

Your website uses **TWO completely separate tables** in Supabase:

| Table | Purpose | Who Controls | User Can See |
|-------|---------|--------------|--------------|
| **`product_cache`** | Search results cache (temporary) | System (automatic) | In search results only |
| **`tracked_products`** | User's watchlist (permanent) | User (manual action) | In dashboard only |

---

## 🔍 Flow 1: User Searches for a Product

### Step-by-Step Process:

```
User types "iPhone 15" in search box
           ↓
[1] Server checks: "Do we have iPhone 15 in product_cache?"
           ↓
    ┌──── YES ─────┐         ┌──── NO ─────┐
    ↓               ↓         ↓              ↓
Show cached      Refresh   Call Apify    Show fresh
results          in bg     API to scrape  results
instantly                      ↓
                         Store in
                      product_cache
                            ↓
                      Show results
```

### Code Location:
**File**: `src/backend/server.js`
**Function**: `fetchAllProducts()` (line ~1176)

### What Happens in Database:

```javascript
// Step 1: Check cache
const cached = await searchProductCache("iPhone 15");

if (cached.length > 0) {
  // Cache HIT - show immediately
  return cached;
} else {
  // Cache MISS - scrape fresh data
  const items = await scrapeProducts({ query: "iPhone 15" });
  
  // Store in product_cache (NOT tracked_products!)
  for (const item of items) {
    await cacheScrapedProduct(item); // ← Goes to product_cache
  }
  
  return items;
}
```

### Result in Supabase:

**`product_cache` table:**
```sql
id | product_id  | product_title      | price | source        | scraped_at
---+-------------+--------------------+-------+---------------+------------
1  | MLM-123     | iPhone 15 Pro Max  | 24999 | mercadolibre  | 2024-02-06
2  | AMZN-456    | iPhone 15 Pro      | 22999 | amazon        | 2024-02-06
```

**`tracked_products` table:**
```
(empty - nothing added yet!)
```

---

## 🎯 Flow 2: User Clicks "Track Price"

### Step-by-Step Process:

```
User sees search results
          ↓
User clicks "Track Price" button on iPhone 15
          ↓
[1] Frontend sends: POST /api/track
          ↓
[2] Backend calls: addTrackedProduct(userId, productData)
          ↓
[3] New row inserted in tracked_products table
          ↓
[4] Product now appears in user's dashboard
```

### Code Location:
**File**: `src/backend/server.js`
**Endpoint**: `POST /api/track` (line ~5796)

### What Happens in Database:

```javascript
// User clicks "Track Price"
app.post("/api/track", authRequired, async (req, res) => {
  const userId = req.user.id; // Current user's ID
  const productData = req.body;
  
  // Add to tracked_products with USER'S ID
  const tracked = await addTrackedProduct({
    userId: userId,        // ← User's actual ID (not user_id=1!)
    productId: productData.productId,
    productTitle: productData.title,
    productUrl: productData.url,
    source: productData.source,
    currentPrice: productData.price,
  });
  
  return tracked;
});
```

### Result in Supabase:

**`product_cache` table:**
```sql
id | product_id  | product_title      | price | source        | scraped_at
---+-------------+--------------------+-------+---------------+------------
1  | MLM-123     | iPhone 15 Pro Max  | 24999 | mercadolibre  | 2024-02-06
2  | AMZN-456    | iPhone 15 Pro      | 22999 | amazon        | 2024-02-06
```

**`tracked_products` table:**
```sql
id | user_id | product_id  | product_title      | current_price | created_at
---+---------+-------------+--------------------+---------------+------------
1  | 5       | MLM-123     | iPhone 15 Pro Max  | 24999         | 2024-02-06
   ↑
   User's actual ID (NOT user_id=1)
```

---

## 📺 Flow 3: User Views Dashboard

### Step-by-Step Process:

```
User goes to /dashboard
          ↓
[1] Backend calls: getTrackedProducts(userId)
          ↓
[2] Query: SELECT * FROM tracked_products WHERE user_id = {current_user}
          ↓
[3] Returns ONLY products this user tracked
          ↓
[4] Shows in dashboard with price history
```

### Code Location:
**File**: `src/backend/server.js`
**Endpoint**: `GET /dashboard` (line ~4639)

### What User Sees:

```javascript
// Get ONLY this user's tracked products
const trackedProducts = await getTrackedProducts(req.user.id);

// User 5 sees:
// - iPhone 15 Pro Max (tracked by them)

// User 5 does NOT see:
// - Products in product_cache (those are just search results)
// - Products tracked by other users
```

---

## 🔄 Complete Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    USER SEARCHES "iPhone"                    │
└───────────────────────────────┬─────────────────────────────┘
                                ↓
                    ┌───────────────────────┐
                    │  Check product_cache  │
                    └───────────┬───────────┘
                                ↓
                    ┌───────────────────────┐
                    │ Cache hit? Show results│
                    │ Cache miss? Call Apify │
                    └───────────┬───────────┘
                                ↓
                    ┌───────────────────────┐
                    │  Store in product_cache│ ← Shared by ALL users
                    │     (NOT tracked!)     │
                    └───────────┬───────────┘
                                ↓
                    ┌───────────────────────┐
                    │   Show search results  │
                    └───────────┬───────────┘
                                ↓
                ┌───────────────────────────────┐
                │                               │
                ↓                               ↓
    ┌───────────────────┐         ┌───────────────────────┐
    │ User clicks        │         │ User does nothing     │
    │ "Track Price"      │         │                       │
    └─────────┬─────────┘         └───────────────────────┘
              ↓
    ┌───────────────────┐
    │ POST /api/track   │
    └─────────┬─────────┘
              ↓
    ┌───────────────────────────┐
    │ addTrackedProduct()       │
    │   user_id = current_user  │ ← User's actual ID
    └─────────┬─────────────────┘
              ↓
    ┌───────────────────────────┐
    │ INSERT into               │
    │ tracked_products          │ ← User's personal watchlist
    └─────────┬─────────────────┘
              ↓
    ┌───────────────────────────┐
    │ Product appears in        │
    │ user's dashboard          │
    └───────────────────────────┘
```

---

## 📋 Real Example Walkthrough

### Scenario: Three Users Search for "iPhone"

#### User A (Sarah, user_id = 5):
1. Searches "iPhone" → Results stored in `product_cache`
2. Clicks "Track Price" on iPhone 15 Pro
3. Row added to `tracked_products` with `user_id = 5`
4. Dashboard shows: **1 tracked product** (iPhone 15 Pro)

#### User B (John, user_id = 7):
1. Searches "iPhone" → **Same cached results** (fast!)
2. Clicks "Track Price" on iPhone 15 Pro Max
3. Row added to `tracked_products` with `user_id = 7`
4. Dashboard shows: **1 tracked product** (iPhone 15 Pro Max)

#### User C (Guest, not logged in):
1. Searches "iPhone" → **Same cached results** (fast!)
2. Can see results but cannot track (must login first)
3. Dashboard: Not accessible (not logged in)

### Database State After All This:

**`product_cache` table (shared by everyone):**
```sql
id | product_id  | product_title      | price | source
---+-------------+--------------------+-------+---------------
1  | MLM-001     | iPhone 15 Pro Max  | 24999 | mercadolibre
2  | MLM-002     | iPhone 15 Pro      | 22999 | mercadolibre
3  | AMZN-001    | iPhone 15          | 19999 | amazon
```

**`tracked_products` table (personal watchlists):**
```sql
id | user_id | product_id | product_title      | current_price
---+---------+------------+--------------------+---------------
1  | 5       | MLM-002    | iPhone 15 Pro      | 22999
2  | 7       | MLM-001    | iPhone 15 Pro Max  | 24999
```

**Result:**
- Sarah sees: 1 tracked product (iPhone 15 Pro)
- John sees: 1 tracked product (iPhone 15 Pro Max)
- They share the same cache but have separate tracked lists ✅

---

## 🔧 Technical Details

### product_cache Table Structure:
```sql
CREATE TABLE product_cache (
  id BIGSERIAL PRIMARY KEY,
  product_id TEXT NOT NULL,
  product_title TEXT,
  product_url TEXT,
  source TEXT NOT NULL,
  current_price DECIMAL(10,2),
  thumbnail TEXT,
  images JSONB,
  description TEXT,
  seller TEXT,
  rating NUMERIC(3,1),
  condition TEXT DEFAULT 'new',
  currency TEXT DEFAULT 'MXN',
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_checked TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(product_id, source)  -- ← Prevents duplicates
);
```

**Key Points:**
- ❌ **NO user_id column** - Shared by everyone
- ✅ Cache duration: 30 minutes
- ✅ Auto-refreshed in background
- ✅ Same data for all users (efficient!)

### tracked_products Table Structure:
```sql
CREATE TABLE tracked_products (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,  -- ← Links to specific user
  product_id TEXT NOT NULL,
  product_title TEXT,
  product_url TEXT,
  source TEXT DEFAULT 'mercadolibre',
  target_price DECIMAL(10,2),
  current_price DECIMAL(10,2),
  thumbnail TEXT,
  images JSONB,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_checked TIMESTAMPTZ,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

**Key Points:**
- ✅ **HAS user_id column** - Personal to each user
- ✅ Permanent (until user removes)
- ✅ Has price history tracking
- ✅ Each user sees only their own

---

## 🎯 Summary: Structure Overview

```
┌────────────────────────────────────────────────────────────┐
│                    YOUR WEBSITE                             │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  SEARCH SYSTEM                  TRACKING SYSTEM             │
│  ┌─────────────────┐           ┌──────────────────┐       │
│  │ product_cache   │           │ tracked_products │       │
│  │ (Temporary)     │           │ (Permanent)      │       │
│  ├─────────────────┤           ├──────────────────┤       │
│  │ NO user_id      │           │ HAS user_id      │       │
│  │ Shared by ALL   │           │ Per-user lists   │       │
│  │ Auto-populated  │           │ Manual "Track"   │       │
│  │ 30min cache     │           │ Forever (until   │       │
│  │                 │           │ user removes)    │       │
│  └─────────────────┘           └──────────────────┘       │
│         ↑                               ↑                  │
│         │                               │                  │
│   System stores                   User clicks              │
│   search results                  "Track Price"            │
│                                                             │
└────────────────────────────────────────────────────────────┘
```

---

## ✅ Key Takeaways

1. **Search results** → Stored in `product_cache` (shared, temporary)
2. **User clicks "Track Price"** → Stored in `tracked_products` (personal, permanent)
3. **Dashboard** → Shows ONLY `tracked_products` for that user
4. **All users share** the same `product_cache` (saves API calls!)
5. **Each user has** their own separate `tracked_products` list

**This is the CORRECT architecture!** ✅

---

## 🚀 Ready to Use

After you:
1. Apply Migration 007 (create `product_cache` table)
2. Run cleanup SQL (delete old auto-tracked junk)
3. Restart server

Your website will work exactly as described above! 🎉
