// src/middleware/errorHandler.js
// Central error-handling middleware. Converts thrown errors into
// the JSON error format described in API_SPEC.md.

const logger = require('../config/logger');

function errorHandler(err, req, res, next) {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path
  });

  // If the error has a known shape, use it
  const status = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message =
    status === 500
      ? 'An unexpected error occurred'
      : err.message || 'Request failed';

  res.status(status).json({
    error: {
      code,
      message,
      details: err.details || undefined
    }
  });
}

module.exports = {
  errorHandler
};
