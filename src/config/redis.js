/**
 * Redis Configuration for Bull Queue
 * Supports Redis Cloud URL or individual host/port/password
 */

const Redis = require("ioredis");

let redisClient = null;

/**
 * Parse Redis URL and return connection options
 * Supports: redis://default:password@host:port
 */
function parseRedisUrl(url) {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port, 10) || 6379,
      password: parsed.password || undefined,
      username: parsed.username !== "default" ? parsed.username : undefined,
      maxRetriesPerRequest: null, // Required for Bull
      enableReadyCheck: false,
    };
  } catch (error) {
    console.error("[Redis] Failed to parse REDIS_URL:", error.message);
    return null;
  }
}

/**
 * Get Redis connection options for Bull queue
 */
function getRedisOptions() {
  const redisUrl = process.env.REDIS_URL;

  if (redisUrl) {
    return parseRedisUrl(redisUrl);
  }

  // Fallback to individual environment variables
  const host = process.env.REDIS_HOST;
  const port = process.env.REDIS_PORT;
  const password = process.env.REDIS_PASSWORD;

  if (host) {
    return {
      host,
      port: parseInt(port, 10) || 6379,
      password: password || undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };
  }

  return null;
}

/**
 * Check if Redis is configured
 */
function isRedisConfigured() {
  return Boolean(process.env.REDIS_URL || process.env.REDIS_HOST);
}

/**
 * Get or create shared Redis client for Bull queue
 */
function getRedisClient() {
  if (!isRedisConfigured()) {
    return null;
  }

  if (!redisClient) {
    const options = getRedisOptions();
    if (options) {
      redisClient = new Redis(options);

      redisClient.on("connect", () => {
        console.log("[Redis] Connected to Redis server");
      });

      redisClient.on("error", (err) => {
        console.error("[Redis] Connection error:", err.message);
      });

      redisClient.on("close", () => {
        console.log("[Redis] Connection closed");
      });
    }
  }

  return redisClient;
}

/**
 * Close Redis connection
 */
async function closeRedis() {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    console.log("[Redis] Connection closed");
  }
}

module.exports = {
  getRedisOptions,
  getRedisClient,
  isRedisConfigured,
  closeRedis,
};
