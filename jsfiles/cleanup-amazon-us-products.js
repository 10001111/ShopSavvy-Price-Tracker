/**
 * Cleanup Script: Remove Amazon US Products
 *
 * This script removes products from Amazon US and keeps only Amazon Mexico products.
 * Run this after deploying the updated Apify actor to clean old US data.
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanupAmazonUSProducts() {
  console.log('🧹 Starting cleanup of Amazon US products...\n');

  try {
    // Step 1: Check current product count
    const { count: totalBefore, error: countError } = await supabase
      .from('product_cache')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      console.error('❌ Error counting products:', countError);
      return;
    }

    console.log(`📊 Total products in cache: ${totalBefore}`);

    // Step 2: Identify Amazon US products
    // Amazon US URLs contain "amazon.com" (not "amazon.com.mx")
    const { data: usProducts, error: fetchError } = await supabase
      .from('product_cache')
      .select('product_id, product_title, product_url, price, currency')
      .eq('source', 'amazon')
      .or('product_url.not.like.%amazon.com.mx%,product_url.like.%amazon.com%');

    if (fetchError) {
      console.error('❌ Error fetching US products:', fetchError);
      return;
    }

    console.log(`\n🔍 Found ${usProducts.length} Amazon US products to remove:\n`);

    if (usProducts.length > 0) {
      // Show sample products
      console.log('📦 Sample products to be deleted:');
      usProducts.slice(0, 5).forEach((p, i) => {
        console.log(`  ${i + 1}. ${p.product_title?.substring(0, 60)}...`);
        console.log(`     URL: ${p.product_url?.substring(0, 80)}`);
        console.log(`     Price: ${p.price} ${p.currency}`);
      });

      if (usProducts.length > 5) {
        console.log(`  ... and ${usProducts.length - 5} more\n`);
      }

      // Step 3: Delete Amazon US products
      const productIds = usProducts.map(p => p.product_id);

      const { error: deleteError } = await supabase
        .from('product_cache')
        .delete()
        .in('product_id', productIds);

      if (deleteError) {
        console.error('❌ Error deleting US products:', deleteError);
        return;
      }

      console.log(`\n✅ Deleted ${usProducts.length} Amazon US products`);
    } else {
      console.log('✅ No Amazon US products found (database already clean)');
    }

    // Step 4: Also clean products with zero prices
    console.log('\n🧹 Cleaning products with zero or null prices...');

    const { data: zeroPriceProducts, error: zeroError } = await supabase
      .from('product_cache')
      .delete()
      .or('price.eq.0,price.is.null')
      .select();

    if (zeroError) {
      console.error('❌ Error deleting zero-price products:', zeroError);
    } else {
      console.log(`✅ Deleted ${zeroPriceProducts?.length || 0} products with invalid prices`);
    }

    // Step 5: Clean products with USD currency
    console.log('\n🧹 Cleaning products with USD currency (should be MXN)...');

    const { data: usdProducts, error: usdError } = await supabase
      .from('product_cache')
      .delete()
      .eq('currency', 'USD')
      .select();

    if (usdError) {
      console.error('❌ Error deleting USD products:', usdError);
    } else {
      console.log(`✅ Deleted ${usdProducts?.length || 0} products with USD currency`);
    }

    // Step 6: Check final product count
    const { count: totalAfter, error: countAfterError } = await supabase
      .from('product_cache')
      .select('*', { count: 'exact', head: true });

    if (countAfterError) {
      console.error('❌ Error counting products after cleanup:', countAfterError);
      return;
    }

    console.log(`\n📊 Products remaining: ${totalAfter}`);
    console.log(`📉 Products removed: ${totalBefore - totalAfter}`);

    // Step 7: Verify remaining products are from Mexico
    console.log('\n🔍 Verifying remaining products...');

    const { data: remainingProducts, error: verifyError } = await supabase
      .from('product_cache')
      .select('source, currency, product_url')
      .limit(10);

    if (verifyError) {
      console.error('❌ Error verifying products:', verifyError);
      return;
    }

    console.log('\n📦 Sample of remaining products:');
    remainingProducts.forEach((p, i) => {
      const isMexicoAmazon = p.product_url?.includes('amazon.com.mx');
      const isMexicoML = p.product_url?.includes('mercadolibre.com.mx');
      const isValid = (isMexicoAmazon || isMexicoML) && p.currency === 'MXN';

      console.log(`  ${i + 1}. Source: ${p.source}, Currency: ${p.currency}`);
      console.log(`     URL: ${p.product_url?.substring(0, 80)}`);
      console.log(`     ${isValid ? '✅ Valid Mexico product' : '⚠️  WARNING: Not Mexico product'}`);
    });

    // Step 8: Summary statistics
    const { data: stats, error: statsError } = await supabase
      .from('product_cache')
      .select('source, currency')
      .limit(1000);

    if (!statsError && stats) {
      const byCurrency = {};
      const bySource = {};

      stats.forEach(p => {
        byCurrency[p.currency] = (byCurrency[p.currency] || 0) + 1;
        bySource[p.source] = (bySource[p.source] || 0) + 1;
      });

      console.log('\n📊 Database Statistics:');
      console.log('  By Currency:', byCurrency);
      console.log('  By Source:', bySource);
    }

    console.log('\n✅ Cleanup completed successfully!');
    console.log('\n📝 Next steps:');
    console.log('  1. Deploy updated Apify actor to Apify platform');
    console.log('  2. Trigger new search to scrape Amazon Mexico products');
    console.log('  3. Verify new products show Mexico URLs and MXN prices');

  } catch (error) {
    console.error('\n❌ Unexpected error during cleanup:', error);
  }
}

// Run cleanup
cleanupAmazonUSProducts()
  .then(() => {
    console.log('\n🎉 Script finished');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
