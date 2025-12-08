const express = require('express');
const router = express.Router();

const webhookRoutes = require('./webhook.routes');
const taskRoutes = require('./task.routes');
// const addressUpdateRoutes = require('./addressUpdate'); // Placeholder
const { authMiddleware } = require('../middleware/authMiddleware');

router.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
});

// Webhooks (no Firebase auth; secured by provider secret/signature)
router.use('/webhooks', webhookRoutes);

// Dashboard APIs (protected by Firebase auth)
router.use('/tasks', authMiddleware, taskRoutes);

// Member self-service (secured by MemberActionToken)
// router.use('/', addressUpdateRoutes);

module.exports = router;
