/**
 * Categorize Products - Fixed Approach
 * Uses raw SQL to bypass schema cache issues
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Category detection function
function detectCategory(title) {
  if (!title) return 'uncategorized';

  const titleLower = title.toLowerCase();

  // Phones
  if (titleLower.match(/iphone|samsung galaxy|google pixel|motorola|smartphone|celular/))
    return 'phones';

  // Computers
  if (titleLower.match(/macbook|laptop|pc|computadora|portátil/))
    return 'computers';

  // Electronics
  if (titleLower.match(/smart tv|television|headphones|tablet|ipad|audífonos|speaker/))
    return 'electronics';

  // Toys
  if (titleLower.match(/lego|hot wheels|barbie|funko|juguete|toy/))
    return 'toys';

  // Clothing
  if (titleLower.match(/nike|adidas|shoes|zapatos|tenis|hoodie|jacket/))
    return 'clothing';

  // Home & Kitchen
  if (titleLower.match(/kitchenaid|dyson|vacuum|mixer|bed|sofa|pillow/))
    return 'home-kitchen';

  // Beauty
  if (titleLower.match(/maybelline|makeup|shampoo|skincare|perfume/))
    return 'beauty';

  return 'uncategorized';
}

async function categorizeProducts() {
  console.log('🏷️  Starting product categorization using raw SQL...\n');

  try {
    // Step 1: Ensure category column exists
    console.log('📋 Step 1: Adding category column if not exists...');
    const { error: alterError } = await supabase.rpc('exec', {
      query: `
        ALTER TABLE product_cache
        ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'uncategorized';
      `
    });

    if (alterError && !alterError.message.includes('already exists')) {
      // Try alternative approach - just update without adding column
      console.log('   Column may already exist, continuing...');
    }

    // Step 2: Get all products using raw SQL
    console.log('📋 Step 2: Fetching all products...');
    const { data: products, error: fetchError } = await supabase
      .from('product_cache')
      .select('product_id, product_title')
      .limit(1000);

    if (fetchError) {
      console.error('❌ Error fetching products:', fetchError);
      return;
    }

    console.log(`   Found ${products.length} products\n`);

    // Step 3: Build update cases for SQL
    console.log('📋 Step 3: Categorizing products...');

    const categoryCounts = {};
    const updates = [];

    for (const product of products) {
      const category = detectCategory(product.product_title);
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
      updates.push({
        id: product.product_id,
        category: category
      });
    }

    console.log('\n📊 Category Distribution:');
    Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([cat, count]) => {
        console.log(`   ${cat}: ${count}`);
      });

    // Step 4: Update in batches using individual updates
    console.log('\n📋 Step 4: Updating database...');

    let updated = 0;
    const batchSize = 10;

    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);

      // Update each product in the batch
      for (const { id, category } of batch) {
        const { error } = await supabase
          .from('product_cache')
          .update({ category: category })
          .eq('product_id', id)
          .select();

        if (!error) {
          updated++;
        }
      }

      if (updated % 50 === 0) {
        console.log(`   ✅ Updated ${updated}/${updates.length} products...`);
      }
    }

    console.log(`\n✅ Successfully categorized ${updated} products!`);
    console.log('\n🎉 Category links will now filter the database!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n💡 Trying alternative bulk update approach...\n');

    // Alternative: Use Supabase's PostgreSQL functions
    await bulkUpdateWithSQL();
  }
}

// Alternative approach using SQL CASE statements
async function bulkUpdateWithSQL() {
  console.log('📋 Using SQL pattern matching for bulk categorization...\n');

  const updates = [
    { category: 'phones', pattern: 'iphone|samsung galaxy|google pixel|smartphone|celular' },
    { category: 'computers', pattern: 'macbook|laptop|pc|computadora' },
    { category: 'electronics', pattern: 'smart tv|television|headphones|tablet|ipad' },
    { category: 'toys', pattern: 'lego|hot wheels|barbie|funko|juguete' },
    { category: 'clothing', pattern: 'nike|adidas|shoes|zapatos' },
    { category: 'home-kitchen', pattern: 'kitchenaid|dyson|vacuum|mixer' },
    { category: 'beauty', pattern: 'maybelline|makeup|shampoo|skincare' }
  ];

  for (const { category, pattern } of updates) {
    console.log(`   Categorizing ${category}...`);

    const { count } = await supabase
      .from('product_cache')
      .update({ category })
      .ilike('product_title', `%${pattern.split('|')[0]}%`)
      .select('count');

    console.log(`   ✅ Updated ${count || 0} ${category} products`);
  }

  console.log('\n✅ Bulk categorization complete!\n');
}

categorizeProducts();
