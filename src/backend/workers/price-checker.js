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

/**
 * Fetch current price for a Mercado Libre product
 */
async function fetchMLPrice(productId) {
  try {
    const response = await fetch(
      `https://api.mercadolibre.com/items/${productId}`,
      {
        headers: {
          Accept: "application/json",
        },
      },
    );

    if (!response.ok) {
      if (response.status === 404) {
        console.log(`[PriceChecker] Product ${productId} not found (404)`);
        return null;
      }
      throw new Error(`ML API returned ${response.status}`);
    }

    const data = await response.json();
    return parseFloat(data.price);
  } catch (error) {
    console.error(
      `[PriceChecker] Error fetching ML price for ${productId}:`,
      error.message,
    );
    throw error;
  }
}

/**
 * Fetch current price for an Amazon product
 * Note: Requires Amazon PA-API credentials
 */
async function fetchAmazonPrice(asin) {
  // TODO: Implement Amazon PA-API 5.0 price fetch
  // For now, return null (Amazon integration not fully implemented)
  console.log(
    `[PriceChecker] Amazon price fetch not yet implemented for ${asin}`,
  );
  return null;
}

/**
 * Process a single price check job
 */
priceCheckQueue.process(
  parseInt(process.env.PRICE_CHECK_CONCURRENCY) || 5,
  async (job) => {
    const { trackedProductId, productId, source } = job.data;

    console.log(
      `[PriceChecker] Checking price for ${productId} (source: ${source})`,
    );

    try {
      // Fetch current price based on source
      let currentPrice = null;

      if (source === "mercadolibre") {
        currentPrice = await fetchMLPrice(productId);
      } else if (source === "amazon") {
        currentPrice = await fetchAmazonPrice(productId);
      }

      if (currentPrice === null) {
        console.log(
          `[PriceChecker] Could not fetch price for ${productId}, skipping`,
        );
        return { status: "skipped", reason: "price_fetch_failed" };
      }

      // Update tracked product with new price
      await supabaseDb.updateTrackedProductPrice(
        trackedProductId,
        currentPrice,
      );

      // Add price history entry
      await supabaseDb.addPriceHistory(trackedProductId, currentPrice);

      console.log(
        `[PriceChecker] ✓ Updated price for ${productId}: $${currentPrice}`,
      );

      return {
        status: "success",
        productId,
        price: currentPrice,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error(
        `[PriceChecker] Error processing ${productId}:`,
        error.message,
      );
      throw error; // Let Bull handle retry logic
    }
  },
);

/**
 * Schedule price checks for all tracked products
 */
async function scheduleAllPriceChecks() {
  try {
    console.log(
      "[PriceChecker] Scheduling price checks for all tracked products...",
    );

    // Get all tracked products from database
    const products = await supabaseDb.getAllTrackedProducts();

    if (products.length === 0) {
      console.log("[PriceChecker] No tracked products found");
      return 0;
    }

    console.log(`[PriceChecker] Found ${products.length} tracked products`);

    // Add each product to the queue
    let scheduled = 0;
    for (const product of products) {
      // Skip if last check was recent (within 30 minutes)
      if (product.last_checked) {
        const lastChecked = new Date(product.last_checked);
        const now = new Date();
        const minutesSinceCheck = (now - lastChecked) / (1000 * 60);

        if (minutesSinceCheck < 30) {
          console.log(
            `[PriceChecker] Skipping ${product.product_id} (checked ${Math.round(minutesSinceCheck)} min ago)`,
          );
          continue;
        }
      }

      // Add job to queue with delay to avoid rate limiting
      await priceCheckQueue.add(
        {
          trackedProductId: product.id,
          productId: product.product_id,
          source: product.source,
        },
        {
          delay: scheduled * 2000, // 2 second delay between checks
          jobId: `price-check-${product.id}-${Date.now()}`, // Unique job ID
        },
      );

      scheduled++;
    }

    console.log(`[PriceChecker] Scheduled ${scheduled} price checks`);
    return scheduled;
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
