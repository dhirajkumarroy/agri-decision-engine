'use strict';

const NodeCache = require('node-cache');
const logger = require('../config/logger');

// Single shared cache instance with periodic stat checks
const store = new NodeCache({ useClones: false, checkperiod: 120 });

/**
 * Returns an Express middleware that caches GET responses in memory.
 *
 * @param {number} ttl  Time-to-live in seconds
 * @param {function} [keyFn]  Optional: custom function (req) => string for cache key
 */
const cacheMiddleware = (ttl, keyFn = null) => (req, res, next) => {
  // Only cache GET requests
  if (req.method !== 'GET') return next();

  const key = keyFn ? keyFn(req) : req.originalUrl;
  const cached = store.get(key);

  if (cached !== undefined) {
    logger.debug('Cache HIT', { key });
    return res.json(cached);
  }

  logger.debug('Cache MISS', { key });

  // Intercept res.json to store the response body
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      store.set(key, body, ttl);
    }
    return originalJson(body);
  };

  next();
};

/**
 * Manually set a value in the cache.
 */
const set = (key, value, ttl) => store.set(key, value, ttl);

/**
 * Manually retrieve a value from the cache.
 */
const get = (key) => store.get(key);

/**
 * Delete one or more keys.
 */
const del = (...keys) => store.del(keys);

/**
 * Flush all cached entries.
 */
const flush = () => store.flushAll();

/**
 * Cache statistics (keys, hits, misses).
 */
const stats = () => store.getStats();

module.exports = { cacheMiddleware, set, get, del, flush, stats };
