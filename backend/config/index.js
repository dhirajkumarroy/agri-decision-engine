'use strict';

require('dotenv').config();

const config = {
  env: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV !== 'production',

  server: {
    port: parseInt(process.env.PORT, 10) || 3000,
  },

  mongo: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/farmpilot_ai',
  },

  mlBackend: {
    url: process.env.ML_BACKEND_URL || 'http://localhost:8000',
    timeout: 30000, // 30 seconds for ML inference
  },

  mqtt: {
    enabled: process.env.MQTT_ENABLED === 'true',
    brokerUrl: process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
    sensorTopic: process.env.MQTT_SENSOR_TOPIC || 'farm/sensor',
    actuatorTopic: process.env.MQTT_ACTUATOR_TOPIC || 'farm/actuator',
    publishRetries: parseInt(process.env.MQTT_PUBLISH_RETRIES, 10) || 3,
    clientIdPrefix: process.env.MQTT_CLIENT_ID_PREFIX || 'farmpilot-ai',
  },

  weather: {
    apiKey: process.env.OPENWEATHER_API_KEY || '',
    baseUrl: 'https://api.openweathermap.org/data/2.5',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'changeme_use_a_real_secret_in_production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },

  email: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.EMAIL_FROM || 'Farmpilot AI <noreply@example.com>',
    to: process.env.EMAIL_TO || 'support@example.com',
    enabled: process.env.EMAIL_ENABLED !== 'false',
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
    mlMax: parseInt(process.env.ML_RATE_LIMIT_MAX, 10) || 20,
  },

  cache: {
    weatherTTL: parseInt(process.env.WEATHER_CACHE_TTL, 10) || 600,
    cropInfoTTL: parseInt(process.env.CROP_INFO_CACHE_TTL, 10) || 86400,
    forecastTTL: parseInt(process.env.FORECAST_CACHE_TTL, 10) || 1800,
  },

  cors: {
    origins: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:8000')
      .split(',')
      .map((o) => o.trim()),
  },

  iot: {
    apiKey: process.env.IOT_API_KEY || 'changeme_iot_secret',
  },

  ai: {
    provider: (process.env.AI_PROVIDER || 'ollama').toLowerCase(),
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-opus-4-1',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    ollamaHost: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434',
    ollamaModel: process.env.OLLAMA_MODEL || 'llama3',
    maxTokens: 1024,
    rateMax: parseInt(process.env.AI_RATE_LIMIT_MAX, 10) || 20,
  },
};

module.exports = config;
