const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const addressUpdateController = require('../controllers/addressUpdateController');

const { authMiddleware } = require('../middleware/authMiddleware');

// Resolve Staff (Public)
router.get('/resolve-staff', authController.resolveStaff);

// Protected Auth Routes
router.get('/me', authMiddleware, authController.getMe);

// Member Self-Service (secured by MemberActionToken, not Firebase auth)
router.get('/address-update/validate', addressUpdateController.validateToken);
router.post('/address-update/confirm', addressUpdateController.confirmAddress);

module.exports = router;
