'use strict';

const express = require('express');
const router = express.Router();

const notificationService = require('../services/notificationService');
const { authenticate } = require('../middleware/auth');
const { success, notFound } = require('../utils/apiResponse');

/**
 * GET /api/notifications
 * Fetch notifications for the authenticated user.
 * ?unread=true  — only unread
 * ?limit=20
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const limit      = Math.min(50, parseInt(req.query.limit) || 20);
    const onlyUnread = req.query.unread === 'true';
    const data = await notificationService.getForUser(req.user.id, { limit, onlyUnread });
    return success(res, data);
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/notifications/:id/read
 * Mark a single notification as read.
 */
router.patch('/:id/read', authenticate, async (req, res, next) => {
  try {
    const n = await notificationService.markRead(req.params.id, req.user.id);
    if (!n) return notFound(res, 'Notification not found');
    return success(res, n);
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/notifications/read-all
 * Mark all of the user's notifications as read.
 */
router.patch('/read-all', authenticate, async (req, res, next) => {
  try {
    const count = await notificationService.markAllRead(req.user.id);
    return success(res, { markedRead: count });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
