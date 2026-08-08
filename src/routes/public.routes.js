const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/auth.controller');
const addressUpdateController = require('../controllers/addressUpdateController');

const { authMiddleware } = require('../middleware/authMiddleware');

const resolveStaffLimiter = rateLimit({
    windowMs: Number(process.env.RESOLVE_STAFF_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    limit: Number(process.env.RESOLVE_STAFF_RATE_LIMIT_MAX) || 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many staff resolution attempts. Please try again later.' }
});

const pinLoginLimiter = rateLimit({
    windowMs: Number(process.env.PIN_LOGIN_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    limit: Number(process.env.PIN_LOGIN_RATE_LIMIT_MAX) || 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many PIN login attempts. Please try again later.' }
});

// Resolve Staff (Public)
router.get('/resolve-staff', resolveStaffLimiter, authController.resolveStaff);
router.get('/pin-config', authController.getPinConfig);
router.post('/pin-login', pinLoginLimiter, authController.pinLogin);

// Protected Auth Routes
router.get('/me', authMiddleware, authController.getMe);
router.patch('/me', authMiddleware, authController.updateMe);

// Member Self-Service (secured by MemberActionToken, not Firebase auth)
router.get('/address-update/validate', addressUpdateController.validateToken);
router.post('/address-update/validate', addressUpdateController.validateToken);
router.post('/address-update/confirm', addressUpdateController.confirmAddress);

module.exports = router;
