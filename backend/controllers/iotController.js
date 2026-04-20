'use strict';

const iotService = require('../services/iotService');
const { success, created } = require('../utils/apiResponse');

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/iot/power
// ESP32 — reports power status
// Auth: API key
// ─────────────────────────────────────────────────────────────────────────────
const reportPower = async (req, res, next) => {
  try {
    const { deviceId, status } = req.body;
    const result = await iotService.handlePower(deviceId, status, req.device?.userId);
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/iot/motor
// User — sets motor ON/OFF
// Auth: JWT
// ─────────────────────────────────────────────────────────────────────────────
const controlMotor = async (req, res, next) => {
  try {
    const { deviceId, action } = req.body;
    const result = await iotService.setMotor(deviceId, action, req.user.id);
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/iot/command/:deviceId
// ESP32 — polls for pending motor command
// Auth: API key
// ─────────────────────────────────────────────────────────────────────────────
const fetchCommand = async (req, res, next) => {
  try {
    const { deviceId } = req.params;
    const result = await iotService.getCommand(deviceId);
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/iot/status
// ESP32 — sends sensor data
// Auth: API key
// ─────────────────────────────────────────────────────────────────────────────
const receiveSensorData = async (req, res, next) => {
  try {
    const { deviceId, soil, temperature, humidity, flow, rain, current, motor } = req.body;
    const log = await iotService.handleSensorData({ deviceId, soil, temperature, humidity, flow, rain, current, motor });
    return created(res, { logged: true, id: log._id });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/iot/device/:deviceId
// User/Dashboard — full device status
// Auth: JWT
// ─────────────────────────────────────────────────────────────────────────────
const getDeviceStatus = async (req, res, next) => {
  try {
    const { deviceId } = req.params;
    const status = await iotService.getDeviceStatus(deviceId, req.user.id);
    return success(res, status);
  } catch (err) {
    next(err);
  }
};

module.exports = { reportPower, controlMotor, fetchCommand, receiveSensorData, getDeviceStatus };
