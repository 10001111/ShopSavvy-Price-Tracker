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
        const isTransient = error.message.includes("fetch failed") ||
                           error.message.includes("ECONNRESET") ||
                           error.message.includes("ETIMEDOUT");

        if (isTransient && attempt < maxRetries) {
          // Wait before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, 100 * attempt));
          continue;
        }

        return { success: false, error };
      }

      return { success: true, data };
    } catch (err) {
      // Check if it's a transient error
      const isTransient = err.message.includes("fetch failed") ||
                         err.message.includes("ECONNRESET") ||
                         err.message.includes("ETIMEDOUT");

      if (isTransient && attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 100 * attempt));
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
  const requiredTables = ["users", "login_history", "user_sessions", "tracked_products", "price_history"];
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
      if (errorMsg.includes("schema cache") ||
          errorMsg.includes("does not exist") ||
          errorMsg.includes("relation") ||
          errorMsg.includes("permission denied") ||
          errorMsg.includes("fetch failed") || // Treat persistent fetch failures as table issues
          error.code === "42P01" || // PostgreSQL: undefined_table
          error.code === "PGRST204") { // PostgREST: no such table
        missingTables.push(table);
      }
    } else {
      console.log(`[Supabase]   ${table}: ✓`);
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
// HIGHLIGHTED DEALS & DISCOVERY FUNCTIONS
// ============================================

/**
 * Get highlighted deals - products with best prices or good deals
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
      const history = await getPriceHistory(product.id, { period: "30d", limit: 100 });

      if (history && history.length > 0) {
        const prices = history.map(h => parseFloat(h.price));
        const currentPrice = parseFloat(product.current_price);
        const minPrice = Math.min(...prices);
        const avgPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;

        const isBestPrice = currentPrice <= minPrice;
        const isGoodDeal = currentPrice < avgPrice * 0.95;
        const savingsPercent = avgPrice > 0 ? ((avgPrice - currentPrice) / avgPrice) * 100 : 0;

        if (isBestPrice || isGoodDeal) {
          dealsWithStats.push({
            ...product,
            minPrice,
            avgPrice: Math.round(avgPrice * 100) / 100,
            isBestPrice,
            isGoodDeal,
            savingsPercent: Math.round(savingsPercent * 100) / 100,
            savingsAmount: Math.round((avgPrice - currentPrice) * 100) / 100,
            dataPoints: history.length
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
async function getPopularProducts({ limit = 8, category = "", dealsOnly = false } = {}) {
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
      .map(item => ({ ...item.product, trackCount: item.count }));

    // Filter by category if specified
    if (category) {
      popularProducts = popularProducts.filter(p =>
        p.product_title?.toLowerCase().includes(category.toLowerCase()) ||
        p.source?.toLowerCase() === category.toLowerCase()
      );
    }

    // If dealsOnly, calculate and filter deals
    if (dealsOnly) {
      const dealsFiltered = [];
      for (const product of popularProducts) {
        const history = await getPriceHistory(product.id, { period: "30d", limit: 50 });
        if (history && history.length > 0) {
          const prices = history.map(h => parseFloat(h.price));
          const currentPrice = parseFloat(product.current_price);
          const avgPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;
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
              savingsPercent: Math.round(((avgPrice - currentPrice) / avgPrice) * 100 * 100) / 100
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
async function getTopPriceDrops({ period = "recent", category = "", limit = 8 } = {}) {
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
      if (category && !product.product_title?.toLowerCase().includes(category.toLowerCase())) {
        continue;
      }

      const history = await getPriceHistory(product.id, { period: period === "weekly" ? "7d" : "30d", limit: 100 });

      if (history && history.length >= 2) {
        const currentPrice = parseFloat(product.current_price);

        // Find the oldest price in our period
        const pricesInPeriod = history.filter(h => new Date(h.recorded_at) >= cutoffDate);

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
              periodStart: oldestInPeriod.recorded_at
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
      { key: "electronics", keywords: ["phone", "laptop", "computer", "tablet", "tv", "audio", "headphone", "speaker", "celular", "computadora", "televisor", "bocina"], icon: "📱", nameEn: "Electronics", nameEs: "Electrónica" },
      { key: "home", keywords: ["home", "kitchen", "furniture", "decor", "hogar", "cocina", "mueble", "decoración"], icon: "🏠", nameEn: "Home & Kitchen", nameEs: "Hogar y Cocina" },
      { key: "fashion", keywords: ["clothing", "shoes", "fashion", "watch", "jewelry", "ropa", "zapatos", "moda", "reloj", "joyería"], icon: "👗", nameEn: "Fashion", nameEs: "Moda" },
      { key: "sports", keywords: ["sport", "fitness", "exercise", "outdoor", "deporte", "ejercicio", "aire libre"], icon: "⚽", nameEn: "Sports & Outdoors", nameEs: "Deportes" },
      { key: "beauty", keywords: ["beauty", "cosmetic", "skincare", "perfume", "belleza", "cosmético", "cuidado piel"], icon: "💄", nameEn: "Beauty", nameEs: "Belleza" },
      { key: "toys", keywords: ["toy", "game", "puzzle", "lego", "juguete", "juego"], icon: "🎮", nameEn: "Toys & Games", nameEs: "Juguetes" },
      { key: "books", keywords: ["book", "kindle", "reading", "libro", "lectura"], icon: "📚", nameEn: "Books", nameEs: "Libros" },
      { key: "automotive", keywords: ["car", "auto", "vehicle", "motor", "carro", "vehículo", "coche"], icon: "🚗", nameEn: "Automotive", nameEs: "Automotriz" },
      { key: "other", keywords: [], icon: "📦", nameEn: "Other", nameEs: "Otros" }
    ];

    // Categorize products and find max discounts
    const categoryStats = new Map();

    for (const cat of categoryDefinitions) {
      categoryStats.set(cat.key, {
        ...cat,
        maxDiscount: 0,
        productCount: 0,
        bestDealProduct: null
      });
    }

    // Process each product
    for (const product of products) {
      const title = (product.product_title || "").toLowerCase();
      let matchedCategory = "other";

      // Find matching category
      for (const cat of categoryDefinitions) {
        if (cat.keywords.some(kw => title.includes(kw))) {
          matchedCategory = cat.key;
          break;
        }
      }

      // Get price stats for this product
      const history = await getPriceHistory(product.id, { period: "30d", limit: 50 });

      if (history && history.length > 0) {
        const prices = history.map(h => parseFloat(h.price));
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
              discountPercent: Math.round(discountPercent)
            };
          }
        }
      }
    }

    // Convert to array and filter out empty categories
    const results = Array.from(categoryStats.values())
      .filter(cat => cat.productCount > 0 && cat.maxDiscount > 0)
      .sort((a, b) => b.maxDiscount - a.maxDiscount);

    return results;
  } catch (err) {
    console.error("[Supabase] getDiscountsByCategory exception:", err);
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
    const sources = [...new Set(products.map(p => p.source).filter(Boolean))];
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
  // Discovery & Deals
  getHighlightedDeals,
  getPopularProducts,
  getTopPriceDrops,
  getDiscountsByCategory,
  getProductCategories,
  // Setup
  createDemoAccounts
};
