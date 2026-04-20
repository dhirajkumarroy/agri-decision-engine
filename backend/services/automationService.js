'use strict';

const config = require('../config');
const logger = require('../config/logger');
const ActionLog = require('../models/ActionLog');
const mqttService = require('./mqttService');

const executeDecision = async (decision, context = {}) => {
  const reason = decision.reason || 'No reason provided';
  const source = context.source || 'manual';
  const timestamp = new Date();

  if (decision.irrigation === 'NO_CHANGE') {
    const logEntry = await ActionLog.create({
      action: 'NO_ACTION',
      reason,
      source,
      status: 'skipped',
      sensorDataId: context.sensorDataId || null,
      payload: { pump: null },
      attempts: 0,
      timestamp,
    });

    logger.info('Automation skipped', { reason, source, actionLogId: logEntry._id.toString() });

    return {
      action: 'NO_ACTION',
      pump: null,
      status: 'skipped',
      attempts: 0,
      logId: logEntry._id,
    };
  }

  const pump = decision.irrigation;
  const payload = {
    pump,
    reason,
    source,
    timestamp: timestamp.toISOString(),
  };

  try {
    const publishResult = await mqttService.publish(config.mqtt.actuatorTopic, payload, {
      retries: config.mqtt.publishRetries,
    });

    const logEntry = await ActionLog.create({
      action: `PUMP_${pump}`,
      reason,
      source,
      status: 'success',
      sensorDataId: context.sensorDataId || null,
      payload,
      attempts: publishResult.attempts,
      timestamp,
    });

    logger.info('Automation command sent', {
      action: `PUMP_${pump}`,
      source,
      attempts: publishResult.attempts,
      actionLogId: logEntry._id.toString(),
    });

    return {
      action: `PUMP_${pump}`,
      pump,
      status: 'success',
      attempts: publishResult.attempts,
      logId: logEntry._id,
    };
  } catch (err) {
    const attempts = err.attempts || config.mqtt.publishRetries;

    const logEntry = await ActionLog.create({
      action: `PUMP_${pump}`,
      reason,
      source,
      status: 'failed',
      sensorDataId: context.sensorDataId || null,
      payload,
      attempts,
      timestamp,
    });

    logger.error('Automation command failed', {
      action: `PUMP_${pump}`,
      source,
      attempts,
      actionLogId: logEntry._id.toString(),
      error: err.message,
    });

    err.status = err.status || 502;
    err.actionLogId = logEntry._id;
    throw err;
  }
};

module.exports = {
  executeDecision,
};
