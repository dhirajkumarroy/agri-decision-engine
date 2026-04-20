'use strict';

const rateLimit = require('express-rate-limit');
const config = require('../config');
const logger = require('../config/logger');
const { tooManyRequests } = require('../utils/apiResponse');

// Handler called when limit is exceeded
const limitHandler = (req, res) => {
  logger.warn('Rate limit exceeded', { ip: req.ip, url: req.originalUrl });
  return tooManyRequests(res, 'Too many requests from this IP, please try again later.');
};

/**
 * Global rate limiter — applied to all routes.
 */
const globalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: limitHandler,
  skip: (req) =>
    req.path === '/health' ||           // health checks
    req.path.startsWith('/api/iot/'),   // IoT routes have their own iotLimiter
});

/**
 * Strict limiter for ML prediction endpoints.
 * ML inference is CPU/GPU heavy — cap more aggressively.
 */
const mlLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.mlMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: limitHandler,
  keyGenerator: (req) => {
    // Key by user ID if authenticated, else by IP
    return req.user?.id ? `user:${req.user.id}` : req.ip;
  },
});

/**
 * Contact form limiter — prevent email spam.
 */
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => tooManyRequests(res, 'Too many contact requests. Please wait before sending again.'),
});

/**
 * Auth limiter — brute-force protection.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => tooManyRequests(res, 'Too many auth attempts. Please try again in 15 minutes.'),
});

/**
 * IoT device limiter — higher throughput than global, keyed by deviceId header or IP.
 * ESP32 sends heartbeats frequently, so allow more requests per window.
 */
const iotLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120,            // 2 requests/sec sustained
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.headers['x-device-id'] || req.params?.deviceId || req.body?.deviceId || req.ip,
  handler: (req, res) => tooManyRequests(res, 'IoT rate limit exceeded. Slow down your device polling.'),
});

/**
 * AI chat limiter — keyed by user ID when authenticated, else by IP.
 * 20 requests per 15-minute window to control Claude API costs.
 */
const aiLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.ai?.rateMax ?? 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => (req.user?.id ? `user:${req.user.id}` : req.ip),
  handler: (req, res) => tooManyRequests(res, 'AI chat limit reached. Please wait before sending more messages.'),
});

module.exports = { globalLimiter, mlLimiter, contactLimiter, authLimiter, iotLimiter, aiLimiter };
