const express = require('express');
const router = express.Router();
const memberController = require('../controllers/member.controller');
const { requireRole } = require('../middleware/authMiddleware');

// Base: /api/members (auth already applied at mount point)

// Search (all authenticated users)
router.get('/search', memberController.searchMembers);

// Full CRUD (manager/admin only)
router.get('/', requireRole(['manager', 'admin']), memberController.listMembers);
router.get('/:id/relationship-profile', requireRole(['manager', 'admin']), memberController.getRelationshipProfile);
router.get('/:id', requireRole(['manager', 'admin']), memberController.getMember);
router.post('/', requireRole(['manager', 'admin']), memberController.createMember);
router.post('/:id/merge', requireRole(['manager', 'admin']), memberController.mergeMember);
router.put('/:id', requireRole(['manager', 'admin']), memberController.updateMember);
router.delete('/:id', requireRole(['manager', 'admin']), memberController.deleteMember);

module.exports = router;
