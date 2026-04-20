'use strict';

const morgan = require('morgan');
const { v4: uuidv4 } = require('uuid');
const logger = require('../config/logger');

// Attach a unique request ID to every incoming request
const requestId = (req, res, next) => {
  req.id = req.headers['x-request-id'] || uuidv4();
  res.setHeader('X-Request-Id', req.id);
  next();
};

// Morgan token: request ID
morgan.token('request-id', (req) => req.id);

// Morgan token: authenticated user ID
morgan.token('user-id', (req) => req.user?.id || 'anon');

// Morgan token: response body size (bytes)
morgan.token('body-size', (req, res) => res.getHeader('content-length') || '-');

// Pipe morgan output through winston
const stream = {
  write: (message) => logger.http(message.trim()),
};

const httpLogger = morgan(
  ':request-id :method :url :status :response-time ms - :body-size - :user-id',
  { stream }
);

module.exports = { requestId, httpLogger };
