const express = require('express');
const rateLimit = require('express-rate-limit');
const webhookController = require('../controllers/webhook.controller');
const { validateTwilioSignature } = require('../middleware/webhookValidation');
const { validate, webhookSchema } = require('../utils/validation');

const router = express.Router();

// Dedicated limiter for webhooks
const webhookLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 mins
    limit: 1000, // Stricter than global potentially, but allows burst from Twilio
    message: { error: 'Too many requests from this IP' }
});

// Hardened Endpoint
router.post('/sms',
    webhookLimiter,
    validateTwilioSignature,
    (req, res, next) => {
        try {
            validate(webhookSchema, req.body);
            next();
        } catch (err) {
            next(err);
        }
    },
    webhookController.handleSms
);

module.exports = router;
