const express = require('express');
const noticeController = require('../controllers/notice.controller');
const { requireRole } = require('../middleware/authMiddleware');

const router = express.Router();
const MANAGER_ROLES = ['manager', 'admin'];

router.get('/', noticeController.listNotices);
router.get('/:id', noticeController.getNotice);
router.post('/', requireRole(MANAGER_ROLES), noticeController.createNotice);
router.patch('/:id', requireRole(MANAGER_ROLES), noticeController.updateNotice);
router.delete('/:id', requireRole(MANAGER_ROLES), noticeController.archiveNotice);
router.get('/:id/comments', noticeController.listComments);
router.post('/:id/comments', noticeController.createComment);
router.delete('/:id/comments/:commentId', requireRole(MANAGER_ROLES), noticeController.deleteComment);
router.post('/:id/tasks', requireRole(MANAGER_ROLES), noticeController.linkTask);
router.delete('/:id/tasks/:taskId', requireRole(MANAGER_ROLES), noticeController.unlinkTask);

module.exports = router;
