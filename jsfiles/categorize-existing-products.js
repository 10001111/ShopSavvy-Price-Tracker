/**
 * Categorize All Existing Products in Database
 *
 * Updates all 118 "uncategorized" products with proper categories
 * based on their product titles.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Smart category detection based on product title
function detectCategory(title) {
  if (!title) return 'uncategorized';

  const titleLower = title.toLowerCase();

  // Strong indicators (highest priority)
  const strongIndicators = {
    phones: [
      'iphone', 'samsung galaxy', 'google pixel', 'motorola edge',
      'oneplus', 'xiaomi', 'huawei', 'oppo', 'vivo', 'realme',
      'smartphone', 'celular', 'teléfono móvil'
    ],
    computers: [
      'macbook', 'laptop', 'gaming laptop', 'desktop pc', 'imac',
      'chromebook', 'ultrabook', 'workstation', 'computadora',
      'portátil', 'pc gamer'
    ],
    electronics: [
      'smart tv', 'television', 'televisión', 'sony headphones',
      'airpods', 'earbuds', 'speaker', 'altavoz', 'nintendo switch',
      'playstation', 'xbox', 'ipad', 'tablet', 'kindle',
      'gopro', 'camera', 'cámara', 'drone', 'smartwatch'
    ],
    toys: [
      'lego', 'playmobil', 'hot wheels', 'barbie', 'funko pop',
      'nerf', 'juguete', 'muñeca', 'board game', 'puzzle',
      'action figure', 'doll house', 'rc car', 'toy car'
    ],
    clothing: [
      'nike', 'adidas', 'puma', 'under armour', 'jordan',
      'shoes', 'sneakers', 'zapatos', 'tenis', 'hoodie',
      'jacket', 'jeans', 'pants', 'shirt', 'dress',
      'camisa', 'pantalón', 'chamarra', 'sudadera'
    ],
    'home-kitchen': [
      'kitchenaid', 'instant pot', 'ninja blender', 'cuisinart',
      'dyson', 'vacuum', 'aspiradora', 'mixer', 'batidora',
      'toaster', 'coffee maker', 'air fryer', 'microwave',
      'bed', 'mattress', 'pillow', 'sofa', 'chair', 'table',
      'cama', 'colchón', 'almohada', 'mueble'
    ],
    beauty: [
      'maybelline', 'l\'oreal', 'neutrogena', 'cerave', 'dove',
      'makeup', 'maquillaje', 'lipstick', 'mascara', 'foundation',
      'shampoo', 'champú', 'conditioner', 'moisturizer',
      'sunscreen', 'perfume', 'cologne', 'skincare'
    ]
  };

  // Check strong indicators first
  for (const [category, keywords] of Object.entries(strongIndicators)) {
    for (const keyword of keywords) {
      if (titleLower.includes(keyword)) {
        return category;
      }
    }
  }

  // Exclusion rules (prevent misclassification)
  const exclusionRules = {
    phones: ['case', 'cover', 'charger', 'cable', 'screen protector', 'holder'],
    computers: ['toy', 'lego', 'miniature', 'sticker', 'poster', 'book'],
    electronics: ['toy', 'lego', 'book', 'poster', 'sticker']
  };

  // Score-based matching for remaining products
  const categoryScores = {};

  // Electronics keywords
  const electronicsWords = ['electronic', 'digital', 'wireless', 'bluetooth', 'usb', 'hdmi'];
  electronicsWords.forEach(word => {
    if (titleLower.includes(word)) {
      categoryScores.electronics = (categoryScores.electronics || 0) + 1;
    }
  });

  // Home & Kitchen keywords
  const homeWords = ['kitchen', 'home', 'casa', 'cocina', 'stainless', 'ceramic'];
  homeWords.forEach(word => {
    if (titleLower.includes(word)) {
      categoryScores['home-kitchen'] = (categoryScores['home-kitchen'] || 0) + 1;
    }
  });

  // Find highest score
  let maxScore = 0;
  let bestCategory = 'uncategorized';

  for (const [category, score] of Object.entries(categoryScores)) {
    if (score > maxScore) {
      maxScore = score;
      bestCategory = category;
    }
  }

  return bestCategory;
}

async function categorizeAllProducts() {
  console.log('🏷️  Starting product categorization...\n');

  // 1. Fetch all products
  const { data: products, error } = await supabase
    .from('product_cache')
    .select('*');

  if (error) {
    console.error('❌ Error fetching products:', error);
    return;
  }

  console.log(`📊 Total products to categorize: ${products.length}\n`);

  // 2. Categorize each product
  const categoryCounts = {
    electronics: 0,
    phones: 0,
    computers: 0,
    toys: 0,
    clothing: 0,
    'home-kitchen': 0,
    beauty: 0,
    uncategorized: 0
  };

  const updates = [];

  for (const product of products) {
    const category = detectCategory(product.product_title);
    categoryCounts[category] = (categoryCounts[category] || 0) + 1;

    updates.push({
      product_id: product.product_id,
      category: category,
      title: product.product_title
    });
  }

  console.log('📊 Category Distribution:');
  Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, count]) => {
      console.log(`   ${cat}: ${count}`);
    });
  console.log('');

  // 3. Update database
  console.log('💾 Updating database...\n');

  let updated = 0;
  let failed = 0;

  for (const { product_id, category, title } of updates) {
    const { error } = await supabase
      .from('product_cache')
      .update({ category })
      .eq('product_id', product_id);

    if (error) {
      console.log(`❌ Failed to update: ${title.slice(0, 50)}`);
      console.log(`   Error: ${error.message}`);
      failed++;
    } else {
      updated++;
      if (updated % 20 === 0) {
        console.log(`✅ Updated ${updated}/${updates.length} products...`);
      }
    }
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('✅ CATEGORIZATION COMPLETE');
  console.log('='.repeat(60));
  console.log(`Total products: ${products.length}`);
  console.log(`Successfully updated: ${updated}`);
  console.log(`Failed: ${failed}`);
  console.log('');

  // 4. Show sample products per category
  console.log('📋 Sample Products per Category:\n');

  for (const [category, count] of Object.entries(categoryCounts)) {
    if (count > 0 && category !== 'uncategorized') {
      console.log(`${category.toUpperCase()} (${count} products):`);
      const samples = updates
        .filter(u => u.category === category)
        .slice(0, 3);
      samples.forEach(s => {
        console.log(`   - ${s.title.slice(0, 60)}`);
      });
      console.log('');
    }
  }

  console.log('🎉 All products have been categorized!');
  console.log('💡 Now category links will filter the database properly.\n');
}

categorizeAllProducts();
