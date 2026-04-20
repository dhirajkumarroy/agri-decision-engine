'use strict';

const express = require('express');
const router = express.Router();

const { cacheMiddleware } = require('../middleware/cache');
const { mlLimiter } = require('../middleware/rateLimiter');
const { cropNameRules, cropPredictRules, fertilizerRules } = require('../utils/validators');
const validate = require('../middleware/validate');
const { optionalAuth } = require('../middleware/auth');
const mlService = require('../services/mlService');
const notificationService = require('../services/notificationService');
const Prediction = require('../models/Prediction');
const User = require('../models/User');
const { success, error: apiError } = require('../utils/apiResponse');
const config = require('../config');
const { CROP_DATA } = require('./cropData');

/**
 * GET /api/crops/info/:crop_name  — cached, no auth needed
 */
router.get('/info/:crop_name', cropNameRules, validate, cacheMiddleware(config.cache.cropInfoTTL), (req, res) => {
  const name = req.params.crop_name.toLowerCase().trim();
  const info = CROP_DATA[name];
  if (!info) return apiError(res, `Crop '${req.params.crop_name}' not found in knowledge base`, 404);
  return success(res, { crop_name: name, info });
});

/**
 * GET /api/crops/list  — cached
 */
router.get('/list', cacheMiddleware(config.cache.cropInfoTTL), (_req, res) => {
  const list = Object.keys(CROP_DATA).map((key) => ({
    id: key,
    name: key.charAt(0).toUpperCase() + key.slice(1),
    season: CROP_DATA[key].season,
  }));
  return success(res, { total: list.length, crops: list });
});

/**
 * POST /api/crops/predict
 * Proxy to FastAPI, save result to DB, send notification if logged in.
 */
router.post('/predict', mlLimiter, optionalAuth, cropPredictRules, validate, async (req, res, next) => {
  const start = Date.now();
  try {
    const result = await mlService.predictCrop(req.body);
    const duration = Date.now() - start;

    // Extract top crop for summary
    const topCrop = result.predictions?.[0]?.crop || result.top_crop || null;
    const confidence = result.predictions?.[0]?.probability
      ? Math.round(result.predictions[0].probability * 100)
      : null;

    // Save to DB (async, don't block response)
    Prediction.create({
      userId: req.user?.id || null,
      type: 'crop',
      input: {
        city: req.body.city,
        N: req.body.N, P: req.body.P, K: req.body.K,
        ph: req.body.ph, rainfall: req.body.rainfall,
        temperature: req.body.temperature, humidity: req.body.humidity,
      },
      result,
      summary: { topCrop, confidence },
      ip: req.ip,
      durationMs: duration,
    }).then((pred) => {
      // Increment user prediction counter + send notification
      if (req.user?.id) {
        User.findByIdAndUpdate(req.user.id, { $inc: { totalPredictions: 1 } }).exec();
        if (topCrop) {
          notificationService.notifyCropResult(req.user.id, topCrop, confidence, pred._id);
        }
      }
    }).catch(() => {}); // silently ignore DB errors

    return success(res, result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/crops/fertilizer
 */
router.post('/fertilizer', mlLimiter, optionalAuth, fertilizerRules, validate, async (req, res, next) => {
  const start = Date.now();
  try {
    const result = await mlService.predictFertilizer(req.body);

    Prediction.create({
      userId: req.user?.id || null,
      type: 'fertilizer',
      input: req.body,
      result,
      ip: req.ip,
      durationMs: Date.now() - start,
    }).catch(() => {});

    return success(res, result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
