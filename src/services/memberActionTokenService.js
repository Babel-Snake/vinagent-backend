// src/services/memberActionTokenService.js
// Creates and validates MemberActionToken rows.

const crypto = require('crypto');
const logger = require('../config/logger');
// TODO: require models.MemberActionToken

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function createToken({ memberId, wineryId, taskId, type, channel, target, payload }) {
  const token = generateToken();

  logger.info('createToken called', { memberId, wineryId, taskId, type, channel });

  // TODO: persist via Sequelize
  return {
    id: 8001,
    token,
    memberId,
    wineryId,
    taskId,
    type,
    channel,
    target,
    payload,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  };
}

async function validateToken(token) {
  // TODO: lookup token in DB, check expiry/usedAt
  logger.info('validateToken called');

  // Placeholder: treat any token as valid for now
  return {
    tokenRecord: {
      id: 8001,
      memberId: 42,
      wineryId: 1,
      taskId: 5001,
      type: 'ADDRESS_CHANGE',
      channel: 'sms',
      payload: {}
    },
    member: null,
    task: null
  };
}

module.exports = {
  createToken,
  validateToken
};
