/**
 * Migration Runner
 * This script will show you exactly what to do
 */

const fs = require('fs');

console.log('\n' + '='.repeat(60));
console.log('🔧 MIGRATION 008 - ADD QUANTITY FIELDS');
console.log('='.repeat(60) + '\n');

// Read the migration file
const migration = fs.readFileSync('./migrations/008_add_product_quantity_fields.sql', 'utf8');

console.log('📋 Copy the SQL below and paste it into Supabase SQL Editor:\n');
console.log('🌐 Supabase SQL Editor: https://supabase.com/dashboard/project/erjptjtmkfotfdtnaidh/editor\n');
console.log('-'.repeat(60));
console.log(migration);
console.log('-'.repeat(60));

console.log('\n✅ STEPS:');
console.log('1. Copy the SQL above (from ALTER TABLE to the end)');
console.log('2. Go to: https://supabase.com/dashboard/project/erjptjtmkfotfdtnaidh/editor');
console.log('3. Paste the SQL');
console.log('4. Click "Run" button');
console.log('5. Restart your server: npm start');
console.log('\n' + '='.repeat(60) + '\n');
