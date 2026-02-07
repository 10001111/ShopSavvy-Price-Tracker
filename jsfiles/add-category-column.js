/**
 * Add Category Column to product_cache Table
 * Uses Supabase's SQL execution capabilities
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function addCategoryColumn() {
  console.log('🔧 Adding category column to product_cache table...\n');

  // SQL to add the column
  const sql = `
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'product_cache' AND column_name = 'category'
      ) THEN
        ALTER TABLE product_cache
        ADD COLUMN category VARCHAR(50) DEFAULT 'uncategorized';

        CREATE INDEX idx_product_cache_category ON product_cache(category);

        RAISE NOTICE 'Category column added successfully';
      ELSE
        RAISE NOTICE 'Category column already exists';
      END IF;
    END $$;
  `;

  console.log('📋 Executing SQL to add column...\n');
  console.log(sql);
  console.log('\n');

  try {
    // Try using the PostgreSQL query directly
    const { data, error } = await supabase.rpc('exec_raw_sql', { sql_query: sql });

    if (error) {
      console.log('❌ Standard RPC failed:', error.message);
      console.log('\n💡 The category column needs to be added manually.\n');
      console.log('Please run this in Supabase SQL Editor:');
      console.log('=' .repeat(60));
      console.log(`
ALTER TABLE product_cache
ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'uncategorized';

CREATE INDEX IF NOT EXISTS idx_product_cache_category
ON product_cache(category);
      `);
      console.log('='.repeat(60));
      console.log('\nSteps:');
      console.log('1. Go to https://supabase.com/dashboard');
      console.log('2. Click SQL Editor');
      console.log('3. New Query');
      console.log('4. Paste the SQL above');
      console.log('5. Click Run\n');
    } else {
      console.log('✅ Column added successfully!');
      console.log('Data:', data);
    }
  } catch (err) {
    console.log('❌ Error:', err.message);
    console.log('\n💡 Manual SQL required - see instructions above\n');
  }
}

addCategoryColumn();
