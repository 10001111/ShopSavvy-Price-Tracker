# Hashtag-Based Category Filtering System

## Overview
The hashtag system replaces fuzzy keyword-based category detection with explicit tags for accurate product categorization. Each product gets hashtags like `#phone`, `#toys`, `#electronics` based on title analysis with exclusion rules.

## Problem Solved
**Before**: Products appeared in wrong categories due to keyword ambiguity:
- "Call of Duty cable" → showed in #phone (because "cable")
- "Gaming headphones" → showed in #laptop (because "gaming")
- "Toy phone" → showed in #phone (should be #toys)

**After**: Products only appear in categories matching their hashtags:
- Phone accessories → NO #phone tag (excluded)
- Gaming headphones → #gaming + #electronics (correct)
- Toy phones → #toys only (exclusion rule applied)

## Valid Hashtags
- `electronics` — General electronics (TVs, tablets, cameras, speakers)
- `phone` — Smartphones only (accessories excluded)
- `laptop` — Laptops and computers (cases/bags excluded)
- `gaming` — Gaming consoles and accessories
- `toys` — Toys, LEGO, board games
- `clothing` — Apparel and shoes
- `home` — Home and kitchen appliances
- `sports` — Fitness and outdoor gear
- `beauty` — Cosmetics and personal care

## How It Works

### 1. Database Schema
```sql
-- product_cache table has hashtags column
ALTER TABLE product_cache ADD COLUMN hashtags TEXT[] DEFAULT '{}';

-- GIN index for fast array queries
CREATE INDEX idx_product_cache_hashtags ON product_cache USING GIN (hashtags);
```

### 2. Hashtag Generation (Auto)
When products are scraped and cached, `generateHashtags()` runs:

```javascript
// In supabase-db.js > cacheScrapedProduct()
const hashtags = generateHashtags(product);
// e.g., "iPhone 15 Pro" → ["phone", "electronics"]
```

**Hashtag Rules**:
- **Title keywords** → hashtags (e.g., "iphone" → #phone, #electronics)
- **Exclusions** → prevent wrong tags (e.g., "phone case" → exclude #phone)

### 3. Category Navigation
When users click category tabs (e.g., "Phones"), the URL becomes `/?q=phone`.

Server detects hashtag query:
```javascript
// In server.js > fetchAllProducts()
const VALID_HASHTAGS = ["electronics", "phone", "laptop", ...];
const isHashtagQuery = VALID_HASHTAGS.includes(query.toLowerCase());

if (isHashtagQuery) {
  // Use hashtag filter (PostgreSQL array containment)
  existing = await supabaseDb.getProductsByHashtag(query, options);
}
```

### 4. Database Query
```javascript
// In supabase-db.js > getProductsByHashtag()
getSupabase()
  .from("product_cache")
  .select("*")
  .contains("hashtags", [hashtag]) // PostgreSQL @> operator
  .order("scraped_at", { ascending: false });
```

PostgreSQL `@>` operator uses GIN index for fast lookups.

## Exclusion Rules
Products are **excluded** from hashtags if they contain disqualifying keywords:

| Hashtag | Exclusions |
|---------|------------|
| `phone` | case, cover, holder, mount, charger, cable, screen protector, funda, cargador |
| `laptop` | case, bag, mochila, sticker, mousepad, alfombrilla |
| `electronics` | toy, juguete, replica, poster, sticker |
| `beauty` | toy, food, kitchen appliance |
| `clothing` | doll clothes, toy |
| `home` | toy, miniature, doll house |

**Example**: "iPhone charger cable" → NO #phone tag (excluded by "charger" + "cable")

## Migrations

### Migration 012: Add hashtags column
```bash
# Run in Supabase Dashboard > SQL Editor
supabase/migrations/012_add_hashtags_column.sql
```
Adds `hashtags TEXT[]` column and GIN index.

### Migration 013: Backfill existing products
```bash
# Run in Supabase Dashboard > SQL Editor
supabase/migrations/013_backfill_hashtags.sql
```
Generates hashtags for all existing products using PostgreSQL function.

## Testing

### 1. Check hashtag generation
```javascript
// In server console or debug endpoint
const product = { title: "Samsung Galaxy S24 Ultra" };
const hashtags = generateHashtags(product);
// Expected: ["phone", "electronics"]
```

### 2. Verify database
```sql
-- Check products with #phone hashtag
SELECT product_title, hashtags 
FROM product_cache 
WHERE hashtags @> ARRAY['phone']
LIMIT 10;
```

### 3. Test category navigation
1. Go to homepage
2. Click "Phones" category tab
3. URL: `/?q=phone`
4. Server log should show: `[Hashtag] Filtering by hashtag: #phone`
5. Only products with `#phone` tag appear

## Benefits

✅ **Accurate filtering** — Products only appear where they belong  
✅ **Fast queries** — GIN index makes array searches instant  
✅ **No false positives** — Exclusion rules prevent mismatches  
✅ **Bilingual support** — Rules cover English and Spanish keywords  
✅ **No scraping** — Hashtag queries only show cached products (fast!)  

## Code Locations

| File | Function | Purpose |
|------|----------|---------|
| `supabase-db.js:518` | `generateHashtags()` | Creates hashtags from product title |
| `supabase-db.js:623` | `cacheScrapedProduct()` | Stores products with hashtags |
| `supabase-db.js:1280` | `getProductsByHashtag()` | Filters products by hashtag |
| `server.js:2467` | `fetchAllProducts()` | Detects hashtag queries |
| `server.js:1354-1362` | Category nav | Frontend category tabs |

## Future Enhancements

- [ ] Allow multiple hashtag filtering (e.g., `#phone AND #gaming`)
- [ ] Add hashtag-based product recommendations
- [ ] Show hashtag badges on product cards
- [ ] Admin dashboard to manually edit product hashtags
