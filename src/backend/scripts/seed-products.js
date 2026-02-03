/**
 * Seed Script - Populate Database with Real Mercado Libre Products
 * This script fetches real products from ML API and adds them to tracked_products
 * to enable real data analysis
 */

require("dotenv").config();
const supabaseDb = require("../supabase-db");
const bcrypt = require("bcryptjs");

// Categories with search queries for Mercado Libre
const SEED_CATEGORIES = [
  {
    category: "electronics",
    queries: [
      "iphone 15",
      "samsung galaxy s24",
      "macbook air m3",
      "ipad pro",
      "airpods pro",
      "smart tv samsung",
      "sony headphones",
      "apple watch",
    ],
    limit: 3, // Products per query
  },
  {
    category: "home-kitchen",
    queries: [
      "dyson vacuum",
      "ninja blender",
      "instant pot",
      "keurig coffee maker",
    ],
    limit: 2,
  },
  {
    category: "toys",
    queries: [
      "playstation 5",
      "xbox series x",
      "nintendo switch oled",
      "lego star wars",
    ],
    limit: 2,
  },
  {
    category: "fashion",
    queries: ["nike shoes", "adidas sneakers", "ray ban sunglasses"],
    limit: 2,
  },
  {
    category: "sports-outdoors",
    queries: ["treadmill", "yoga mat", "dumbbells"],
    limit: 2,
  },
  {
    category: "beauty",
    queries: ["loreal makeup", "olay skincare", "gillette razor"],
    limit: 2,
  },
];

/**
 * Fetch products from Mercado Libre API
 */
async function fetchMLProducts(query, limit = 5) {
  try {
    const searchUrl = `https://api.mercadolibre.com/sites/MLM/search?q=${encodeURIComponent(query)}&limit=${limit}`;

    console.log(`  Fetching: ${query}...`);

    const response = await fetch(searchUrl, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      console.error(`  ✗ ML API error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error(`  ✗ Error fetching products:`, error.message);
    return [];
  }
}

/**
 * Create or get demo user
 */
async function getOrCreateDemoUser() {
  const demoEmail = "demo@shopsavvy.com";

  // Check if user exists
  let user = await supabaseDb.getUserByEmail(demoEmail);

  if (!user) {
    console.log("Creating demo user...");
    const passwordHash = await bcrypt.hash("demo1234", 10);

    user = await supabaseDb.createUser({
      email: demoEmail,
      passwordHash,
      verified: true,
      authProvider: "local",
    });

    console.log(`✓ Created demo user: ${demoEmail}`);
  } else {
    console.log(`✓ Found existing demo user: ${demoEmail}`);
  }

  return user;
}

/**
 * Add product to tracking
 */
async function addProduct(userId, product, category) {
  try {
    const tracked = await supabaseDb.addTrackedProduct({
      userId: userId,
      productId: product.id,
      productTitle: product.title,
      productUrl: product.permalink,
      source: "mercadolibre",
      targetPrice: null, // No target price for seeded products
      currentPrice: product.price,
    });

    if (tracked) {
      // Add initial price history entry
      await supabaseDb.addPriceHistory(tracked.id, product.price);

      console.log(`  ✓ Added: ${product.title.substring(0, 50)}... ($${product.price})`);
      return true;
    }

    return false;
  } catch (error) {
    console.error(`  ✗ Error adding product:`, error.message);
    return false;
  }
}

/**
 * Main seed function
 */
async function seedProducts() {
  console.log("=".repeat(60));
  console.log("ShopSavvy - Seeding Database with Real Products");
  console.log("=".repeat(60));
  console.log();

  // Initialize Supabase
  const sb = supabaseDb.getSupabase();
  if (!sb) {
    console.error("✗ Failed to initialize Supabase");
    console.error("  Make sure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set");
    process.exit(1);
  }

  console.log("✓ Supabase connected");
  console.log();

  // Verify tables exist
  const tableCheck = await supabaseDb.verifyTables();
  if (!tableCheck.ok) {
    console.error("✗ Required tables not found:", tableCheck.missingTables.join(", "));
    console.error("  Run the migration SQL in your Supabase SQL Editor first");
    process.exit(1);
  }

  console.log("✓ All required tables exist");
  console.log();

  // Get or create demo user
  const user = await getOrCreateDemoUser();
  console.log();

  // Seed products for each category
  let totalAdded = 0;

  for (const catConfig of SEED_CATEGORIES) {
    console.log(`📦 Seeding ${catConfig.category}...`);

    for (const query of catConfig.queries) {
      const products = await fetchMLProducts(query, catConfig.limit);

      // Add delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 1000));

      for (const product of products.slice(0, catConfig.limit)) {
        const added = await addProduct(user.id, product, catConfig.category);
        if (added) totalAdded++;
      }
    }

    console.log();
  }

  console.log("=".repeat(60));
  console.log(`✓ Seeding complete! Added ${totalAdded} products`);
  console.log("=".repeat(60));
  console.log();
  console.log("Next steps:");
  console.log("1. Start the price checker worker: npm run worker");
  console.log("2. Wait 24-48 hours for price history to accumulate");
  console.log("3. The data analysis will show real deals and price drops");
  console.log();
}

// Run if called directly
if (require.main === module) {
  seedProducts()
    .then(() => {
      console.log("Done!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Seed failed:", error);
      process.exit(1);
    });
}

module.exports = { seedProducts };
