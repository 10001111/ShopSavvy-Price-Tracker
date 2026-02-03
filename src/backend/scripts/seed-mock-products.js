/**
 * Seed Database with Mock Products for Testing
 * This adds the existing mock products to Supabase with synthetic price history
 */

require("dotenv").config();
const supabaseDb = require("../supabase-db");
const bcrypt = require("bcryptjs");

// Mock products from server.js
const MOCK_PRODUCTS = [
  {
    id: "MLM-001",
    title: "iPhone 15 Pro Max 256GB - Titanio Natural",
    price: 28999,
    category: "electronics",
    url: "https://www.mercadolibre.com.mx/apple-iphone-15-pro-max-256gb/p/MLM25691971",
  },
  {
    id: "MLM-002",
    title: "Samsung Galaxy S24 Ultra 256GB Negro",
    price: 24999,
    category: "electronics",
    url: "https://www.mercadolibre.com.mx/samsung-galaxy-s24-ultra/p/MLM26839123",
  },
  {
    id: "MLM-003",
    title: 'MacBook Air M3 13" 256GB - Medianoche',
    price: 26999,
    category: "electronics",
    url: "https://www.mercadolibre.com.mx/apple-macbook-air-m3/p/MLM28475234",
  },
  {
    id: "MLM-004",
    title: "PlayStation 5 Slim 1TB Digital Edition",
    price: 11499,
    category: "toys",
    url: "https://www.mercadolibre.com.mx/playstation-5-slim/p/MLM27123456",
  },
  {
    id: "MLM-005",
    title: "Audífonos Sony WH-1000XM5 Bluetooth Negro",
    price: 6499,
    category: "electronics",
    url: "https://www.mercadolibre.com.mx/sony-wh-1000xm5/p/MLM23456789",
  },
  {
    id: "MLM-006",
    title: 'iPad Pro M4 11" 256GB WiFi - Plata',
    price: 19999,
    category: "electronics",
    url: "https://www.mercadolibre.com.mx/ipad-pro-m4/p/MLM28901234",
  },
  {
    id: "MLM-007",
    title: "Nintendo Switch OLED Edición Zelda",
    price: 7999,
    category: "toys",
    url: "https://www.mercadolibre.com.mx/nintendo-switch-oled/p/MLM26789012",
  },
  {
    id: "MLM-008",
    title: "AirPods Pro 2da Generación con USB-C",
    price: 4499,
    category: "electronics",
    url: "https://www.mercadolibre.com.mx/airpods-pro-2/p/MLM27890123",
  },
  {
    id: "MLM-009",
    title: 'Smart TV Samsung 55" Crystal UHD 4K',
    price: 8999,
    category: "electronics",
    url: "https://www.mercadolibre.com.mx/samsung-55-crystal-uhd/p/MLM25678901",
  },
  {
    id: "MLM-010",
    title: "Xbox Series X 1TB Negro",
    price: 12999,
    category: "toys",
    url: "https://www.mercadolibre.com.mx/xbox-series-x/p/MLM26543210",
  },
  {
    id: "MLM-011",
    title: "Aspiradora Dyson V15 Detect Absolute",
    price: 14999,
    category: "home-kitchen",
    url: "https://www.mercadolibre.com.mx/dyson-v15-detect/p/MLM27654321",
  },
  {
    id: "MLM-012",
    title: "Apple Watch Series 9 GPS 45mm Aluminio",
    price: 8999,
    category: "electronics",
    url: "https://www.mercadolibre.com.mx/apple-watch-series-9/p/MLM28765432",
  },
];

/**
 * Generate synthetic price history (7 days worth)
 * Simulates price fluctuations for realistic analysis
 */
function generatePriceHistory(basePrice) {
  const history = [];
  const now = new Date();

  // Generate 7 days of price history (4 checks per day = 28 data points)
  for (let day = 6; day >= 0; day--) {
    for (let check = 0; check < 4; check++) {
      const timestamp = new Date(now);
      timestamp.setDate(timestamp.getDate() - day);
      timestamp.setHours(check * 6); // Every 6 hours

      // Add realistic price variation (+/- 10%)
      const variation = 1 + (Math.random() * 0.2 - 0.1);
      const price = Math.round(basePrice * variation);

      history.push({
        price,
        timestamp,
      });
    }
  }

  return history;
}

/**
 * Get or create demo user
 */
async function getOrCreateDemoUser() {
  const demoEmail = "demo@shopsavvy.com";

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
 * Add product with price history
 */
async function addProductWithHistory(userId, product) {
  try {
    // Add tracked product
    const tracked = await supabaseDb.addTrackedProduct({
      userId: userId,
      productId: product.id,
      productTitle: product.title,
      productUrl: product.url,
      source: "mercadolibre",
      targetPrice: null,
      currentPrice: product.price,
    });

    if (!tracked) {
      console.log(`  ✗ Failed to add: ${product.title}`);
      return false;
    }

    // Generate and add price history
    const priceHistory = generatePriceHistory(product.price);

    for (const entry of priceHistory) {
      await supabaseDb.getSupabase()
        .from("price_history")
        .insert({
          tracked_product_id: tracked.id,
          price: entry.price,
          recorded_at: entry.timestamp.toISOString(),
        });
    }

    console.log(`  ✓ Added: ${product.title} with ${priceHistory.length} price history entries`);
    return true;
  } catch (error) {
    console.error(`  ✗ Error adding ${product.title}:`, error.message);
    return false;
  }
}

/**
 * Main seed function
 */
async function seedMockProducts() {
  console.log("=".repeat(60));
  console.log("ShopSavvy - Seeding Mock Products with Price History");
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
    process.exit(1);
  }

  console.log("✓ All required tables exist");
  console.log();

  // Get or create demo user
  const user = await getOrCreateDemoUser();
  console.log();

  // Seed products
  let totalAdded = 0;
  console.log("📦 Adding mock products with synthetic price history...");
  console.log();

  for (const product of MOCK_PRODUCTS) {
    const added = await addProductWithHistory(user.id, product);
    if (added) totalAdded++;
  }

  console.log();
  console.log("=".repeat(60));
  console.log(`✓ Seeding complete! Added ${totalAdded} products`);
  console.log(`  Each product has 7 days of price history (28 data points)`);
  console.log("=".repeat(60));
  console.log();
  console.log("✨ Your database now has enough data for real analysis!");
  console.log();
  console.log("Next steps:");
  console.log("1. Start the application: npm start");
  console.log("2. Visit http://localhost:3000");
  console.log("3. See real data analysis in action!");
  console.log("4. The price checker worker will continue updating prices");
  console.log();
}

// Run if called directly
if (require.main === module) {
  seedMockProducts()
    .then(() => {
      console.log("Done!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Seed failed:", error);
      process.exit(1);
    });
}

module.exports = { seedMockProducts };
