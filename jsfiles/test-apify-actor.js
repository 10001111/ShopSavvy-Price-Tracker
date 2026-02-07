/**
 * Test Script: Verify Apify Actor Returns All Fields
 *
 * Run this to verify your deployed actor extracts:
 * - Rating
 * - Review count
 * - Available quantity (stock)
 * - Sold quantity
 * - Seller name
 * - Images
 * - All prices in MXN
 */

require('dotenv').config();
const { scrapeProducts } = require('./src/backend/apify');

async function testActor() {
  console.log('\n🧪 Testing Apify Actor: ShopSavvy-Price-Tracker');
  console.log('=' .repeat(60));

  try {
    // Test Amazon Mexico search
    console.log('\n📦 Test 1: Amazon Mexico - "iPhone"');
    console.log('-'.repeat(60));

    const amazonResults = await scrapeProducts({
      source: 'amazon',
      query: 'iphone',
      maxResults: 3
    });

    if (amazonResults.length === 0) {
      console.error('❌ No results from Amazon Mexico');
    } else {
      console.log(`✅ Found ${amazonResults.length} products from Amazon Mexico\n`);

      amazonResults.forEach((product, index) => {
        console.log(`\n📱 Product #${index + 1}:`);
        console.log('  ID:', product.id);
        console.log('  Title:', product.title?.substring(0, 60) + '...');
        console.log('  Price:', product.price, product.currency);
        console.log('  Rating:', product.rating ? `${product.rating}/5` : '❌ MISSING');
        console.log('  Review Count:', product.review_count ?? '❌ MISSING');
        console.log('  Available Qty:', product.available_quantity ?? '❌ MISSING');
        console.log('  Sold Qty:', product.sold_quantity ?? '❌ MISSING');
        console.log('  Stock Status:', product.stock_status ?? '❌ MISSING');
        console.log('  Seller:', product.seller || '❌ MISSING');
        console.log('  Images:', product.images?.length || 0, 'images');
        console.log('  URL:', product.url?.substring(0, 50) + '...');

        // Validation checks
        const issues = [];
        if (product.currency !== 'MXN') issues.push('Currency is not MXN');
        if (!product.url?.includes('amazon.com.mx')) issues.push('URL is not amazon.com.mx');
        if (product.rating === null || product.rating === undefined) issues.push('Rating missing');
        if (!product.review_count) issues.push('Review count missing');
        if (product.available_quantity === null || product.available_quantity === undefined) issues.push('Stock quantity missing');
        if (!product.seller) issues.push('Seller missing');
        if (!product.images || product.images.length === 0) issues.push('No images');

        if (issues.length > 0) {
          console.log('\n  ⚠️  Issues:', issues.join(', '));
        } else {
          console.log('\n  ✅ All fields present!');
        }
      });
    }

    // Test Mercado Libre search
    console.log('\n\n📦 Test 2: Mercado Libre - "laptop"');
    console.log('-'.repeat(60));

    const mlResults = await scrapeProducts({
      source: 'mercadolibre',
      query: 'laptop',
      maxResults: 2
    });

    if (mlResults.length === 0) {
      console.error('❌ No results from Mercado Libre');
    } else {
      console.log(`✅ Found ${mlResults.length} products from Mercado Libre\n`);

      mlResults.forEach((product, index) => {
        console.log(`\n💻 Product #${index + 1}:`);
        console.log('  ID:', product.id);
        console.log('  Title:', product.title?.substring(0, 60) + '...');
        console.log('  Price:', product.price, product.currency);
        console.log('  Rating:', product.rating ? `${product.rating}/5` : '❌ MISSING');
        console.log('  Review Count:', product.review_count ?? '❌ MISSING');
        console.log('  Available Qty:', product.available_quantity ?? '❌ MISSING');
        console.log('  Sold Qty:', product.sold_quantity ?? '❌ MISSING');
        console.log('  Stock Status:', product.stock_status ?? '❌ MISSING');
        console.log('  Seller:', product.seller || '❌ MISSING');
        console.log('  Images:', product.images?.length || 0, 'images');

        const issues = [];
        if (product.currency !== 'MXN') issues.push('Currency is not MXN');
        if (product.rating === null || product.rating === undefined) issues.push('Rating missing');
        if (!product.seller) issues.push('Seller missing');
        if (!product.images || product.images.length === 0) issues.push('No images');

        if (issues.length > 0) {
          console.log('\n  ⚠️  Issues:', issues.join(', '));
        } else {
          console.log('\n  ✅ All fields present!');
        }
      });
    }

    // Summary
    console.log('\n\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));
    console.log('Amazon Mexico products:', amazonResults.length);
    console.log('Mercado Libre products:', mlResults.length);
    console.log('Total products:', amazonResults.length + mlResults.length);

    const allProducts = [...amazonResults, ...mlResults];
    const withRating = allProducts.filter(p => p.rating).length;
    const withStock = allProducts.filter(p => p.available_quantity !== null && p.available_quantity !== undefined).length;
    const withSold = allProducts.filter(p => p.sold_quantity).length;
    const withSeller = allProducts.filter(p => p.seller).length;
    const allMXN = allProducts.filter(p => p.currency === 'MXN').length;

    console.log('\nField Coverage:');
    console.log(`  ⭐ Rating: ${withRating}/${allProducts.length} (${Math.round(withRating/allProducts.length*100)}%)`);
    console.log(`  📦 Stock: ${withStock}/${allProducts.length} (${Math.round(withStock/allProducts.length*100)}%)`);
    console.log(`  💰 Sold: ${withSold}/${allProducts.length} (${Math.round(withSold/allProducts.length*100)}%)`);
    console.log(`  🏪 Seller: ${withSeller}/${allProducts.length} (${Math.round(withSeller/allProducts.length*100)}%)`);
    console.log(`  💵 MXN Currency: ${allMXN}/${allProducts.length} (${Math.round(allMXN/allProducts.length*100)}%)`);

    if (allMXN === allProducts.length && withRating > 0 && withStock > 0 && withSeller > 0) {
      console.log('\n✅ Actor is working correctly!');
    } else {
      console.log('\n⚠️  Actor needs to be redeployed with latest code');
      console.log('   Run: cd src/backend/actor && apify push');
    }

  } catch (error) {
    console.error('\n❌ Error testing actor:', error.message);
    console.error(error.stack);
  }
}

testActor();
