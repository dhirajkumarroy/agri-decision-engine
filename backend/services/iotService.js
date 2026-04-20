'use strict';

const Device    = require('../models/Device');
const SensorLog = require('../models/SensorLog');
const MotorLog  = require('../models/MotorLog');
const notificationService = require('./notificationService');
const logger    = require('../config/logger');

const buildHttpError = (message, status, details) =>
  Object.assign(new Error(message), { status, details });

const DEVICE_ONLINE_WINDOW_MS = 30 * 1000;

/**
 * Touch device lastSeen and optionally update state fields.
 */
const touchDevice = async (deviceId, patch = {}) => {
  return Device.findOneAndUpdate(
    { deviceId },
    { $set: { ...patch, lastSeen: new Date() }, $setOnInsert: { deviceId } },
    { upsert: true, returnDocument: 'after' }
  );
};

/**
 * Ensure a device exists for the authenticated user.
 * This gives the frontend a clean first-use path without exposing a separate
 * device provisioning endpoint.
 */
const ensureDeviceForUser = async (deviceId, userId) => {
  let device = await Device.findOne({ deviceId });
  if (!device) {
    device = await Device.create({ deviceId, userId, lastSeen: new Date() });
    logger.info('New IoT device registered', { deviceId, userId });
    return device;
  }

  if (String(device.userId) !== String(userId)) {
    throw buildHttpError('You do not have access to this device.', 403);
  }

  return device;
};

const requireOwnedDevice = async (deviceId, userId) => {
  let device = await Device.findOne({ deviceId });
  if (!device) {
    throw buildHttpError(`Device '${deviceId}' not found.`, 404);
  }

  // Claim unclaimed device (auto-registered by ESP32 before any user linked it)
  if (!device.userId) {
    device = await Device.findOneAndUpdate(
      { deviceId },
      { $set: { userId } },
      { returnDocument: 'after' }
    );
    logger.info('Device claimed by user', { deviceId, userId });
    return device;
  }

  if (String(device.userId) !== String(userId)) {
    throw buildHttpError('You do not have access to this device.', 403);
  }

  return device;
};

const handlePower = async (deviceId, status, userId) => {
  const previousDevice = await Device.findOne({ deviceId }).lean();
  const wasOffline =
    !previousDevice?.lastSeen ||
    (Date.now() - new Date(previousDevice.lastSeen).getTime()) > DEVICE_ONLINE_WINDOW_MS;

  const patch = { powerState: status };

  // Safety-first behavior: when a device comes back after an outage/reset,
  // clear any stale ON command so the relay does not auto-start unexpectedly.
  if (status === 'ON' && wasOffline) {
    patch.motorState = 'OFF';
    patch.reportedMotorState = 'OFF';
  }

  const device = await touchDevice(deviceId, patch);

  if (status === 'ON') {
    if (device.userId) {
      await notificationService.create({
        userId: device.userId,
        type:    'power_on',
        title:   'Power Restored',
        message: `Device ${deviceId} came online.`,
        meta:    { deviceId },
      });
    }
    logger.info('Power ON event', { deviceId });
  }

  return { deviceId, powerState: status, lastSeen: device.lastSeen };
};

const setMotor = async (deviceId, action, userId) => {
  const existingDevice = await ensureDeviceForUser(deviceId, userId);

  if (existingDevice.motorState === action) {
    logger.info('Motor command ignored because state is unchanged', { deviceId, action, userId });
    return { deviceId, motor: action, unchanged: true };
  }

  const device = await touchDevice(deviceId, { motorState: action });

  await MotorLog.create({ deviceId, action, triggeredBy: 'user', userId });

  const notifType = action === 'ON' ? 'motor_started' : 'motor_stopped';
  await notificationService.create({
    userId: device.userId,
    type:    notifType,
    title:   `Motor ${action}`,
    message: `Motor on device ${deviceId} was turned ${action} by user.`,
    meta:    { deviceId, action },
  });

  logger.info('Motor command set', { deviceId, action, userId });
  return { deviceId, motor: action };
};

/**
 * ESP32 polls this to get its pending motor command.
 */
const getCommand = async (deviceId) => {
  const device = await Device.findOneAndUpdate(
    { deviceId },
    { $set: { lastSeen: new Date() }, $setOnInsert: { deviceId } },
    { upsert: true, returnDocument: 'after' }
  ).lean();

  return { motor: device.motorState, lastSeen: device.lastSeen };
};

const handleSensorData = async ({ deviceId, soil, temperature, humidity, flow, rain, current, motor }) => {
  const reportedMotorState = motor ? 'ON' : 'OFF';
  const device = await touchDevice(deviceId, { reportedMotorState });

  const log = await SensorLog.create({ deviceId, soil, temperature, humidity, flow, rain, current, motor });

  if (device.userId) {
    const alerts = [];

    if (flow === 0 && motor === true) {
      alerts.push(
        notificationService.create({
          userId:  device.userId,
          type:    'no_water',
          title:   'No Water Flow Detected',
          message: `Device ${deviceId} reported zero water flow. Check the pipeline.`,
          meta:    { deviceId, flow },
        })
      );
      logger.warn('No water flow', { deviceId });
    }

    if (current === 0 && motor === true) {
      alerts.push(
        notificationService.create({
          userId:  device.userId,
          type:    'motor_failed',
          title:   'Motor Failure Detected',
          message: `Device ${deviceId}: motor is ON but current is 0A. Motor may have failed.`,
          meta:    { deviceId, current },
        })
      );
      logger.warn('Motor failure', { deviceId });
    }

    if (rain === true) {
      alerts.push(
        notificationService.create({
          userId:  device.userId,
          type:    'rain_detected',
          title:   'Rain Detected',
          message: `Device ${deviceId} detected rainfall. Consider turning off the motor.`,
          meta:    { deviceId },
        })
      );
      logger.info('Rain detected', { deviceId });
    }

    await Promise.allSettled(alerts);
  }

  return log;
};

const getDeviceStatus = async (deviceId, userId) => {
  const device = await requireOwnedDevice(deviceId, userId);
  const latest = await SensorLog.findOne({ deviceId }).sort({ timestamp: -1 }).lean();
  const online = !!device.lastSeen && (Date.now() - new Date(device.lastSeen).getTime()) < DEVICE_ONLINE_WINDOW_MS;
  const actualMotor = online ? (latest?.motor ?? (device.reportedMotorState === 'ON')) : false;

  return {
    deviceId,
    motor:    actualMotor,
    desiredMotor: device.motorState === 'ON',
    power:    device.powerState === 'ON',
    soil:     latest?.soil ?? null,
    temperature: latest?.temperature ?? null,
    humidity: latest?.humidity ?? null,
    flow:     latest?.flow    ?? null,
    rain:     latest?.rain    ?? null,
    current:  latest?.current ?? null,
    lastSeen: device.lastSeen,
  };
};

module.exports = {
  ensureDeviceForUser,
  handlePower,
  setMotor,
  getCommand,
  handleSensorData,
  getDeviceStatus,
};
