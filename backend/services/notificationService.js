'use strict';

const Notification = require('../models/Notification');
const logger = require('../config/logger');

/**
 * Create one notification for a user.
 * Silently swallows errors so notification failures never break the main flow.
 */
const create = async ({ userId, type, title, message, meta = {} }) => {
  try {
    const n = await Notification.create({ userId, type, title, message, meta });
    logger.debug('Notification created', { userId, type, notificationId: n._id });
    return n;
  } catch (err) {
    logger.error('Failed to create notification', { error: err.message, userId, type });
    return null;
  }
};

/**
 * Get unread + recent notifications for a user.
 * Returns up to `limit` items, newest first.
 */
const getForUser = async (userId, { limit = 20, onlyUnread = false } = {}) => {
  const filter = { userId };
  if (onlyUnread) filter.read = false;

  const notifications = await Notification.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  const unreadCount = await Notification.countDocuments({ userId, read: false });
  return { notifications, unreadCount };
};

/**
 * Mark one notification as read.
 */
const markRead = async (notificationId, userId) => {
  return Notification.findOneAndUpdate(
    { _id: notificationId, userId },
    { read: true, readAt: new Date() },
    { new: true }
  );
};

/**
 * Mark ALL of a user's notifications as read.
 */
const markAllRead = async (userId) => {
  const result = await Notification.updateMany(
    { userId, read: false },
    { read: true, readAt: new Date() }
  );
  return result.modifiedCount;
};

// ── Pre-built notification factories ─────────────────────────────────────────

const notifyCropResult = (userId, topCrop, confidence, predictionId) =>
  create({
    userId,
    type: 'crop_result',
    title: `Crop Recommendation Ready`,
    message: `Best match: ${topCrop} (${confidence}% confidence). View your full recommendation.`,
    meta: { predictionId, link: `/dashboard` },
  });

const notifyDiseaseAlert = (userId, disease, confidence, predictionId) =>
  create({
    userId,
    type: 'disease_alert',
    title: `Disease Detected: ${disease}`,
    message: `Detected with ${confidence}% confidence. Check treatment recommendations immediately.`,
    meta: { predictionId, link: `/predict` },
  });

const notifyQueryReply = (userId, queryId, subject) =>
  create({
    userId,
    type: 'query_reply',
    title: `Reply to your query: "${subject}"`,
    message: `An admin has responded to your contact query. Check your email for the full reply.`,
    meta: { queryId },
  });

const notifySystem = (userId, title, message) =>
  create({ userId, type: 'system', title, message });

module.exports = {
  create,
  getForUser,
  markRead,
  markAllRead,
  notifyCropResult,
  notifyDiseaseAlert,
  notifyQueryReply,
  notifySystem,
};
