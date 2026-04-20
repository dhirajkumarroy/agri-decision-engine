'use strict';

/**
 * Backward-compatible aliases so the FastAPI-style frontend URLs
 * are served by the Node.js layer (caching + rate limiting active).
 *
 *  FastAPI path            → Node.js handler
 *  /api/live-weather       → weatherService.getWeatherByCoords
 *  /api/weather-by-city    → weatherService.getWeatherByCity
 *  /api/forecast           → weatherService.getForecast
 *  /api/iot-irrigation     → mlService.predictIrrigation
 *  /api/crop-info/:name    → CROP_DATA lookup
 */

const express = require('express');
const router  = express.Router();

const weatherService = require('../services/weatherService');
const mlService      = require('../services/mlService');
const { cacheMiddleware } = require('../middleware/cache');
const { mlLimiter }  = require('../middleware/rateLimiter');
const { optionalAuth } = require('../middleware/auth');
const { irrigationRules } = require('../utils/validators');
const validate = require('../middleware/validate');
const Prediction = require('../models/Prediction');
const User       = require('../models/User');
const { success, error: apiError, badRequest } = require('../utils/apiResponse');
const config = require('../config');

// Reuse the same crop data as crops.js
const { CROP_DATA } = require('./cropData');

// ── GET /api/live-weather?lat=&lon= ──────────────────────────────────────────
router.get('/live-weather', cacheMiddleware(config.cache.weatherTTL, (req) => `weather:coords:${req.query.lat}:${req.query.lon}`), async (req, res, next) => {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  if (isNaN(lat) || isNaN(lon)) return badRequest(res, 'lat and lon are required');
  try {
    const data = await weatherService.getWeatherByCoords(lat, lon);
    // Return in FastAPI-compatible shape so frontend JS works unchanged
    return res.json({
      city: data.city,
      temperature: data.temperature,
      humidity: data.humidity,
      rainfall: data.rainfall,
      description: data.description,
      wind_speed: data.wind_speed,
      pressure: data.pressure,
      icon: data.icon,
      lat: data.lat,
      lon: data.lon,
    });
  } catch (err) {
    if (err.isAxiosError) return apiError(res, 'Weather service unavailable', 503);
    next(err);
  }
});

// ── GET /api/weather-by-city?city= ───────────────────────────────────────────
router.get('/weather-by-city', cacheMiddleware(config.cache.weatherTTL, (req) => `weather:city:${req.query.city?.toLowerCase()}`), async (req, res, next) => {
  const { city } = req.query;
  if (!city) return badRequest(res, 'city is required');
  try {
    const data = await weatherService.getWeatherByCity(city);
    return res.json({
      city: data.city,
      temperature: data.temperature,
      humidity: data.humidity,
      rainfall: data.rainfall,
      description: data.description,
      wind_speed: data.wind_speed,
      pressure: data.pressure,
      icon: data.icon,
      lat: data.lat,
      lon: data.lon,
    });
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ error: err.message });
    if (err.isAxiosError) return apiError(res, 'Weather service unavailable', 503);
    next(err);
  }
});

// ── GET /api/forecast?lat=&lon= ───────────────────────────────────────────────
router.get('/forecast', cacheMiddleware(config.cache.forecastTTL, (req) => `forecast:${req.query.lat}:${req.query.lon}`), async (req, res, next) => {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  if (isNaN(lat) || isNaN(lon)) return badRequest(res, 'lat and lon are required');
  try {
    const data = await weatherService.getForecast(lat, lon);
    return res.json(data); // { city, forecast: [...] }
  } catch (err) {
    if (err.isAxiosError) return apiError(res, 'Weather service unavailable', 503);
    next(err);
  }
});

// ── POST /api/iot-irrigation ──────────────────────────────────────────────────
router.post('/iot-irrigation', mlLimiter, optionalAuth, irrigationRules, validate, async (req, res, next) => {
  const start = Date.now();
  try {
    const payload = { ...req.body };
    if (payload.soil_moisture === undefined && payload.moisture !== undefined) {
      payload.soil_moisture = payload.moisture;
    }
    if (payload.rain === undefined && payload.rainfall !== undefined) {
      payload.rain = payload.rainfall;
    }

    const result = await mlService.predictIrrigation(payload);
    Prediction.create({
      userId: req.user?.id || null,
      type: 'irrigation',
      input: req.body,
      result,
      summary: {
        irrigationNeeded: result.irrigation_needed ?? (result.irrigation === 'yes' ? true : result.irrigation === 'no' ? false : result.result ?? null),
      },
      ip: req.ip,
      durationMs: Date.now() - start,
    }).then(() => {
      if (req.user?.id) User.findByIdAndUpdate(req.user.id, { $inc: { totalPredictions: 1 } }).exec();
    }).catch(() => {});
    return res.json(result); // return raw FastAPI shape
  } catch (err) {
    next(err);
  }
});

// ── GET /api/crop-info/:crop_name ─────────────────────────────────────────────
router.get('/crop-info/:crop_name', cacheMiddleware(config.cache.cropInfoTTL), (req, res) => {
  const name = req.params.crop_name.toLowerCase().trim();
  const info = CROP_DATA[name];
  if (!info) return res.status(404).json({ error: `Crop '${req.params.crop_name}' not found` });
  return res.json({ crop_name: name, info }); // FastAPI-compatible shape
});

module.exports = router;
