/**
 * Database Diagnostic Script
 * Run this to check the state of your Supabase database
 * Usage: node check-database.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function checkDatabase() {
  console.log('🔍 OfertaRadar Database Diagnostic\n');
  console.log('═'.repeat(60));

  try {
    // Check product_cache
    console.log('\n📦 product_cache (Scraped Products)');
    console.log('─'.repeat(60));

    const { count: cacheCount } = await supabase
      .from('product_cache')
      .select('*', { count: 'exact', head: true });

    console.log(`Total products: ${cacheCount || 0}`);

    if (cacheCount > 0) {
      // Get sample products
      const { data: samples } = await supabase
        .from('product_cache')
        .select('product_id, product_title, price, source, last_updated')
        .order('last_updated', { ascending: false })
        .limit(5);

      console.log('\nMost recent products:');
      samples.forEach((p, i) => {
        console.log(`  ${i + 1}. ${p.product_title?.substring(0, 50)}...`);
        console.log(`     Price: $${p.price} | Source: ${p.source} | Updated: ${new Date(p.last_updated).toLocaleString()}`);
      });

      // Check sources
      const { data: sources } = await supabase
        .from('product_cache')
        .select('source');

      const sourceCounts = sources.reduce((acc, p) => {
        acc[p.source] = (acc[p.source] || 0) + 1;
        return acc;
      }, {});

      console.log('\nBy source:');
      Object.entries(sourceCounts).forEach(([source, count]) => {
        console.log(`  - ${source}: ${count} products`);
      });
    } else {
      console.log('⚠️  EMPTY - No products have been scraped yet!');
      console.log('   Reason: No user searches have been performed.');
      console.log('   Solution: Go to the app and search for products.');
    }

    // Check tracked_products
    console.log('\n\n👤 tracked_products (User Watchlists)');
    console.log('─'.repeat(60));

    const { count: trackedCount } = await supabase
      .from('tracked_products')
      .select('*', { count: 'exact', head: true });

    console.log(`Total tracked products: ${trackedCount || 0}`);

    if (trackedCount > 0) {
      const { data: tracked } = await supabase
        .from('tracked_products')
        .select('product_title, current_price, user_id')
        .limit(5);

      console.log('\nSample tracked products:');
      tracked.forEach((p, i) => {
        console.log(`  ${i + 1}. ${p.product_title?.substring(0, 50)} - $${p.current_price}`);
      });
    } else {
      console.log('⚠️  EMPTY - No users have added products to their watchlist.');
    }

    // Check search_history
    console.log('\n\n🔍 search_history (User Searches)');
    console.log('─'.repeat(60));

    const { count: searchCount } = await supabase
      .from('search_history')
      .select('*', { count: 'exact', head: true });

    console.log(`Total searches: ${searchCount || 0}`);

    if (searchCount > 0) {
      const { data: searches } = await supabase
        .from('search_history')
        .select('query, source, created_at')
        .order('created_at', { ascending: false })
        .limit(10);

      console.log('\nRecent searches:');
      searches.forEach((s, i) => {
        console.log(`  ${i + 1}. "${s.query}" (${s.source}) - ${new Date(s.created_at).toLocaleString()}`);
      });
    } else {
      console.log('⚠️  EMPTY - No search history recorded.');
    }

    // Check users
    console.log('\n\n👥 users (Registered Users)');
    console.log('─'.repeat(60));

    const { count: userCount } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    console.log(`Total users: ${userCount || 0}`);

    if (userCount > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('email, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

      console.log('\nRecent users:');
      users.forEach((u, i) => {
        console.log(`  ${i + 1}. ${u.email} - Joined ${new Date(u.created_at).toLocaleDateString()}`);
      });
    }

    // Summary
    console.log('\n\n📊 SUMMARY');
    console.log('═'.repeat(60));

    const hasData = cacheCount > 0;

    if (hasData) {
      console.log('✅ Database is populated and working!');
      console.log(`   - ${cacheCount} scraped products available`);
      console.log(`   - Deal sections should be displaying products`);
    } else {
      console.log('⚠️  Database needs data!');
      console.log('\n🔧 Next steps to populate:');
      console.log('   1. Start the server: npm run dev');
      console.log('   2. Open the app in browser');
      console.log('   3. Search for products (e.g., "iPhone", "laptop")');
      console.log('   4. Wait 1-2 minutes for Apify to scrape');
      console.log('   5. Refresh homepage - deal sections will populate!');
    }

    console.log('\n' + '═'.repeat(60) + '\n');

  } catch (error) {
    console.error('\n❌ Error checking database:', error.message);
    console.error('Details:', error);
  }
}

checkDatabase();
