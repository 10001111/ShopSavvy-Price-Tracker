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

// ============================================
// CACHING HELPERS
// ============================================

/**
 * Default cache TTL: 30 minutes (in seconds)
 */
const DEFAULT_CACHE_TTL = 30 * 60;

/**
 * Get cached data from Redis
 * @param {string} key - Cache key
 * @returns {Object|null} - Parsed data or null if not found
 */
async function getCache(key) {
  const client = getRedisClient();
  if (!client) return null;

  try {
    const data = await client.get(key);
    if (data) {
      console.log(`[Redis Cache] HIT: ${key}`);
      return JSON.parse(data);
    }
    console.log(`[Redis Cache] MISS: ${key}`);
    return null;
  } catch (error) {
    console.error("[Redis Cache] Get error:", error.message);
    return null;
  }
}

/**
 * Set cached data in Redis with TTL
 * @param {string} key - Cache key
 * @param {Object} data - Data to cache (will be JSON stringified)
 * @param {number} ttl - Time to live in seconds (default: 30 minutes)
 */
async function setCache(key, data, ttl = DEFAULT_CACHE_TTL) {
  const client = getRedisClient();
  if (!client) return false;

  try {
    await client.setex(key, ttl, JSON.stringify(data));
    console.log(`[Redis Cache] SET: ${key} (TTL: ${ttl}s)`);
    return true;
  } catch (error) {
    console.error("[Redis Cache] Set error:", error.message);
    return false;
  }
}

/**
 * Delete cached data from Redis
 * @param {string} key - Cache key (supports wildcards with pattern)
 */
async function deleteCache(key) {
  const client = getRedisClient();
  if (!client) return false;

  try {
    await client.del(key);
    console.log(`[Redis Cache] DEL: ${key}`);
    return true;
  } catch (error) {
    console.error("[Redis Cache] Delete error:", error.message);
    return false;
  }
}

/**
 * Delete all cache keys matching a pattern
 * @param {string} pattern - Pattern to match (e.g., "price-history:*")
 */
async function deleteCachePattern(pattern) {
  const client = getRedisClient();
  if (!client) return false;

  try {
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      await client.del(...keys);
      console.log(`[Redis Cache] Deleted ${keys.length} keys matching: ${pattern}`);
    }
    return true;
  } catch (error) {
    console.error("[Redis Cache] Pattern delete error:", error.message);
    return false;
  }
}

/**
 * Generate cache key for price history
 * @param {string} trackedProductId - The tracked product ID
 * @param {string} period - Time period (7d, 30d, all)
 */
function priceHistoryCacheKey(trackedProductId, period = "30d") {
  return `price-history:${trackedProductId}:${period}`;
}

module.exports = {
  getRedisOptions,
  getRedisClient,
  isRedisConfigured,
  closeRedis,
  // Caching helpers
  getCache,
  setCache,
  deleteCache,
  deleteCachePattern,
  priceHistoryCacheKey,
  DEFAULT_CACHE_TTL,
};
