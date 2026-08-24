const express = require('express');
const router = express.Router();

const webhookRoutes = require('./webhook.routes');
const taskRoutes = require('./task.routes');
const { authMiddleware } = require('../middleware/authMiddleware');

router.get('/health', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({
        status: 'ok',
        type: 'liveness',
        readiness: '/health/ready'
    });
});

// Webhooks (no Firebase auth; secured by provider secret/signature)
router.use('/webhooks', webhookRoutes);

// Public API (no auth required)
router.use('/public', require('./public.routes'));

// Dashboard APIs (protected by Firebase auth)
router.use('/tasks/flags', authMiddleware, require('./taskFlag.routes'));
router.use('/tasks', authMiddleware, taskRoutes);
router.use('/notices', authMiddleware, require('./notice.routes'));
router.use('/integration-events', authMiddleware, require('./integrationEvent.routes'));
router.use('/operational-areas', authMiddleware, require('./operationalArea.routes'));
router.use('/requests', authMiddleware, require('./operationalRequest.routes'));
router.use('/operational-records', authMiddleware, require('./operationalRecord.routes'));
router.use('/operations', authMiddleware, require('./operations.routes'));
router.use('/automations', authMiddleware, require('./automation.routes'));
router.use('/integration-management', authMiddleware, require('./integrationManagement.routes'));
router.use('/projects', authMiddleware, require('./project.routes'));
router.use('/attachments', authMiddleware, require('./attachment.routes'));
router.use('/staff', authMiddleware, require('./staff.routes'));
router.use('/users', authMiddleware, require('./user.routes'));
router.use('/members', authMiddleware, require('./member.routes'));
router.use('/winery', authMiddleware, require('./winery.routes')); // Phase 12

router.use('/notifications', authMiddleware, require('./notification.routes'));
router.use('/calendar', authMiddleware, require('./calendar.routes'));
router.use('/analytics', authMiddleware, require('./analytics.routes'));
router.use('/usage', authMiddleware, require('./usage.routes'));


module.exports = router;
