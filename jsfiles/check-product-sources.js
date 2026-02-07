/**
 * Check Product Sources and Category Distribution
 *
 * Analyzes the product_cache table to see:
 * - How many products from Amazon vs Mercado Libre
 * - Product distribution across categories
 * - Identify duplicates
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function analyzeProducts() {
  console.log('🔍 Analyzing Product Sources and Categories...\n');

  // 1. Get all products
  const { data: allProducts, error } = await supabase
    .from('product_cache')
    .select('*');

  if (error) {
    console.error('❌ Error fetching products:', error);
    return;
  }

  console.log(`📊 Total products in database: ${allProducts.length}\n`);

  if (allProducts.length === 0) {
    console.log('⚠️  Database is empty. Need to trigger searches to populate it.\n');
    console.log('💡 Suggestion: Visit your website and search for:');
    console.log('   - "iPhone" (Phones category)');
    console.log('   - "Samsung TV" (Electronics category)');
    console.log('   - "LEGO" (Toys category)');
    console.log('   - "Nike shoes" (Clothing category)\n');
    return;
  }

  // 2. Count by source
  const sourceCount = {
    amazon: allProducts.filter(p => p.source === 'amazon').length,
    mercadolibre: allProducts.filter(p => p.source === 'mercadolibre').length,
    other: allProducts.filter(p => p.source !== 'amazon' && p.source !== 'mercadolibre').length
  };

  console.log('📦 Products by Source:');
  console.log(`   Amazon: ${sourceCount.amazon}`);
  console.log(`   Mercado Libre: ${sourceCount.mercadolibre}`);
  console.log(`   Other: ${sourceCount.other}\n`);

  // 3. Check if Mercado Libre is working
  if (sourceCount.mercadolibre === 0) {
    console.log('⚠️  WARNING: No Mercado Libre products found!');
    console.log('   This means the Mercado Libre scraper might not be working.\n');
  } else {
    console.log('✅ Mercado Libre scraper is working!\n');

    // Show sample ML products
    const mlProducts = allProducts.filter(p => p.source === 'mercadolibre').slice(0, 3);
    console.log('📋 Sample Mercado Libre Products:');
    mlProducts.forEach(p => {
      console.log(`   - ${p.title.slice(0, 60)} ($${p.price} ${p.currency})`);
    });
    console.log('');
  }

  // 4. Count by category
  const categoryCount = {};
  allProducts.forEach(p => {
    const cat = p.category || 'uncategorized';
    categoryCount[cat] = (categoryCount[cat] || 0) + 1;
  });

  console.log('📂 Products by Category:');
  Object.entries(categoryCount)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, count]) => {
      console.log(`   ${cat}: ${count}`);
    });
  console.log('');

  // 5. Check for duplicates (same title from different sources)
  const titleMap = new Map();
  allProducts.forEach(p => {
    if (!p.title) return; // Skip products without titles
    const normalizedTitle = p.title.toLowerCase().trim();
    if (!titleMap.has(normalizedTitle)) {
      titleMap.set(normalizedTitle, []);
    }
    titleMap.get(normalizedTitle).push(p);
  });

  const duplicates = Array.from(titleMap.values()).filter(products => products.length > 1);

  console.log(`🔍 Duplicate Detection:`);
  console.log(`   Unique products: ${titleMap.size}`);
  console.log(`   Duplicate titles: ${duplicates.length}\n`);

  if (duplicates.length > 0) {
    console.log('📋 Sample Duplicates (showing first 5):');
    duplicates.slice(0, 5).forEach(products => {
      console.log(`\n   "${products[0].title.slice(0, 60)}"`);
      products.forEach(p => {
        console.log(`      - ${p.source}: $${p.price} ${p.currency}`);
      });
    });
    console.log('');
  }

  // 6. Check price validity
  const invalidPrices = allProducts.filter(p => !p.price || p.price <= 0);
  if (invalidPrices.length > 0) {
    console.log(`⚠️  Invalid Prices Found: ${invalidPrices.length} products with zero/null prices`);
    console.log('   These should have been filtered by the actor!\n');
  } else {
    console.log('✅ All products have valid prices\n');
  }

  // 7. Check stock status
  const outOfStock = allProducts.filter(p =>
    p.stock_status === 'out_of_stock' ||
    (p.available_quantity !== null && p.available_quantity <= 0)
  );

  if (outOfStock.length > 0) {
    console.log(`⚠️  Out of Stock Products: ${outOfStock.length}`);
    console.log('   These should be filtered from deal sections!\n');
  } else {
    console.log('✅ All products are in stock\n');
  }

  // 8. Summary
  console.log('='.repeat(60));
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total Products: ${allProducts.length}`);
  console.log(`Amazon: ${sourceCount.amazon} | Mercado Libre: ${sourceCount.mercadolibre}`);
  console.log(`Categories: ${Object.keys(categoryCount).length}`);
  console.log(`Duplicates: ${duplicates.length}`);
  console.log(`Invalid Prices: ${invalidPrices.length}`);
  console.log(`Out of Stock: ${outOfStock.length}`);
  console.log('='.repeat(60));

  // 9. Recommendations
  console.log('\n💡 Recommendations:');

  if (sourceCount.mercadolibre === 0) {
    console.log('   ❌ Mercado Libre scraper needs debugging');
  }

  if (duplicates.length > 10) {
    console.log('   ⚠️  Consider implementing duplicate detection');
  }

  if (invalidPrices.length > 0) {
    console.log('   ⚠️  Clean up products with invalid prices');
  }

  if (Object.keys(categoryCount).length < 5) {
    console.log('   💡 Run searches for more categories to populate database');
  }

  console.log('');
}

analyzeProducts();
