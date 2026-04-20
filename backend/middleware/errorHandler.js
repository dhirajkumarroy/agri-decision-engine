'use strict';

const logger = require('../config/logger');
const { error: apiError } = require('../utils/apiResponse');
const { v4: uuidv4 } = require('uuid');

/**
 * Global error-handling middleware.
 * Must be registered LAST with app.use().
 */
const errorHandler = (err, req, res, next) => {
  const errorId = uuidv4();

  // Log the full error with context
  logger.error('Unhandled error', {
    errorId,
    message: err.message,
    stack: err.stack,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userId: req.user?.id || 'anonymous',
  });

  // Axios / upstream ML backend errors
  if (err.isAxiosError) {
    const status = err.response?.status || 502;
    const upstreamMessage = err.response?.data?.error || err.response?.data?.detail || 'ML backend error';

    if (status === 404) {
      return apiError(res, upstreamMessage, 404);
    }
    if (status === 422) {
      return apiError(res, 'Invalid input data sent to ML model', 422, err.response?.data);
    }
    return apiError(res, 'ML service unavailable. Please try again later.', 502);
  }

  // Validation errors (express-validator results forwarded as an error)
  if (err.type === 'validation') {
    return apiError(res, 'Validation failed', 400, err.errors);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return apiError(res, 'Invalid token', 401);
  }
  if (err.name === 'TokenExpiredError') {
    return apiError(res, 'Token has expired', 401);
  }

  // Multer / file upload errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return apiError(res, 'File too large. Maximum size is 10 MB.', 413);
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return apiError(res, 'Unexpected file field.', 400);
  }

  // Known HTTP errors
  if (err.status && err.status < 500) {
    return apiError(res, err.message, err.status, err.details);
  }

  // Default 500
  const isDev = process.env.NODE_ENV !== 'production';
  return apiError(
    res,
    isDev ? err.message : `Internal server error (ref: ${errorId})`,
    500,
    isDev ? err.stack : undefined
  );
};

/**
 * 404 handler — place before errorHandler.
 */
const notFoundHandler = (req, res) => {
  return apiError(res, `Route ${req.method} ${req.originalUrl} not found`, 404);
};

module.exports = { errorHandler, notFoundHandler };
