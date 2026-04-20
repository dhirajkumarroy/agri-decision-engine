'use strict';

const express = require('express');
const router = express.Router();

const weatherService = require('../services/weatherService');
const { weatherByCityRules, weatherByCoordRules } = require('../utils/validators');
const validate = require('../middleware/validate');
const { success, error: apiError } = require('../utils/apiResponse');

/**
 * GET /api/weather/city?city=Mumbai
 * Fetch current weather by city name (cached).
 */
router.get('/city', weatherByCityRules, validate, async (req, res, next) => {
  try {
    const data = await weatherService.getWeatherByCity(req.query.city);
    return success(res, data);
  } catch (err) {
    if (err.status === 404) return apiError(res, err.message, 404);
    if (err.isAxiosError) {
      const status = err.response?.status;
      if (status === 401) return apiError(res, 'OpenWeather API key is invalid or not configured', 503);
      if (status === 404) return apiError(res, `City '${req.query.city}' not found`, 404);
      return apiError(res, 'Weather service unavailable. Please try again later.', 503);
    }
    next(err);
  }
});

/**
 * GET /api/weather/coords?lat=19.07&lon=72.87
 * Fetch current weather by coordinates (cached).
 */
router.get('/coords', weatherByCoordRules, validate, async (req, res, next) => {
  try {
    const data = await weatherService.getWeatherByCoords(
      parseFloat(req.query.lat),
      parseFloat(req.query.lon)
    );
    return success(res, data);
  } catch (err) {
    if (err.isAxiosError) {
      const status = err.response?.status;
      if (status === 401) return apiError(res, 'OpenWeather API key is invalid or not configured', 503);
      return apiError(res, 'Weather service unavailable. Please try again later.', 503);
    }
    next(err);
  }
});

/**
 * GET /api/weather/forecast?lat=19.07&lon=72.87
 * Fetch 7-day forecast by coordinates (cached).
 */
router.get('/forecast', weatherByCoordRules, validate, async (req, res, next) => {
  try {
    const data = await weatherService.getForecast(
      parseFloat(req.query.lat),
      parseFloat(req.query.lon)
    );
    return success(res, data);
  } catch (err) {
    if (err.isAxiosError) {
      const status = err.response?.status;
      if (status === 401) return apiError(res, 'OpenWeather API key is invalid or not configured', 503);
      return apiError(res, 'Weather service unavailable. Please try again later.', 503);
    }
    next(err);
  }
});

module.exports = router;
