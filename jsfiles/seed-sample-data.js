/**
 * Seed Sample Data Script
 * Populates product_cache with sample products for testing
 * Usage: node seed-sample-data.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Sample products to seed
const sampleProducts = [
  // iPhones
  {
    product_id: 'B0CHX3TZ7R',
    product_title: 'Apple iPhone 15 Pro Max, US Version, 256GB, Black Titanium - Unlocked (Renewed)',
    price: 1199.99,
    original_price: 1299.99,
    thumbnail: 'https://m.media-amazon.com/images/I/81SigpJN1KL._AC_SX679_.jpg',
    source: 'amazon',
    permalink: 'https://amazon.com/dp/B0CHX3TZ7R',
    search_query: 'iphone',
    available_quantity: 15,
  },
  {
    product_id: 'MLX73LZ/A',
    product_title: 'iPhone 16, US Version, 128GB, Pink - Unlocked (Renewed Premium)',
    price: 899.99,
    original_price: 999.99,
    thumbnail: 'https://m.media-amazon.com/images/I/71v2jVh6nIL._AC_SX679_.jpg',
    source: 'amazon',
    permalink: 'https://amazon.com/dp/MLX73LZ',
    search_query: 'iphone',
    available_quantity: 8,
  },
  {
    product_id: 'B0DGZKHW8F',
    product_title: 'Apple iPhone 15, 128GB, Blue - Unlocked',
    price: 729.99,
    original_price: 799.99,
    thumbnail: 'https://m.media-amazon.com/images/I/71657TiFeHL._AC_SX679_.jpg',
    source: 'amazon',
    permalink: 'https://amazon.com/dp/B0DGZKHW8F',
    search_query: 'iphone 15',
    available_quantity: 22,
  },

  // Laptops
  {
    product_id: 'B0CCP16LH1',
    product_title: 'HP 15.6" Business Laptop with Microsoft Office 365, AMD Ryzen 5, 16GB RAM, 512GB SSD',
    price: 439.99,
    original_price: 599.99,
    thumbnail: 'https://m.media-amazon.com/images/I/71F3BUkzz7L._AC_SX679_.jpg',
    source: 'amazon',
    permalink: 'https://amazon.com/dp/B0CCP16LH1',
    search_query: 'laptop',
    available_quantity: 12,
  },
  {
    product_id: 'B0CKX1F7QG',
    product_title: 'Acer Aspire 3 A315-24P-R7VH Slim Laptop, 15.6" FHD, AMD Ryzen 5, 8GB RAM, 512GB SSD',
    price: 349.99,
    original_price: 449.99,
    thumbnail: 'https://m.media-amazon.com/images/I/61S5u7gKziL._AC_SX679_.jpg',
    source: 'amazon',
    permalink: 'https://amazon.com/dp/B0CKX1F7QG',
    search_query: 'laptop',
    available_quantity: 5,
  },
  {
    product_id: 'B0D5F62D1Y',
    product_title: 'MacBook Air 13-inch with M3 chip, 16GB RAM, 512GB SSD - Midnight',
    price: 1299.00,
    original_price: 1499.00,
    thumbnail: 'https://m.media-amazon.com/images/I/71TPda7cwUL._AC_SX679_.jpg',
    source: 'amazon',
    permalink: 'https://amazon.com/dp/B0D5F62D1Y',
    search_query: 'macbook',
    available_quantity: 3,
  },

  // Headphones
  {
    product_id: 'B0BDHDF7B2',
    product_title: 'Apple AirPods Pro (2nd Generation) with MagSafe Charging Case (USB‑C)',
    price: 189.99,
    original_price: 249.00,
    thumbnail: 'https://m.media-amazon.com/images/I/61f1YfTkTDL._AC_SX679_.jpg',
    source: 'amazon',
    permalink: 'https://amazon.com/dp/B0BDHDF7B2',
    search_query: 'airpods',
    available_quantity: 50,
  },
  {
    product_id: 'B0CMDYH9R9',
    product_title: 'Sony WH-1000XM5 Wireless Noise Canceling Headphones - Black',
    price: 328.00,
    original_price: 399.99,
    thumbnail: 'https://m.media-amazon.com/images/I/51QeS090a+L._AC_SX679_.jpg',
    source: 'amazon',
    permalink: 'https://amazon.com/dp/B0CMDYH9R9',
    search_query: 'headphones',
    available_quantity: 18,
  },

  // Tablets
  {
    product_id: 'B0D3J98W75',
    product_title: 'iPad (10th Generation): 10.9-inch Liquid Retina Display, 64GB, Wi-Fi 6, Silver',
    price: 299.00,
    original_price: 349.00,
    thumbnail: 'https://m.media-amazon.com/images/I/61uA2UVnYWL._AC_SX679_.jpg',
    source: 'amazon',
    permalink: 'https://amazon.com/dp/B0D3J98W75',
    search_query: 'ipad',
    available_quantity: 25,
  },
  {
    product_id: 'B0CX23V2ZK',
    product_title: 'Samsung Galaxy Tab S9 FE 10.9" 128GB Android Tablet, Gray',
    price: 349.99,
    original_price: 449.99,
    thumbnail: 'https://m.media-amazon.com/images/I/71uTAx48BDL._AC_SX679_.jpg',
    source: 'amazon',
    permalink: 'https://amazon.com/dp/B0CX23V2ZK',
    search_query: 'tablet',
    available_quantity: 14,
  },

  // Smartwatches
  {
    product_id: 'B0D1XD1ZV3',
    product_title: 'Apple Watch Series 10 GPS 42mm Sport Band - Jet Black Aluminum Case',
    price: 379.00,
    original_price: 429.00,
    thumbnail: 'https://m.media-amazon.com/images/I/71W1aeNbHJL._AC_SX679_.jpg',
    source: 'amazon',
    permalink: 'https://amazon.com/dp/B0D1XD1ZV3',
    search_query: 'apple watch',
    available_quantity: 7,
  },
  {
    product_id: 'B0CSVF14M2',
    product_title: 'Samsung Galaxy Watch 6 Classic 47mm Bluetooth Smartwatch - Black',
    price: 279.99,
    original_price: 399.99,
    thumbnail: 'https://m.media-amazon.com/images/I/71Ml9JKttZL._AC_SX679_.jpg',
    source: 'amazon',
    permalink: 'https://amazon.com/dp/B0CSVF14M2',
    search_query: 'smartwatch',
    available_quantity: 11,
  },
];

async function seedData() {
  console.log('🌱 Seeding sample data to product_cache...\n');
  console.log('═'.repeat(60));

  try {
    // Check if data already exists
    const { count: existingCount } = await supabase
      .from('product_cache')
      .select('*', { count: 'exact', head: true });

    if (existingCount > 0) {
      console.log(`\n⚠️  Warning: product_cache already has ${existingCount} products.`);
      console.log('Do you want to add more sample data? (This will not delete existing data)');
      console.log('\nContinuing in 3 seconds... Press Ctrl+C to cancel.\n');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // Prepare products for insertion
    const productsToInsert = sampleProducts.map(p => ({
      id: uuidv4(),
      ...p,
      last_updated: new Date().toISOString(),
      created_at: new Date().toISOString(),
    }));

    // Insert in batches
    console.log(`\n📦 Inserting ${productsToInsert.length} sample products...`);

    const { data, error } = await supabase
      .from('product_cache')
      .insert(productsToInsert)
      .select();

    if (error) {
      console.error('❌ Error inserting data:', error.message);
      console.error('Details:', error);
      return;
    }

    console.log(`✅ Successfully inserted ${data.length} products!`);

    // Show summary
    console.log('\n📊 Summary by category:');
    const categories = {
      'iPhones': productsToInsert.filter(p => p.product_title.toLowerCase().includes('iphone')).length,
      'Laptops': productsToInsert.filter(p => p.product_title.toLowerCase().includes('laptop') || p.product_title.toLowerCase().includes('macbook')).length,
      'Headphones': productsToInsert.filter(p => p.product_title.toLowerCase().includes('airpods') || p.product_title.toLowerCase().includes('headphone')).length,
      'Tablets': productsToInsert.filter(p => p.product_title.toLowerCase().includes('ipad') || p.product_title.toLowerCase().includes('tablet')).length,
      'Smartwatches': productsToInsert.filter(p => p.product_title.toLowerCase().includes('watch')).length,
    };

    Object.entries(categories).forEach(([cat, count]) => {
      console.log(`  - ${cat}: ${count} products`);
    });

    // Check total now
    const { count: totalCount } = await supabase
      .from('product_cache')
      .select('*', { count: 'exact', head: true });

    console.log(`\n🗄️  Total products in database: ${totalCount}`);
    console.log('\n✅ Done! Your deal sections should now display products.');
    console.log('   Refresh your home page to see the results.\n');
    console.log('═'.repeat(60) + '\n');

  } catch (error) {
    console.error('\n❌ Error seeding data:', error.message);
    console.error('Details:', error);
  }
}

seedData();
