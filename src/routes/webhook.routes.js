const express = require('express');
const webhookController = require('../controllers/webhook.controller');

const router = express.Router();

// Public webhook - usually verified by middleware (signature check)
// For now, open.
router.post('/sms', webhookController.handleSms);

module.exports = router;
