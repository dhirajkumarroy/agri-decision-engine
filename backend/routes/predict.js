'use strict';

const express = require('express');
const multer = require('multer');
const router = express.Router();

const mlService = require('../services/mlService');
const notificationService = require('../services/notificationService');
const emailService = require('../services/emailService');
const Prediction = require('../models/Prediction');
const User = require('../models/User');
const { mlLimiter } = require('../middleware/rateLimiter');
const { optionalAuth } = require('../middleware/auth');
const { irrigationRules } = require('../utils/validators');
const validate = require('../middleware/validate');
const { success, badRequest } = require('../utils/apiResponse');
const logger = require('../config/logger');

// ── Multer: in-memory image storage ──────────────────────────────────────────
const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    ALLOWED_MIME.has(file.mimetype)
      ? cb(null, true)
      : cb(new Error('Only JPEG, PNG, and WebP images are allowed'));
  },
});

/**
 * POST /api/predict/disease
 */
router.post('/disease', mlLimiter, optionalAuth, upload.single('file'), async (req, res, next) => {
  if (!req.file) return badRequest(res, 'Image file is required (field name: "file")');

  const start = Date.now();
  logger.info('Disease detection request', {
    filename: req.file.originalname,
    size: req.file.size,
    ip: req.ip,
  });

  try {
    const result = await mlService.predictDisease(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname
    );
    const duration = Date.now() - start;

    const disease = result.disease || result.predicted_class || null;
    const confidence = result.confidence ? Math.round(result.confidence * 100) : null;

    // Save to DB
    Prediction.create({
      userId: req.user?.id || null,
      type: 'disease',
      input: {
        filename: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
      },
      result,
      summary: { disease, confidence },
      ip: req.ip,
      durationMs: duration,
    }).then(async (pred) => {
      if (req.user?.id && disease) {
        User.findByIdAndUpdate(req.user.id, { $inc: { totalPredictions: 1 } }).exec();

        // In-app notification
        await notificationService.notifyDiseaseAlert(req.user.id, disease, confidence, pred._id);

        // Email notification if disease detected (not "Healthy")
        if (!disease.toLowerCase().includes('healthy')) {
          const user = await User.findById(req.user.id).select('name email');
          if (user) {
            emailService.sendNotificationEmail({
              toEmail: user.email,
              subject: `Disease Alert: ${disease} detected on your crop`,
              htmlBody: `
                <h3 style="color:#c62828;">⚠️ Disease Detected</h3>
                <p>Hi <strong>${user.name}</strong>,</p>
                <p>Our AI model detected <strong>${disease}</strong> (${confidence}% confidence) in the image you uploaded.</p>
                <p><strong>Action required:</strong> Please check the treatment recommendations on the platform immediately.</p>
                <a href="http://localhost:3000/predict" style="display:inline-block;background:#2e7d32;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;margin-top:12px;">View Treatment Guide →</a>
              `,
              textBody: `Disease Detected: ${disease} (${confidence}%). Please check treatment recommendations at http://localhost:3000/predict`,
            }).catch(() => {});
          }
        }
      }
    }).catch(() => {});

    return success(res, result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/predict/irrigation
 */
router.post('/irrigation', mlLimiter, optionalAuth, irrigationRules, validate, async (req, res, next) => {
  const start = Date.now();
  try {
    const payload = { ...req.body };
    if (payload.soil_moisture === undefined && payload.moisture !== undefined) {
      payload.soil_moisture = payload.moisture;
    }
    if (payload.rain === undefined && payload.rainfall !== undefined) {
      payload.rain = payload.rainfall;
    }

    const result = await mlService.predictIrrigation(payload);

    const irrigationNeeded = result.irrigation_needed ?? result.result ?? null;

    Prediction.create({
      userId: req.user?.id || null,
      type: 'irrigation',
      input: payload,
      result,
      summary: {
        irrigationNeeded: irrigationNeeded ?? (result.irrigation === 'yes' ? true : result.irrigation === 'no' ? false : null),
      },
      ip: req.ip,
      durationMs: Date.now() - start,
    }).then(() => {
      if (req.user?.id) {
        User.findByIdAndUpdate(req.user.id, { $inc: { totalPredictions: 1 } }).exec();
      }
    }).catch(() => {});

    return success(res, result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
