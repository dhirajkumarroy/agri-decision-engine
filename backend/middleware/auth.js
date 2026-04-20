'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config');
const { unauthorized, forbidden } = require('../utils/apiResponse');
const logger = require('../config/logger');

/**
 * Verifies the JWT in the Authorization header.
 * Attaches decoded payload to req.user on success.
 * Returns 401 if token is missing/invalid.
 */
const authenticate = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return unauthorized(res, 'Authentication token required');
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    req.user = decoded;
    next();
  } catch (err) {
    logger.debug('JWT verification failed', { error: err.message, ip: req.ip });
    if (err.name === 'TokenExpiredError') {
      return unauthorized(res, 'Token has expired. Please log in again.');
    }
    return unauthorized(res, 'Invalid authentication token');
  }
};

/**
 * Optional authentication — does NOT block if token is absent.
 * Attaches req.user if a valid token is present, otherwise req.user = null.
 */
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }

  const token = authHeader.slice(7);
  try {
    req.user = jwt.verify(token, config.jwt.secret);
  } catch {
    req.user = null;
  }
  next();
};

/**
 * Role-based access guard.
 * Usage: authorize('admin') or authorize('admin', 'moderator')
 */
const authorize = (...roles) => (req, res, next) => {
  if (!req.user) return unauthorized(res);
  if (!roles.includes(req.user.role)) {
    logger.warn('Forbidden access attempt', {
      userId: req.user.id,
      requiredRoles: roles,
      userRole: req.user.role,
      url: req.originalUrl,
    });
    return forbidden(res, 'You do not have permission to access this resource');
  }
  next();
};

/**
 * Utility: sign a new access token.
 */
const signAccessToken = (payload) =>
  jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn });

/**
 * Utility: sign a refresh token with a longer TTL.
 */
const signRefreshToken = (payload) =>
  jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.refreshExpiresIn });

module.exports = { authenticate, optionalAuth, authorize, signAccessToken, signRefreshToken };
