/**
 * Clean Zero-Price Products Script
 * Removes products with price = 0 or NULL from product_cache
 * Run with: node clean-zero-prices.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanZeroPriceProducts() {
  console.log('🔍 Starting cleanup of zero-price products...\n');

  // Step 1: Count products with zero/null prices
  const { count: zeroCount, error: countError } = await supabase
    .from('product_cache')
    .select('*', { count: 'exact', head: true })
    .or('price.is.null,price.eq.0');

  if (countError) {
    console.error('❌ Error counting zero-price products:', countError);
    return;
  }

  console.log(`📊 Found ${zeroCount} products with zero or null prices`);

  if (zeroCount === 0) {
    console.log('✅ No products to clean. Database is already clean!');
    return;
  }

  // Step 2: Get sample products before deletion (for logging)
  const { data: samples } = await supabase
    .from('product_cache')
    .select('product_id, product_title, price')
    .or('price.is.null,price.eq.0')
    .limit(5);

  console.log('\n🔍 Sample products to be deleted:');
  samples?.forEach((p, i) => {
    console.log(`  ${i + 1}. ${p.product_title?.substring(0, 50)} (price: ${p.price})`);
  });

  // Step 3: Delete products with zero/null prices
  console.log(`\n🗑️  Deleting ${zeroCount} products...`);

  const { error: deleteError } = await supabase
    .from('product_cache')
    .delete()
    .or('price.is.null,price.eq.0');

  if (deleteError) {
    console.error('❌ Error deleting products:', deleteError);
    return;
  }

  console.log(`✅ Successfully deleted ${zeroCount} products with zero/null prices`);

  // Step 4: Verify cleanup
  const { count: remainingCount } = await supabase
    .from('product_cache')
    .select('*', { count: 'exact', head: true });

  console.log(`\n📊 Database status after cleanup:`);
  console.log(`  - Products remaining: ${remainingCount}`);
  console.log(`  - Products deleted: ${zeroCount}`);

  // Step 5: Show sample of remaining products
  const { data: remaining } = await supabase
    .from('product_cache')
    .select('product_id, product_title, price, currency')
    .order('last_updated', { ascending: false })
    .limit(5);

  console.log(`\n✅ Sample of remaining products (with valid prices):`);
  remaining?.forEach((p, i) => {
    console.log(`  ${i + 1}. ${p.product_title?.substring(0, 40)} - ${p.currency} ${p.price}`);
  });

  console.log('\n✅ Cleanup complete! Restart your server to see the changes.');
}

// Run the cleanup
cleanZeroPriceProducts()
  .then(() => {
    console.log('\n🎉 Script finished successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
