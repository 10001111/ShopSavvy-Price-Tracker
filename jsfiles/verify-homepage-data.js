/**
 * Comprehensive verification script:
 * 1. Check for zero-price products in database
 * 2. Verify currency distribution
 * 3. Test what getHighlightedDeals() returns
 * 4. Test what getPopularProducts() returns
 * 5. Show what prices would display on homepage
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Import the actual function from supabase-db.js
const supabaseDb = require('./src/backend/supabase-db.js');

async function verifyHomepageData() {
  console.log('🔍 COMPREHENSIVE HOMEPAGE DATA VERIFICATION\n');
  console.log('='.repeat(70));

  // 1. Check for zero-price products
  console.log('\n📊 Step 1: Checking for zero-price products\n');
  const { count: zeroCount } = await supabase
    .from('product_cache')
    .select('*', { count: 'exact', head: true })
    .or('price.is.null,price.eq.0');

  if (zeroCount > 0) {
    console.log(`❌ PROBLEM: Found ${zeroCount} products with zero/null prices!`);
    const { data: zeroProducts } = await supabase
      .from('product_cache')
      .select('product_id, product_title, price, currency')
      .or('price.is.null,price.eq.0')
      .limit(5);
    console.log('Sample zero-price products:');
    zeroProducts?.forEach(p => {
      console.log(`  - ${p.product_id}: ${p.product_title?.substring(0, 50)}... (${p.currency} ${p.price})`);
    });
  } else {
    console.log('✅ NO zero-price products found');
  }

  // 2. Check currency distribution
  console.log('\n💱 Step 2: Currency Distribution\n');
  const { data: allProducts } = await supabase
    .from('product_cache')
    .select('currency, price')
    .gt('price', 0);

  const currencyCounts = {};
  allProducts?.forEach(p => {
    const curr = p.currency || 'UNKNOWN';
    currencyCounts[curr] = (currencyCounts[curr] || 0) + 1;
  });

  console.log('Currency breakdown:');
  Object.entries(currencyCounts).forEach(([curr, count]) => {
    console.log(`  - ${curr}: ${count} products`);
  });

  // 3. Test getHighlightedDeals()
  console.log('\n🌟 Step 3: Testing getHighlightedDeals()\n');
  const deals = await supabaseDb.getHighlightedDeals({ limit: 5 });
  console.log(`Returned ${deals.length} deals`);
  if (deals.length > 0) {
    console.log('Sample deals:');
    deals.slice(0, 3).forEach((d, i) => {
      console.log(`  ${i + 1}. ${d.product_title?.substring(0, 50)}...`);
      console.log(`     - current_price: ${d.current_price}`);
      console.log(`     - currency: ${d.currency}`);
      console.log(`     - Will display as: ${d.currency} ${d.current_price.toFixed(2)}`);
    });
  }

  // 4. Test getPopularProducts()
  console.log('\n🔥 Step 4: Testing getPopularProducts()\n');
  const popular = await supabaseDb.getPopularProducts({ limit: 5 });
  console.log(`Returned ${popular.length} products`);
  if (popular.length > 0) {
    console.log('Sample popular products:');
    popular.slice(0, 3).forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.product_title?.substring(0, 50)}...`);
      console.log(`     - current_price: ${p.current_price}`);
      console.log(`     - currency: ${p.currency}`);
      console.log(`     - Will display as: ${p.currency} ${p.current_price.toFixed(2)}`);
    });
  }

  // 5. Check what homepage would actually display
  console.log('\n🎨 Step 5: Simulating Homepage Display\n');

  function formatPrice(value, currency = "MXN") {
    if (typeof value !== "number" || Number.isNaN(value) || value === 0) {
      return "N/A";
    }
    const formatted = value.toLocaleString("en-US", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return formatted;
  }

  console.log('How prices would render on homepage:');
  if (popular.length > 0) {
    popular.slice(0, 3).forEach((p, i) => {
      console.log(`  ${i + 1}. "${p.product_title?.substring(0, 40)}..."`);
      console.log(`     - Raw data: price=${p.current_price}, currency=${p.currency}`);
      console.log(`     - Displayed as (hardcoded MXN): ${formatPrice(p.current_price, "MXN")}`);
      console.log(`     - Should display as (using product currency): ${formatPrice(p.current_price, p.currency)}`);
    });
  }

  // 6. Summary
  console.log('\n' + '='.repeat(70));
  console.log('📋 SUMMARY\n');
  console.log(`✅ Total products in cache: ${allProducts?.length || 0}`);
  console.log(`${zeroCount > 0 ? '❌' : '✅'} Zero-price products: ${zeroCount}`);
  console.log(`✅ Highlighted deals: ${deals.length}`);
  console.log(`✅ Popular products: ${popular.length}`);

  if (deals.length === 0 && popular.length === 0) {
    console.log('\n⚠️  WARNING: No deals or popular products to display on homepage!');
    console.log('   This means the homepage will be empty.');
  }

  console.log('\n🔧 ISSUE IDENTIFIED:');
  console.log('   Products are stored with currency="USD" in database');
  console.log('   But homepage hardcodes formatPrice(price, "MXN")');
  console.log('   Solution: Use formatPrice(price, product.currency) instead');

  console.log('\n' + '='.repeat(70));
}

verifyHomepageData()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
