/**
 * Test Category Scraping
 *
 * Tests the Amazon scraper with various category-specific searches
 * to populate the database with diverse products.
 */

import { ApifyClient } from 'apify-client';
import dotenv from 'dotenv';

dotenv.config();

const ACTOR_ID = "f5pjkmpD15S3cqunX";
const BUILD = "1.0.4";

const client = new ApifyClient({ token: process.env.Apify_Token });

// Category-specific search queries
const categorySearches = [
  // Electronics
  { category: 'electronics', queries: ['Samsung TV 4K', 'Sony headphones', 'iPad', 'Nintendo Switch'] },

  // Phones
  { category: 'phones', queries: ['iPhone 15', 'Samsung Galaxy S24', 'Google Pixel 8', 'Motorola edge'] },

  // Computers
  { category: 'computers', queries: ['MacBook Air', 'Dell laptop', 'gaming PC', 'HP printer'] },

  // Toys
  { category: 'toys', queries: ['LEGO Star Wars', 'Hot Wheels', 'Barbie', 'Funko Pop Marvel'] },

  // Clothing
  { category: 'clothing', queries: ['Nike shoes', 'Adidas hoodie', 'Levi jeans', 'North Face jacket'] },

  // Home & Kitchen
  { category: 'home-kitchen', queries: ['KitchenAid mixer', 'Instant Pot', 'Dyson vacuum', 'Ninja blender'] },

  // Beauty
  { category: 'beauty', queries: ['Maybelline mascara', 'CeraVe moisturizer', 'Neutrogena sunscreen'] }
];

async function testCategoryScraping() {
  console.log('🧪 Testing Category Scraping with Amazon Mexico\n');
  console.log(`Using Actor: ${ACTOR_ID}`);
  console.log(`Build: ${BUILD}\n`);
  console.log('='.repeat(60));

  for (const { category, queries } of categorySearches) {
    console.log(`\n📂 Category: ${category.toUpperCase()}`);
    console.log('-'.repeat(60));

    for (const query of queries) {
      console.log(`\n🔍 Searching: "${query}"`);

      try {
        const startTime = Date.now();

        const run = await client.actor(ACTOR_ID).call(
          {
            source: 'amazon',
            query: query,
            maxResults: 3  // Just 3 per search for testing
          },
          {
            build: BUILD,
            waitSecs: 120,
            memory: 512
          }
        );

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        if (run.status === 'SUCCEEDED') {
          const { items } = await client.dataset(run.defaultDatasetId).listItems();
          console.log(`   ✅ Success! Found ${items.length} products in ${duration}s`);

          if (items.length > 0) {
            items.forEach((item, i) => {
              console.log(`   ${i + 1}. ${item.title?.slice(0, 50)}... - $${item.price} MXN`);
            });
          } else {
            console.log(`   ⚠️  No products found for "${query}"`);
          }
        } else {
          console.log(`   ❌ Failed with status: ${run.status}`);
        }

        // Small delay between searches to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('🎉 Category scraping test complete!');
  console.log('\n💡 Next steps:');
  console.log('   1. Check your database for new products');
  console.log('   2. Verify products are in correct categories');
  console.log('   3. Test the website to see variety');
}

testCategoryScraping();
