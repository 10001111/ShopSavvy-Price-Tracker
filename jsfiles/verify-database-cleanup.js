/**
 * Verify Database Cleanup Script
 *
 * Confirms that all Amazon US products have been removed
 * and the database is ready for fresh Mexico products.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyDatabaseCleanup() {
  console.log('🔍 Verifying database cleanup...\n');

  // 1. Check total products
  const { data: allProducts, error: allError } = await supabase
    .from('product_cache')
    .select('*');

  if (allError) {
    console.error('❌ Error fetching products:', allError);
    return;
  }

  console.log(`📊 Total products in database: ${allProducts.length}`);

  if (allProducts.length === 0) {
    console.log('✅ Database is completely clean and ready for fresh Mexico products!\n');
    console.log('📋 Next Steps:');
    console.log('1. Deploy the Apify actor to cloud (https://console.apify.com/)');
    console.log('2. Trigger a search on your website');
    console.log('3. The actor will scrape amazon.com.mx and mercadolibre.com.mx');
    console.log('4. New products will populate the database with MXN prices\n');
    return;
  }

  // 2. Check for Amazon US products (should be 0)
  const amazonUSProducts = allProducts.filter(p =>
    p.source === 'amazon' &&
    p.product_url &&
    !p.product_url.includes('amazon.com.mx')
  );

  console.log(`🔍 Amazon US products remaining: ${amazonUSProducts.length}`);

  if (amazonUSProducts.length > 0) {
    console.log('\n⚠️  Found Amazon US products that need removal:');
    amazonUSProducts.forEach(p => {
      console.log(`   - ${p.title} (${p.product_url})`);
    });
  }

  // 3. Check for USD products (should be 0)
  const usdProducts = allProducts.filter(p => p.currency === 'USD');
  console.log(`💵 USD products remaining: ${usdProducts.length}`);

  if (usdProducts.length > 0) {
    console.log('\n⚠️  Found USD products that need removal:');
    usdProducts.forEach(p => {
      console.log(`   - ${p.title} (${p.currency})`);
    });
  }

  // 4. Check for zero price products (should be 0)
  const zeroPriceProducts = allProducts.filter(p => !p.price || p.price <= 0);
  console.log(`🔢 Zero-price products remaining: ${zeroPriceProducts.length}`);

  if (zeroPriceProducts.length > 0) {
    console.log('\n⚠️  Found zero-price products that need removal:');
    zeroPriceProducts.forEach(p => {
      console.log(`   - ${p.title} (Price: ${p.price})`);
    });
  }

  // 5. Check for Amazon Mexico products (good data)
  const amazonMXProducts = allProducts.filter(p =>
    p.source === 'amazon' &&
    p.product_url &&
    p.product_url.includes('amazon.com.mx')
  );

  console.log(`\n✅ Amazon Mexico products: ${amazonMXProducts.length}`);

  // 6. Check for Mercado Libre products (good data)
  const mercadoLibreProducts = allProducts.filter(p =>
    p.source === 'mercadolibre'
  );

  console.log(`✅ Mercado Libre products: ${mercadoLibreProducts.length}`);

  // 7. Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 CLEANUP VERIFICATION SUMMARY');
  console.log('='.repeat(50));
  console.log(`Total products: ${allProducts.length}`);
  console.log(`❌ Amazon US products: ${amazonUSProducts.length} (should be 0)`);
  console.log(`❌ USD products: ${usdProducts.length} (should be 0)`);
  console.log(`❌ Zero-price products: ${zeroPriceProducts.length} (should be 0)`);
  console.log(`✅ Amazon Mexico products: ${amazonMXProducts.length}`);
  console.log(`✅ Mercado Libre products: ${mercadoLibreProducts.length}`);
  console.log('='.repeat(50));

  if (amazonUSProducts.length === 0 && usdProducts.length === 0 && zeroPriceProducts.length === 0) {
    console.log('\n🎉 DATABASE IS CLEAN! Ready for fresh Mexico products.');
  } else {
    console.log('\n⚠️  Database still has issues. Run cleanup script again.');
  }
}

verifyDatabaseCleanup();
