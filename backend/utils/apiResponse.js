'use strict';

/**
 * Standardised API response helpers.
 * Every response follows: { success, data?, error?, meta? }
 */

const success = (res, data = null, statusCode = 200, meta = null) => {
  const body = { success: true };
  if (data !== null) body.data = data;
  if (meta !== null) body.meta = meta;
  return res.status(statusCode).json(body);
};

const created = (res, data = null) => success(res, data, 201);

const error = (res, message = 'Something went wrong', statusCode = 500, details = null) => {
  const body = { success: false, error: { message } };
  if (details) body.error.details = details;
  return res.status(statusCode).json(body);
};

const badRequest = (res, message = 'Bad request', details = null) =>
  error(res, message, 400, details);

const unauthorized = (res, message = 'Unauthorized') => error(res, message, 401);

const forbidden = (res, message = 'Forbidden') => error(res, message, 403);

const notFound = (res, message = 'Resource not found') => error(res, message, 404);

const tooManyRequests = (res, message = 'Too many requests, please try again later') =>
  error(res, message, 429);

module.exports = { success, created, error, badRequest, unauthorized, forbidden, notFound, tooManyRequests };
