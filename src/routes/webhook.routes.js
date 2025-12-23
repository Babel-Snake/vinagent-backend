const express = require('express');
const rateLimit = require('express-rate-limit');
const webhookController = require('../controllers/webhook.controller');
const { validateTwilioSignature, validateEmailSignature } = require('../middleware/webhookValidation');
const { validate, smsWebhookSchema, emailWebhookSchema, voiceWebhookSchema } = require('../utils/validation');

const router = express.Router();

// Dedicated limiter for webhooks
const webhookLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 mins
    limit: 1000, // Stricter than global potentially, but allows burst from Twilio
    message: { error: 'Too many requests from this IP' }
});

const emailWebhookLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 600,
    message: { error: 'Too many email webhook requests' }
});

const voiceWebhookLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 500,
    message: { error: 'Too many voice webhook requests' }
});

const validateBody = (schema) => (req, res, next) => {
    try {
        req.validatedBody = validate(schema, req.body);
        next();
    } catch (err) {
        next(err);
    }
};
// Hardened Endpoint
router.post('/sms',
    webhookLimiter,
    validateTwilioSignature,
    validateBody(smsWebhookSchema),
    webhookController.handleSms
);

router.post('/email',
    emailWebhookLimiter,
    validateEmailSignature,
    validateBody(emailWebhookSchema),
    webhookController.handleEmail
);

router.post('/voice',
    voiceWebhookLimiter,
    validateTwilioSignature,
    validateBody(voiceWebhookSchema),
    webhookController.handleVoice
);

module.exports = router;
