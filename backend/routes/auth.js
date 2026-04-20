'use strict';

const express = require('express');
const router = express.Router();

const authService = require('../services/authService');
const { authenticate } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');
const { registerRules, loginRules } = require('../utils/validators');
const { success, created, error: apiError } = require('../utils/apiResponse');

/**
 * POST /api/auth/register
 * Create a new user account.
 */
router.post(
  '/register',
  authLimiter,
  registerRules,
  validate,
  async (req, res, next) => {
    try {
      const { name, email, password } = req.body;
      const result = await authService.register({ name, email, password });
      return created(res, result);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/auth/login
 * Authenticate and receive JWT tokens.
 */
router.post(
  '/login',
  authLimiter,
  loginRules,
  validate,
  async (req, res, next) => {
    try {
      const { email, password } = req.body;
      const result = await authService.login({ email, password });
      return success(res, result);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/auth/refresh
 * Exchange a refresh token for a new access token.
 */
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return apiError(res, 'Refresh token is required', 400);
    const result = await authService.refresh(refreshToken);
    return success(res, result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/auth/me
 * Return the currently authenticated user's profile.
 */
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await authService.findById(req.user.id);
    if (!user) return apiError(res, 'User not found', 404);
    return success(res, user.toSafeObject());
  } catch (err) {
    next(err);
  }
});

module.exports = router;
