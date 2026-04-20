'use strict';

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

const config = require('./config');
const logger = require('./config/logger');
const db = require('./db');
const { requestId, httpLogger } = require('./middleware/requestLogger');
const { globalLimiter } = require('./middleware/rateLimiter');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const routes = require('./routes');
const mqttService = require('./services/mqttService');

const writeProxyBody = (proxyReq, req) => {
  if (!req.body || !Object.keys(req.body).length) {
    return;
  }

  const contentType = proxyReq.getHeader('Content-Type') || req.headers['content-type'] || '';
  let bodyData = null;

  if (contentType.includes('application/json')) {
    bodyData = JSON.stringify(req.body);
  } else if (contentType.includes('application/x-www-form-urlencoded')) {
    bodyData = new URLSearchParams(req.body).toString();
  }

  if (!bodyData) {
    return;
  }

  proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
  proxyReq.write(bodyData);
};

// ─────────────────────────────────────────────────────────────────────────────
const app = express();

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com'],
      styleSrc:   ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net', 'fonts.googleapis.com'],
      fontSrc:    ["'self'", 'fonts.gstatic.com', 'cdn.jsdelivr.net'],
      imgSrc:     ["'self'", 'data:', '*.openweathermap.org', 'maps.google.com'],
      connectSrc: ["'self'", 'api.openweathermap.org', `http://localhost:${config.server.port}`, config.mlBackend.url],
      frameSrc:   ["'self'", 'maps.google.com'],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: (origin, cb) => (!origin || config.cors.origins.includes(origin) || config.isDev) ? cb(null, true) : cb(new Error(`CORS: origin '${origin}' not allowed`)),
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  exposedHeaders: ['X-Request-Id', 'RateLimit-Remaining', 'RateLimit-Reset'],
  credentials: true,
  maxAge: 86400,
}));

app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(requestId);
app.use(httpLogger);
app.use(globalLimiter);
app.set('trust proxy', 1);

// Serve admin panel static files
app.use('/static', express.static(path.join(__dirname, '..', 'app', 'static')));
app.use('/admin-panel', express.static(path.join(__dirname, 'admin')));

// ── API + admin routes (handled by Node.js) ───────────────────────────────────
app.use('/', routes);

// ── Reverse proxy → FastAPI for all HTML pages + FastAPI APIs ─────────────────
app.use('/', createProxyMiddleware({
  target: config.mlBackend.url,
  changeOrigin: true,
  on: {
    proxyReq: (proxyReq, req) => {
      writeProxyBody(proxyReq, req);
    },
    error: (_err, _req, res) => {
      res.status(502).json({
        success: false,
        error: { message: 'FastAPI is unreachable. Run: uvicorn app.main:app --reload --port 8000' },
      });
    },
  },
}));

app.use(notFoundHandler);
app.use(errorHandler);

// ─────────────────────────────────────────────────────────────────────────────
// Startup: connect MongoDB first, then open HTTP port
// ─────────────────────────────────────────────────────────────────────────────
const start = async () => {
  try {
    await db.connect();
  } catch (err) {
    logger.warn('MongoDB unavailable at startup — continuing without DB', { error: err.message });
  }

  if (config.mqtt.enabled) {
    try {
      await mqttService.connect();
    } catch (err) {
      logger.warn('MQTT unavailable at startup — continuing without broker', { error: err.message });
    }
  } else {
    logger.info('MQTT disabled by configuration');
  }

  const server = app.listen(config.server.port, () => {
    logger.info([
      '╔══════════════════════════════════════════════════════╗',
      '║            Farmpilot AI — Node.js Backend            ║',
      '╠══════════════════════════════════════════════════════╣',
      `║  Env      : ${config.env.padEnd(38)}║`,
      `║  Port     : ${String(config.server.port).padEnd(38)}║`,
      `║  ML URL   : ${config.mlBackend.url.padEnd(38)}║`,
      `║  Admin    : http://localhost:${config.server.port}/admin-panel/     ║`,
      '╚══════════════════════════════════════════════════════╝',
    ].join('\n'));
  });

  const shutdown = async (signal) => {
    logger.info(`${signal} received — shutting down`);
    await mqttService.close().catch(() => {});
    server.close(() => { logger.info('Server closed'); process.exit(0); });
    setTimeout(() => process.exit(1), 10000);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
};

process.on('unhandledRejection', (reason) => logger.error('Unhandled rejection', { reason }));

start();
module.exports = app;


// const express = require('express');
// const app = express();

// app.use(express.json());

// app.post('/iot/test', (req, res) => {
//   console.log("📡 SENSOR DATA:", req.body);
//   res.json({ ok: true });
// });

// app.listen(3000, () => {
//   console.log("Server running on 3000");
// });
