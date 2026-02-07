/**
 * Apify Service Module
 * Calls the ShopSavvy-Price-Tracker Actor on Apify to scrape
 * Amazon and Mercado Libre product data.
 *
 * Uses Redis to cache recent scrape results (30 min TTL).
 */

const { ApifyClient } = require("apify-client");
const { getCache, setCache, deleteCache } = require("./config/redis");

const ACTOR_ID = "f5pjkmpD15S3cqunX"; // ShopSavvy-Price-Tracker
const CACHE_TTL = 30 * 60; // 30 minutes in seconds

let client = null;

function getClient() {
  if (!client) {
    const token = process.env.Apify_Token;
    if (!token) {
      throw new Error("[Apify] Apify_Token is not set in .env");
    }
    client = new ApifyClient({ token });
  }
  return client;
}

/**
 * Build a Redis cache key for a scrape request
 */
function buildCacheKey({ source, query, productUrls }) {
  if (productUrls && productUrls.length > 0) {
    return `apify:urls:${productUrls.join(",")}`;
  }
  return `apify:search:${source}:${query}`;
}

/**
 * Run the ShopSavvy Actor and wait for results.
 * @param {Object} input
 * @param {string} input.source        - 'amazon' | 'mercadolibre' | 'all'
 * @param {string} input.query         - search keyword
 * @param {string[]} [input.productUrls] - direct URLs (for price re-checks)
 * @param {number} [input.maxResults]  - max products per source (default 20)
 * @returns {Promise<Array>}           - array of scraped product objects
 */
async function scrapeProducts({ source = "all", query = "", productUrls = [], maxResults = 20 }) {
  const apify = getClient();

  // 🔧 TEMPORARY: Force Amazon-only until Mercado Libre browser scraper is ready
  if (source === "all") {
    console.log(`[APIFY] Converting "all" to "amazon" (Mercado Libre temporarily disabled)`);
    source = "amazon";
  }
  if (source === "mercadolibre") {
    console.log(`[APIFY] ⚠️  Mercado Libre scraper temporarily disabled (requires browser-based scraping)`);
    console.log(`[APIFY] Suggestion: Use "amazon" or "all" for now`);
    return [];
  }

  const cacheKey = buildCacheKey({ source, query, productUrls });

  // 🔍 DEBUG: Log scraping request details
  console.log(`\n🕷️  [APIFY] ========== SCRAPING REQUEST ==========`);
  console.log(`🕷️  [APIFY] Source: ${source}`);
  console.log(`🕷️  [APIFY] Query: "${query}"`);
  console.log(`🕷️  [APIFY] Product URLs: ${productUrls.length > 0 ? productUrls.length : 'none'}`);
  console.log(`🕷️  [APIFY] Max Results: ${maxResults}`);
  console.log(`🕷️  [APIFY] Cache Key: ${cacheKey}`);

  // Check Redis cache first
  const cached = await getCache(cacheKey);
  if (cached) {
    console.log(`✅ [APIFY] Cache hit! Returning ${cached.length} cached products`);
    console.log(`🕷️  [APIFY] ========================================\n`);
    return cached;
  }

  console.log(`⚠️  [APIFY] Cache miss - starting fresh scrape`);
  console.log(`🚀 [APIFY] Calling Apify Actor ID: ${ACTOR_ID}`);

  const startTime = Date.now();

  // Start the Actor and wait for it to finish
  const run = await apify.actor(ACTOR_ID).call(
    { source, query, productUrls, maxResults },
    {
      build: "1.0.4", // Latest build with improved debugging
      waitSecs: 300, // wait up to 5 minutes
      memory: 512,
    }
  );

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(`🕷️  [APIFY] Actor run finished in ${duration}s`);
  console.log(`🕷️  [APIFY] Run ID: ${run.id}`);
  console.log(`🕷️  [APIFY] Status: ${run.status}`);

  if (run.status !== "SUCCEEDED") {
    console.error(`❌ [APIFY] Actor run FAILED with status: ${run.status}`);
    console.error(`❌ [APIFY] Run details:`, JSON.stringify(run, null, 2));
    console.log(`🕷️  [APIFY] ========================================\n`);
    return [];
  }

  // Pull results from the run's dataset
  const { items } = await apify.dataset(run.defaultDatasetId).listItems();
  console.log(`✅ [APIFY] Successfully scraped ${items.length} products`);

  // 🔍 DEBUG: Show sample product data
  if (items.length > 0) {
    const sample = items[0];
    console.log(`📦 [APIFY] Sample product:`, {
      id: sample.id,
      title: sample.title?.substring(0, 50) + '...',
      price: sample.price,
      source: sample.source,
      available_quantity: sample.available_quantity,
      sold_quantity: sample.sold_quantity,
      rating: sample.rating
    });
  }

  // Cache the results
  if (items.length > 0) {
    await setCache(cacheKey, items, CACHE_TTL);
    console.log(`💾 [APIFY] Cached ${items.length} products (TTL: ${CACHE_TTL}s)`);
  } else {
    console.warn(`⚠️  [APIFY] No products found - not caching`);
  }

  console.log(`🕷️  [APIFY] ========================================\n`);
  return items;
}

/**
 * Re-check current prices for a set of already-tracked product URLs.
 * Used by the price-checker worker.
 * @param {string[]} productUrls - array of product page URLs
 * @returns {Promise<Array>}     - array of { id, price, source, ... }
 */
async function recheckPrices(productUrls) {
  if (!productUrls || productUrls.length === 0) return [];

  // Don't cache price re-checks -- we always want fresh data
  const apify = getClient();

  console.log("[Apify] Re-checking prices for", productUrls.length, "products...");

  const run = await apify.actor(ACTOR_ID).call(
    { source: "all", query: "", productUrls, maxResults: productUrls.length },
    { build: "1.0.4", waitSecs: 300, memory: 512 }
  );

  if (run.status !== "SUCCEEDED") {
    console.error("[Apify] Price re-check run failed:", run.status);
    return [];
  }

  const { items } = await apify.dataset(run.defaultDatasetId).listItems();
  console.log("[Apify] Re-check returned", items.length, "results");
  return items;
}

/**
 * Invalidate cached scrape results for a given search
 */
async function invalidateCache({ source, query, productUrls }) {
  const cacheKey = buildCacheKey({ source, query, productUrls });
  await deleteCache(cacheKey);
  console.log("[Apify] Cache invalidated:", cacheKey);
}

module.exports = {
  scrapeProducts,
  recheckPrices,
  invalidateCache,
};
