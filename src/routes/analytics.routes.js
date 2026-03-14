const express = require('express');
const router = express.Router();
const { requireRole } = require('../middleware/authMiddleware');
const analyticsController = require('../controllers/analytics.controller');

// Base: /api/analytics (auth already applied at mount point)
router.get('/', requireRole(['manager', 'admin']), analyticsController.getAnalytics);

module.exports = router;
