'use strict';

const express = require('express');
const { body, param } = require('express-validator');

const router     = express.Router();
const ctrl       = require('../controllers/iotController');
const { authenticate }  = require('../middleware/auth');
const { iotLimiter }    = require('../middleware/rateLimiter');
const { apiKeyAuth }    = require('../middleware/apiKeyAuth');
const validate          = require('../middleware/validate');

// ── Validation rule sets ──────────────────────────────────────────────────────

const powerRules = [
  body('deviceId').isString().trim().notEmpty().withMessage('deviceId is required'),
  body('status').isIn(['ON', 'OFF']).withMessage('status must be ON or OFF'),
];

const motorRules = [
  body('deviceId').isString().trim().notEmpty().withMessage('deviceId is required'),
  body('action').isIn(['ON', 'OFF']).withMessage('action must be ON or OFF'),
];

const sensorRules = [
  body('deviceId').isString().trim().notEmpty().withMessage('deviceId is required'),
  body('flow').isFloat({ min: 0 }).withMessage('flow must be a non-negative number'),
  body('soil').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('soil must be a non-negative number'),
  body('temperature').optional({ nullable: true }).isFloat().withMessage('temperature must be a number'),
  body('humidity').optional({ nullable: true }).isFloat({ min: 0, max: 100 }).withMessage('humidity must be between 0 and 100'),
  body('rain').isBoolean().withMessage('rain must be a boolean'),
  body('current').isFloat({ min: 0 }).withMessage('current must be a non-negative number'),
  body('motor').isBoolean().withMessage('motor must be a boolean'),
];

const deviceIdParam = [
  param('deviceId').isString().trim().notEmpty().withMessage('deviceId param is required'),
];

// ── ESP32 routes (API key auth) ───────────────────────────────────────────────

// ESP32 → reports power event
router.post('/power',
  iotLimiter,
  apiKeyAuth,
  powerRules,
  validate,
  ctrl.reportPower
);

// ESP32 → polls motor command
router.get('/command/:deviceId',
  iotLimiter,
  apiKeyAuth,
  deviceIdParam,
  validate,
  ctrl.fetchCommand
);

// ESP32 → sends sensor data
router.post('/status',
  iotLimiter,
  apiKeyAuth,
  sensorRules,
  validate,
  ctrl.receiveSensorData
);

// ── User / Dashboard routes (JWT auth) ───────────────────────────────────────

// User → sets motor ON/OFF
router.post('/motor',
  iotLimiter,
  authenticate,
  motorRules,
  validate,
  ctrl.controlMotor
);

// Dashboard → full device status
router.get('/device/:deviceId',
  authenticate,
  deviceIdParam,
  validate,
  ctrl.getDeviceStatus
);

module.exports = router;
