'use strict';

const axios = require('axios');
const config = require('../config');
const { get: cacheGet, set: cacheSet } = require('../middleware/cache');
const logger = require('../config/logger');

const OW_BASE = config.weather.baseUrl;
const API_KEY = config.weather.apiKey;

/**
 * Build a safe Axios instance with default timeout.
 */
const http = axios.create({ timeout: 10000 });

/**
 * Fetch current weather by city name.
 * Results are cached for config.cache.weatherTTL seconds.
 *
 * @param {string} city
 * @returns {Object} Normalised weather payload
 */
const getWeatherByCity = async (city) => {
  const cacheKey = `weather:city:${city.toLowerCase().trim()}`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    logger.debug('Weather cache HIT', { city });
    return cached;
  }

  if (!API_KEY) throw new Error('OpenWeather API key is not configured');

  const url = `${OW_BASE}/weather?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=metric`;
  const { data } = await http.get(url);

  if (!data.main) {
    const err = new Error(`City '${city}' not found`);
    err.status = 404;
    throw err;
  }

  const result = normaliseCurrentWeather(data);
  cacheSet(cacheKey, result, config.cache.weatherTTL);
  return result;
};

/**
 * Fetch current weather by coordinates.
 *
 * @param {number} lat
 * @param {number} lon
 * @returns {Object} Normalised weather payload
 */
const getWeatherByCoords = async (lat, lon) => {
  const cacheKey = `weather:coords:${lat}:${lon}`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    logger.debug('Weather cache HIT', { lat, lon });
    return cached;
  }

  if (!API_KEY) throw new Error('OpenWeather API key is not configured');

  const url = `${OW_BASE}/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`;
  const { data } = await http.get(url);

  const result = normaliseCurrentWeather(data);
  cacheSet(cacheKey, result, config.cache.weatherTTL);
  return result;
};

/**
 * Fetch 7-day (3-hour step) forecast by coordinates.
 *
 * @param {number} lat
 * @param {number} lon
 * @returns {Object} { city, forecast: Array }
 */
const getForecast = async (lat, lon) => {
  const cacheKey = `forecast:${lat}:${lon}`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    logger.debug('Forecast cache HIT', { lat, lon });
    return cached;
  }

  if (!API_KEY) throw new Error('OpenWeather API key is not configured');

  const url = `${OW_BASE}/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&cnt=40`;
  const { data } = await http.get(url);

  // Collapse 3-hour intervals into daily summaries
  const dailyMap = {};
  for (const item of data.list) {
    const date = item.dt_txt.split(' ')[0];
    if (!dailyMap[date]) {
      dailyMap[date] = {
        date,
        temps: [],
        humidity: [],
        description: item.weather[0]?.description || '',
        icon: item.weather[0]?.icon || '',
        rainfall: 0,
      };
    }
    dailyMap[date].temps.push(item.main.temp);
    dailyMap[date].humidity.push(item.main.humidity);
    if (item.rain?.['3h']) dailyMap[date].rainfall += item.rain['3h'];
  }

  const forecast = Object.values(dailyMap).slice(0, 7).map((d) => ({
    date: d.date,
    temp_min: Math.round(Math.min(...d.temps) * 10) / 10,
    temp_max: Math.round(Math.max(...d.temps) * 10) / 10,
    temperature: Math.round((d.temps.reduce((a, b) => a + b, 0) / d.temps.length) * 10) / 10,
    humidity: Math.round(d.humidity.reduce((a, b) => a + b, 0) / d.humidity.length),
    rainfall: Math.round(d.rainfall * 10) / 10,
    description: d.description,
    icon: d.icon,
  }));

  const result = { city: data.city?.name || '', forecast };
  cacheSet(cacheKey, result, config.cache.forecastTTL);
  return result;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const normaliseCurrentWeather = (data) => ({
  city: data.name,
  country: data.sys?.country || '',
  temperature: data.main.temp,
  feels_like: data.main.feels_like,
  temp_min: data.main.temp_min,
  temp_max: data.main.temp_max,
  humidity: data.main.humidity,
  pressure: data.main.pressure,
  description: data.weather[0]?.description || '',
  icon: data.weather[0]?.icon || '',
  wind_speed: data.wind?.speed || 0,
  wind_deg: data.wind?.deg || 0,
  rainfall: data.rain?.['1h'] || 0,
  visibility: data.visibility ? data.visibility / 1000 : null, // km
  lat: data.coord?.lat,
  lon: data.coord?.lon,
  sunrise: data.sys?.sunrise,
  sunset: data.sys?.sunset,
  fetched_at: new Date().toISOString(),
});

module.exports = { getWeatherByCity, getWeatherByCoords, getForecast };
