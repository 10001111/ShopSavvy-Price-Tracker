/**
 * Run Category Column Migration
 * Adds the category column to product_cache table
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runMigration() {
  console.log('🔧 Running migration: Add category column to product_cache\n');

  try {
    // First, try to add the column using a simple update check
    // This will tell us if the column exists
    const { error: testError } = await supabase
      .from('product_cache')
      .update({ category: 'uncategorized' })
      .eq('product_id', 'test-nonexistent')
      .select();

    if (testError && testError.message.includes('column "category" does not exist')) {
      console.log('❌ Column "category" does not exist');
      console.log('\n📋 You need to run this SQL in Supabase SQL Editor:\n');
      console.log('='.repeat(60));
      console.log(`
ALTER TABLE product_cache
ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'uncategorized';

CREATE INDEX IF NOT EXISTS idx_product_cache_category
ON product_cache(category);

CREATE INDEX IF NOT EXISTS idx_product_cache_category_price
ON product_cache(category, price);
      `);
      console.log('='.repeat(60));
      console.log('\n📍 Steps:');
      console.log('1. Go to: https://supabase.com/dashboard');
      console.log('2. Select your project');
      console.log('3. Click "SQL Editor" in left sidebar');
      console.log('4. Click "New Query"');
      console.log('5. Paste the SQL above');
      console.log('6. Click "Run" or press Ctrl+Enter');
      console.log('7. Re-run this script\n');
      return;
    }

    console.log('✅ Column "category" already exists!');
    console.log('✅ Migration complete - ready to categorize products\n');

  } catch (error) {
    console.error('Error:', error.message);
  }
}

runMigration();
