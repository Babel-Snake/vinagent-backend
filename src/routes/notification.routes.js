const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notification.controller');
const { authMiddleware } = require('../middleware/authMiddleware');

router.use(authMiddleware);
router.get('/', notificationController.listNotifications);
router.patch('/:id/read', notificationController.markRead);

module.exports = router;
