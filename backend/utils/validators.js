'use strict';

const { body, query, param } = require('express-validator');

// ── Crop Prediction ────────────────────────────────────────────────────────────
const cropPredictRules = [
  body('city').optional().isString().trim().notEmpty().withMessage('City must be a non-empty string'),
  body('N').isFloat({ min: 0, max: 300 }).withMessage('Nitrogen (N) must be between 0–300'),
  body('P').isFloat({ min: 0, max: 300 }).withMessage('Phosphorus (P) must be between 0–300'),
  body('K').isFloat({ min: 0, max: 300 }).withMessage('Potassium (K) must be between 0–300'),
  body('ph').isFloat({ min: 0, max: 14 }).withMessage('pH must be between 0–14'),
  body('rainfall').isFloat({ min: 0, max: 5000 }).withMessage('Rainfall must be between 0–5000 mm'),
  body('temperature')
    .optional()
    .isFloat({ min: -20, max: 60 })
    .withMessage('Temperature must be between -20 and 60 °C'),
  body('humidity')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Humidity must be between 0–100%'),
];

// ── Fertilizer ────────────────────────────────────────────────────────────────
const fertilizerRules = [
  body('temperature').isFloat({ min: -20, max: 60 }).withMessage('Temperature required'),
  body('humidity').isFloat({ min: 0, max: 100 }).withMessage('Humidity required'),
  body('moisture').isFloat({ min: 0, max: 100 }).withMessage('Moisture required'),
  body('soil_type').isString().trim().notEmpty().withMessage('Soil type required'),
  body('crop_type').isString().trim().notEmpty().withMessage('Crop type required'),
  body('N').isFloat({ min: 0, max: 300 }).withMessage('N required'),
  body('P').isFloat({ min: 0, max: 300 }).withMessage('P required'),
  body('K').isFloat({ min: 0, max: 300 }).withMessage('K required'),
];

// ── Irrigation (manual form — no IoT device needed) ──────────────────────────
// Accepts both 'moisture' and 'soil_moisture' (frontend sends soil_moisture).
// soil_type and crop_type are optional for manual entry.
const irrigationRules = [
  body('temperature').isFloat({ min: -20, max: 60 }).withMessage('Temperature must be between -20 and 60 °C'),
  body('humidity').isFloat({ min: 0, max: 100 }).withMessage('Humidity must be between 0–100%'),
  body('moisture')
    .optional()
    .isFloat({ min: 0, max: 100 }).withMessage('Moisture must be between 0–100%'),
  body('soil_moisture')
    .optional()
    .isFloat({ min: 0, max: 100 }).withMessage('Soil moisture must be between 0–100%'),
  body('rain')
    .optional()
    .isFloat({ min: 0, max: 5000 }).withMessage('Rain must be between 0–5000 mm'),
  body('rainfall')
    .optional()
    .isFloat({ min: 0, max: 5000 }).withMessage('Rainfall must be between 0–5000 mm'),
  body('soil_type').optional().isString().trim(),
  body('crop_type')
    .optional()
    .isIn(['Cotton', 'Maize', 'Potato', 'Rice', 'Sugarcane', 'Wheat'])
    .withMessage('Crop type must be one of: Cotton, Maize, Potato, Rice, Sugarcane, Wheat'),
  body('growth_stage')
    .optional()
    .isIn(['Sowing', 'Vegetative', 'Flowering', 'Harvest'])
    .withMessage('Growth stage must be one of: Sowing, Vegetative, Flowering, Harvest'),
];

const sensorInputRules = [
  body('crop').optional().isString().trim().notEmpty().withMessage('Crop must be a non-empty string'),
  body('temperature').isFloat({ min: -20, max: 80 }).withMessage('Temperature must be between -20 and 80'),
  body('humidity').isFloat({ min: 0, max: 100 }).withMessage('Humidity must be between 0 and 100'),
  body('cropStage')
    .optional()
    .isIn(['seedling', 'vegetative', 'flowering', 'maturity'])
    .withMessage('Crop stage must be seedling, vegetative, flowering, or maturity'),
  body().custom((value) => {
    const soilMoisture = value.soilMoisture ?? value.soil_moisture ?? value.moisture;
    if (soilMoisture === undefined || soilMoisture === null || soilMoisture === '') {
      throw new Error('soilMoisture, soil_moisture, or moisture is required');
    }
    return true;
  }),
  body('soilMoisture').optional().isFloat({ min: 0, max: 100 }).withMessage('soilMoisture must be between 0 and 100'),
  body('soil_moisture').optional().isFloat({ min: 0, max: 100 }).withMessage('soil_moisture must be between 0 and 100'),
  body('moisture').optional().isFloat({ min: 0, max: 100 }).withMessage('moisture must be between 0 and 100'),
  body('timestamp').optional().isISO8601().withMessage('timestamp must be a valid ISO 8601 date'),
];

// ── Weather ───────────────────────────────────────────────────────────────────
const weatherByCityRules = [
  query('city').isString().trim().notEmpty().withMessage('city query param is required'),
];

const weatherByCoordRules = [
  query('lat').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude required'),
  query('lon').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude required'),
];

// ── Crop Info ─────────────────────────────────────────────────────────────────
const cropNameRules = [
  param('crop_name')
    .isString()
    .trim()
    .notEmpty()
    .isLength({ max: 50 })
    .withMessage('Invalid crop name'),
];

// ── Contact ───────────────────────────────────────────────────────────────────
const contactRules = [
  body('name').isString().trim().notEmpty().isLength({ max: 100 }).withMessage('Name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('subject').isString().trim().notEmpty().isLength({ max: 200 }).withMessage('Subject is required'),
  body('message')
    .isString()
    .trim()
    .notEmpty()
    .isLength({ min: 10, max: 2000 })
    .withMessage('Message must be 10–2000 characters'),
];

// ── Auth ──────────────────────────────────────────────────────────────────────
const registerRules = [
  body('name').isString().trim().notEmpty().isLength({ max: 100 }).withMessage('Name required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password')
    .isString()
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must be 8+ chars with uppercase, lowercase, and digit'),
];

const loginRules = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isString().notEmpty().withMessage('Password required'),
];

module.exports = {
  cropPredictRules,
  fertilizerRules,
  irrigationRules,
  sensorInputRules,
  weatherByCityRules,
  weatherByCoordRules,
  cropNameRules,
  contactRules,
  registerRules,
  loginRules,
};
