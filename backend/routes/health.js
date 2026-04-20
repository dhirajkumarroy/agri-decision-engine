'use strict';

const express = require('express');
const router = express.Router();
const os = require('os');

const mlService = require('../services/mlService');
const emailService = require('../services/emailService');
const { stats: cacheStats } = require('../middleware/cache');
const { status: dbStatus } = require('../db');
const { success } = require('../utils/apiResponse');
const logger = require('../config/logger');
const mqttService = require('../services/mqttService');

const collectServiceHealth = async () => {
  const [mlStatus, smtpStatus] = await Promise.allSettled([
    mlService.healthCheck(),
    emailService.verifyConnection(),
  ]);

  const services = {
    ml_backend: mlStatus.status === 'fulfilled' ? mlStatus.value : { ok: false },
    smtp: smtpStatus.status === 'fulfilled'
      ? {
          ok: smtpStatus.value === null ? true : smtpStatus.value,
          enabled: smtpStatus.value !== null,
        }
      : { ok: false, enabled: true },
    mongodb: dbStatus(),
    mqtt: mqttService.status(),
  };

  const overallOk = services.ml_backend.ok && services.mongodb.connected && services.mqtt.ok;

  return {
    services,
    overallStatus: overallOk ? 'ok' : 'degraded',
  };
};

/**
 * GET /health
 * Lightweight readiness probe for the smart farming stack.
 * Includes MongoDB, FastAPI, and MQTT connection state.
 */
router.get('/', async (_req, res, next) => {
  try {
    const { services, overallStatus } = await collectServiceHealth();
    return res.status(overallStatus === 'ok' ? 200 : 503).json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      services: {
        mongodb: services.mongodb,
        ml_backend: services.ml_backend,
        mqtt: services.mqtt,
      },
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /health/detailed
 * Deep readiness probe — checks all dependencies plus runtime stats.
 * Can be used by monitoring tools (Prometheus, Grafana, UptimeRobot).
 */
router.get('/detailed', async (_req, res, next) => {
  try {
    const start = Date.now();

    const { services, overallStatus } = await collectServiceHealth();

    const uptime = process.uptime();
    const memUsage = process.memoryUsage();
    const cache = cacheStats();

    const status = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime_seconds: Math.round(uptime),
      version: process.env.npm_package_version || '1.0.0',
      node_version: process.version,
      environment: process.env.NODE_ENV || 'development',

      services: {
        ml_backend: services.ml_backend,
        smtp: services.smtp,
        mongodb: services.mongodb,
        mqtt: services.mqtt,
      },

      system: {
        platform: os.platform(),
        arch: os.arch(),
        load_avg: os.loadavg(),
        free_memory_mb: Math.round(os.freemem() / 1024 / 1024),
        total_memory_mb: Math.round(os.totalmem() / 1024 / 1024),
        heap_used_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
        heap_total_mb: Math.round(memUsage.heapTotal / 1024 / 1024),
      },

      cache: {
        keys: cache.keys,
        hits: cache.hits,
        misses: cache.misses,
        hit_rate: cache.hits + cache.misses > 0
          ? `${Math.round((cache.hits / (cache.hits + cache.misses)) * 100)}%`
          : 'N/A',
      },

      response_time_ms: Date.now() - start,
    };

    status.status = overallStatus;

    logger.debug('Health check', { status: status.status });
    return success(res, status, status.status === 'ok' ? 200 : 503);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
