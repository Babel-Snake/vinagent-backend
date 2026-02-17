
const express = require('express');
const router = express.Router();
const calendarController = require('../controllers/calendar.controller');
const { requireRole } = require('../middleware/authMiddleware');

// Valid roles for writing: manager, admin
const MANAGER_ROLES = ['manager', 'admin'];

// Read - Available to all staff
router.get('/', calendarController.listEvents);

// Write - Manager/Admin only
router.post('/', requireRole(MANAGER_ROLES), calendarController.createEvent);
router.put('/:id', requireRole(MANAGER_ROLES), calendarController.updateEvent);
router.delete('/:id', requireRole(MANAGER_ROLES), calendarController.deleteEvent);

module.exports = router;
