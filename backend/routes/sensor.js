'use strict';

const express = require('express');

const pipelineService = require('../services/pipelineService');
const validate = require('../middleware/validate');
const { sensorInputRules } = require('../utils/validators');
const { created } = require('../utils/apiResponse');

const router = express.Router();

router.post('/manual', sensorInputRules, validate, async (req, res, next) => {
  try {
    const result = await pipelineService.processSensorData(req.body, 'manual');
    return created(res, result);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
