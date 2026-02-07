/**
 * Categorize Products Using PostgREST SQL
 * Bypasses Supabase JS client schema cache
 */

import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function categorizeWithSQL() {
  console.log('🏷️  Categorizing products using direct SQL execution...\n');

  // Use Supabase's PostgREST to execute raw SQL
  const sqlQueries = [
    // 1. Ensure column exists
    `ALTER TABLE product_cache ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'uncategorized';`,

    // 2. Reset all to uncategorized
    `UPDATE product_cache SET category = 'uncategorized';`,

    // 3. Categorize phones
    `UPDATE product_cache SET category = 'phones'
     WHERE product_title ~* '(iphone|samsung galaxy|google pixel|motorola|smartphone|celular)';`,

    // 4. Categorize computers
    `UPDATE product_cache SET category = 'computers'
     WHERE category = 'uncategorized'
     AND product_title ~* '(macbook|laptop|pc|computadora|portátil)';`,

    // 5. Categorize electronics
    `UPDATE product_cache SET category = 'electronics'
     WHERE category = 'uncategorized'
     AND product_title ~* '(smart tv|television|headphones|tablet|ipad|audífonos)';`,

    // 6. Categorize toys
    `UPDATE product_cache SET category = 'toys'
     WHERE category = 'uncategorized'
     AND product_title ~* '(lego|hot wheels|barbie|funko|juguete|toy)';`,

    // 7. Categorize clothing
    `UPDATE product_cache SET category = 'clothing'
     WHERE category = 'uncategorized'
     AND product_title ~* '(nike|adidas|shoes|zapatos|tenis)';`,

    // 8. Categorize home & kitchen
    `UPDATE product_cache SET category = 'home-kitchen'
     WHERE category = 'uncategorized'
     AND product_title ~* '(kitchenaid|dyson|vacuum|mixer|bed|sofa)';`,

    // 9. Categorize beauty
    `UPDATE product_cache SET category = 'beauty'
     WHERE category = 'uncategorized'
     AND product_title ~* '(maybelline|makeup|shampoo|skincare|perfume)';`
  ];

  console.log('📋 Executing SQL categorization queries...\n');

  for (let i = 0; i < sqlQueries.length; i++) {
    const sql = sqlQueries[i];
    const action = i === 0 ? 'Adding column' :
                   i === 1 ? 'Resetting categories' :
                   `Categorizing ${sql.match(/category = '([^']+)'/)?.[1]}`;

    console.log(`   ${i + 1}. ${action}...`);

    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({ query: sql })
      });

      if (!response.ok) {
        const error = await response.text();
        console.log(`      ⚠️  Response: ${error}`);
      } else {
        console.log(`      ✅ Done`);
      }
    } catch (error) {
      console.log(`      ⚠️  ${error.message}`);
    }
  }

  console.log('\n📊 Checking results...\n');

  // Query to see category distribution
  const checkSQL = `
    SELECT category, COUNT(*) as count
    FROM product_cache
    GROUP BY category
    ORDER BY count DESC;
  `;

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query: checkSQL })
    });

    const result = await response.json();
    console.log('Category Distribution:', result);
  } catch (error) {
    console.log('Could not fetch results:', error.message);
  }

  console.log('\n✅ Categorization complete!\n');
  console.log('💡 If you see errors above, the column might need to be added');
  console.log('   manually in Supabase dashboard → SQL Editor\n');
}

categorizeWithSQL();
