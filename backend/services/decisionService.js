'use strict';

const STAGE_THRESHOLDS = {
  seedling: { min: 70, max: 85 },
  vegetative: { min: 60, max: 80 },
  flowering: { min: 65, max: 82 },
  maturity: { min: 50, max: 72 },
};

const getIrrigationDecision = (sensorData) => {
  const crop = String(sensorData.crop || 'rice').trim().toLowerCase();
  const cropStage = String(sensorData.cropStage || 'vegetative').trim().toLowerCase();
  const soilMoisture = Number(sensorData.soilMoisture);
  const thresholds = STAGE_THRESHOLDS[cropStage] || STAGE_THRESHOLDS.vegetative;

  if (crop !== 'rice') {
    return {
      irrigation: 'NO_CHANGE',
      reason: `Decision engine currently supports rice automation. Received crop '${crop}'.`,
    };
  }

  if (soilMoisture < thresholds.min) {
    return {
      irrigation: 'ON',
      reason: `Rice at ${cropStage} stage is below moisture threshold (${soilMoisture}% < ${thresholds.min}%).`,
    };
  }

  if (soilMoisture > thresholds.max) {
    return {
      irrigation: 'OFF',
      reason: `Rice at ${cropStage} stage is above moisture threshold (${soilMoisture}% > ${thresholds.max}%).`,
    };
  }

  return {
    irrigation: 'NO_CHANGE',
    reason: `Rice at ${cropStage} stage is within the target moisture band (${thresholds.min}% - ${thresholds.max}%).`,
  };
};

module.exports = {
  getIrrigationDecision,
  STAGE_THRESHOLDS,
};
