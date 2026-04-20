'use strict';

const mqtt = require('mqtt');

const config = require('../config');
const logger = require('../config/logger');

let client = null;
let connectionPromise = null;
let connected = false;

const ensureEnabled = () => {
  if (!config.mqtt.enabled) {
    return false;
  }
  return true;
};

const subscribeToSensorTopic = async () => {
  if (!client || !connected) {
    return;
  }

  await new Promise((resolve, reject) => {
    client.subscribe(config.mqtt.sensorTopic, { qos: 1 }, (err) => {
      if (err) {
        return reject(err);
      }

      logger.info('MQTT subscription active', { topic: config.mqtt.sensorTopic });
      return resolve();
    });
  });
};

const handleSensorMessage = async (topic, payloadBuffer) => {
  if (topic !== config.mqtt.sensorTopic) {
    return;
  }

  try {
    const payload = JSON.parse(payloadBuffer.toString());
    const pipelineService = require('./pipelineService');
    await pipelineService.processSensorData(payload, 'iot');
  } catch (err) {
    logger.error('Failed to process MQTT sensor message', {
      topic,
      error: err.message,
    });
  }
};

const attachEventHandlers = () => {
  client.on('connect', async () => {
    connected = true;
    logger.info('MQTT broker connected', { brokerUrl: config.mqtt.brokerUrl });

    try {
      await subscribeToSensorTopic();
    } catch (err) {
      logger.error('MQTT subscribe failed', { error: err.message });
    }
  });

  client.on('reconnect', () => {
    logger.warn('MQTT reconnecting');
  });

  client.on('close', () => {
    connected = false;
    logger.warn('MQTT connection closed');
  });

  client.on('offline', () => {
    connected = false;
    logger.warn('MQTT client offline');
  });

  client.on('error', (err) => {
    logger.error('MQTT error', {
      brokerUrl: config.mqtt.brokerUrl,
      error: err.message || err.code || 'Unknown MQTT error',
    });
  });

  client.on('message', (topic, payload) => {
    handleSensorMessage(topic, payload);
  });
};

const connect = async () => {
  if (!ensureEnabled()) {
    return null;
  }

  if (client && connected) {
    return client;
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = new Promise((resolve, reject) => {
    client = mqtt.connect(config.mqtt.brokerUrl, {
      clientId: `${config.mqtt.clientIdPrefix}-${process.pid}`,
      reconnectPeriod: 5000,
      connectTimeout: 5000,
    });

    attachEventHandlers();

    client.once('connect', () => {
      resolve(client);
    });

    client.once('error', (err) => {
      reject(err);
    });
  });

  try {
    return await connectionPromise;
  } finally {
    connectionPromise = null;
  }
};

const publish = async (topic, payload, options = {}) => {
  if (!ensureEnabled()) {
    throw Object.assign(new Error('MQTT is disabled by configuration.'), {
      status: 503,
      code: 'MQTT_DISABLED',
    });
  }

  const retries = options.retries ?? config.mqtt.publishRetries;
  let attempts = 0;
  let lastError = null;

  await connect();

  while (attempts < retries) {
    attempts += 1;

    try {
      await new Promise((resolve, reject) => {
        client.publish(topic, JSON.stringify(payload), { qos: 1 }, (err) => {
          if (err) {
            return reject(err);
          }
          return resolve();
        });
      });

      logger.info('MQTT publish successful', { topic, attempts });
      return { attempts };
    } catch (err) {
      lastError = err;
      logger.warn('MQTT publish attempt failed', { topic, attempts, error: err.message });
    }
  }

  throw Object.assign(new Error(`MQTT publish failed after ${attempts} attempts: ${lastError?.message || 'unknown error'}`), {
    attempts,
    cause: lastError || undefined,
  });
};

const status = () => ({
  ok: config.mqtt.enabled ? connected : true,
  enabled: config.mqtt.enabled,
  brokerUrl: config.mqtt.brokerUrl,
  sensorTopic: config.mqtt.sensorTopic,
  actuatorTopic: config.mqtt.actuatorTopic,
});

const close = async () => {
  if (!client) {
    return;
  }

  await new Promise((resolve) => {
    client.end(false, {}, () => {
      connected = false;
      resolve();
    });
  });
};

module.exports = {
  connect,
  publish,
  status,
  close,
};
