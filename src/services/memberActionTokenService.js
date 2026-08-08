// src/services/memberActionTokenService.js
// Creates and validates MemberActionToken rows.

const crypto = require('crypto');
const logger = require('../config/logger');
const { MemberActionToken, Member, Task } = require('../models');

const TOKEN_EXPIRY_DAYS = 7;
const TOKEN_PATTERN = /^[a-f0-9]{64}$/i;
const TOKEN_TYPES = new Set(['ADDRESS_CHANGE', 'PAYMENT_METHOD_UPDATE', 'PREFERENCE_UPDATE']);

function serviceError(message, statusCode, code) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

function sameId(left, right) {
  if (left === null || left === undefined || right === null || right === undefined) return false;
  return Number.isInteger(Number(left)) && Number(left) > 0 && Number(left) === Number(right);
}

function transactionOptions(transaction) {
  if (!transaction) return {};

  return {
    transaction,
    // MySQL honours SELECT ... FOR UPDATE; SQLite safely ignores this option.
    lock: transaction.LOCK?.UPDATE || true
  };
}

function assertTokenShape(token) {
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) {
    throw serviceError('Invalid token', 400, 'INVALID_TOKEN');
  }
}

function invalidTokenContext(tokenRecord, reason) {
  logger.warn('MemberActionToken relationship validation failed', {
    tokenId: tokenRecord?.id,
    reason
  });
  return serviceError('Token is not valid for this action', 400, 'INVALID_TOKEN_CONTEXT');
}

/**
 * Generate a cryptographically secure random token
 */
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(token) {
  assertTokenShape(token);
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
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
  if (!Number.isInteger(Number(memberId)) || !Number.isInteger(Number(wineryId)) || !TOKEN_TYPES.has(type)) {
    throw serviceError('Invalid token context', 400, 'INVALID_TOKEN_CONTEXT');
  }

  const relationshipQuery = transactionOptions(transaction);
  const member = await Member.findOne({
    where: { id: memberId, wineryId },
    attributes: ['id', 'wineryId'],
    ...relationshipQuery
  });

  if (!member) {
    throw serviceError('Member is not available in this winery', 400, 'INVALID_TOKEN_CONTEXT');
  }

  if (taskId !== undefined && taskId !== null) {
    if (!Number.isInteger(Number(taskId))) {
      throw serviceError('Invalid task context', 400, 'INVALID_TOKEN_CONTEXT');
    }

    const task = await Task.findOne({
      where: { id: taskId, wineryId, memberId },
      attributes: ['id', 'memberId', 'wineryId'],
      ...relationshipQuery
    });

    if (!task) {
      throw serviceError('Task is not available for this member and winery', 400, 'INVALID_TOKEN_CONTEXT');
    }
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const tokenRecord = await MemberActionToken.create({
    memberId,
    wineryId,
    taskId,
    type,
    channel,
    token: null,
    tokenHash: hashToken(token),
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

  // Keep the bearer value ephemeral. It is intentionally never persisted and
  // is exposed only to the immediate caller that builds the outbound link.
  Object.defineProperty(tokenRecord, 'rawToken', {
    value: token,
    enumerable: false,
    configurable: false,
    writable: false
  });

  return tokenRecord;
}

/**
 * Validate a token and return the associated records
 * @param {string} token - The token string to validate
 * @returns {Object} { tokenRecord, member, task } or throws error
 */
async function validateToken(token, { expectedType, transaction, lock = false } = {}) {
  assertTokenShape(token);

  const queryOptions = transaction ? { transaction } : {};
  if (transaction && lock) {
    queryOptions.lock = transaction.LOCK?.UPDATE || true;
  }

  const tokenRecord = await MemberActionToken.findOne({
    where: { tokenHash: hashToken(token) },
    include: [
      { model: Member },
      { model: Task }
    ],
    ...queryOptions
  });

  if (!tokenRecord) {
    throw serviceError('Token not found', 404, 'TOKEN_NOT_FOUND');
  }

  // Check if already used
  if (tokenRecord.usedAt) {
    throw serviceError('Token has already been used', 400, 'TOKEN_ALREADY_USED');
  }

  // Check expiry
  if (new Date() > new Date(tokenRecord.expiresAt)) {
    throw serviceError('Token has expired', 400, 'TOKEN_EXPIRED');
  }

  if (expectedType && tokenRecord.type !== expectedType) {
    throw invalidTokenContext(tokenRecord, 'unexpected token type');
  }

  const member = tokenRecord.Member;
  const task = tokenRecord.Task;

  if (
    !member ||
    !sameId(member.id, tokenRecord.memberId) ||
    !sameId(member.wineryId, tokenRecord.wineryId)
  ) {
    throw invalidTokenContext(tokenRecord, 'member and token belong to different wineries');
  }

  if (tokenRecord.taskId !== null && tokenRecord.taskId !== undefined) {
    if (
      !task ||
      !sameId(task.id, tokenRecord.taskId) ||
      !sameId(task.memberId, tokenRecord.memberId) ||
      !sameId(task.wineryId, tokenRecord.wineryId)
    ) {
      throw invalidTokenContext(tokenRecord, 'task, member and token relationship is inconsistent');
    }
  }

  return {
    tokenRecord,
    member,
    task
  };
}

/**
 * Mark a token as used
 * @param {number} tokenId - The token ID
 * @param {Object} [transaction] - Sequelize transaction
 */
async function markTokenUsed(tokenId, transaction) {
  const result = await MemberActionToken.update(
    { usedAt: new Date() },
    { where: { id: tokenId, usedAt: null }, transaction }
  );

  const affectedRows = Array.isArray(result) ? result[0] : result;
  if (affectedRows !== 1) {
    throw serviceError('Token has already been used', 400, 'TOKEN_ALREADY_USED');
  }

  logger.info('MemberActionToken marked as used', { tokenId });
}

/**
 * Generate the confirmation URL for a token
 * @param {string} token - The token string
 * @returns {string} The full URL
 */
function getConfirmationUrl(token) {
  assertTokenShape(token);
  const baseUrl = process.env.PUBLIC_APP_URL || process.env.PUBLIC_URL || 'https://app.vinagent.app';
  const confirmationUrl = new URL('/confirm-address', baseUrl);
  // Fragments are not sent to the frontend server, reverse proxy, or as the
  // HTTP referrer. The browser page removes it from history before validation.
  confirmationUrl.hash = new URLSearchParams({ token }).toString();
  return confirmationUrl.toString();
}

module.exports = {
  createToken,
  validateToken,
  markTokenUsed,
  getConfirmationUrl,
  generateToken,
  hashToken
};
