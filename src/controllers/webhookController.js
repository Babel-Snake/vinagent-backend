// src/controllers/webhookController.js
// Handles POST /webhooks/sms,
// normalises Twilio payload and passes to ingestion/triage.

const logger = require('../config/logger');
// TODO: require services when implemented

async function handleSmsWebhook(req, res, next) {
  try {
    // TODO: validate Twilio signature here in future

    const { From, Body, MessageSid } = req.body;

    if (!From || !Body) {
      const err = new Error('Missing required fields');
      err.statusCode = 400;
      err.code = 'INVALID_WEBHOOK_PAYLOAD';
      throw err;
    }

    // TODO: call a messageIngestionService with normalised payload
    logger.info('Received SMS webhook', {
      from: From,
      messageSid: MessageSid
    });

    // For now, just return ok; implementation will create Message + Task
    return res.json({ status: 'ok' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  handleSmsWebhook
};
