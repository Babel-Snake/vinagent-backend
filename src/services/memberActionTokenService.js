// src/services/memberActionTokenService.js
// Creates and validates MemberActionToken rows.

const crypto = require('crypto');
const logger = require('../config/logger');
const { MemberActionToken, Member, Task } = require('../models');

const TOKEN_EXPIRY_DAYS = 7;

/**
 * Generate a cryptographically secure random token
 */
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Create a new MemberActionToken for secure member confirmation
 * @param {Object} params
 * @param {number} params.memberId - Member ID
 * @param {number} params.wineryId - Winery ID
 * @param {number} [params.taskId] - Associated task ID
 * @param {string} params.type - Token type (ADDRESS_CHANGE, etc.)
 * @param {string} [params.channel='sms'] - Delivery channel
 * @param {string} [params.target] - Phone/email where link is sent
 * @param {Object} [params.payload] - Extra context (e.g., proposed address)
 * @param {Object} [params.transaction] - Sequelize transaction
 */
async function createToken({ memberId, wineryId, taskId, type, channel = 'sms', target, payload, transaction }) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const tokenRecord = await MemberActionToken.create({
    memberId,
    wineryId,
    taskId,
    type,
    channel,
    token,
    target,
    payload,
    expiresAt
  }, { transaction });

  logger.info('MemberActionToken created', {
    tokenId: tokenRecord.id,
    memberId,
    taskId,
    type,
    channel
  });

  return tokenRecord;
}

/**
 * Validate a token and return the associated records
 * @param {string} token - The token string to validate
 * @returns {Object} { tokenRecord, member, task } or throws error
 */
async function validateToken(token) {
  if (!token) {
    const err = new Error('Token is required');
    err.statusCode = 400;
    err.code = 'INVALID_TOKEN';
    throw err;
  }

  const tokenRecord = await MemberActionToken.findOne({
    where: { token },
    include: [
      { model: Member },
      { model: Task }
    ]
  });

  if (!tokenRecord) {
    const err = new Error('Token not found');
    err.statusCode = 404;
    err.code = 'TOKEN_NOT_FOUND';
    throw err;
  }

  // Check if already used
  if (tokenRecord.usedAt) {
    const err = new Error('Token has already been used');
    err.statusCode = 400;
    err.code = 'TOKEN_ALREADY_USED';
    throw err;
  }

  // Check expiry
  if (new Date() > new Date(tokenRecord.expiresAt)) {
    const err = new Error('Token has expired');
    err.statusCode = 400;
    err.code = 'TOKEN_EXPIRED';
    throw err;
  }

  return {
    tokenRecord,
    member: tokenRecord.Member,
    task: tokenRecord.Task
  };
}

/**
 * Mark a token as used
 * @param {number} tokenId - The token ID
 * @param {Object} [transaction] - Sequelize transaction
 */
async function markTokenUsed(tokenId, transaction) {
  await MemberActionToken.update(
    { usedAt: new Date() },
    { where: { id: tokenId }, transaction }
  );

  logger.info('MemberActionToken marked as used', { tokenId });
}

/**
 * Generate the confirmation URL for a token
 * @param {string} token - The token string
 * @returns {string} The full URL
 */
function getConfirmationUrl(token) {
  // In production, this would be configured via env
  const baseUrl = process.env.PUBLIC_URL || 'https://app.vinagent.app';
  return `${baseUrl}/confirm-address?token=${token}`;
}

module.exports = {
  createToken,
  validateToken,
  markTokenUsed,
  getConfirmationUrl,
  generateToken
};
