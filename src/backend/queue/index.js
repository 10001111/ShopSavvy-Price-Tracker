/**
 * Bull Queue Setup for Price Update Jobs
 * Handles scheduling and processing of background price updates
 */

const Queue = require("bull");
const { getRedisOptions, isRedisConfigured } = require("../config/redis");
const { initWorker, processJob } = require("./priceUpdateWorker");

let priceUpdateQueue = null;

/**
 * Initialize Bull queue with Redis connection
 * @returns {Queue|null} Bull queue instance or null if Redis not configured
 */
function initQueue() {
  if (!isRedisConfigured()) {
    console.log("[Queue] Redis not configured - background jobs disabled");
    return null;
  }

  const redisOptions = getRedisOptions();
  if (!redisOptions) {
    console.log("[Queue] Invalid Redis configuration");
    return null;
  }

  priceUpdateQueue = new Queue("price-updates", {
    redis: redisOptions,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000, // Start with 5 second delay, then 10s, 20s
      },
      removeOnComplete: 100, // Keep last 100 completed jobs
      removeOnFail: 50, // Keep last 50 failed jobs
    },
  });

  // Handle queue events
  priceUpdateQueue.on("ready", () => {
    console.log("[Queue] Price update queue initialized and ready");
  });

  priceUpdateQueue.on("error", (error) => {
    console.error("[Queue] Queue error:", error.message);
  });

  priceUpdateQueue.on("failed", (job, error) => {
    console.error(`[Queue] Job ${job.id} failed:`, error.message);
  });

  priceUpdateQueue.on("completed", (job, result) => {
    console.log(
      `[Queue] Job ${job.id} completed - ` +
        `Updated: ${result.updated}, Unchanged: ${result.unchanged}, Errors: ${result.errors}`
    );
  });

  priceUpdateQueue.on("stalled", (job) => {
    console.warn(`[Queue] Job ${job.id} stalled`);
  });

  // Register job processor
  priceUpdateQueue.process("update-all-prices", async (job) => {
    return await processJob(job);
  });

  return priceUpdateQueue;
}

/**
 * Setup recurring price update job
 * Runs every 12 hours by default
 */
async function setupRecurringJobs() {
  if (!priceUpdateQueue) {
    console.log("[Queue] Cannot setup recurring jobs - queue not initialized");
    return;
  }

  // Remove any existing repeatable jobs to avoid duplicates
  const existingJobs = await priceUpdateQueue.getRepeatableJobs();
  for (const job of existingJobs) {
    if (job.name === "update-all-prices") {
      await priceUpdateQueue.removeRepeatableByKey(job.key);
      console.log("[Queue] Removed existing repeatable job");
    }
  }

  // Add new repeatable job - every 12 hours
  await priceUpdateQueue.add(
    "update-all-prices",
    { source: "scheduled" },
    {
      repeat: {
        cron: "0 */12 * * *", // At minute 0 of every 12th hour
      },
      jobId: "price-update-scheduled",
    }
  );

  console.log("[Queue] Scheduled price update job (every 12 hours)");
}

/**
 * Manually trigger a price update job
 * Used for testing or admin-triggered updates
 * @returns {Promise<Object>} Job instance
 */
async function triggerPriceUpdate() {
  if (!priceUpdateQueue) {
    throw new Error("Queue not initialized - Redis may not be configured");
  }

  const job = await priceUpdateQueue.add(
    "update-all-prices",
    {
      source: "manual",
      triggeredAt: new Date().toISOString(),
    },
    {
      jobId: `manual-${Date.now()}`,
    }
  );

  console.log(`[Queue] Manual price update triggered - Job ID: ${job.id}`);
  return job;
}

/**
 * Get queue status and statistics
 * @returns {Promise<Object>} Queue status object
 */
async function getQueueStatus() {
  if (!priceUpdateQueue) {
    return {
      initialized: false,
      error: "Queue not initialized",
    };
  }

  const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
    priceUpdateQueue.getWaitingCount(),
    priceUpdateQueue.getActiveCount(),
    priceUpdateQueue.getCompletedCount(),
    priceUpdateQueue.getFailedCount(),
    priceUpdateQueue.getDelayedCount(),
    priceUpdateQueue.isPaused(),
  ]);

  const repeatableJobs = await priceUpdateQueue.getRepeatableJobs();

  return {
    initialized: true,
    paused,
    counts: {
      waiting,
      active,
      completed,
      failed,
      delayed,
    },
    repeatableJobs: repeatableJobs.map((job) => ({
      name: job.name,
      cron: job.cron,
      next: job.next ? new Date(job.next).toISOString() : null,
    })),
  };
}

/**
 * Get recent jobs from the queue
 * @param {number} limit - Maximum number of jobs to return
 * @returns {Promise<Object>} Recent jobs
 */
async function getRecentJobs(limit = 10) {
  if (!priceUpdateQueue) {
    return { error: "Queue not initialized" };
  }

  const [completed, failed, active] = await Promise.all([
    priceUpdateQueue.getCompleted(0, limit - 1),
    priceUpdateQueue.getFailed(0, limit - 1),
    priceUpdateQueue.getActive(0, limit - 1),
  ]);

  const formatJob = (job) => ({
    id: job.id,
    name: job.name,
    data: job.data,
    progress: job.progress(),
    attemptsMade: job.attemptsMade,
    finishedOn: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
    processedOn: job.processedOn ? new Date(job.processedOn).toISOString() : null,
    returnvalue: job.returnvalue,
    failedReason: job.failedReason,
  });

  return {
    active: active.map(formatJob),
    completed: completed.map(formatJob),
    failed: failed.map(formatJob),
  };
}

/**
 * Close the queue connection
 */
async function closeQueue() {
  if (priceUpdateQueue) {
    await priceUpdateQueue.close();
    priceUpdateQueue = null;
    console.log("[Queue] Queue closed");
  }
}

/**
 * Get the queue instance
 * @returns {Queue|null}
 */
function getQueue() {
  return priceUpdateQueue;
}

module.exports = {
  initQueue,
  initWorker,
  setupRecurringJobs,
  triggerPriceUpdate,
  getQueueStatus,
  getRecentJobs,
  closeQueue,
  getQueue,
};
