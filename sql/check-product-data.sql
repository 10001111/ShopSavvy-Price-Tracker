-- Check what data is actually in product_cache
SELECT
  product_id,
  product_title,
  price,
  currency,
  source,
  available_quantity,
  rating,
  created_at
FROM product_cache
ORDER BY created_at DESC
LIMIT 10;
