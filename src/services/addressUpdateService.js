// src/services/addressUpdateService.js
// Applies confirmed address changes using a valid MemberActionToken.

const logger = require('../config/logger');
const { Member, TaskAction } = require('../models');
const memberActionTokenService = require('./memberActionTokenService');
const { getDefaultTaskOutcome } = require('../utils/taskOutcome');

const ADDRESS_FIELDS = ['addressLine1', 'addressLine2', 'suburb', 'state', 'postcode', 'country'];
const MAX_ADDRESS_FIELD_LENGTH = 255;

function addressError(message, code = 'INVALID_ADDRESS') {
  const err = new Error(message);
  err.statusCode = 400;
  err.code = code;
  return err;
}

function normalizeAddress(address) {
  if (!address || typeof address !== 'object' || Array.isArray(address)) {
    throw addressError('No address to apply', 'NO_ADDRESS');
  }

  const normalized = {};
  for (const field of ADDRESS_FIELDS) {
    if (address[field] === undefined) continue;

    if (address[field] === null && field !== 'addressLine1') {
      normalized[field] = null;
      continue;
    }

    if (typeof address[field] !== 'string') {
      throw addressError(`${field} must be a string`);
    }

    const value = address[field].trim();
    if (value.length > MAX_ADDRESS_FIELD_LENGTH) {
      throw addressError(`${field} must not exceed ${MAX_ADDRESS_FIELD_LENGTH} characters`);
    }
    normalized[field] = value || (field === 'addressLine1' ? '' : null);
  }

  if (!normalized.addressLine1) {
    throw addressError('No address to apply', 'NO_ADDRESS');
  }

  return normalized;
}

/**
 * Confirm an address change using a MemberActionToken
 * @param {Object} params
 * @param {string} params.token - The token string
 * @param {Object} [params.newAddress] - Optional override address (if member corrects it)
 */
async function confirmAddress({ token, newAddress }) {
  const t = await Member.sequelize.transaction();

  try {
    // Lock and validate inside the same transaction as the update. This makes
    // the single-use guarantee effective even when two confirmations race.
    const { tokenRecord, member, task } = await memberActionTokenService.validateToken(token, {
      expectedType: 'ADDRESS_CHANGE',
      transaction: t,
      lock: true
    });

    const payload = tokenRecord.payload || {};
    const tokenAddress = payload.newAddress || payload;
    const addressToApply = normalizeAddress(newAddress === undefined ? tokenAddress : newAddress);

    const { addressLine1, addressLine2, suburb, state, postcode, country } = addressToApply;

    if (addressLine1 !== undefined) member.addressLine1 = addressLine1;
    if (addressLine2 !== undefined) member.addressLine2 = addressLine2;
    if (suburb !== undefined) member.suburb = suburb;
    if (state !== undefined) member.state = state;
    if (postcode !== undefined) member.postcode = postcode;
    if (country !== undefined) member.country = country;

    await member.save({ transaction: t });

    // The conditional update prevents a second consumer from marking the same
    // token used if the database dialect cannot provide a row lock.
    await memberActionTokenService.markTokenUsed(tokenRecord.id, t);

    if (task) {
      const defaultOutcome = getDefaultTaskOutcome(task, 'ACTIONED');
      task.status = 'ACTIONED';
      task.workflowState = 'COMPLETED';
      task.waitingOn = 'NONE';
      task.nextStepSummary = null;
      task.blockedReason = null;
      task.dueAt = null;
      task.resolvedAs = defaultOutcome.resolvedAs;
      task.resolutionType = defaultOutcome.resolutionType;
      task.customerOutcome = 'ACCOUNT_UPDATED';
      task.followUpRequired = false;
      task.followUpDueAt = null;
      task.followUpSummary = null;
      task.resolutionSummary = 'Member confirmed address change via secure link.';
      task.resolvedAt = new Date();
      await task.save({ transaction: t });

      await TaskAction.create({
        taskId: task.id,
        userId: null, // Member action, no staff user
        actionType: 'ACTIONED',
        details: {
          action: 'MEMBER_CONFIRMED_ADDRESS',
          tokenId: tokenRecord.id,
          appliedAddress: addressToApply
        }
      }, { transaction: t });
    }

    await t.commit();

    logger.info('Address update confirmed by member', {
      memberId: member.id,
      taskId: task?.id,
      tokenId: tokenRecord.id
    });

    return {
      member: {
        id: member.id,
        firstName: member.firstName,
        lastName: member.lastName
      },
      newAddress: addressToApply,
      taskId: task?.id
    };

  } catch (err) {
    await t.rollback();
    throw err;
  }
}

module.exports = {
  confirmAddress
};
