'use strict';

const SensorData = require('../models/SensorData');
const logger = require('../config/logger');
const decisionService = require('./decisionService');
const automationService = require('./automationService');

const ALLOWED_SOURCES = new Set(['manual', 'iot']);
const ALLOWED_STAGES = new Set(['seedling', 'vegetative', 'flowering', 'maturity']);

const createValidationError = (message, details = null) => {
  const err = new Error(message);
  err.status = 400;
  err.details = details;
  return err;
};

const toNumber = (value) => {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
};

const normalizeStage = (stage) => String(stage || 'vegetative').trim().toLowerCase();

const validateInput = (data, source) => {
  const normalizedSource = String(source || '').trim().toLowerCase();
  if (!ALLOWED_SOURCES.has(normalizedSource)) {
    throw createValidationError(`Unsupported source '${source}'.`);
  }

  const soilMoisture = toNumber(data.soilMoisture ?? data.soil_moisture ?? data.moisture);
  const temperature = toNumber(data.temperature);
  const humidity = toNumber(data.humidity);
  const crop = String(data.crop || 'rice').trim().toLowerCase();
  const cropStage = normalizeStage(data.cropStage);
  const timestamp = data.timestamp ? new Date(data.timestamp) : new Date();

  const errors = [];

  if (!Number.isFinite(soilMoisture) || soilMoisture < 0 || soilMoisture > 100) {
    errors.push({ field: 'soilMoisture', message: 'Soil moisture must be between 0 and 100.' });
  }

  if (!Number.isFinite(temperature) || temperature < -20 || temperature > 80) {
    errors.push({ field: 'temperature', message: 'Temperature must be between -20 and 80.' });
  }

  if (!Number.isFinite(humidity) || humidity < 0 || humidity > 100) {
    errors.push({ field: 'humidity', message: 'Humidity must be between 0 and 100.' });
  }

  if (!ALLOWED_STAGES.has(cropStage)) {
    errors.push({ field: 'cropStage', message: 'Crop stage must be seedling, vegetative, flowering, or maturity.' });
  }

  if (Number.isNaN(timestamp.getTime())) {
    errors.push({ field: 'timestamp', message: 'Timestamp must be a valid date.' });
  }

  if (errors.length > 0) {
    throw createValidationError('Invalid sensor data.', errors);
  }

  return {
    crop,
    soilMoisture,
    temperature,
    humidity,
    cropStage,
    source: normalizedSource,
    timestamp,
  };
};

const processSensorData = async (data, source) => {
  const normalized = validateInput(data, source);
  const sensorData = await SensorData.create(normalized);
  const decision = decisionService.getIrrigationDecision(sensorData.toObject());
  const automation = await automationService.executeDecision(decision, {
    source: normalized.source,
    sensorDataId: sensorData._id,
  });

  logger.info('Sensor pipeline completed', {
    sensorDataId: sensorData._id.toString(),
    source: normalized.source,
    irrigation: decision.irrigation,
    automationStatus: automation.status,
  });

  return {
    sensorData,
    decision,
    automation,
  };
};

module.exports = {
  processSensorData,
  validateInput,
};
