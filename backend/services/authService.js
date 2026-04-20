'use strict';

const User = require('../models/User');
const { signAccessToken, signRefreshToken } = require('../middleware/auth');
const logger = require('../config/logger');

// ── Register ──────────────────────────────────────────────────────────────────
const register = async ({ name, email, password }) => {
  const existing = await User.findOne({ email });
  if (existing) {
    const err = new Error('Email already registered');
    err.status = 409;
    throw err;
  }

  const user = await User.create({ name, email, password });
  logger.info('New user registered', { userId: user._id, email: user.email });

  return { user: user.toSafeObject(), ...issueTokens(user) };
};

// ── Login ─────────────────────────────────────────────────────────────────────
const login = async ({ email, password }) => {
  // Explicitly select password (excluded by default via schema `select: false`)
  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    const err = new Error('Invalid email or password');
    err.status = 401;
    throw err;
  }

  if (!user.isActive) {
    const err = new Error('Account is disabled. Contact support.');
    err.status = 403;
    throw err;
  }

  user.lastLoginAt = new Date();
  await user.save({ validateModifiedOnly: true });

  logger.info('User logged in', { userId: user._id });
  return { user: user.toSafeObject(), ...issueTokens(user) };
};

// ── Refresh token ─────────────────────────────────────────────────────────────
const refresh = async (token) => {
  const jwt = require('jsonwebtoken');
  const config = require('../config');

  let decoded;
  try {
    decoded = jwt.verify(token, config.jwt.secret);
  } catch {
    const err = new Error('Invalid or expired refresh token');
    err.status = 401;
    throw err;
  }

  const user = await User.findById(decoded.id);
  if (!user || !user.isActive) {
    const err = new Error('User not found or disabled');
    err.status = 401;
    throw err;
  }

  return { user: user.toSafeObject(), ...issueTokens(user) };
};

// ── Lookups ───────────────────────────────────────────────────────────────────
const findById = (id) => User.findById(id);
const findByEmail = (email) => User.findOne({ email });

// ── Helpers ───────────────────────────────────────────────────────────────────
const issueTokens = (user) => ({
  accessToken: signAccessToken({
    id: user._id || user.id,
    email: user.email,
    role: user.role,
    name: user.name,
  }),
  refreshToken: signRefreshToken({ id: user._id || user.id }),
});

module.exports = { register, login, refresh, findById, findByEmail };
