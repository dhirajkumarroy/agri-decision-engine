'use strict';

const express = require('express');
const router = express.Router();

const aiService = require('../services/aiService');
const Chat = require('../models/Chat');
const { aiLimiter } = require('../middleware/rateLimiter');
const { optionalAuth, authenticate } = require('../middleware/auth');
const { badRequest, success } = require('../utils/apiResponse');
const logger = require('../config/logger');

/**
 * POST /api/ai/chat
 * Streams the AI reply using Server-Sent Events (text/event-stream).
 *
 * Body: { message: string, sessionId: string }
 *
 * Auth: optional — works for guests too, history stored with userId when available.
 */
router.post('/chat', aiLimiter, optionalAuth, async (req, res) => {
  const { message, sessionId } = req.body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return badRequest(res, 'message is required');
  }
  if (!sessionId || typeof sessionId !== 'string') {
    return badRequest(res, 'sessionId is required');
  }

  const trimmedMessage = message.trim().slice(0, 2000);

  // ── Set up SSE ──────────────────────────────────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable Nginx buffering if present
  res.flushHeaders();

  let fullResponse = '';
  let mlContext = null;

  try {
    const gen = aiService.streamChat(sessionId, trimmedMessage);
    let result = await gen.next();

    while (!result.done) {
      const chunk = result.value;
      fullResponse += chunk;
      res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
      result = await gen.next();
    }

    // The generator's return value carries { fullResponse, mlContext }
    if (result.value) {
      mlContext = result.value.mlContext || null;
    }
  } catch (err) {
    logger.error('AI chat stream error', { err: err.message, sessionId });
    res.write(`data: ${JSON.stringify({ error: 'AI service unavailable. Please try again.' })}\n\n`);
  } finally {
    res.write('data: [DONE]\n\n');
    res.end();
  }

  // ── Async DB save (fire-and-forget) ─────────────────────────────────────────
  if (fullResponse) {
    Chat.create({
      userId: req.user?.id || null,
      sessionId,
      message: trimmedMessage,
      response: fullResponse,
      mlContext,
    }).catch((err) => logger.warn('AI chat: DB save failed', { err: err.message }));
  }
});

/**
 * POST /api/ai/explain
 * One-shot endpoint: explain an ML result (crop / disease / irrigation) in plain language.
 *
 * Body: { type: 'crop'|'disease'|'irrigation', result: Object }
 */
router.post('/explain', aiLimiter, optionalAuth, async (req, res, next) => {
  const { type, result } = req.body;

  const allowed = ['crop', 'disease', 'irrigation'];
  if (!type || !allowed.includes(type)) {
    return badRequest(res, `type must be one of: ${allowed.join(', ')}`);
  }
  if (!result || typeof result !== 'object') {
    return badRequest(res, 'result must be an object');
  }

  try {
    const explanation = await aiService.explainMLResult(type, result);
    return success(res, { explanation });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/ai/chat/:sessionId
 * Clears the in-memory session history for a new conversation.
 */
router.delete('/chat/:sessionId', optionalAuth, (req, res) => {
  aiService.clearSession(req.params.sessionId);
  return success(res, { cleared: true });
});

/**
 * GET /api/ai/history
 * Returns the authenticated user's chat history (last 50 exchanges).
 */
router.get('/history', authenticate, async (req, res, next) => {
  try {
    const chats = await Chat.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(50)
      .select('sessionId message response createdAt mlContext')
      .lean();

    return success(res, { chats });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
