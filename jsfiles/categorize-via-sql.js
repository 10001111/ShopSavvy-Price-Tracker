/**
 * Categorize Products via Direct SQL
 * Uses raw SQL to bypass schema cache issues
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

// Extract connection details from Supabase URL
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Supabase connection string format
const connectionString = `postgresql://postgres.erjptjtmkfotfdtnaidh:${process.env.SUPABASE_DB_PASSWORD || 'your-db-password'}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;

// Category detection function
function detectCategory(title) {
  if (!title) return 'uncategorized';

  const titleLower = title.toLowerCase();

  // Strong indicators
  if (titleLower.match(/iphone|samsung galaxy|google pixel|motorola|oneplus|xiaomi|smartphone|celular/)) return 'phones';
  if (titleLower.match(/macbook|laptop|gaming laptop|desktop pc|chromebook|computadora|portátil/)) return 'computers';
  if (titleLower.match(/smart tv|television|headphones|airpods|speaker|nintendo switch|playstation|xbox|ipad|tablet|kindle|camera|drone|smartwatch/)) return 'electronics';
  if (titleLower.match(/lego|playmobil|hot wheels|barbie|funko pop|nerf|juguete|muñeca|board game|puzzle/)) return 'toys';
  if (titleLower.match(/nike|adidas|puma|shoes|sneakers|zapatos|tenis|hoodie|jacket|jeans|shirt/)) return 'clothing';
  if (titleLower.match(/kitchenaid|instant pot|ninja blender|dyson|vacuum|mixer|toaster|coffee maker|air fryer|bed|mattress|pillow|sofa/)) return 'home-kitchen';
  if (titleLower.match(/maybelline|l'oreal|neutrogena|cerave|makeup|lipstick|mascara|shampoo|perfume|skincare/)) return 'beauty';

  return 'uncategorized';
}

async function categorizeProducts() {
  console.log('🏷️  Categorizing products via direct database connection...\n');

  // Try using Supabase's direct connection
  const client = new Client({
    host: 'aws-0-us-east-1.pooler.supabase.com',
    port: 5432,
    database: 'postgres',
    user: 'postgres.erjptjtmkfotfdtnaidh',
    password: process.env.SUPABASE_DB_PASSWORD || '',
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // Get all products
    const result = await client.query('SELECT product_id, product_title FROM product_cache');
    console.log(`📊 Found ${result.rows.length} products\n`);

    const categoryCounts = {};
    let updated = 0;

    // Update each product
    for (const row of result.rows) {
      const category = detectCategory(row.product_title);
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;

      await client.query(
        'UPDATE product_cache SET category = $1 WHERE product_id = $2',
        [category, row.product_id]
      );

      updated++;
      if (updated % 50 === 0) {
        console.log(`✅ Updated ${updated}/${result.rows.length} products...`);
      }
    }

    console.log('\n📊 Category Distribution:');
    Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([cat, count]) => {
        console.log(`   ${cat}: ${count}`);
      });

    console.log(`\n✅ Successfully categorized ${updated} products!\n`);

  } catch (error) {
    if (error.message.includes('password')) {
      console.log('❌ Database password not configured');
      console.log('\n📋 Alternative: Run this SQL in Supabase SQL Editor:\n');
      console.log('='.repeat(60));
      console.log(`
-- First, ensure category column exists
ALTER TABLE product_cache
ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'uncategorized';

-- Then update categories based on product titles
UPDATE product_cache SET category = 'phones'
WHERE product_title ~* 'iphone|samsung galaxy|google pixel|motorola|smartphone|celular';

UPDATE product_cache SET category = 'computers'
WHERE category = 'uncategorized' AND product_title ~* 'macbook|laptop|computadora|portátil';

UPDATE product_cache SET category = 'electronics'
WHERE category = 'uncategorized' AND product_title ~* 'smart tv|television|headphones|tablet|ipad';

UPDATE product_cache SET category = 'toys'
WHERE category = 'uncategorized' AND product_title ~* 'lego|hot wheels|barbie|funko|juguete';

UPDATE product_cache SET category = 'clothing'
WHERE category = 'uncategorized' AND product_title ~* 'nike|adidas|shoes|zapatos|tenis';

UPDATE product_cache SET category = 'home-kitchen'
WHERE category = 'uncategorized' AND product_title ~* 'kitchenaid|dyson|vacuum|mixer|bed';

UPDATE product_cache SET category = 'beauty'
WHERE category = 'uncategorized' AND product_title ~* 'maybelline|makeup|shampoo|skincare';
      `);
      console.log('='.repeat(60));
      console.log('\n📍 Go to: https://supabase.com/dashboard');
      console.log('   → SQL Editor → New Query → Paste & Run\n');
    } else {
      console.error('Error:', error.message);
    }
  } finally {
    await client.end();
  }
}

categorizeProducts();
