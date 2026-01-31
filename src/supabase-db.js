/**
 * Supabase Database Module
 * Replaces SQLite with Supabase for cloud storage
 */

const { createClient } = require("@supabase/supabase-js");
const bcrypt = require("bcryptjs");

let supabase = null;

/**
 * Initialize Supabase client
 * Prefers SERVICE_ROLE key for server-side operations (bypasses RLS)
 * Falls back to ANON key if service role not available
 */
function initSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL;
  // Prefer service_role key for server-side (bypasses RLS)
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  const keyType = process.env.SUPABASE_SERVICE_ROLE_KEY ? "service_role" : "anon";

  if (!supabaseUrl || !supabaseKey) {
    console.error("[Supabase] Missing SUPABASE_URL or SUPABASE_ANON_KEY");
    return null;
  }

  supabase = createClient(supabaseUrl, supabaseKey);
  console.log(`[Supabase] Client initialized (using ${keyType} key)`);

  if (keyType === "anon") {
    console.log("[Supabase] ⚠️  For better reliability, add SUPABASE_SERVICE_ROLE_KEY to .env");
  }

  return supabase;
}

/**
 * Verify that required tables exist in Supabase
 * Returns { ok: boolean, missingTables: string[], error: string|null }
 */
async function verifyTables() {
  const requiredTables = ["users", "login_history", "user_sessions", "tracked_products", "price_history"];
  const missingTables = [];
  const tableErrors = {};

  console.log("[Supabase] Checking tables...");

  for (const table of requiredTables) {
    try {
      const { data, error } = await getSupabase()
        .from(table)
        .select("id")
        .limit(1);

      if (error) {
        // Log the actual error for debugging
        console.log(`[Supabase]   ${table}: ❌ ${error.message}`);
        tableErrors[table] = error.message;

        // Check for common error patterns that indicate missing table
        const errorMsg = error.message.toLowerCase();
        if (errorMsg.includes("schema cache") ||
            errorMsg.includes("does not exist") ||
            errorMsg.includes("relation") ||
            errorMsg.includes("permission denied") ||
            error.code === "42P01" || // PostgreSQL: undefined_table
            error.code === "PGRST204") { // PostgREST: no such table
          missingTables.push(table);
        }
      } else {
        console.log(`[Supabase]   ${table}: ✓`);
      }
    } catch (err) {
      console.log(`[Supabase]   ${table}: ❌ Exception: ${err.message}`);
      missingTables.push(table);
      tableErrors[table] = err.message;
    }
  }

  if (missingTables.length > 0) {
    console.error(`\n[Supabase] ❌ Problem tables: ${missingTables.join(", ")}`);
    console.error("[Supabase] This could be due to:");
    console.error("[Supabase]   1. Tables not created - run migration SQL");
    console.error("[Supabase]   2. RLS blocking access - add SUPABASE_SERVICE_ROLE_KEY to .env");
    console.error("[Supabase]   3. Wrong Supabase project - check SUPABASE_URL");
    return { ok: false, missingTables, error: `Problem tables: ${missingTables.join(", ")}`, tableErrors };
  }

  console.log("[Supabase] ✓ All required tables accessible");
  return { ok: true, missingTables: [], error: null };
}

/**
 * Get Supabase client (initialize if needed)
 */
function getSupabase() {
  if (!supabase) {
    initSupabase();
  }
  return supabase;
}

// ============================================
// USER OPERATIONS
// ============================================

/**
 * Get user by email
 */
async function getUserByEmail(email) {
  const { data, error } = await getSupabase()
    .from("users")
    .select("*")
    .eq("email", email.toLowerCase())
    .single();

  if (error && error.code !== "PGRST116") {
    console.error("[Supabase] getUserByEmail error:", error);
  }
  return data;
}

/**
 * Get user by ID
 */
async function getUserById(id) {
  const { data, error } = await getSupabase()
    .from("users")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error("[Supabase] getUserById error:", error);
  }
  return data;
}

/**
 * Create new user
 */
async function createUser({ email, passwordHash, verified = false, verificationToken = null, authProvider = "local" }) {
  const { data, error } = await getSupabase()
    .from("users")
    .insert({
      email: email.toLowerCase(),
      password_hash: passwordHash,
      verified,
      verification_token: verificationToken,
      auth_provider: authProvider,
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    console.error("[Supabase] createUser error:", error);
    throw error;
  }

  console.log(`[Supabase] User created: ${email}`);
  return data;
}

/**
 * Update user
 */
async function updateUser(id, updates) {
  const { data, error } = await getSupabase()
    .from("users")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[Supabase] updateUser error:", error);
  }
  return data;
}

/**
 * Verify user email
 */
async function verifyUser(id) {
  return updateUser(id, { verified: true, verification_token: null });
}

/**
 * Get all users (for admin)
 */
async function getAllUsers() {
  const { data, error } = await getSupabase()
    .from("users")
    .select("id, email, verified, login_count, last_login, auth_provider, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[Supabase] getAllUsers error:", error);
  }
  return data || [];
}

// ============================================
// LOGIN HISTORY OPERATIONS
// ============================================

/**
 * Record login attempt
 */
async function recordLoginAttempt({ userId, email, success, ipAddress, userAgent, authMethod }) {
  // Insert login history record
  const { error: historyError } = await getSupabase()
    .from("login_history")
    .insert({
      user_id: userId,
      email: email.toLowerCase(),
      success,
      ip_address: ipAddress,
      user_agent: userAgent,
      auth_method: authMethod,
      created_at: new Date().toISOString()
    });

  if (historyError) {
    console.error("[Supabase] recordLoginAttempt error:", historyError);
  }

  // Update user's last_login and login_count if successful
  if (success && userId) {
    // First get current login count
    const { data: userData } = await getSupabase()
      .from("users")
      .select("login_count")
      .eq("id", userId)
      .single();

    const currentCount = userData?.login_count || 0;

    // Update with incremented count
    const { error: updateError } = await getSupabase()
      .from("users")
      .update({
        last_login: new Date().toISOString(),
        login_count: currentCount + 1
      })
      .eq("id", userId);

    if (updateError) {
      console.error("[Supabase] Error updating login stats:", updateError);
    }
  }
}

/**
 * Get login history for a user
 */
async function getLoginHistory(userId, limit = 10) {
  const { data, error } = await getSupabase()
    .from("login_history")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[Supabase] getLoginHistory error:", error);
  }
  return data || [];
}

/**
 * Get all login history (for admin)
 */
async function getAllLoginHistory(limit = 50) {
  const { data, error } = await getSupabase()
    .from("login_history")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[Supabase] getAllLoginHistory error:", error);
  }
  return data || [];
}

// ============================================
// TRACKED PRODUCTS OPERATIONS
// ============================================

/**
 * Add product to tracking
 */
async function addTrackedProduct({ userId, productId, productTitle, productUrl, source, targetPrice, currentPrice }) {
  const { data, error } = await getSupabase()
    .from("tracked_products")
    .insert({
      user_id: userId,
      product_id: productId,
      product_title: productTitle,
      product_url: productUrl,
      source,
      target_price: targetPrice,
      current_price: currentPrice,
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    console.error("[Supabase] addTrackedProduct error:", error);
  }
  return data;
}

/**
 * Get user's tracked products
 */
async function getTrackedProducts(userId) {
  const { data, error } = await getSupabase()
    .from("tracked_products")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[Supabase] getTrackedProducts error:", error);
  }
  return data || [];
}

/**
 * Remove tracked product
 */
async function removeTrackedProduct(id, userId) {
  const { error } = await getSupabase()
    .from("tracked_products")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    console.error("[Supabase] removeTrackedProduct error:", error);
  }
  return !error;
}

/**
 * Get all tracked products (for background worker)
 */
async function getAllTrackedProducts() {
  const { data, error } = await getSupabase()
    .from("tracked_products")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[Supabase] getAllTrackedProducts error:", error);
  }
  return data || [];
}

/**
 * Update tracked product price and last_checked timestamp
 */
async function updateTrackedProductPrice(id, price) {
  const { data, error } = await getSupabase()
    .from("tracked_products")
    .update({
      current_price: price,
      last_checked: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[Supabase] updateTrackedProductPrice error:", error);
  }
  return data;
}

// ============================================
// PRICE HISTORY OPERATIONS
// ============================================

/**
 * Add price history entry for a tracked product
 * Also invalidates the Redis cache for this product's price history
 */
async function addPriceHistory(trackedProductId, price) {
  const { data, error } = await getSupabase()
    .from("price_history")
    .insert({
      tracked_product_id: trackedProductId,
      price,
      recorded_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error("[Supabase] addPriceHistory error:", error);
  }

  // Invalidate cache for all periods when new price is added
  try {
    const { deleteCachePattern } = require("./config/redis");
    await deleteCachePattern(`price-history:${trackedProductId}:*`);
  } catch (cacheError) {
    // Don't fail if cache invalidation fails
    console.error("[Supabase] Cache invalidation error:", cacheError.message);
  }

  return data;
}

/**
 * Get price history for a tracked product
 * @param {string} trackedProductId - The tracked product ID
 * @param {Object} options - Query options
 * @param {number} options.limit - Maximum number of records to return
 * @param {string} options.period - Time period: '7d', '30d', or 'all'
 */
async function getPriceHistory(trackedProductId, options = {}) {
  const { limit = 100, period = "all" } = options;

  // Calculate date range based on period
  let startDate = null;
  if (period === "7d") {
    startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
  } else if (period === "30d") {
    startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
  }

  let query = getSupabase()
    .from("price_history")
    .select("*")
    .eq("tracked_product_id", trackedProductId)
    .order("recorded_at", { ascending: false });

  // Apply date filter if period is specified
  if (startDate) {
    query = query.gte("recorded_at", startDate.toISOString());
  }

  // Apply limit
  query = query.limit(limit);

  const { data, error } = await query;

  if (error) {
    console.error("[Supabase] getPriceHistory error:", error);
  }
  return data || [];
}

/**
 * Get price statistics for a tracked product
 * Calculates avg, min, max for the given period
 * @param {string} trackedProductId - The tracked product ID
 * @param {string} period - Time period: '7d', '30d', or 'all'
 */
async function getPriceStatistics(trackedProductId, period = "30d") {
  // Get price history for the period
  const history = await getPriceHistory(trackedProductId, { period, limit: 1000 });

  if (!history || history.length === 0) {
    return null;
  }

  const prices = history.map(h => parseFloat(h.price));
  const currentPrice = prices[0]; // Most recent price (ordered desc)
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const avgPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;

  // Calculate price change from oldest to newest in this period
  const oldestPrice = prices[prices.length - 1];
  const priceChange = currentPrice - oldestPrice;
  const priceChangePercent = oldestPrice > 0 ? ((priceChange / oldestPrice) * 100) : 0;

  // Good Deal logic: current price is at least 5% below average
  const goodDealThreshold = avgPrice * 0.95;
  const isGoodDeal = currentPrice < goodDealThreshold;
  const savingsFromAvg = avgPrice - currentPrice;
  const savingsPercent = avgPrice > 0 ? ((savingsFromAvg / avgPrice) * 100) : 0;

  return {
    currentPrice,
    minPrice,
    maxPrice,
    avgPrice: Math.round(avgPrice * 100) / 100, // Round to 2 decimal places
    priceChange: Math.round(priceChange * 100) / 100,
    priceChangePercent: Math.round(priceChangePercent * 100) / 100,
    isGoodDeal,
    savingsFromAvg: isGoodDeal ? Math.round(savingsFromAvg * 100) / 100 : 0,
    savingsPercent: isGoodDeal ? Math.round(savingsPercent * 100) / 100 : 0,
    dataPoints: history.length,
    periodStart: history.length > 0 ? history[history.length - 1].recorded_at : null,
    periodEnd: history.length > 0 ? history[0].recorded_at : null,
  };
}

// ============================================
// DEMO DATA SETUP
// ============================================

/**
 * Create demo accounts if they don't exist
 */
async function createDemoAccounts() {
  const demoUsers = [
    { email: "demo@shopsavvy.com", password: "demo1234" },
    { email: "test@example.com", password: "test1234" },
    { email: "admin@shopsavvy.com", password: "admin1234" }
  ];

  for (const user of demoUsers) {
    const existing = await getUserByEmail(user.email);
    if (!existing) {
      const passwordHash = await bcrypt.hash(user.password, 10);
      await createUser({
        email: user.email,
        passwordHash,
        verified: true,
        authProvider: "local"
      });
      console.log(`[Supabase] Created demo account: ${user.email}`);
    }
  }
}

// ============================================
// DATABASE INTERFACE (SQLite-compatible)
// ============================================

/**
 * Create a database interface that mimics SQLite's db.get/db.run/db.all
 * This allows minimal changes to existing code
 */
function createDbInterface() {
  // Helper to normalize params (can be array or single value)
  const normalizeParams = (params) => {
    if (params === undefined || params === null) return [];
    if (Array.isArray(params)) return params;
    return [params]; // Wrap single value in array
  };

  return {
    // Get single row
    async get(query, rawParams) {
      const params = normalizeParams(rawParams);
      // Parse the query to determine what to do
      if (query.includes("SELECT") && query.includes("FROM users")) {
        if (query.includes("WHERE email")) {
          return getUserByEmail(params[0]);
        }
        if (query.includes("WHERE id")) {
          return getUserById(params[0]);
        }
      }
      console.warn("[Supabase] Unhandled query:", query);
      return null;
    },

    // Run insert/update/delete
    async run(query, rawParams) {
      const params = normalizeParams(rawParams);
      // Handle INSERT into users
      if (query.includes("INSERT INTO users")) {
        return createUser({
          email: params[0],
          passwordHash: params[1], // Already hashed
          verified: params[2] || false,
          verificationToken: params[3] || null,
          authProvider: params[4] || "local"
        });
      }

      // Handle UPDATE users
      if (query.includes("UPDATE users") && query.includes("verified")) {
        const id = params[params.length - 1];
        return verifyUser(id);
      }

      // Handle UPDATE users SET auth_provider
      if (query.includes("UPDATE users") && query.includes("auth_provider")) {
        const id = params[params.length - 1];
        return updateUser(id, { auth_provider: "google", verified: true });
      }

      console.warn("[Supabase] Unhandled query:", query);
      return { changes: 0 };
    },

    // Get multiple rows
    async all(query, rawParams) {
      const params = normalizeParams(rawParams);
      if (query.includes("FROM users")) {
        return getAllUsers();
      }
      if (query.includes("FROM login_history")) {
        if (params[0]) {
          return getLoginHistory(params[0], params[1] || 10);
        }
        return getAllLoginHistory();
      }
      console.warn("[Supabase] Unhandled query:", query);
      return [];
    }
  };
}

module.exports = {
  initSupabase,
  getSupabase,
  verifyTables,
  createDbInterface,
  // User operations
  getUserByEmail,
  getUserById,
  createUser,
  updateUser,
  verifyUser,
  getAllUsers,
  // Login history
  recordLoginAttempt,
  getLoginHistory,
  getAllLoginHistory,
  // Tracked products
  addTrackedProduct,
  getTrackedProducts,
  removeTrackedProduct,
  getAllTrackedProducts,
  updateTrackedProductPrice,
  // Price history
  addPriceHistory,
  getPriceHistory,
  getPriceStatistics,
  // Setup
  createDemoAccounts
};
