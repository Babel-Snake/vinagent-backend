const express = require('express');
const router = express.Router();
const staffController = require('../controllers/staff.controller');
const { requireRole } = require('../middleware/authMiddleware');

// NOTE: Authentication is applied at routes/index.js level
// Only Managers/Admins can manage staff

// Create new staff (POST /api/staff) - Manager/Admin only
router.post('/', requireRole(['manager', 'admin']), staffController.createStaff);

// List staff (GET /api/staff) - Manager/Admin only
router.get('/', requireRole(['manager', 'admin']), staffController.listStaff);

// Update staff (PUT /api/staff/:id) - Manager/Admin only
router.put('/:id', requireRole(['manager', 'admin']), staffController.updateStaff);

// Delete staff (DELETE /api/staff/:id) - Manager/Admin only
router.delete('/:id', requireRole(['manager', 'admin']), staffController.deleteStaff);

module.exports = router;
