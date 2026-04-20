'use strict';

const config = require('../config');
const { unauthorized } = require('../utils/apiResponse');
const logger = require('../config/logger');

/**
 * API key authentication for ESP32 / IoT devices.
 * ESP32 must send:  X-API-Key: <IOT_API_KEY>
 *
 * Also exposes req.device = { deviceId } from body/params for downstream use.
 */
const apiKeyAuth = (req, res, next) => {
  const key = req.headers['x-api-key'];

  if (!key) {
    return unauthorized(res, 'API key required. Send X-API-Key header.');
  }

  if (key !== config.iot.apiKey) {
    logger.warn('Invalid IoT API key attempt', { ip: req.ip, url: req.originalUrl });
    return unauthorized(res, 'Invalid API key.');
  }

  // Attach deviceId for service layer convenience
  req.device = {
    deviceId: req.body?.deviceId || req.params?.deviceId || null,
  };

  next();
};

module.exports = { apiKeyAuth };
