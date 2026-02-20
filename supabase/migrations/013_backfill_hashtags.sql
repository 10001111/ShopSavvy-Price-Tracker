-- =============================================
-- Migration 013: Backfill hashtags for existing products
-- Generates hashtags based on product titles
-- =============================================

-- This migration uses PostgreSQL's powerful text matching to generate hashtags
-- based on product titles for all existing products in product_cache

-- Function to generate hashtags based on title
CREATE OR REPLACE FUNCTION generate_product_hashtags(title TEXT)
RETURNS TEXT[] AS $$
DECLARE
  tags TEXT[] := '{}';
  lower_title TEXT;
BEGIN
  lower_title := LOWER(title);

  -- Exclusion check functions
  -- Phone exclusions
  IF lower_title ~* '\b(case|cover|holder|mount|charger|cable|screen protector|funda|cargador|protector|soporte)\b' THEN
    -- Skip phone tag if it's an accessory
    NULL;
  -- Phones
  ELSIF lower_title ~* '\b(iphone|samsung galaxy|google pixel|motorola|xiaomi|redmi|oneplus|smartphone|celular|telefono|teléfono)\b' THEN
    tags := array_append(tags, 'phone');
    tags := array_append(tags, 'electronics');
  END IF;

  -- Laptop exclusions
  IF lower_title ~* '\b(case|bag|mochila|sticker|pegatina|mousepad|alfombrilla)\b' THEN
    -- Skip laptop tag if it's an accessory
    NULL;
  -- Laptops / Computers
  ELSIF lower_title ~* '\b(macbook|laptop|notebook|chromebook|computadora)\b' THEN
    tags := array_append(tags, 'laptop');
    tags := array_append(tags, 'electronics');
  END IF;

  -- Gaming
  IF lower_title ~* '\b(playstation|ps5|ps4|xbox|nintendo|gaming|videojuego|video game|game controller|mando)\b' THEN
    IF NOT (lower_title ~* '\b(toy|juguete)\b') THEN
      tags := array_append(tags, 'gaming');
      tags := array_append(tags, 'electronics');
    END IF;
  END IF;

  -- General Electronics (skip if marked as toy/replica)
  IF lower_title ~* '\b(ipad|tablet|smart tv|televisión|television|\btv\b|airpods|headphones|audifonos|audífonos|camera|cámara|smartwatch|apple watch|drone|earbuds|speaker)\b' THEN
    IF NOT (lower_title ~* '\b(toy|juguete|replica|poster|sticker)\b') THEN
      tags := array_append(tags, 'electronics');
    END IF;
  END IF;

  -- Toys (always include if toy keywords present)
  IF lower_title ~* '\b(lego|barbie|hot wheels|funko|nerf|playmobil|juguete|\btoy\b|board game|juego de mesa)\b' THEN
    tags := array_append(tags, 'toys');
  END IF;

  -- Clothing
  IF lower_title ~* '\b(nike|adidas|sneakers|tenis|zapatos|shirt|camisa|jeans|pants|pantalon|vestido|dress|jacket|chaqueta)\b' THEN
    IF NOT (lower_title ~* '\b(toy|juguete|doll clothes|ropa muñeca)\b') THEN
      tags := array_append(tags, 'clothing');
    END IF;
  END IF;

  -- Home & Kitchen
  IF lower_title ~* '\b(dyson|instant pot|kitchenaid|blender|licuadora|vacuum|aspiradora|coffee maker|cafetera|microwave|microondas|refrigerator|refrigerador)\b' THEN
    IF NOT (lower_title ~* '\b(toy|juguete|miniature|miniatura)\b') THEN
      tags := array_append(tags, 'home');
    END IF;
  END IF;

  -- Sports
  IF lower_title ~* '\b(treadmill|caminadora|weights|pesas|dumbbell|yoga|bicicleta|bike|fitness|gymnasium|gimnasio)\b' THEN
    IF NOT (lower_title ~* '\b(toy|juguete|video game|videojuego)\b') THEN
      tags := array_append(tags, 'sports');
    END IF;
  END IF;

  -- Beauty
  IF lower_title ~* '\b(perfume|colonia|shampoo|champú|champu|makeup|maquillaje|skincare|cream|crema|lipstick|eyeliner)\b' THEN
    IF NOT (lower_title ~* '\b(toy|juguete)\b') THEN
      tags := array_append(tags, 'beauty');
    END IF;
  END IF;

  RETURN tags;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Update all existing products with generated hashtags
UPDATE public.product_cache
SET hashtags = generate_product_hashtags(product_title)
WHERE hashtags IS NULL OR hashtags = '{}';

-- Get stats
DO $$
DECLARE
  total_products INTEGER;
  tagged_products INTEGER;
  untagged_products INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_products FROM public.product_cache;
  SELECT COUNT(*) INTO tagged_products FROM public.product_cache WHERE array_length(hashtags, 1) > 0;
  SELECT COUNT(*) INTO untagged_products FROM public.product_cache WHERE hashtags IS NULL OR hashtags = '{}';

  RAISE NOTICE 'Migration 013 Complete:';
  RAISE NOTICE '  Total products: %', total_products;
  RAISE NOTICE '  Tagged products: %', tagged_products;
  RAISE NOTICE '  Untagged products: %', untagged_products;
END $$;

-- Drop the temporary function (it's now embedded in the app code)
DROP FUNCTION IF EXISTS generate_product_hashtags(TEXT);

-- Success message
SELECT 'Migration 013: Hashtags backfilled successfully!' AS status;
