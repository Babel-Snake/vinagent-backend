// src/routes/webhooks.js
// Webhook endpoints, e.g. Twilio SMS -> /api/webhooks/sms

const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');

router.post('/sms', webhookController.handleSmsWebhook);

module.exports = router;
