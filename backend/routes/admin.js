'use strict';

const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');

const ContactQuery = require('../models/ContactQuery');
const User = require('../models/User');
const Prediction = require('../models/Prediction');
const Notification = require('../models/Notification');
const Device = require('../models/Device');
const SensorLog = require('../models/SensorLog');
const emailService = require('../services/emailService');
const notificationService = require('../services/notificationService');
const { authenticate, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { success, notFound, error: apiError } = require('../utils/apiResponse');
const logger = require('../config/logger');

const DEVICE_ONLINE_WINDOW_MS = 30 * 1000;

// All admin routes require authentication + admin role
router.use(authenticate, authorize('admin'));

// ── Contact Queries ───────────────────────────────────────────────────────────

/**
 * GET /api/admin/queries
 * List all contact queries (paginated, filterable by status).
 * ?status=pending|in_review|replied|closed
 * ?page=1&limit=20
 */
router.get('/queries', async (req, res, next) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, parseInt(req.query.limit) || 20);
    const skip   = (page - 1) * limit;
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.email)  filter.email  = req.query.email;

    const [queries, total] = await Promise.all([
      ContactQuery.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      ContactQuery.countDocuments(filter),
    ]);

    // Count by status for dashboard
    const statusCounts = await ContactQuery.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const byStatus = statusCounts.reduce((acc, s) => { acc[s._id] = s.count; return acc; }, {});

    return success(res, { queries, total, page, pages: Math.ceil(total / limit), byStatus });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/queries/:id
 * Single query detail.
 */
router.get('/queries/:id', async (req, res, next) => {
  try {
    const query = await ContactQuery.findById(req.params.id).lean();
    if (!query) return notFound(res, 'Query not found');
    return success(res, query);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/queries/:id/reply
 * Reply to a contact query — sends email + creates in-app notification.
 *
 * Body: { message: string, adminName?: string }
 */
router.post(
  '/queries/:id/reply',
  [
    param('id').isMongoId().withMessage('Invalid query ID'),
    body('message').isString().trim().notEmpty().isLength({ min: 10, max: 3000 })
      .withMessage('Reply message must be 10–3000 characters'),
    body('adminName').optional().isString().trim().isLength({ max: 100 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const query = await ContactQuery.findById(req.params.id);
      if (!query) return notFound(res, 'Query not found');

      const { message, adminName = req.user.name || 'Support Team' } = req.body;

      // 1. Send email reply
      let emailDelivered = false;
      try {
        await emailService.sendAdminReply({
          toEmail: query.email,
          toName: query.name,
          originalSubject: query.subject,
          originalMessage: query.message,
          replyMessage: message,
          adminName,
        });
        emailDelivered = true;
        logger.info('Admin reply email sent', { queryId: query._id, to: query.email });
      } catch (emailErr) {
        logger.error('Admin reply email failed', { error: emailErr.message, queryId: query._id });
      }

      // 2. Update query in DB
      query.replies.push({ message, sentBy: adminName, emailDelivered });
      query.status = 'replied';
      await query.save();

      // 3. In-app notification — find user by email (if they have an account)
      const user = await User.findOne({ email: query.email });
      if (user) {
        await notificationService.notifyQueryReply(user._id, query._id, query.subject);
      }

      return success(res, {
        message: 'Reply sent successfully',
        emailDelivered,
        query: {
          id: query._id,
          status: query.status,
          replies: query.replies,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PATCH /api/admin/queries/:id/status
 * Update query status (in_review / closed).
 * Body: { status: 'in_review' | 'closed', adminNote?: string }
 */
router.patch(
  '/queries/:id/status',
  [
    param('id').isMongoId(),
    body('status').isIn(['pending', 'in_review', 'replied', 'closed']).withMessage('Invalid status'),
    body('adminNote').optional().isString().trim().isLength({ max: 500 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const update = { status: req.body.status };
      if (req.body.adminNote !== undefined) update.adminNote = req.body.adminNote;

      const query = await ContactQuery.findByIdAndUpdate(req.params.id, update, { new: true });
      if (!query) return notFound(res, 'Query not found');
      return success(res, query);
    } catch (err) {
      next(err);
    }
  }
);

// ── Platform Statistics ───────────────────────────────────────────────────────

/**
 * GET /api/admin/stats
 * Overview of users, predictions, and queries.
 */
router.get('/stats', async (_req, res, next) => {
  try {
    const [
      totalUsers,
      activeUsers,
      totalPredictions,
      predByType,
      totalQueries,
      pendingQueries,
      recentUsers,
      totalDevices,
      onlineDevices,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isActive: true }),
      Prediction.countDocuments(),
      Prediction.aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }]),
      ContactQuery.countDocuments(),
      ContactQuery.countDocuments({ status: 'pending' }),
      User.find().sort({ createdAt: -1 }).limit(5).select('name email role createdAt').lean(),
      Device.countDocuments(),
      Device.countDocuments({ lastSeen: { $gte: new Date(Date.now() - DEVICE_ONLINE_WINDOW_MS) } }),
    ]);

    const predictionsByType = predByType.reduce((acc, p) => { acc[p._id] = p.count; return acc; }, {});

    return success(res, {
      users: { total: totalUsers, active: activeUsers, recent: recentUsers },
      predictions: { total: totalPredictions, byType: predictionsByType },
      queries: { total: totalQueries, pending: pendingQueries },
      devices: { total: totalDevices, online: onlineDevices },
    });
  } catch (err) {
    next(err);
  }
});

// ── User Management ───────────────────────────────────────────────────────────

/**
 * GET /api/admin/users
 * List all users (paginated, searchable by name/email).
 * ?search=foo&page=1&limit=20
 */
router.get('/users', async (req, res, next) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page) || 1);
    const limit  = Math.min(100, parseInt(req.query.limit) || 20);
    const filter = {};
    if (req.query.search) {
      const re = new RegExp(req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: re }, { email: re }];
    }
    if (req.query.role) filter.role = req.query.role;
    const [users, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      User.countDocuments(filter),
    ]);
    return success(res, { users, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/admin/users/:id/toggle
 * Enable or disable a user account.
 */
router.patch('/users/:id/toggle', async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return notFound(res, 'User not found');
    if (String(user._id) === req.user.id) return apiError(res, 'Cannot disable your own account', 400);
    user.isActive = !user.isActive;
    await user.save({ validateModifiedOnly: true });
    logger.info('User account toggled', { adminId: req.user.id, targetId: user._id, isActive: user.isActive });
    return success(res, { id: user._id, isActive: user.isActive });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/broadcast
 * Send a system notification to all users.
 * Body: { title, message }
 */
router.post(
  '/broadcast',
  [
    body('title').isString().trim().notEmpty().isLength({ max: 200 }),
    body('message').isString().trim().notEmpty().isLength({ max: 1000 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const users = await User.find({ isActive: true }).select('_id').lean();
      const { title, message } = req.body;

      // Create notifications in bulk
      const docs = users.map((u) => ({
        userId: u._id, type: 'system', title, message, meta: {},
      }));
      await Notification.insertMany(docs, { ordered: false });

      logger.info('Broadcast notification sent', { adminId: req.user.id, recipients: users.length });
      return success(res, { sent: users.length });
    } catch (err) {
      next(err);
    }
  }
);

// ── IoT Device Management ─────────────────────────────────────────────────────

/**
 * GET /api/admin/devices
 * List all IoT devices with owner info and latest sensor snapshot.
 */
router.get('/devices', async (req, res, next) => {
  try {
    const devices = await Device.find()
      .populate('userId', 'name email')
      .sort({ lastSeen: -1 })
      .lean();

    const deviceIds = devices.map(d => d.deviceId);
    const latestLogs = await SensorLog.aggregate([
      { $match: { deviceId: { $in: deviceIds } } },
      { $sort: { timestamp: -1 } },
      { $group: { _id: '$deviceId', doc: { $first: '$$ROOT' } } },
    ]);
    const logMap = latestLogs.reduce((acc, l) => { acc[l._id] = l.doc; return acc; }, {});

    const onlineCutoff = new Date(Date.now() - DEVICE_ONLINE_WINDOW_MS);
    const result = devices.map(d => ({
      ...d,
      online: d.lastSeen ? d.lastSeen >= onlineCutoff : false,
      latestSensor: logMap[d.deviceId] || null,
    }));

    return success(res, { devices: result, total: result.length });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/admin/devices/:deviceId/motor
 * Admin force-sets motor state on any device.
 * Body: { action: 'ON' | 'OFF' }
 */
router.patch(
  '/devices/:deviceId/motor',
  [
    param('deviceId').isString().trim().notEmpty(),
    body('action').isIn(['ON', 'OFF']).withMessage('action must be ON or OFF'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const device = await Device.findOneAndUpdate(
        { deviceId: req.params.deviceId },
        { $set: { motorState: req.body.action } },
        { new: true, returnDocument: 'after' }
      );
      if (!device) return notFound(res, 'Device not found');
      logger.info('Admin motor override', {
        deviceId: req.params.deviceId,
        action: req.body.action,
        adminId: req.user.id,
      });
      return success(res, { deviceId: device.deviceId, motorState: device.motorState });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
