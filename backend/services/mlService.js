'use strict';

const axios = require('axios');
const FormData = require('form-data');
const config = require('../config');
const logger = require('../config/logger');

/**
 * Axios instance pointing at the FastAPI ML backend.
 * Uses a longer timeout because inference can be slow on CPU.
 */
const mlHttp = axios.create({
  baseURL: config.mlBackend.url,
  timeout: config.mlBackend.timeout,
});

// ── Response interceptor: log upstream errors ─────────────────────────────────
mlHttp.interceptors.response.use(
  (res) => res,
  (err) => {
    logger.error('ML backend error', {
      url: err.config?.url,
      status: err.response?.status,
      data: err.response?.data,
    });
    return Promise.reject(err);
  }
);

/**
 * POST crop prediction to FastAPI.
 *
 * @param {Object} payload  { city?, N, P, K, ph, rainfall, temperature?, humidity? }
 * @returns {Object}        FastAPI prediction response
 */
const predictCrop = async (payload) => {
  const params = new URLSearchParams();
  if (payload.city) params.set('city', payload.city);
  params.set('N', payload.N);
  params.set('P', payload.P);
  params.set('K', payload.K);
  params.set('ph', payload.ph);
  params.set('rainfall', payload.rainfall);
  if (payload.temperature !== undefined) params.set('temperature', payload.temperature);
  if (payload.humidity !== undefined) params.set('humidity', payload.humidity);

  const { data } = await mlHttp.post('/predict-crop', params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  return data;
};

/**
 * POST disease detection image to FastAPI.
 *
 * @param {Buffer}  fileBuffer   Raw image bytes
 * @param {string}  mimeType     e.g. 'image/jpeg'
 * @param {string}  originalName Original filename
 * @returns {Object}             Disease prediction response
 */
const predictDisease = async (fileBuffer, mimeType, originalName) => {
  const form = new FormData();
  form.append('file', fileBuffer, {
    filename: originalName,
    contentType: mimeType,
  });

  const { data } = await mlHttp.post('/predict-disease', form, {
    headers: form.getHeaders(),
  });
  return data;
};

/**
 * POST fertilizer recommendation to FastAPI.
 *
 * @param {Object} payload
 * @returns {Object}
 */
const predictFertilizer = async (payload) => {
  const { data } = await mlHttp.post('/api/predict-fertilizer', payload);
  return data;
};

/**
 * POST irrigation IoT data to FastAPI.
 *
 * @param {Object} payload
 * @returns {Object}
 */
const predictIrrigation = async (payload) => {
  const { data } = await mlHttp.post('/predict-irrigation', payload);
  return data;
};

/**
 * Health-check the FastAPI backend.
 *
 * @returns {{ ok: boolean, latency_ms: number }}
 */
const healthCheck = async () => {
  const start = Date.now();
  try {
    await mlHttp.get('/');
    return { ok: true, latency_ms: Date.now() - start };
  } catch {
    return { ok: false, latency_ms: Date.now() - start };
  }
};

module.exports = { predictCrop, predictDisease, predictFertilizer, predictIrrigation, healthCheck };
