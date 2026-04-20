'use strict';

const express = require('express');
const router = express.Router();

const authRoutes          = require('./auth');
const weatherRoutes       = require('./weather');
const cropsRoutes         = require('./crops');
const predictRoutes       = require('./predict');
const predictionsRoutes   = require('./predictions');
const notificationsRoutes = require('./notifications');
const contactRoutes       = require('./contact');
const adminRoutes         = require('./admin');
const healthRoutes        = require('./health');
const sensorRoutes        = require('./sensor');
const iotRoutes           = require('./iot');
const aiRoutes            = require('./ai');
const aliasRoutes         = require('./aliases'); // FastAPI-compatible URL aliases

router.use('/health',                healthRoutes);
router.use('/api/health',            healthRoutes);  // alias so /api/health/detailed also works
router.use('/api/sensor',            sensorRoutes);
router.use('/api/auth',              authRoutes);
router.use('/api/weather',           weatherRoutes);
router.use('/api/crops',             cropsRoutes);
router.use('/api/predict',           predictRoutes);
router.use('/api/predictions',       predictionsRoutes);
router.use('/api/notifications',     notificationsRoutes);
router.use('/api/contact',           contactRoutes);
router.use('/api/admin',             adminRoutes);
router.use('/api/iot',               iotRoutes);
router.use('/api/ai',                aiRoutes);
// Aliases — must be LAST so real routes take priority
router.use('/api',                   aliasRoutes);

module.exports = router;
