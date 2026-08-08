// src/services/smsService.js
// Backwards-compatible wrapper around the configured Twilio provider.
// In tests, this module can be mocked.

const twilioProvider = require('./notifications/providers/twilio.provider');

async function send({ to, body, from = null }) {
  const result = await twilioProvider.sendSms(to, body, { from });
  return {
    provider: result.provider || 'twilio',
    externalId: result.sid || result.id || null,
    status: result.status || null
  };
}

module.exports = {
  send
};
