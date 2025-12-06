// src/middleware/authMiddleware.js
// Firebase Authentication middleware for dashboard APIs.
// For now this is a stub; Codex will wire firebase-admin
// based on the config.

const logger = require('../config/logger');

// TODO: initialize firebase-admin using config/firebase.js later.
async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const [, token] = authHeader.split(' ');

  if (!token) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Missing or invalid authentication token'
      }
    });
  }

  try {
    // TODO: verify token via Firebase Admin, e.g. admin.auth().verifyIdToken(token)
    // Stub user for now:
    req.user = {
      userId: 7,
      wineryId: 1,
      role: 'manager'
    };
    next();
  } catch (err) {
    logger.warn('Auth failed', { error: err.message });
    return res.status(401).json({
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Invalid authentication token'
      }
    });
  }
}

module.exports = {
  authMiddleware
};
