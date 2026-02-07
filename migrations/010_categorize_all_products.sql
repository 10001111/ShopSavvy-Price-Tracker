-- Migration 010: Categorize all existing products in database
-- Run this in Supabase SQL Editor to automatically categorize all 352 products

-- 1. Ensure category column exists
ALTER TABLE product_cache
ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'uncategorized';

-- 2. Reset all to uncategorized first
UPDATE product_cache SET category = 'uncategorized';

-- 3. Categorize phones (highest priority)
UPDATE product_cache SET category = 'phones'
WHERE product_title ~* '(iphone|samsung galaxy|google pixel|motorola|oneplus|xiaomi|huawei|oppo|smartphone|celular|teléfono móvil)';

-- 4. Categorize computers
UPDATE product_cache SET category = 'computers'
WHERE category = 'uncategorized'
AND product_title ~* '(macbook|laptop|gaming laptop|desktop|pc|chromebook|ultrabook|workstation|computadora|portátil)';

-- 5. Categorize electronics
UPDATE product_cache SET category = 'electronics'
WHERE category = 'uncategorized'
AND product_title ~* '(smart tv|television|televisión|headphones|airpods|earbuds|speaker|altavoz|nintendo switch|playstation|xbox|ipad|tablet|kindle|camera|cámara|drone|smartwatch|audífonos)';

-- 6. Categorize toys
UPDATE product_cache SET category = 'toys'
WHERE category = 'uncategorized'
AND product_title ~* '(lego|playmobil|hot wheels|barbie|funko pop|nerf|juguete|muñeca|board game|puzzle|action figure|doll house|toy)';

-- 7. Categorize clothing
UPDATE product_cache SET category = 'clothing'
WHERE category = 'uncategorized'
AND product_title ~* '(nike|adidas|puma|under armour|shoes|sneakers|zapatos|tenis|hoodie|jacket|jeans|pants|shirt|dress|camisa|pantalón|chamarra|sudadera)';

-- 8. Categorize home & kitchen
UPDATE product_cache SET category = 'home-kitchen'
WHERE category = 'uncategorized'
AND product_title ~* '(kitchenaid|instant pot|ninja|cuisinart|dyson|vacuum|aspiradora|mixer|batidora|toaster|coffee maker|air fryer|microwave|bed|mattress|pillow|sofa|chair|table|cama|colchón|almohada|mueble)';

-- 9. Categorize beauty
UPDATE product_cache SET category = 'beauty'
WHERE category = 'uncategorized'
AND product_title ~* '(maybelline|l.oreal|neutrogena|cerave|dove|makeup|maquillaje|lipstick|mascara|foundation|shampoo|champú|conditioner|moisturizer|sunscreen|perfume|cologne|skincare)';

-- 10. Show results
SELECT category, COUNT(*) as product_count
FROM product_cache
GROUP BY category
ORDER BY product_count DESC;
