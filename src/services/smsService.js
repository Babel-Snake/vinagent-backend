// src/services/smsService.js
// Wraps SMS provider (e.g. Twilio). For now, just logs calls.
// In tests, this module can be mocked.

const logger = require('../config/logger');

async function send({ to, body }) {
  // TODO: integrate Twilio or other SMS provider.
  logger.info('smsService.send called', { to, preview: body.slice(0, 60) });
  return {
    provider: 'twilio',
    externalId: 'SM-placeholder'
  };
}

module.exports = {
  send
};
