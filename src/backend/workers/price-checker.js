/**
 * Price Checker Worker
 * Background job that periodically checks prices for tracked products
 * and updates the database with new price history
 */

const Queue = require("bull");
const supabaseDb = require("../supabase-db");

// Initialize Bull queue for price check jobs
const REDIS_URL =
  process.env.REDIS_URL ||
  `redis://${process.env.REDIS_HOST || "localhost"}:${process.env.REDIS_PORT || 6379}`;

// When using REDIS_URL with auth, don't pass additional config
const queueConfig = process.env.REDIS_URL
  ? {} // Let Bull parse the URL
  : {
      redis: {
        password: process.env.REDIS_PASSWORD || undefined,
        db: parseInt(process.env.REDIS_DB) || 0,
      },
    };

const priceCheckQueue = new Queue("price-check", REDIS_URL, {
  ...queueConfig,
  defaultJobOptions: {
    attempts: parseInt(process.env.PRICE_CHECK_MAX_RETRIES) || 3,
    backoff: {
      type: "exponential",
      delay: 5000, // 5 seconds initial delay
    },
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 500, // Keep last 500 failed jobs
  },
});

const { recheckPrices } = require("../apify");

/**
 * Batch re-check prices for a group of products using the Apify Actor.
 * Groups products by their product_url, sends them all in one Actor run.
 * Returns a map of product_id -> new price.
 * @param {Array} products - tracked product rows with { product_id, product_url }
 * @returns {Promise<Map<string, number>>} product_id -> price
 */
async function batchRecheckPrices(products) {
  // Collect all product URLs (using snake_case to match DB schema)
  const urls = products.filter((p) => p.product_url).map((p) => p.product_url);

  if (urls.length === 0) {
    console.log("[PriceChecker] No product URLs available for re-check");
    return new Map();
  }

  // Call Apify Actor with all URLs at once
  const results = await recheckPrices(urls);

  // Build a map: product_id -> price from results.
  // Also build a URL -> price map as fallback (Actor may return results keyed by URL).
  const priceMap = new Map();
  const urlPriceMap = new Map();
  for (const item of results) {
    const price = parseFloat(item.price);
    if (item.id && !isNaN(price)) {
      priceMap.set(item.id, price);
    }
    if (item.url && !isNaN(price)) {
      urlPriceMap.set(item.url, price);
    }
  }

  // Merge URL-based results: for each product, if ID lookup missed, try URL
  for (const p of products) {
    if (
      !priceMap.has(p.product_id) &&
      p.product_url &&
      urlPriceMap.has(p.product_url)
    ) {
      priceMap.set(p.product_id, urlPriceMap.get(p.product_url));
    }
  }

  return priceMap;
}

/**
 * Process a price check job.
 * Each job carries a batch of tracked products to re-check via Apify.
 */
priceCheckQueue.process(
  parseInt(process.env.PRICE_CHECK_CONCURRENCY) || 5,
  async (job) => {
    const { products } = job.data; // array of { tracked_product_id, product_id, source, product_url }

    console.log(
      `[PriceChecker] Processing batch of ${products.length} products`,
    );

    try {
      // Batch re-check all products in one Apify Actor run
      const priceMap = await batchRecheckPrices(products);

      let updated = 0;
      let skipped = 0;

      for (const product of products) {
        const newPrice = priceMap.get(product.product_id);

        if (newPrice == null) {
          console.log(
            `[PriceChecker] No price returned for ${product.product_id}, skipping`,
          );
          skipped++;
          continue;
        }

        // Update tracked product price
        await supabaseDb.updateTrackedProductPrice(
          product.tracked_product_id,
          newPrice,
        );

        // Add price history entry
        await supabaseDb.addPriceHistory(product.tracked_product_id, newPrice);

        console.log(`[PriceChecker] ✓ ${product.product_id}: $${newPrice}`);
        updated++;
      }

      return {
        status: "success",
        updated,
        skipped,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error(`[PriceChecker] Batch error:`, error.message);
      throw error;
    }
  },
);

/**
 * Schedule price checks for all tracked products.
 * Batches products into groups of 20 -- each batch is one Apify Actor run.
 */
async function scheduleAllPriceChecks() {
  try {
    console.log("[PriceChecker] Scheduling price checks...");

    const products = await supabaseDb.getAllTrackedProducts();

    if (products.length === 0) {
      console.log("[PriceChecker] No tracked products found");
      return 0;
    }

    // Filter out products checked within the last 30 minutes
    const now = new Date();
    const stale = products.filter((p) => {
      if (!p.last_checked) return true;
      const mins = (now - new Date(p.last_checked)) / (1000 * 60);
      return mins >= 30;
    });

    console.log(
      `[PriceChecker] ${stale.length} of ${products.length} products need re-check`,
    );

    if (stale.length === 0) return 0;

    // Chunk into batches of 20 (each batch = 1 Apify Actor run)
    const BATCH_SIZE = 20;
    let batchIndex = 0;

    for (let i = 0; i < stale.length; i += BATCH_SIZE) {
      const batch = stale.slice(i, i + BATCH_SIZE).map((p) => ({
        tracked_product_id: p.id,
        product_id: p.product_id,
        source: p.source,
        product_url: p.product_url,
      }));

      await priceCheckQueue.add(
        { products: batch },
        {
          delay: batchIndex * 5000, // 5 second delay between batches
          jobId: `price-batch-${batchIndex}-${Date.now()}`,
        },
      );
      batchIndex++;
    }

    console.log(
      `[PriceChecker] Scheduled ${batchIndex} batch jobs (${stale.length} products)`,
    );
    return batchIndex;
  } catch (error) {
    console.error("[PriceChecker] Error scheduling price checks:", error);
    throw error;
  }
}

/**
 * Start the price checker worker
 * This runs continuously and schedules price checks at regular intervals
 */
async function startPriceChecker() {
  if (process.env.ENABLE_PRICE_WORKER !== "true") {
    console.log(
      "[PriceChecker] Price worker disabled (set ENABLE_PRICE_WORKER=true to enable)",
    );
    return;
  }

  console.log("[PriceChecker] Starting price checker worker...");

  // Initial price check on startup
  try {
    await scheduleAllPriceChecks();
  } catch (error) {
    console.error("[PriceChecker] Error on startup:", error);
  }

  // Schedule recurring price checks
  const intervalMinutes =
    parseInt(process.env.PRICE_CHECK_INTERVAL_MINUTES) || 60;
  const intervalMs = intervalMinutes * 60 * 1000;

  console.log(
    `[PriceChecker] Will check prices every ${intervalMinutes} minutes`,
  );

  setInterval(async () => {
    try {
      await scheduleAllPriceChecks();
    } catch (error) {
      console.error("[PriceChecker] Error in scheduled check:", error);
    }
  }, intervalMs);

  // Log queue events
  priceCheckQueue.on("completed", (job, result) => {
    console.log(
      `[PriceChecker] Job ${job.id} completed:`,
      result.status,
      result.productId,
      result.price,
    );
  });

  priceCheckQueue.on("failed", (job, err) => {
    console.error(
      `[PriceChecker] Job ${job.id} failed:`,
      job.data.productId,
      err.message,
    );
  });

  priceCheckQueue.on("error", (error) => {
    console.error("[PriceChecker] Queue error:", error);
  });

  console.log("[PriceChecker] ✓ Price checker worker started");
}

/**
 * Gracefully shutdown the worker
 */
async function shutdown() {
  console.log("[PriceChecker] Shutting down gracefully...");
  await priceCheckQueue.close();
  console.log("[PriceChecker] ✓ Shutdown complete");
}

// Handle graceful shutdown
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

module.exports = {
  priceCheckQueue,
  startPriceChecker,
  scheduleAllPriceChecks,
  shutdown,
};
