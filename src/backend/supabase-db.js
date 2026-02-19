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
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  const keyType = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? "service_role"
    : "anon";

  if (!supabaseUrl || !supabaseKey) {
    console.error("[Supabase] Missing SUPABASE_URL or SUPABASE_ANON_KEY");
    return null;
  }

  supabase = createClient(supabaseUrl, supabaseKey);
  console.log(`[Supabase] Client initialized (using ${keyType} key)`);

  if (keyType === "anon") {
    console.log(
      "[Supabase] ⚠️  For better reliability, add SUPABASE_SERVICE_ROLE_KEY to .env",
    );
  }

  return supabase;
}

/**
 * Helper to check a single table with retry for transient errors
 */
async function checkTableWithRetry(table, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const { data, error } = await getSupabase()
        .from(table)
        .select("id")
        .limit(1);

      if (error) {
        // Check if it's a transient network error
        const isTransient =
          error.message.includes("fetch failed") ||
          error.message.includes("ECONNRESET") ||
          error.message.includes("ETIMEDOUT");

        if (isTransient && attempt < maxRetries) {
          // Wait before retry (exponential backoff)
          await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
          continue;
        }

        return { success: false, error };
      }

      return { success: true, data };
    } catch (err) {
      // Check if it's a transient error
      const isTransient =
        err.message.includes("fetch failed") ||
        err.message.includes("ECONNRESET") ||
        err.message.includes("ETIMEDOUT");

      if (isTransient && attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
        continue;
      }

      return { success: false, error: { message: err.message } };
    }
  }
  return { success: false, error: { message: "Max retries exceeded" } };
}

/**
 * Verify that required tables exist in Supabase
 * Returns { ok: boolean, missingTables: string[], error: string|null }
 */
async function verifyTables() {
  const requiredTables = [
    "users",
    "login_history",
    "user_sessions",
    "tracked_products",
    "price_history",
  ];
  const missingTables = [];
  const tableErrors = {};

  console.log("[Supabase] Checking tables...");

  for (const table of requiredTables) {
    const result = await checkTableWithRetry(table);

    if (!result.success) {
      const error = result.error;
      // Log the actual error for debugging
      console.log(`[Supabase]   ${table}: ❌ ${error.message}`);
      tableErrors[table] = error.message;

      // Check for common error patterns that indicate missing table
      const errorMsg = error.message.toLowerCase();
      if (
        errorMsg.includes("schema cache") ||
        errorMsg.includes("does not exist") ||
        errorMsg.includes("relation") ||
        errorMsg.includes("permission denied") ||
        errorMsg.includes("fetch failed") || // Treat persistent fetch failures as table issues
        error.code === "42P01" || // PostgreSQL: undefined_table
        error.code === "PGRST204"
      ) {
        // PostgREST: no such table
        missingTables.push(table);
      }
    } else {
      console.log(`[Supabase]   ${table}: ✓`);
    }
  }

  if (missingTables.length > 0) {
    console.error(
      `\n[Supabase] ❌ Problem tables: ${missingTables.join(", ")}`,
    );
    console.error("[Supabase] This could be due to:");
    console.error("[Supabase]   1. Tables not created - run migration SQL");
    console.error(
      "[Supabase]   2. RLS blocking access - add SUPABASE_SERVICE_ROLE_KEY to .env",
    );
    console.error(
      "[Supabase]   3. Wrong Supabase project - check SUPABASE_URL",
    );
    return {
      ok: false,
      missingTables,
      error: `Problem tables: ${missingTables.join(", ")}`,
      tableErrors,
    };
  }

  console.log("[Supabase] ✓ All required tables accessible");

  // Check for critical columns from migrations
  const columnChecks = await verifyMigrationColumns();
  if (!columnChecks.ok) {
    console.warn("[Supabase] ⚠️  Some migrations may not be applied:");
    columnChecks.warnings.forEach((warning) =>
      console.warn(`[Supabase]   - ${warning}`),
    );
  }

  return {
    ok: true,
    missingTables: [],
    error: null,
    columnWarnings: columnChecks.warnings,
  };
}

/**
 * Verify critical columns from migrations exist
 * Returns { ok: boolean, warnings: string[] }
 */
async function verifyMigrationColumns() {
  const warnings = [];

  // Check Migration 004: product extended fields
  try {
    const { data, error } = await getSupabase()
      .from("tracked_products")
      .select("thumbnail, description, seller, rating, condition, currency")
      .limit(1);

    if (
      error &&
      (error.message.includes("does not exist") ||
        error.message.includes("column"))
    ) {
      warnings.push(
        "Migration 004 (product images/descriptions) may not be applied",
      );
    }
  } catch (e) {
    // Ignore - table might be empty
  }

  // Check Migration 005: search_history table
  try {
    const { error } = await getSupabase()
      .from("search_history")
      .select("id")
      .limit(1);

    if (error && error.message.includes("does not exist")) {
      warnings.push("Migration 005 (search history) may not be applied");
    }
  } catch (e) {
    warnings.push("Migration 005 (search history) table not found");
  }

  // Check Migration 006: user roles
  try {
    const { data, error } = await getSupabase()
      .from("users")
      .select("role")
      .limit(1);

    if (
      error &&
      (error.message.includes("does not exist") ||
        error.message.includes("column"))
    ) {
      warnings.push("Migration 006 (user roles) may not be applied");
    }
  } catch (e) {
    // Ignore
  }

  // Check Migration 007: product_cache table
  try {
    const { error } = await getSupabase()
      .from("product_cache")
      .select("id")
      .limit(1);

    if (error && error.message.includes("does not exist")) {
      warnings.push(
        "Migration 007 (product_cache table) may not be applied - REQUIRED FOR SEARCH",
      );
    }
  } catch (e) {
    warnings.push(
      "Migration 007 (product_cache table) not found - REQUIRED FOR SEARCH",
    );
  }

  return {
    ok: warnings.length === 0,
    warnings,
  };
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
async function createUser({
  email,
  passwordHash,
  verified = false,
  verificationToken = null,
  authProvider = "local",
}) {
  const { data, error } = await getSupabase()
    .from("users")
    .insert({
      email: email.toLowerCase(),
      password_hash: passwordHash,
      verified,
      verification_token: verificationToken,
      auth_provider: authProvider,
      created_at: new Date().toISOString(),
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
    .select(
      "id, email, verified, login_count, last_login, auth_provider, created_at",
    )
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
async function recordLoginAttempt({
  userId,
  email,
  success,
  ipAddress,
  userAgent,
  authMethod,
}) {
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
      created_at: new Date().toISOString(),
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
        login_count: currentCount + 1,
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
async function addTrackedProduct({
  userId,
  productId,
  productTitle,
  productUrl,
  source,
  targetPrice,
  currentPrice,
  thumbnail,
  images,
  description,
  seller,
  rating,
  condition,
  currency,
}) {
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
      thumbnail: thumbnail || null,
      images: images || [],
      description: description || null,
      seller: seller || null,
      rating: rating || null,
      condition: condition || "new",
      currency: currency || "MXN",
      scraped_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error("[Supabase] addTrackedProduct error:", error);
  }
  return data;
}

/**
 * Cache a scraped product in the product_cache table (NOT tracked_products).
 * This stores search results for display without tracking them.
 * @param {Object} product - { id, title, url, source, price, ... }
 * @returns {Promise<Object|null>}
 */
async function cacheScrapedProduct(product) {
  console.log(`\n💾 [CACHE] ========== STORING PRODUCT ==========`);
  console.log(`💾 [CACHE] Title: "${product.title?.substring(0, 50)}..."`);
  console.log(`💾 [CACHE] Source: ${product.source}`);
  console.log(`💾 [CACHE] Product ID: ${product.id}`);

  const productData = {
    product_id: product.id,
    product_title: product.title,
    product_url: product.url || null,
    source: product.source,
    price: parseFloat(product.price) || 0,
    original_price: product.original_price
      ? parseFloat(product.original_price)
      : null,
    thumbnail:
      product.thumbnail || (product.images && product.images[0]) || null,
    images: product.images || [],
    description: product.description || null,
    seller: product.seller || null,
    rating: product.rating || null,
    available_quantity: product.available_quantity || null,
    sold_quantity: product.sold_quantity || null,
    condition: product.condition || "new",
    currency: product.currency || "USD",
    scraped_at: new Date().toISOString(),
    last_updated: new Date().toISOString(), // FIX: Changed from last_checked to last_updated
  };

  console.log("📝 [CACHE] Data being inserted:", {
    product_id: productData.product_id,
    price: productData.price,
    currency: productData.currency,
    rating: productData.rating,
    available_quantity: productData.available_quantity,
    sold_quantity: productData.sold_quantity,
    images_count: Array.isArray(productData.images)
      ? productData.images.length
      : 0,
  });

  // Try to insert, on conflict update
  const { data, error } = await getSupabase()
    .from("product_cache")
    .upsert(productData, {
      onConflict: "product_id,source",
      ignoreDuplicates: false,
    })
    .select()
    .single();

  if (error) {
    console.error(`\n❌ [CACHE] ========== DATABASE ERROR ==========`);
    console.error(
      `❌ [CACHE] Failed to store product: ${productData.product_id}`,
    );
    console.error(`❌ [CACHE] Error message: ${error.message}`);
    console.error(`❌ [CACHE] Error code: ${error.code}`);
    console.error(`❌ [CACHE] Error details:`, JSON.stringify(error, null, 2));

    // Check for common errors
    if (error.code === "PGRST204") {
      console.error(
        `\n💡 [CACHE] SOLUTION: Column not found in database schema`,
      );
      console.error(
        `💡 [CACHE] This means the database table is missing required columns.`,
      );
      console.error(
        `💡 [CACHE] ACTION REQUIRED: Run migration 008 to add missing columns:`,
      );
      console.error(`💡 [CACHE]   1. Go to Supabase Dashboard > SQL Editor`);
      console.error(
        `💡 [CACHE]   2. Run: migrations/008_add_product_quantity_fields.sql`,
      );
      console.error(`💡 [CACHE]   3. Restart the server`);
    } else if (error.code === "23505") {
      console.error(
        `\n💡 [CACHE] Duplicate key violation - product already exists`,
      );
    }

    console.error(`❌ [CACHE] ==========================================\n`);
    return null;
  }

  console.log(`✅ [CACHE] Successfully stored product!`);
  console.log(`✅ [CACHE] Product ID: ${data.product_id}`);
  console.log(`✅ [CACHE] Price: ${data.currency} ${data.price}`);
  console.log(`✅ [CACHE] Stock: ${data.available_quantity || "unknown"}`);
  console.log(`💾 [CACHE] ==========================================\n`);
  return data;
}

// DELETED: upsertScrapedProduct - was causing auto-tracking bug
// Use cacheScrapedProduct() instead

/**
 * Search product cache (for displaying search results)
 * @param {string} query - Search query
 * @param {Object} options - { limit, source }
 * @returns {Promise<Array>}
 */
async function searchProductCache(query, options = {}) {
  const { limit = 20, source = "all", fuzzy = false } = options;

  // Normalize query for better matching
  const normalizedQuery = query.trim().toLowerCase();

  // OPTIMIZATION: For fuzzy search, try multiple search strategies
  if (fuzzy) {
    // Split query into words for broader matching
    const words = normalizedQuery.split(/\s+/).filter((w) => w.length > 2);

    if (words.length === 0) {
      return []; // Query too short for fuzzy search
    }

    // Search for products matching ANY of the keywords
    let queryBuilder = getSupabase()
      .from("product_cache")
      .select("*")
      .order("scraped_at", { ascending: false })
      .limit(limit * 2); // Get more results for filtering

    // Build OR condition for fuzzy matching
    const orConditions = words
      .map((word) => `product_title.ilike.%${word}%`)
      .join(",");
    queryBuilder = queryBuilder.or(orConditions);

    // Filter by source if specified
    if (source !== "all") {
      queryBuilder = queryBuilder.eq("source", source);
    }

    const { data, error } = await queryBuilder;

    if (error) {
      console.error("[Supabase] searchProductCache (fuzzy) error:", error);
      return [];
    }

    // Score and sort results by relevance
    const scoredResults = (data || []).map((product) => {
      const title = (product.product_title || "").toLowerCase();
      let score = 0;

      // Exact query match = highest score
      if (title.includes(normalizedQuery)) {
        score += 100;
      }

      // Count matching words
      words.forEach((word) => {
        if (title.includes(word)) {
          score += 10;
        }
      });

      // Prefer newer results (slight boost)
      const age = Date.now() - new Date(product.scraped_at).getTime();
      const ageHours = age / (1000 * 60 * 60);
      if (ageHours < 24) score += 5;

      return { ...product, _score: score };
    });

    // Sort by score and return top results
    return scoredResults.sort((a, b) => b._score - a._score).slice(0, limit);
  }

  // OPTIMIZATION: Standard exact search (fast path)
  let queryBuilder = getSupabase()
    .from("product_cache")
    .select("*")
    .ilike("product_title", `%${normalizedQuery}%`)
    .order("scraped_at", { ascending: false })
    .limit(limit);

  // Filter by source if specified
  if (source !== "all") {
    queryBuilder = queryBuilder.eq("source", source);
  }

  const { data, error } = await queryBuilder;

  if (error) {
    console.error("[Supabase] searchProductCache error:", error);
    return [];
  }

  return data || [];
}

/**
 * Get a single product from product_cache by product_id
 * @param {string} productId - The product ID to search for
 * @returns {Promise<Object|null>} - Product data or null
 */
async function getProductFromCache(productId) {
  console.log(`[Supabase] Getting product from cache: ${productId}`);

  const { data, error } = await getSupabase()
    .from("product_cache")
    .select("*")
    .eq("product_id", productId)
    .order("scraped_at", { ascending: false })
    .limit(1)
    .single();

  if (error) {
    // Check if error is "no rows" which is expected
    if (error.code === "PGRST116") {
      console.log(`[Supabase] Product not found in cache: ${productId}`);
      return null;
    }
    console.error("[Supabase] getProductFromCache error:", error);
    return null;
  }

  console.log(`[Supabase] Found product in cache: ${data?.product_title}`);
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

// DELETED: searchTrackedProducts
// Was used for old cache system that stored searches in tracked_products
// Now use: searchProductCache() for search results cache

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
 * Look up a single tracked product by its product_id (works for any source).
 * Returns the row or null.
 */
async function getTrackedProductById(productId, source) {
  let req = getSupabase()
    .from("tracked_products")
    .select("*")
    .eq("product_id", productId);

  if (source && source !== "all") {
    req = req.eq("source", source);
  }

  const { data, error } = await req.single();
  if (error) {
    // PGRST116 = no rows — not a real error
    if (error.code !== "PGRST116") {
      console.error("[Supabase] getTrackedProductById error:", error);
    }
    return null;
  }
  return data;
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
  const history = await getPriceHistory(trackedProductId, {
    period,
    limit: 1000,
  });

  if (!history || history.length === 0) {
    return null;
  }

  const prices = history.map((h) => parseFloat(h.price));
  const currentPrice = prices[0]; // Most recent price (ordered desc)
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const avgPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;

  // Calculate price change from oldest to newest in this period
  const oldestPrice = prices[prices.length - 1];
  const priceChange = currentPrice - oldestPrice;
  const priceChangePercent =
    oldestPrice > 0 ? (priceChange / oldestPrice) * 100 : 0;

  // Good Deal logic: current price is at least 5% below average
  const goodDealThreshold = avgPrice * 0.95;
  const isGoodDeal = currentPrice < goodDealThreshold;
  const savingsFromAvg = avgPrice - currentPrice;
  const savingsPercent = avgPrice > 0 ? (savingsFromAvg / avgPrice) * 100 : 0;

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
    periodStart:
      history.length > 0 ? history[history.length - 1].recorded_at : null,
    periodEnd: history.length > 0 ? history[0].recorded_at : null,
  };
}

// ============================================
// HIGHLIGHTED DEALS & DISCOVERY FUNCTIONS
// ============================================

/**
 * Get highlighted deals from PRODUCT CACHE (scraped search results)
 * Shows recently scraped products with good ratings and availability
 * @param {number} limit - Maximum products to return
 */
async function getHighlightedDealsFromCache(limit = 12) {
  try {
    console.log(
      `[Cache Deals] Fetching highlighted deals from product_cache (limit: ${limit})`,
    );

    // Get products from product_cache with good ratings, sorted by recency
    const { data: products, error } = await getSupabase()
      .from("product_cache")
      .select("*")
      .not("price", "is", null)
      .gt("price", 0) // Exclude $0 prices
      .gt("available_quantity", 0) // Must have inventory
      .order("scraped_at", { ascending: false })
      .limit(limit * 3); // Get more to filter

    if (error) {
      console.error("[Cache Deals] getHighlightedDealsFromCache error:", error);
      return [];
    }

    if (!products || products.length === 0) {
      console.log("[Cache Deals] No products found in product_cache");
      return [];
    }

    console.log(`[Cache Deals] Found ${products.length} products in cache`);

    // Score products based on multiple factors
    const scoredProducts = products.map((product) => {
      let score = 0;

      // Factor 1: Rating (0-50 points)
      const rating = parseFloat(product.rating) || 0;
      if (rating >= 4.5) score += 50;
      else if (rating >= 4.0) score += 40;
      else if (rating >= 3.5) score += 30;
      else if (rating >= 3.0) score += 20;

      // Factor 2: Availability (0-30 points)
      const availableQty = product.available_quantity || 0;
      if (availableQty > 100) score += 30;
      else if (availableQty > 50) score += 25;
      else if (availableQty > 10) score += 20;
      else if (availableQty > 0) score += 10;

      // Factor 3: Sales volume (0-20 points)
      const soldQty = product.sold_quantity || 0;
      if (soldQty > 1000) score += 20;
      else if (soldQty > 500) score += 15;
      else if (soldQty > 100) score += 10;
      else if (soldQty > 50) score += 5;

      return { ...product, _dealScore: score };
    });

    // Sort by score and return top deals
    const topDeals = scoredProducts
      .sort((a, b) => b._dealScore - a._dealScore)
      .slice(0, limit);

    console.log(`[Cache Deals] Returning ${topDeals.length} highlighted deals`);
    return topDeals;
  } catch (err) {
    console.error("[Cache Deals] getHighlightedDealsFromCache exception:", err);
    return [];
  }
}

/**
 * Get popular products from PRODUCT CACHE (most sold, highest rated)
 * @param {Object} options - Query options
 */
async function getPopularProductsFromCache({ limit = 8 } = {}) {
  try {
    console.log(
      `[Cache Popular] Fetching popular products from product_cache (limit: ${limit})`,
    );

    // Get products sorted by sold quantity and rating
    const { data: products, error } = await getSupabase()
      .from("product_cache")
      .select("*")
      .not("price", "is", null)
      .gt("price", 0) // Exclude $0 prices
      .gt("available_quantity", 0) // Must have inventory
      .order("sold_quantity", { ascending: false })
      .limit(limit * 2);

    if (error) {
      console.error(
        "[Cache Popular] getPopularProductsFromCache error:",
        error,
      );
      return [];
    }

    if (!products || products.length === 0) {
      console.log("[Cache Popular] No products found in product_cache");
      return [];
    }

    console.log(`[Cache Popular] Found ${products.length} products`);

    // Sort by combination of sold quantity and rating
    const sortedProducts = products
      .map((p) => ({
        ...p,
        _popularityScore:
          (p.sold_quantity || 0) * 0.7 + (parseFloat(p.rating) || 0) * 100,
      }))
      .sort((a, b) => b._popularityScore - a._popularityScore)
      .slice(0, limit);

    console.log(
      `[Cache Popular] Returning ${sortedProducts.length} popular products`,
    );
    return sortedProducts;
  } catch (err) {
    console.error(
      "[Cache Popular] getPopularProductsFromCache exception:",
      err,
    );
    return [];
  }
}

/**
 * Get recently added products from PRODUCT CACHE
 * @param {Object} options - Query options
 */
async function getRecentProductsFromCache({
  limit = 8,
  period = "recent",
} = {}) {
  try {
    console.log(
      `[Cache Recent] Fetching recent products from product_cache (limit: ${limit})`,
    );

    // Calculate time range
    let hoursBack = 48; // default: 2 days
    if (period === "daily") hoursBack = 24;
    else if (period === "weekly") hoursBack = 168;

    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - hoursBack);

    // Get recently scraped products
    const { data: products, error } = await getSupabase()
      .from("product_cache")
      .select("*")
      .not("price", "is", null)
      .gt("price", 0) // Exclude $0 prices
      .gt("available_quantity", 0) // Must have inventory
      .gte("scraped_at", cutoffDate.toISOString())
      .order("scraped_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[Cache Recent] getRecentProductsFromCache error:", error);
      return [];
    }

    console.log(
      `[Cache Recent] Found ${products?.length || 0} recent products`,
    );
    return products || [];
  } catch (err) {
    console.error("[Cache Recent] getRecentProductsFromCache exception:", err);
    return [];
  }
}

/**
 * Get products by category from product_cache
 * Used for category page filtering (fast database query, no search)
 * @param {string} category - Category to filter by
 * @param {object} options - Filter options
 * @returns {Promise<Array>} Products in the category
 */
async function getProductsByCategory(category, options = {}) {
  try {
    const {
      limit = 100,
      minPrice = 0,
      maxPrice = 999999,
      source = "all",
    } = options;

    console.log(`[Category Filter] Getting products for category: ${category}`);

    let query = getSupabase()
      .from("product_cache")
      .select("*")
      .eq("category", category)
      .gt("price", 0)
      .gte("price", minPrice)
      .lte("price", maxPrice)
      .gt("available_quantity", 0);

    // Filter by source if specified
    if (source !== "all") {
      query = query.eq("source", source);
    }

    const { data: products, error } = await query
      .order("scraped_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[Category Filter] Error:", error);
      return [];
    }

    console.log(
      `[Category Filter] Found ${products?.length || 0} products in "${category}"`,
    );
    return products || [];
  } catch (err) {
    console.error("[Category Filter] Exception:", err);
    return [];
  }
}

/**
 * OLD FUNCTION - Get highlighted deals from TRACKED PRODUCTS (user dashboard items)
 * Aggregates data across all users' tracked products
 * @param {number} limit - Maximum products to return
 */
async function getHighlightedDeals(limit = 10) {
  try {
    // Get all tracked products with their price history
    const { data: products, error } = await getSupabase()
      .from("tracked_products")
      .select("*")
      .not("current_price", "is", null)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[Supabase] getHighlightedDeals error:", error);
      return [];
    }

    if (!products || products.length === 0) return [];

    // Get unique products by product_id (aggregate across users)
    const productMap = new Map();
    for (const p of products) {
      if (!productMap.has(p.product_id)) {
        productMap.set(p.product_id, p);
      }
    }

    // Calculate stats for each unique product
    const dealsWithStats = [];
    for (const product of productMap.values()) {
      const history = await getPriceHistory(product.id, {
        period: "30d",
        limit: 100,
      });

      // Need at least 2 data points to make a meaningful comparison;
      // a single entry would trivially satisfy current <= min.
      if (history && history.length >= 2) {
        const prices = history.map((h) => parseFloat(h.price));
        const currentPrice = parseFloat(product.current_price);
        const minPrice = Math.min(...prices);
        const avgPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;

        const isBestPrice = currentPrice <= minPrice;
        const isGoodDeal = currentPrice < avgPrice * 0.95;
        const savingsPercent =
          avgPrice > 0 ? ((avgPrice - currentPrice) / avgPrice) * 100 : 0;

        if (isBestPrice || isGoodDeal) {
          dealsWithStats.push({
            ...product,
            minPrice,
            avgPrice: Math.round(avgPrice * 100) / 100,
            isBestPrice,
            isGoodDeal,
            savingsPercent: Math.round(savingsPercent * 100) / 100,
            savingsAmount: Math.round((avgPrice - currentPrice) * 100) / 100,
            dataPoints: history.length,
          });
        }
      }
    }

    // Sort by savings percentage (best deals first)
    dealsWithStats.sort((a, b) => b.savingsPercent - a.savingsPercent);

    return dealsWithStats.slice(0, limit);
  } catch (err) {
    console.error("[Supabase] getHighlightedDeals exception:", err);
    return [];
  }
}

/**
 * Get popular products - most tracked across all users
 * @param {Object} options - Query options
 * @param {number} options.limit - Max products to return
 * @param {string} options.category - Filter by category (optional)
 * @param {boolean} options.dealsOnly - Only return products that are deals
 */
async function getPopularProducts({
  limit = 8,
  category = "",
  dealsOnly = false,
} = {}) {
  try {
    // Get all tracked products
    const { data: products, error } = await getSupabase()
      .from("tracked_products")
      .select("*")
      .not("current_price", "is", null);

    if (error) {
      console.error("[Supabase] getPopularProducts error:", error);
      return [];
    }

    if (!products || products.length === 0) return [];

    // Count tracking frequency per product_id
    const productCounts = new Map();
    for (const p of products) {
      const key = p.product_id;
      if (!productCounts.has(key)) {
        productCounts.set(key, { product: p, count: 0 });
      }
      productCounts.get(key).count++;
    }

    // Convert to array and sort by popularity
    let popularProducts = Array.from(productCounts.values())
      .sort((a, b) => b.count - a.count)
      .map((item) => ({ ...item.product, trackCount: item.count }));

    // Filter by category if specified
    if (category) {
      popularProducts = popularProducts.filter(
        (p) =>
          p.product_title?.toLowerCase().includes(category.toLowerCase()) ||
          p.source?.toLowerCase() === category.toLowerCase(),
      );
    }

    // If dealsOnly, calculate and filter deals
    if (dealsOnly) {
      const dealsFiltered = [];
      for (const product of popularProducts) {
        const history = await getPriceHistory(product.id, {
          period: "30d",
          limit: 50,
        });
        if (history && history.length > 0) {
          const prices = history.map((h) => parseFloat(h.price));
          const currentPrice = parseFloat(product.current_price);
          const avgPrice =
            prices.reduce((sum, p) => sum + p, 0) / prices.length;
          const minPrice = Math.min(...prices);

          const isGoodDeal = currentPrice < avgPrice * 0.95;
          const isBestPrice = currentPrice <= minPrice;

          if (isGoodDeal || isBestPrice) {
            dealsFiltered.push({
              ...product,
              avgPrice: Math.round(avgPrice * 100) / 100,
              minPrice,
              isGoodDeal,
              isBestPrice,
              savingsPercent:
                Math.round(((avgPrice - currentPrice) / avgPrice) * 100 * 100) /
                100,
            });
          }
        }
      }
      return dealsFiltered.slice(0, limit);
    }

    return popularProducts.slice(0, limit);
  } catch (err) {
    console.error("[Supabase] getPopularProducts exception:", err);
    return [];
  }
}

/**
 * Get top price drops - products with biggest recent price decreases
 * @param {Object} options - Query options
 * @param {string} options.period - 'recent' (24h), 'daily' (today), 'weekly' (7 days)
 * @param {string} options.category - Filter by category (optional)
 * @param {number} options.limit - Max products to return
 */
async function getTopPriceDrops({
  period = "recent",
  category = "",
  limit = 8,
} = {}) {
  try {
    // Determine time range based on period
    let hoursBack;
    switch (period) {
      case "daily":
        hoursBack = 24;
        break;
      case "weekly":
        hoursBack = 168; // 7 * 24
        break;
      case "recent":
      default:
        hoursBack = 48;
        break;
    }

    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - hoursBack);

    // Get all tracked products
    const { data: products, error } = await getSupabase()
      .from("tracked_products")
      .select("*")
      .not("current_price", "is", null);

    if (error) {
      console.error("[Supabase] getTopPriceDrops error:", error);
      return [];
    }

    if (!products || products.length === 0) return [];

    // Get unique products by product_id
    const productMap = new Map();
    for (const p of products) {
      if (!productMap.has(p.product_id)) {
        productMap.set(p.product_id, p);
      }
    }

    // Calculate price drops for each product
    const priceDrops = [];
    for (const product of productMap.values()) {
      // Filter by category if specified
      if (
        category &&
        !product.product_title?.toLowerCase().includes(category.toLowerCase())
      ) {
        continue;
      }

      const history = await getPriceHistory(product.id, {
        period: period === "weekly" ? "7d" : "30d",
        limit: 100,
      });

      if (history && history.length >= 2) {
        const currentPrice = parseFloat(product.current_price);

        // Find the oldest price in our period
        const pricesInPeriod = history.filter(
          (h) => new Date(h.recorded_at) >= cutoffDate,
        );

        if (pricesInPeriod.length > 0) {
          const oldestInPeriod = pricesInPeriod[pricesInPeriod.length - 1];
          const periodStartPrice = parseFloat(oldestInPeriod.price);

          if (periodStartPrice > currentPrice) {
            const dropAmount = periodStartPrice - currentPrice;
            const dropPercent = (dropAmount / periodStartPrice) * 100;

            priceDrops.push({
              ...product,
              previousPrice: periodStartPrice,
              dropAmount: Math.round(dropAmount * 100) / 100,
              dropPercent: Math.round(dropPercent * 100) / 100,
              periodStart: oldestInPeriod.recorded_at,
            });
          }
        }
      }
    }

    // Sort by drop percentage (biggest drops first)
    priceDrops.sort((a, b) => b.dropPercent - a.dropPercent);

    return priceDrops.slice(0, limit);
  } catch (err) {
    console.error("[Supabase] getTopPriceDrops exception:", err);
    return [];
  }
}

/**
 * Get discounts aggregated by category
 * Returns categories with their max discount percentage
 */
async function getDiscountsByCategory() {
  try {
    // Get all tracked products
    const { data: products, error } = await getSupabase()
      .from("tracked_products")
      .select("*")
      .not("current_price", "is", null);

    if (error) {
      console.error("[Supabase] getDiscountsByCategory error:", error);
      return [];
    }

    if (!products || products.length === 0) return [];

    // Define category keywords and their display info
    const categoryDefinitions = [
      {
        key: "electronics",
        keywords: [
          "phone",
          "laptop",
          "computer",
          "tablet",
          "tv",
          "audio",
          "headphone",
          "speaker",
          "celular",
          "computadora",
          "televisor",
          "bocina",
        ],
        icon: "📱",
        nameEn: "Electronics",
        nameEs: "Electrónica",
      },
      {
        key: "home",
        keywords: [
          "home",
          "kitchen",
          "furniture",
          "decor",
          "hogar",
          "cocina",
          "mueble",
          "decoración",
        ],
        icon: "🏠",
        nameEn: "Home & Kitchen",
        nameEs: "Hogar y Cocina",
      },
      {
        key: "fashion",
        keywords: [
          "clothing",
          "shoes",
          "fashion",
          "watch",
          "jewelry",
          "ropa",
          "zapatos",
          "moda",
          "reloj",
          "joyería",
        ],
        icon: "👗",
        nameEn: "Fashion",
        nameEs: "Moda",
      },
      {
        key: "sports",
        keywords: [
          "sport",
          "fitness",
          "exercise",
          "outdoor",
          "deporte",
          "ejercicio",
          "aire libre",
        ],
        icon: "⚽",
        nameEn: "Sports & Outdoors",
        nameEs: "Deportes",
      },
      {
        key: "beauty",
        keywords: [
          "beauty",
          "cosmetic",
          "skincare",
          "perfume",
          "belleza",
          "cosmético",
          "cuidado piel",
        ],
        icon: "💄",
        nameEn: "Beauty",
        nameEs: "Belleza",
      },
      {
        key: "toys",
        keywords: ["toy", "game", "puzzle", "lego", "juguete", "juego"],
        icon: "🎮",
        nameEn: "Toys & Games",
        nameEs: "Juguetes",
      },
      {
        key: "books",
        keywords: ["book", "kindle", "reading", "libro", "lectura"],
        icon: "📚",
        nameEn: "Books",
        nameEs: "Libros",
      },
      {
        key: "automotive",
        keywords: [
          "car",
          "auto",
          "vehicle",
          "motor",
          "carro",
          "vehículo",
          "coche",
        ],
        icon: "🚗",
        nameEn: "Automotive",
        nameEs: "Automotriz",
      },
      {
        key: "other",
        keywords: [],
        icon: "📦",
        nameEn: "Other",
        nameEs: "Otros",
      },
    ];

    // Categorize products and find max discounts
    const categoryStats = new Map();

    for (const cat of categoryDefinitions) {
      categoryStats.set(cat.key, {
        ...cat,
        maxDiscount: 0,
        productCount: 0,
        bestDealProduct: null,
      });
    }

    // Process each product
    for (const product of products) {
      const title = (product.product_title || "").toLowerCase();
      let matchedCategory = "other";

      // Find matching category
      for (const cat of categoryDefinitions) {
        if (cat.keywords.some((kw) => title.includes(kw))) {
          matchedCategory = cat.key;
          break;
        }
      }

      // Get price stats for this product
      const history = await getPriceHistory(product.id, {
        period: "30d",
        limit: 50,
      });

      if (history && history.length > 0) {
        const prices = history.map((h) => parseFloat(h.price));
        const currentPrice = parseFloat(product.current_price);
        const avgPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;

        if (avgPrice > currentPrice) {
          const discountPercent = ((avgPrice - currentPrice) / avgPrice) * 100;

          const catStat = categoryStats.get(matchedCategory);
          catStat.productCount++;

          if (discountPercent > catStat.maxDiscount) {
            catStat.maxDiscount = Math.round(discountPercent);
            catStat.bestDealProduct = {
              ...product,
              avgPrice: Math.round(avgPrice * 100) / 100,
              discountPercent: Math.round(discountPercent),
            };
          }
        }
      }
    }

    // Convert to array - show ALL categories, even if they have no products yet
    // This allows users to browse all available categories
    const results = Array.from(categoryStats.values()).sort(
      (a, b) => b.maxDiscount - a.maxDiscount,
    );

    return results;
  } catch (err) {
    console.error("[Supabase] getDiscountsByCategory exception:", err);
    return [];
  }
}

/**
 * Get products by category with their stats
 * @param {string} categoryKey - Category key (e.g., 'electronics', 'fashion')
 * @param {object} options - Query options
 * @returns {Promise<Array>} Products in the category with their stats
 */
async function getProductsByCategory(categoryKey, options = {}) {
  try {
    const { limit = 50, dealsOnly = false } = options;

    // Get all tracked products
    const { data: products, error } = await getSupabase()
      .from("tracked_products")
      .select("*")
      .not("current_price", "is", null);

    if (error) {
      console.error("[Supabase] getProductsByCategory error:", error);
      return [];
    }

    if (!products || products.length === 0) return [];

    // Define category keywords (same as getDiscountsByCategory)
    const categoryDefinitions = {
      electronics: {
        keywords: [
          "phone",
          "laptop",
          "computer",
          "tablet",
          "tv",
          "audio",
          "headphone",
          "speaker",
          "celular",
          "computadora",
          "televisor",
          "bocina",
        ],
      },
      home: {
        keywords: [
          "home",
          "kitchen",
          "furniture",
          "decor",
          "hogar",
          "cocina",
          "mueble",
          "decoración",
        ],
      },
      fashion: {
        keywords: [
          "clothing",
          "shoes",
          "fashion",
          "watch",
          "jewelry",
          "ropa",
          "zapatos",
          "moda",
          "reloj",
          "joyería",
        ],
      },
      sports: {
        keywords: [
          "sport",
          "fitness",
          "exercise",
          "outdoor",
          "deporte",
          "ejercicio",
          "aire libre",
        ],
      },
      beauty: {
        keywords: [
          "beauty",
          "cosmetic",
          "skincare",
          "perfume",
          "belleza",
          "cosmético",
          "cuidado piel",
        ],
      },
      toys: { keywords: ["toy", "game", "puzzle", "lego", "juguete", "juego"] },
      books: { keywords: ["book", "kindle", "reading", "libro", "lectura"] },
      automotive: {
        keywords: [
          "car",
          "auto",
          "vehicle",
          "motor",
          "carro",
          "vehículo",
          "coche",
        ],
      },
      other: { keywords: [] },
    };

    const categoryDef = categoryDefinitions[categoryKey];
    if (!categoryDef) {
      console.error("[Supabase] Invalid category key:", categoryKey);
      return [];
    }

    // Filter products by category
    const categoryProducts = [];

    for (const product of products) {
      const title = (product.product_title || "").toLowerCase();
      let isMatch = false;

      if (categoryKey === "other") {
        // "Other" includes products that don't match any specific category
        isMatch = !Object.entries(categoryDefinitions)
          .filter(([key]) => key !== "other")
          .some(([_, def]) => def.keywords.some((kw) => title.includes(kw)));
      } else {
        // Match against category keywords
        isMatch = categoryDef.keywords.some((kw) => title.includes(kw));
      }

      if (isMatch) {
        // Get price stats for this product
        const history = await getPriceHistory(product.id, {
          period: "30d",
          limit: 50,
        });

        if (history && history.length > 0) {
          const prices = history.map((h) => parseFloat(h.price));
          const currentPrice = parseFloat(product.current_price);
          const avgPrice =
            prices.reduce((sum, p) => sum + p, 0) / prices.length;
          const minPrice = Math.min(...prices);

          const isBestPrice = currentPrice <= minPrice;
          const isGoodDeal = currentPrice < avgPrice * 0.95;
          const savingsPercent =
            avgPrice > 0 ? ((avgPrice - currentPrice) / avgPrice) * 100 : 0;
          const savingsAmount = avgPrice - currentPrice;

          const productWithStats = {
            ...product,
            avgPrice: Math.round(avgPrice * 100) / 100,
            minPrice: Math.round(minPrice * 100) / 100,
            isBestPrice,
            isGoodDeal,
            savingsPercent: Math.round(savingsPercent),
            savingsAmount: Math.round(savingsAmount * 100) / 100,
          };

          // Apply dealsOnly filter if requested
          if (!dealsOnly || isGoodDeal || isBestPrice) {
            categoryProducts.push(productWithStats);
          }
        } else {
          // Include products without history
          categoryProducts.push(product);
        }
      }
    }

    // Sort by savings percentage (best deals first)
    categoryProducts.sort(
      (a, b) => (b.savingsPercent || 0) - (a.savingsPercent || 0),
    );

    return categoryProducts.slice(0, limit);
  } catch (err) {
    console.error("[Supabase] getProductsByCategory exception:", err);
    return [];
  }
}

/**
 * Get all unique categories from tracked products
 */
async function getProductCategories() {
  try {
    const { data: products, error } = await getSupabase()
      .from("tracked_products")
      .select("source")
      .not("source", "is", null);

    if (error) {
      console.error("[Supabase] getProductCategories error:", error);
      return [];
    }

    // Get unique sources
    const sources = [...new Set(products.map((p) => p.source).filter(Boolean))];
    return sources;
  } catch (err) {
    console.error("[Supabase] getProductCategories exception:", err);
    return [];
  }
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
    { email: "admin@shopsavvy.com", password: "admin1234" },
  ];

  for (const user of demoUsers) {
    const existing = await getUserByEmail(user.email);
    if (!existing) {
      const passwordHash = await bcrypt.hash(user.password, 10);
      await createUser({
        email: user.email,
        passwordHash,
        verified: true,
        authProvider: "local",
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
          authProvider: params[4] || "local",
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
    },
  };
}

// ============================================
// SEARCH HISTORY OPERATIONS
// ============================================

/**
 * Record a search performed by a logged-in user.
 * Called every time the home-page search form is submitted with a non-empty query.
 * @param {number} userId
 * @param {string} query
 * @param {string} [source] - 'amazon'
 * @param {number} [resultCount]
 */
async function recordSearch(userId, query, source = "all", resultCount = 0) {
  if (!userId || !query || !query.trim()) return;
  const { error } = await getSupabase()
    .from("search_history")
    .insert({
      user_id: userId,
      query: query.trim().toLowerCase(),
      source: source || "all",
      result_count: resultCount,
      created_at: new Date().toISOString(),
    });
  if (error) {
    console.error("[Supabase] recordSearch error:", error.message);
  }
}

/**
 * Get the most recent search queries for a user (deduplicated).
 * @param {number} userId
 * @param {number} [limit=10]
 * @returns {Promise<string[]>} unique query strings, most recent first
 */
async function getUserSearchHistory(userId, limit = 10) {
  if (!userId) return [];
  const { data, error } = await getSupabase()
    .from("search_history")
    .select("query")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit * 3); // fetch more so we can dedupe and still hit limit

  if (error) {
    console.error("[Supabase] getUserSearchHistory error:", error.message);
    return [];
  }

  // Deduplicate while preserving order
  const seen = new Set();
  const unique = [];
  for (const row of data || []) {
    if (!seen.has(row.query)) {
      seen.add(row.query);
      unique.push(row.query);
      if (unique.length >= limit) break;
    }
  }
  return unique;
}

/**
 * Get products from tracked_products that match any of the user's recent search terms.
 * Used to personalise Popular Products for the logged-in user.
 * @param {string[]} queries - recent search queries
 * @param {number} [limit=12]
 * @returns {Promise<Array>} tracked_products rows
 */
async function getProductsByUserInterests(queries, limit = 12) {
  if (!queries || queries.length === 0) return [];

  // Build OR filter: product_title ilike any of the queries
  // Supabase JS client doesn't support OR filters natively on ilike,
  // so we fetch per-query and merge with dedup.
  const seen = new Set();
  const results = [];

  for (const q of queries) {
    if (results.length >= limit) break;
    const { data, error } = await getSupabase()
      .from("tracked_products")
      .select("*")
      .ilike("product_title", `%${q}%`)
      .not("current_price", "is", null)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) continue;
    for (const row of data || []) {
      if (!seen.has(row.product_id)) {
        seen.add(row.product_id);
        results.push(row);
        if (results.length >= limit) break;
      }
    }
  }

  return results;
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
  // Product cache (search results)
  cacheScrapedProduct,
  searchProductCache,
  getProductFromCache,
  // Tracked products (user-initiated tracking only)
  addTrackedProduct,
  getTrackedProducts,
  getTrackedProductById,
  removeTrackedProduct,
  getAllTrackedProducts,
  updateTrackedProductPrice,
  // Price history
  addPriceHistory,
  getPriceHistory,
  getPriceStatistics,
  // Discovery & Deals (from tracked_products - for user dashboard)
  getHighlightedDeals,
  getPopularProducts,
  getTopPriceDrops,
  getDiscountsByCategory,
  getProductsByCategory,
  getProductCategories,
  // Discovery & Deals (from product_cache - for homepage)
  getHighlightedDealsFromCache,
  getPopularProductsFromCache,
  getRecentProductsFromCache,
  // Search history
  recordSearch,
  getUserSearchHistory,
  getProductsByUserInterests,
  // Setup
  createDemoAccounts,
};
