// src/controllers/addressUpdateController.js
// Implements GET /address-update/validate and POST /address-update/confirm.

const logger = require('../config/logger');
const memberActionTokenService = require('../services/memberActionTokenService');
const addressUpdateService = require('../services/addressUpdateService');
const AppError = require('../utils/AppError');

/**
 * GET /api/public/address-update/validate
 * Validates a token and returns member/address info for the confirmation page
 */
async function validateToken(req, res, next) {
  try {
    const { token } = req.query;

    if (!token) {
      throw new AppError('Token is required', 400, 'INVALID_TOKEN');
    }

    const { tokenRecord, member, task } = await memberActionTokenService.validateToken(token);

    logger.info('Address update token validated', { tokenId: tokenRecord.id });

    return res.json({
      member: member ? {
        id: member.id,
        firstName: member.firstName,
        lastName: member.lastName
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
    const { token, newAddress } = req.body;

    if (!token) {
      throw new AppError('Token is required', 400, 'INVALID_TOKEN');
    }

    const result = await addressUpdateService.confirmAddress({ token, newAddress });

    logger.info('Address update confirmed', { memberId: result.member.id });

    return res.json({
      status: 'ok',
      message: 'Address updated successfully',
      member: result.member,
      newAddress: result.newAddress
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  validateToken,
  confirmAddress
};
