const express = require('express');
const integrationEventController = require('../controllers/integrationEvent.controller');
const { requireRole } = require('../middleware/authMiddleware');

const router = express.Router();
const MANAGER_ROLES = ['manager', 'admin'];

router.use(requireRole(MANAGER_ROLES));

router.get('/', integrationEventController.listEvents);
router.post('/', integrationEventController.createEvent);
router.get('/:id', integrationEventController.getEvent);
router.post('/:id/review', integrationEventController.reviewEvent);

module.exports = router;
