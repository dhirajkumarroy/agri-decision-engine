'use strict';

const { validationResult } = require('express-validator');
const { badRequest } = require('../utils/apiResponse');

/**
 * Runs after express-validator rule chains.
 * If there are validation errors, returns 400 with formatted details.
 * Otherwise calls next().
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const details = errors.array().map(({ path, msg, value }) => ({
      field: path,
      message: msg,
      received: value,
    }));
    return badRequest(res, 'Validation failed', details);
  }
  next();
};

module.exports = validate;
