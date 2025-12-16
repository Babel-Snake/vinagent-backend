const express = require('express');
const router = express.Router();
const staffController = require('../controllers/staff.controller');

// Create new staff (POST /api/staff)
router.post('/', staffController.createStaff);

// List staff (GET /api/staff)
router.get('/', staffController.listStaff);

module.exports = router;
