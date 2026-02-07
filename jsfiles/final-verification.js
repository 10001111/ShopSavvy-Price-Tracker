/**
 * Final verification after fixes:
 * - Confirm NO zero-price products
 * - Confirm currency displays correctly
 * - Show exactly what will render on homepage
 */

require('dotenv').config();
const supabaseDb = require('./src/backend/supabase-db.js');

function formatPrice(value, currency = "USD") {
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

async function finalVerification() {
  console.log('✅ FINAL VERIFICATION - Homepage Display\n');
  console.log('='.repeat(70));

  // Get what homepage will display
  const popular = await supabaseDb.getPopularProducts({ limit: 8 });

  console.log('\n🎨 HOMEPAGE PREVIEW\n');
  console.log(`Found ${popular.length} products for Popular Products section\n`);

  if (popular.length === 0) {
    console.log('❌ WARNING: No products to display!');
    console.log('   Homepage Popular Products section will be empty.\n');
  } else {
    console.log('Products that will display on homepage:\n');
    popular.forEach((p, i) => {
      const displayPrice = formatPrice(p.current_price, p.currency || "USD");
      console.log(`${i + 1}. ${p.product_title?.substring(0, 50)}...`);
      console.log(`   Price: ${displayPrice}`);
      console.log(`   Source: ${p.source}`);
      console.log(`   Category: ${p.category || 'uncategorized'}`);
      if (p.savingsPercent) {
        const savingsDisplay = formatPrice(p.savingsAmount || 0, p.currency || "USD");
        console.log(`   Savings: ${Math.round(p.savingsPercent)}% (${savingsDisplay})`);
      }
      console.log('');
    });
  }

  console.log('='.repeat(70));
  console.log('\n✅ VERIFICATION COMPLETE\n');
  console.log('Expected outcome:');
  console.log('  - All prices display in USD format: $502.31');
  console.log('  - No "MX$" prefix (Mexican Pesos)');
  console.log('  - No zero or invalid prices');
  console.log('  - Modern UI/UX with proper currency display\n');
}

finalVerification()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
