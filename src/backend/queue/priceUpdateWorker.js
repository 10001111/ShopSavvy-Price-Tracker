/**
 * Price Update Worker
 * Processes background jobs to update prices for all tracked products
 */

// Dependencies injected during initialization
let db = null;
let fetchMLProductById = null;
let fetchAmazonProductById = null;

/**
 * Initialize worker with dependencies
 * @param {Object} deps - Dependencies object
 * @param {Object} deps.db - Database module (supabase-db)
 * @param {Function} deps.fetchMLProductById - Mercado Libre product fetch function
 * @param {Function} deps.fetchAmazonProductById - Amazon product fetch function
 */
function initWorker(deps) {
  db = deps.db;
  fetchMLProductById = deps.fetchMLProductById;
  fetchAmazonProductById = deps.fetchAmazonProductById;
  console.log("[Worker] Price update worker initialized");
}

/**
 * Delay helper for rate limiting
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch current price for a product based on its source
 * @param {Object} product - Tracked product from database
 * @returns {Promise<{price: number|null, error: string|null}>}
 */
async function fetchCurrentPrice(product) {
  const { product_id, source } = product;

  try {
    if (source === "mercadolibre") {
      const result = await fetchMLProductById(product_id);
      if (result.product && result.product.price) {
        return { price: result.product.price, error: null };
      }
      return { price: null, error: result.error || "Product not found" };
    }

    if (source === "amazon") {
      // Remove AMZN- prefix if present in product_id
      const asin = product_id.replace(/^AMZN-/, "");
      const result = await fetchAmazonProductById(asin);
      if (result.product && result.product.price) {
        return { price: result.product.price, error: null };
      }
      return { price: null, error: result.error || "Product not found" };
    }

    return { price: null, error: `Unknown source: ${source}` };
  } catch (error) {
    return { price: null, error: error.message };
  }
}

/**
 * Process price update job
 * Fetches current prices for all tracked products and records changes
 * @param {Object} job - Bull job object
 * @returns {Promise<Object>} Job result summary
 */
async function processJob(job) {
  console.log(`[Worker] Starting price update job ${job.id}`);

  if (!db || !fetchMLProductById || !fetchAmazonProductById) {
    throw new Error("Worker not initialized - call initWorker first");
  }

  const startTime = Date.now();
  const results = {
    total: 0,
    updated: 0,
    unchanged: 0,
    errors: 0,
    priceChanges: [],
  };

  try {
    // Get all tracked products
    const products = await db.getAllTrackedProducts();
    results.total = products.length;

    console.log(`[Worker] Processing ${products.length} tracked products`);

    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const progress = Math.round(((i + 1) / products.length) * 100);
      job.progress(progress);

      console.log(
        `[Worker] [${i + 1}/${products.length}] Checking: ${product.product_title?.substring(0, 50)}...`
      );

      // Fetch current price from API
      const { price: newPrice, error } = await fetchCurrentPrice(product);

      if (error) {
        console.log(`[Worker]   Error: ${error}`);
        results.errors++;
        continue;
      }

      if (newPrice === null) {
        console.log(`[Worker]   No price available`);
        results.errors++;
        continue;
      }

      const oldPrice = product.current_price;
      const priceChanged = oldPrice !== newPrice;

      if (priceChanged) {
        console.log(`[Worker]   Price changed: ${oldPrice} -> ${newPrice}`);

        // Record price history
        await db.addPriceHistory(product.id, newPrice);

        // Update current price
        await db.updateTrackedProductPrice(product.id, newPrice);

        results.updated++;
        results.priceChanges.push({
          productId: product.id,
          title: product.product_title,
          oldPrice,
          newPrice,
          change: newPrice - oldPrice,
          percentChange: oldPrice > 0 ? ((newPrice - oldPrice) / oldPrice) * 100 : 0,
        });
      } else {
        console.log(`[Worker]   Price unchanged: ${oldPrice}`);

        // Still update last_checked timestamp
        await db.updateTrackedProductPrice(product.id, newPrice);

        results.unchanged++;
      }

      // Rate limiting: 1 second delay between API calls
      if (i < products.length - 1) {
        await delay(1000);
      }
    }
  } catch (error) {
    console.error(`[Worker] Job ${job.id} failed:`, error);
    throw error;
  }

  const duration = Date.now() - startTime;
  console.log(
    `[Worker] Job ${job.id} completed in ${duration}ms - ` +
      `Total: ${results.total}, Updated: ${results.updated}, ` +
      `Unchanged: ${results.unchanged}, Errors: ${results.errors}`
  );

  return {
    ...results,
    duration,
    completedAt: new Date().toISOString(),
  };
}

module.exports = {
  initWorker,
  processJob,
};
