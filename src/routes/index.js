const express = require('express');
const router = express.Router();

const webhookRoutes = require('./webhook.routes');
// const taskRoutes = require('./tasks'); // Placeholder
// const addressUpdateRoutes = require('./addressUpdate'); // Placeholder
const { authMiddleware } = require('../middleware/authMiddleware'); // Placeholder import availability check? 
// Note: authMiddleware might not be exported as { authMiddleware } if not careful. 
// Checked file earlier: 'module.exports = { errorHandler }' in error handler.
// Need to check authMiddleware file content if I uncommment it.
// For now, I only need webhooks active.

router.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
});

// Webhooks (no Firebase auth; secured by provider secret/signature)
router.use('/webhooks', webhookRoutes);

// Dashboard APIs (protected by Firebase auth)
// router.use('/tasks', authMiddleware, taskRoutes);

// Member self-service (secured by MemberActionToken)
// router.use('/', addressUpdateRoutes);

module.exports = router;
