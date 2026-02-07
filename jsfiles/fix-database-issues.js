/**
 * Fix database issues:
 * 1. Drop duplicate/unused product tables
 * 2. Clean remaining zero-price products
 * 3. Verify product_cache integrity
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixDatabaseIssues() {
  console.log('🔧 Starting database cleanup...\n');

  // Step 1: Check current zero-price products
  console.log('📊 Step 1: Checking zero-price products\n');

  const { count: zeroPriceCount, error: countError } = await supabase
    .from('product_cache')
    .select('*', { count: 'exact', head: true })
    .or('price.is.null,price.eq.0');

  if (countError) {
    console.error('❌ Error counting zero-price products:', countError);
  } else {
    console.log(`Found ${zeroPriceCount} products with zero or null prices\n`);

    if (zeroPriceCount > 0) {
      const { data: zeroProducts } = await supabase
        .from('product_cache')
        .select('product_id, product_title, price, source')
        .or('price.is.null,price.eq.0');

      console.log('Zero-price products:');
      zeroProducts?.forEach((p, i) => {
        console.log(`  ${i + 1}. ${p.product_id} - ${p.product_title?.substring(0, 60)}... (${p.source}, price: ${p.price})`);
      });
      console.log('');
    }
  }

  // Step 2: Delete zero-price products
  console.log('🗑️  Step 2: Deleting zero-price products\n');

  const { error: deleteError } = await supabase
    .from('product_cache')
    .delete()
    .or('price.is.null,price.eq.0');

  if (deleteError) {
    console.error('❌ Error deleting zero-price products:', deleteError);
  } else {
    console.log(`✅ Successfully deleted ${zeroPriceCount} products with zero/null prices\n`);
  }

  // Step 3: Verify remaining products
  console.log('✅ Step 3: Verifying remaining products\n');

  const { count: remainingCount } = await supabase
    .from('product_cache')
    .select('*', { count: 'exact', head: true });

  console.log(`Total products remaining: ${remainingCount}\n`);

  const { data: validProducts } = await supabase
    .from('product_cache')
    .select('product_id, product_title, price, currency, source')
    .gt('price', 0)
    .order('price', { ascending: false })
    .limit(10);

  console.log('Sample of valid products (top 10 by price):');
  validProducts?.forEach((p, i) => {
    console.log(`  ${i + 1}. ${p.product_title?.substring(0, 50)}... - ${p.currency} ${p.price} (${p.source})`);
  });

  // Step 4: Note about duplicate tables
  console.log('\n📋 Step 4: Note about duplicate tables\n');
  console.log('⚠️  The following tables exist but are UNUSED:');
  console.log('  - products');
  console.log('  - cached_products');
  console.log('  - product_data');
  console.log('  - user_tracked_products');
  console.log('  - product_categories');
  console.log('\nThese tables can be safely dropped using Supabase dashboard:');
  console.log('1. Go to: https://supabase.com/dashboard/project/[YOUR_PROJECT]/editor');
  console.log('2. Click on each table name');
  console.log('3. Click "Delete table" from the options');
  console.log('\nOR use SQL Editor:');
  console.log('DROP TABLE IF EXISTS products, cached_products, product_data, user_tracked_products, product_categories;');

  console.log('\n✅ Database cleanup complete!');
}

fixDatabaseIssues()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
