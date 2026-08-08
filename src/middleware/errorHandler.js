// src/middleware/errorHandler.js
// Central error-handling middleware. Converts thrown errors into
// the JSON error format described in API_SPEC.md.

const logger = require('../config/logger');

function errorHandler(err, req, res, _next) {
  // Capture request ID
  const requestId = req.id;

  // Log the error with correlation ID
  logger.error('Unhandled error', {
    error: err.message,
    code: err.code,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
    path: req.path,
    method: req.method,
    requestId
  });

  // If the error has a known shape, use it using defaults
  const status = err.statusCode || 500;
  const code = err.code || (status === 413 ? 'PAYLOAD_TOO_LARGE' : 'INTERNAL_ERROR');
  const message =
    status === 500
      ? 'An unexpected error occurred'
      : err.message || 'Request failed';

  res.status(status).json({
    error: {
      code,
      message,
      // Validation details are useful to clients; internal-error details may
      // contain database/provider diagnostics and must stay server-side.
      details: status < 500 ? err.details || undefined : undefined,
      requestId
    }
  });
}

module.exports = {
  errorHandler
};
