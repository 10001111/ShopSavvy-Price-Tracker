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
  const cacheKey = buildCacheKey({ source, query, productUrls });

  // Check Redis cache first
  const cached = await getCache(cacheKey);
  if (cached) {
    console.log("[Apify] Cache hit:", cacheKey);
    return cached;
  }

  console.log("[Apify] Starting Actor run...", { source, query, productUrls, maxResults });

  // Start the Actor and wait for it to finish
  const run = await apify.actor(ACTOR_ID).call(
    { source, query, productUrls, maxResults },
    {
      waitSecs: 300, // wait up to 5 minutes
      memory: 512,
    }
  );

  console.log("[Apify] Actor run finished. Status:", run.status, "| Run ID:", run.id);

  if (run.status !== "SUCCEEDED") {
    console.error("[Apify] Actor run did not succeed:", run.status);
    return [];
  }

  // Pull results from the run's dataset
  const { items } = await apify.dataset(run.defaultDatasetId).listItems();
  console.log("[Apify] Scraped", items.length, "products");

  // Cache the results
  if (items.length > 0) {
    await setCache(cacheKey, items, CACHE_TTL);
  }

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
    { waitSecs: 300, memory: 512 }
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
