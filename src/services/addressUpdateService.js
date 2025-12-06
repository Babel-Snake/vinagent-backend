// src/services/addressUpdateService.js
// Applies confirmed address changes using a valid MemberActionToken.

const logger = require('../config/logger');
// TODO: require models.Member, models.MemberActionToken, models.Task

async function confirmAddress({ token, newAddress }) {
  logger.info('confirmAddress called');

  // TODO:
  // - validate token via memberActionTokenService.validateToken
  // - update Member
  // - mark token.usedAt
  // - update Task status to EXECUTED
  // - create TaskAction(EXECUTED)

  return {
    member: {
      id: 42,
      firstName: 'Emma',
      lastName: 'Clarke'
    },
    newAddress
  };
}

module.exports = {
  confirmAddress
};
