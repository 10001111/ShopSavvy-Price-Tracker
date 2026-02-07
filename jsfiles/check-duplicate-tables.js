/**
 * Check for duplicate or conflicting tables in Supabase
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

async function checkDuplicateTables() {
  console.log('🔍 Checking for duplicate tables in Supabase...\n');

  try {
    // Query information_schema to get all tables
    const { data: tables, error } = await supabase.rpc('exec_sql', {
      query: `
        SELECT
          table_schema,
          table_name,
          (SELECT COUNT(*) FROM information_schema.columns
           WHERE columns.table_name = tables.table_name
           AND columns.table_schema = tables.table_schema) as column_count
        FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name;
      `
    });

    if (error) {
      console.log('⚠️  RPC method not available, using alternative approach...\n');

      // Alternative: Try to query each potential table directly
      const potentialTables = [
        'product_cache',
        'products',
        'cached_products',
        'product_data',
        'tracked_products',
        'user_tracked_products',
        'search_history',
        'users',
        'price_history',
        'price_alerts',
        'categories',
        'product_categories'
      ];

      console.log('📋 Checking common product-related tables:\n');

      const existingTables = [];

      for (const tableName of potentialTables) {
        try {
          const { data, error, count } = await supabase
            .from(tableName)
            .select('*', { count: 'exact', head: true });

          if (!error) {
            existingTables.push({ table_name: tableName, row_count: count });
            console.log(`✅ ${tableName}: EXISTS (${count} rows)`);
          }
        } catch (e) {
          console.log(`❌ ${tableName}: DOES NOT EXIST`);
        }
      }

      console.log('\n📊 Summary of existing tables:\n');
      existingTables.forEach(table => {
        console.log(`  - ${table.table_name}: ${table.row_count} rows`);
      });

      // Check for potential duplicates or conflicts
      console.log('\n🔍 Checking for potential conflicts:\n');

      const productTables = existingTables.filter(t =>
        t.table_name.includes('product') && !t.table_name.includes('tracked')
      );

      if (productTables.length > 1) {
        console.log('⚠️  WARNING: Multiple product tables detected:');
        productTables.forEach(t => {
          console.log(`  - ${t.table_name} (${t.row_count} rows)`);
        });
        console.log('\n💡 This could cause data conflicts or overwrites!');
      } else {
        console.log('✅ No duplicate product tables detected');
      }

      // Check schema of product_cache if it exists
      if (existingTables.some(t => t.table_name === 'product_cache')) {
        console.log('\n📋 Checking product_cache schema:\n');

        const { data: sampleData, error: sampleError } = await supabase
          .from('product_cache')
          .select('*')
          .limit(1);

        if (sampleData && sampleData.length > 0) {
          console.log('Columns in product_cache:');
          Object.keys(sampleData[0]).forEach(col => {
            console.log(`  - ${col}: ${typeof sampleData[0][col]}`);
          });
        }
      }

      // Check for zero-price products
      console.log('\n💰 Checking for zero-price products:\n');

      const { count: zeroPriceCount, error: countError } = await supabase
        .from('product_cache')
        .select('*', { count: 'exact', head: true })
        .or('price.is.null,price.eq.0');

      if (!countError) {
        console.log(`Found ${zeroPriceCount} products with zero or null prices`);

        if (zeroPriceCount > 0) {
          const { data: zeroProducts } = await supabase
            .from('product_cache')
            .select('product_id, product_title, price, currency, source')
            .or('price.is.null,price.eq.0')
            .limit(5);

          console.log('\nSample zero-price products:');
          zeroProducts?.forEach((p, i) => {
            console.log(`  ${i + 1}. ${p.product_title?.substring(0, 50)}... (${p.source}, price: ${p.price})`);
          });
        }
      }

      return;
    }

    console.log('📋 All tables in public schema:\n');
    tables.forEach(table => {
      console.log(`  - ${table.table_name} (${table.column_count} columns)`);
    });

  } catch (error) {
    console.error('❌ Error checking tables:', error.message);
    console.error(error);
  }
}

checkDuplicateTables()
  .then(() => {
    console.log('\n✅ Table check complete');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
