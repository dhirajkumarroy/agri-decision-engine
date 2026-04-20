'use strict';

const express = require('express');
const router = express.Router();

const Prediction = require('../models/Prediction');
const User = require('../models/User');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { success, notFound, badRequest } = require('../utils/apiResponse');

router.post('/track', optionalAuth, async (req, res, next) => {
  try {
    const { type, input = {}, result = {} } = req.body || {};
    const allowed = new Set(['crop', 'disease', 'irrigation', 'fertilizer']);

    if (!allowed.has(type)) {
      return badRequest(res, 'type must be one of: crop, disease, irrigation, fertilizer');
    }
    if (!result || typeof result !== 'object') {
      return badRequest(res, 'result must be an object');
    }

    const summary = {};
    if (type === 'crop') {
      const top = result.top_recommendations?.[0] || result.predictions?.[0] || null;
      summary.topCrop = top?.crop || null;
      summary.confidence = top?.probability != null ? Math.round(top.probability * 100) : null;
    } else if (type === 'disease') {
      summary.disease = result.disease || result.predicted_class || null;
      summary.confidence = result.confidence != null ? Number(result.confidence) : null;
    } else if (type === 'irrigation') {
      summary.irrigationNeeded =
        result.irrigation_needed ??
        (result.irrigation === 'yes' ? true : result.irrigation === 'no' ? false : null);
    }

    const prediction = await Prediction.create({
      userId: req.user?.id || null,
      type,
      input,
      result,
      summary,
      ip: req.ip,
      durationMs: null,
    });

    if (req.user?.id) {
      User.findByIdAndUpdate(req.user.id, { $inc: { totalPredictions: 1 } }).exec();
    }

    return success(res, { id: prediction._id, tracked: true });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/predictions
 * Logged-in user's prediction history (paginated).
 * ?type=crop|disease|irrigation|fertilizer  — filter by type
 * ?page=1&limit=20
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;
    const filter = { userId: req.user.id };
    if (req.query.type) filter.type = req.query.type;

    const [predictions, total] = await Promise.all([
      Prediction.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-result') // omit heavy ML result payload from list
        .lean(),
      Prediction.countDocuments(filter),
    ]);

    return success(res, { predictions, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/predictions/:id
 * Full detail for a single prediction (includes ML result).
 */
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const prediction = await Prediction.findOne({
      _id: req.params.id,
      userId: req.user.id,
    }).lean();

    if (!prediction) return notFound(res, 'Prediction not found');
    return success(res, prediction);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/predictions/:id
 * Delete a prediction from the user's history.
 */
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const result = await Prediction.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id,
    });
    if (!result) return notFound(res, 'Prediction not found');
    return success(res, { message: 'Prediction deleted' });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/predictions/stats/summary
 * Aggregated stats for the logged-in user.
 */
router.get('/stats/summary', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const [counts, recent] = await Promise.all([
      Prediction.aggregate([
        { $match: { userId: require('mongoose').Types.ObjectId.createFromHexString(userId) } },
        { $group: { _id: '$type', count: { $sum: 1 } } },
      ]),
      Prediction.find({ userId })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('type summary createdAt')
        .lean(),
    ]);

    const byType = counts.reduce((acc, c) => { acc[c._id] = c.count; return acc; }, {});
    const total  = Object.values(byType).reduce((a, b) => a + b, 0);

    return success(res, { total, byType, recentActivity: recent });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
