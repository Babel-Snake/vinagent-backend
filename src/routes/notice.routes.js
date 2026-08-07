const express = require('express');
const noticeController = require('../controllers/notice.controller');

const router = express.Router();

router.get('/', noticeController.listNotices);
router.get('/:id', noticeController.getNotice);
router.post('/', noticeController.createNotice);
router.patch('/:id', noticeController.updateNotice);
router.delete('/:id', noticeController.archiveNotice);
router.get('/:id/comments', noticeController.listComments);
router.post('/:id/comments', noticeController.createComment);
router.delete('/:id/comments/:commentId', noticeController.deleteComment);
router.post('/:id/tasks', noticeController.linkTask);
router.delete('/:id/tasks/:taskId', noticeController.unlinkTask);
router.put('/:id/acknowledgement', noticeController.acknowledgeNotice);
router.get('/:id/acknowledgements', noticeController.listAcknowledgements);

module.exports = router;
