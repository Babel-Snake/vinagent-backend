// src/controllers/addressUpdateController.js
// Implements GET/POST /address-update/validate and POST /address-update/confirm.

const logger = require('../config/logger');
const memberActionTokenService = require('../services/memberActionTokenService');
const addressUpdateService = require('../services/addressUpdateService');
const AppError = require('../utils/AppError');

/**
 * POST /api/public/address-update/validate (preferred) or legacy GET
 * Validates a token and returns member/address info for the confirmation page
 */
async function validateToken(req, res, next) {
  try {
    res.set('Cache-Control', 'no-store, private');
    // New clients keep the bearer token out of proxy access-log URLs by using
    // a JSON request body. Query support remains for previously issued links.
    const token = req.method === 'POST' ? req.body?.token : req.query.token;

    if (!token) {
      throw new AppError('Token is required', 400, 'INVALID_TOKEN');
    }

    const { tokenRecord, member } = await memberActionTokenService.validateToken(token, {
      expectedType: 'ADDRESS_CHANGE'
    });

    logger.info('Address update token validated', { tokenId: tokenRecord.id });

    return res.json({
      member: member ? {
        // First name is enough to reassure the member without exposing an
        // internal identifier or unnecessary profile data to a bearer link.
        firstName: member.firstName
      } : null,
      currentAddress: member ? {
        addressLine1: member.addressLine1,
        addressLine2: member.addressLine2,
        suburb: member.suburb,
        state: member.state,
        postcode: member.postcode,
        country: member.country
      } : null,
      proposedAddress: (tokenRecord.payload && tokenRecord.payload.newAddress)
        ? tokenRecord.payload.newAddress
        : (tokenRecord.payload || null),
      expiresAt: tokenRecord.expiresAt
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/public/address-update/confirm
 * Confirms the address change using the token
 */
async function confirmAddress(req, res, next) {
  try {
    res.set('Cache-Control', 'no-store, private');
    const { token, newAddress } = req.body;

    if (!token) {
      throw new AppError('Token is required', 400, 'INVALID_TOKEN');
    }

    const result = await addressUpdateService.confirmAddress({ token, newAddress });

    logger.info('Address update confirmed', { memberId: result.member.id });

    return res.json({
      status: 'ok',
      message: 'Address updated successfully'
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  validateToken,
  confirmAddress
};
