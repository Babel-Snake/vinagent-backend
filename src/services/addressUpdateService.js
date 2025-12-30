// src/services/addressUpdateService.js
// Applies confirmed address changes using a valid MemberActionToken.

const logger = require('../config/logger');
const { Member, Task, TaskAction } = require('../models');
const memberActionTokenService = require('./memberActionTokenService');

/**
 * Confirm an address change using a MemberActionToken
 * @param {Object} params
 * @param {string} params.token - The token string
 * @param {Object} [params.newAddress] - Optional override address (if member corrects it)
 */
async function confirmAddress({ token, newAddress }) {
  // 1. Validate token
  const { tokenRecord, member, task } = await memberActionTokenService.validateToken(token);

  if (!member) {
    const err = new Error('Member not found for this token');
    err.statusCode = 404;
    err.code = 'MEMBER_NOT_FOUND';
    throw err;
  }

  // 2. Get address from payload or override
  // 2. Get address from payload or override
  const payload = tokenRecord.payload || {};
  const tokenAddress = payload.newAddress || payload;
  const addressToApply = newAddress || tokenAddress || {};

  if (!addressToApply.addressLine1) {
    const err = new Error('No address to apply');
    err.statusCode = 400;
    err.code = 'NO_ADDRESS';
    throw err;
  }

  // 3. Start transaction
  const t = await Member.sequelize.transaction();

  try {
    // 4. Update Member address
    const { addressLine1, addressLine2, suburb, state, postcode, country } = addressToApply;

    if (addressLine1 !== undefined) member.addressLine1 = addressLine1;
    if (addressLine2 !== undefined) member.addressLine2 = addressLine2;
    if (suburb !== undefined) member.suburb = suburb;
    if (state !== undefined) member.state = state;
    if (postcode !== undefined) member.postcode = postcode;
    if (country !== undefined) member.country = country;

    await member.save({ transaction: t });

    // 5. Mark token as used
    await memberActionTokenService.markTokenUsed(tokenRecord.id, t);

    // 6. Update Task status to EXECUTED (if linked)
    if (task) {
      task.status = 'EXECUTED';
      await task.save({ transaction: t });

      // 7. Create TaskAction
      await TaskAction.create({
        taskId: task.id,
        userId: null, // Member action, no staff user
        actionType: 'EXECUTED',
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
