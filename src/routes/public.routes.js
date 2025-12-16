const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');

const { authMiddleware } = require('../middleware/authMiddleware');

// Resolve Staff (Public)
router.get('/resolve-staff', authController.resolveStaff);

// Protected Auth Routes
router.get('/me', authMiddleware, authController.getMe);

module.exports = router;
