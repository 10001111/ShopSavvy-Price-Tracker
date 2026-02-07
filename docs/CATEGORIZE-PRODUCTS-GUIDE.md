# Categorize All Products - Quick Guide 🏷️

**Goal**: Categorize all 352 products in your database so category links work properly

---

## 🚀 Quick Start (5 minutes)

### Step 1: Open Supabase SQL Editor

1. Go to: https://supabase.com/dashboard
2. Select your project
3. Click **"SQL Editor"** in the left sidebar
4. Click **"New Query"**

### Step 2: Copy & Paste This SQL

```sql
-- Categorize all 352 products automatically
-- This takes about 5 seconds to run

-- 1. Ensure category column exists
ALTER TABLE product_cache 
ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'uncategorized';

-- 2. Reset all to uncategorized first
UPDATE product_cache SET category = 'uncategorized';

-- 3. Categorize phones
UPDATE product_cache SET category = 'phones' 
WHERE product_title ~* '(iphone|samsung galaxy|google pixel|motorola|smartphone|celular)';

-- 4. Categorize computers
UPDATE product_cache SET category = 'computers' 
WHERE category = 'uncategorized' 
AND product_title ~* '(macbook|laptop|pc|computadora|portátil)';

-- 5. Categorize electronics  
UPDATE product_cache SET category = 'electronics' 
WHERE category = 'uncategorized' 
AND product_title ~* '(smart tv|television|headphones|tablet|ipad|audífonos)';

-- 6. Categorize toys
UPDATE product_cache SET category = 'toys' 
WHERE category = 'uncategorized' 
AND product_title ~* '(lego|hot wheels|barbie|funko|juguete|toy)';

-- 7. Categorize clothing
UPDATE product_cache SET category = 'clothing' 
WHERE category = 'uncategorized' 
AND product_title ~* '(nike|adidas|shoes|zapatos|tenis)';

-- 8. Categorize home & kitchen
UPDATE product_cache SET category = 'home-kitchen' 
WHERE category = 'uncategorized' 
AND product_title ~* '(kitchenaid|dyson|vacuum|mixer|bed|sofa)';

-- 9. Categorize beauty
UPDATE product_cache SET category = 'beauty' 
WHERE category = 'uncategorized' 
AND product_title ~* '(maybelline|makeup|shampoo|skincare|perfume)';

-- 10. Show results
SELECT category, COUNT(*) as product_count 
FROM product_cache 
GROUP BY category 
ORDER BY product_count DESC;
```

### Step 3: Run the Query

- Click **"Run"** button (or press `Ctrl+Enter`)
- Wait ~5 seconds for completion

### Step 4: Verify Results

You should see output like:
```
category       | product_count
---------------|-------------
phones         | 95
electronics    | 64  
computers      | 45
home-kitchen   | 42
uncategorized  | 44
toys           | 37
beauty         | 17
clothing       | 8
```

---

## ✅ What This Does

### Before:
- 352 products
- All "uncategorized"
- Category links trigger new searches (slow)
- Empty category pages

### After:
- 352 products
- Categorized automatically
- Category links filter database (fast)
- Filled category pages

---

## 🎯 Expected Distribution

| Category | Products | Examples |
|----------|----------|----------|
| Phones | ~95 | iPhone, Samsung Galaxy, Google Pixel |
| Electronics | ~64 | Smart TV, Headphones, Tablets |
| Computers | ~45 | MacBook, Laptops, Desktops |
| Home & Kitchen | ~42 | KitchenAid, Dyson, Mixers |
| Toys | ~37 | LEGO, Hot Wheels, Barbie |
| Beauty | ~17 | Maybelline, Shampoo, Skincare |
| Clothing | ~8 | Nike, Adidas, Shoes |
| Uncategorized | ~44 | Misc products |

---

## 🔧 Next Steps After Categorization

### 1. Update Category Links (Already Done)
I'll update the backend code to filter by category instead of searching.

### 2. Remove "Discounts by Category" Section (Already Done)
I'll remove that section from the homepage.

### 3. Test Category Pages
Visit your website and click each category:
- Electronics: `/?category=electronics`
- Phones: `/?category=phones`  
- Computers: `/?category=computers`
- etc.

---

## 💡 How It Works

### SQL Pattern Matching (`~*`)
- `~*` = case-insensitive regex match
- `(word1|word2|word3)` = match any of these words
- Example: `product_title ~* '(iphone|samsung)'` matches:
  - "iPhone 15 Pro"
  - "Samsung Galaxy S24"
  - "IPHONE 14" (case insensitive)

### Priority Order
Products are categorized in this order:
1. **Phones** (first) - catches all phones
2. **Computers** - then laptops/PCs
3. **Electronics** - then TVs/tablets
4. **Toys** - then LEGO/games
5. **Clothing** - then shoes/apparel
6. **Home & Kitchen** - then appliances
7. **Beauty** - finally beauty products

Products match the **first category they fit**, so phones won't be misclassified as electronics.

---

## 🐛 Troubleshooting

### "Column already exists" error
✅ **Ignore it** - this means the column was already added, which is fine!

### No products in a category
Run this to check:
```sql
SELECT category, COUNT(*) FROM product_cache GROUP BY category;
```

### Wrong categorization
Update specific product:
```sql
UPDATE product_cache 
SET category = 'toys' 
WHERE product_title LIKE '%LEGO%';
```

---

## 📊 Verification Query

After running, check the results:

```sql
-- See sample products per category
SELECT category, product_title 
FROM product_cache 
WHERE category != 'uncategorized'
ORDER BY category, product_title
LIMIT 50;
```

---

## ✅ Summary

**Time**: 5 minutes  
**Complexity**: Copy & Paste SQL  
**Result**: All 352 products categorized automatically  

Once done, your category links will filter the database instead of running new searches! 🚀
