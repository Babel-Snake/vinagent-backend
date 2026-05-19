const express = require('express');
const attachmentController = require('../controllers/attachment.controller');

const router = express.Router();

router.get('/', attachmentController.listAttachments);
router.post('/', attachmentController.createAttachment);
router.get('/:id/download', attachmentController.downloadAttachment);
router.delete('/:id', attachmentController.deleteAttachment);

module.exports = router;
