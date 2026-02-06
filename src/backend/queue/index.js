/**
 * Bull Queue – status helpers only.
 *
 * The old "price-updates" queue + priceUpdateWorker have been retired.
 * All price checking now goes through workers/price-checker.js (Apify-based).
 *
 * This module still exports getQueueStatus / getRecentJobs so that
 * /api/admin/queue-status can report on the price-checker queue.
 */

const Queue = require("bull");
const { getRedisOptions, isRedisConfigured } = require("../config/redis");

// Connect to the price-check queue that price-checker.js owns, read-only
let priceCheckQueue = null;

function getOrCreateQueue() {
  if (priceCheckQueue) return priceCheckQueue;
  if (!isRedisConfigured()) return null;

  const redisOptions = getRedisOptions();
  if (!redisOptions) return null;

  // Open the same "price-check" queue name that price-checker.js uses —
  // we don't register a processor here, just read stats.
  priceCheckQueue = new Queue("price-check", {
    redis: redisOptions,
  });

  priceCheckQueue.on("error", (err) => {
    console.error("[Queue] price-check status queue error:", err.message);
  });

  return priceCheckQueue;
}

/**
 * Get queue status and statistics
 */
async function getQueueStatus() {
  const queue = getOrCreateQueue();
  if (!queue) {
    return { initialized: false, error: "Redis not configured" };
  }

  const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
    queue.isPaused(),
  ]);

  return {
    initialized: true,
    queueName: "price-check",
    paused,
    counts: { waiting, active, completed, failed, delayed },
  };
}

/**
 * Get recent jobs from the price-check queue
 */
async function getRecentJobs(limit = 10) {
  const queue = getOrCreateQueue();
  if (!queue) return { error: "Redis not configured" };

  const [completed, failed, active] = await Promise.all([
    queue.getCompleted(0, limit - 1),
    queue.getFailed(0, limit - 1),
    queue.getActive(0, limit - 1),
  ]);

  const fmt = (job) => ({
    id: job.id,
    name: job.name,
    progress: job.progress(),
    attemptsMade: job.attemptsMade,
    finishedOn: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
    processedOn: job.processedOn ? new Date(job.processedOn).toISOString() : null,
    returnvalue: job.returnvalue,
    failedReason: job.failedReason,
  });

  return {
    active: active.map(fmt),
    completed: completed.map(fmt),
    failed: failed.map(fmt),
  };
}

module.exports = {
  getQueueStatus,
  getRecentJobs,
};
