'use strict';

const express = require('express');
const router = express.Router();

const ContactQuery = require('../models/ContactQuery');
const emailService = require('../services/emailService');
const { contactLimiter } = require('../middleware/rateLimiter');
const { contactRules } = require('../utils/validators');
const validate = require('../middleware/validate');
const { success, error: apiError } = require('../utils/apiResponse');
const logger = require('../config/logger');

/**
 * POST /api/contact
 * Save query to MongoDB, email admin, auto-reply to user.
 */
router.post('/', contactLimiter, contactRules, validate, async (req, res, next) => {
  const { name, email, subject, message } = req.body;

  try {
    // 1. Save to DB
    const query = await ContactQuery.create({
      name,
      email,
      subject,
      message,
      ip: req.ip,
    });

    logger.info('Contact query saved', { queryId: query._id, from: email, subject });

    // 2. Send emails (non-blocking — don't fail the request if email fails)
    emailService.sendContactEmail({ name, email, subject, message }).catch((err) =>
      logger.error('Contact email failed', { error: err.message, queryId: query._id })
    );

    return success(res, {
      queryId: query._id,
      message: `Thank you, ${name}! Your message has been received. We'll reply to ${email} within 24 hours.`,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
