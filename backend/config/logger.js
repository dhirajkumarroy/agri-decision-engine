'use strict';

const { createLogger, format, transports } = require('winston');
require('winston-daily-rotate-file');
const path = require('path');
const config = require('./index');

const { combine, timestamp, printf, colorize, errors, json } = format;

// Human-readable format for development
const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] ${level}: ${stack || message}${metaStr}`;
  })
);

// JSON format for production (structured logging)
const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json()
);

const logDir = path.join(__dirname, '..', 'logs');

const fileRotateTransport = new transports.DailyRotateFile({
  dirname: logDir,
  filename: 'app-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxFiles: '14d',
  maxSize: '20m',
  zippedArchive: true,
  format: prodFormat,
});

const errorRotateTransport = new transports.DailyRotateFile({
  dirname: logDir,
  filename: 'error-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  level: 'error',
  maxFiles: '30d',
  maxSize: '20m',
  zippedArchive: true,
  format: prodFormat,
});

const logger = createLogger({
  level: config.isDev ? 'debug' : 'info',
  defaultMeta: { service: 'farmpilot-ai' },
  transports: [
    new transports.Console({
      format: config.isDev ? devFormat : prodFormat,
    }),
    fileRotateTransport,
    errorRotateTransport,
  ],
  exceptionHandlers: [
    new transports.DailyRotateFile({
      dirname: logDir,
      filename: 'exceptions-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '30d',
      format: prodFormat,
    }),
  ],
  rejectionHandlers: [
    new transports.DailyRotateFile({
      dirname: logDir,
      filename: 'rejections-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '30d',
      format: prodFormat,
    }),
  ],
});

module.exports = logger;
