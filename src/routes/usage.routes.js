const express = require('express');
const { requireRole } = require('../middleware/authMiddleware');
const usageController = require('../controllers/usage.controller');

const router = express.Router();

router.post('/activity', usageController.recordActivity);
router.get('/summary', requireRole(['manager', 'admin']), usageController.getSummary);
router.post('/snapshot', requireRole(['manager', 'admin']), usageController.captureSnapshot);
router.post('/reconcile', requireRole(['admin']), usageController.reconcile);

module.exports = router;
