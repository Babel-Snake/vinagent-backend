// src/controllers/addressUpdateController.js
// Implements GET /address-update/validate and POST /address-update/confirm.

const logger = require('../config/logger');
// TODO: const memberActionTokenService = require('../services/memberActionTokenService');
// TODO: const addressUpdateService = require('../services/addressUpdateService');

async function validateToken(req, res, next) {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({
        error: {
          code: 'INVALID_TOKEN',
          message: 'Token is required'
        }
      });
    }

    // TODO: call memberActionTokenService.validateToken(token)
    logger.info('Validate address update token requested');

    // Placeholder structure
    return res.json({
      member: {
        id: 42,
        firstName: 'Emma',
        lastName: 'Clarke'
      },
      currentAddress: null,
      proposedAddress: null
    });
  } catch (err) {
    next(err);
  }
}

async function confirmAddress(req, res, next) {
  try {
    const { token, newAddress } = req.body;

    if (!token) {
      return res.status(400).json({
        error: {
          code: 'INVALID_TOKEN',
          message: 'Token is required'
        }
      });
    }

    // TODO: call addressUpdateService.confirmAddress({ token, newAddress })
    logger.info('Confirm address update requested');

    // Placeholder response
    return res.json({
      status: 'ok',
      member: {
        id: 42,
        firstName: 'Emma',
        lastName: 'Clarke'
      },
      newAddress
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  validateToken,
  confirmAddress
};
