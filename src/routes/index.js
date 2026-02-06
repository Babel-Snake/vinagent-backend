const express = require('express');
const router = express.Router();

const webhookRoutes = require('./webhook.routes');
const taskRoutes = require('./task.routes');
const { authMiddleware } = require('../middleware/authMiddleware');

router.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
});

// Webhooks (no Firebase auth; secured by provider secret/signature)
router.use('/webhooks', webhookRoutes);

// Public API (no auth required)
router.use('/public', require('./public.routes'));

// FIXME: Temporary endpoint to fix missing table
router.get('/public/fix-db', async (req, res) => {
    try {
        const { sequelize } = require('../models');
        await sequelize.sync({ alter: true });
        res.send('Database synced successfully! You can close this tab.');
    } catch (err) {
        res.status(500).send('Sync failed: ' + err.message);
    }
});

// Dashboard APIs (protected by Firebase auth)
router.use('/tasks', authMiddleware, taskRoutes);
router.use('/staff', authMiddleware, require('./staff.routes'));
router.use('/users', authMiddleware, require('./user.routes'));
router.use('/members', authMiddleware, require('./member.routes'));
router.use('/winery', authMiddleware, require('./winery.routes')); // Phase 12
router.use('/notifications', authMiddleware, require('./notification.routes'));

module.exports = router;
