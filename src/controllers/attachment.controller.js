const path = require('path');
const attachmentService = require('../services/attachment.service');
const {
  validate,
  attachmentListSchema,
  attachmentUploadSchema
} = require('../utils/validation');

async function listAttachments(req, res, next) {
  try {
    const query = validate(attachmentListSchema, req.query);
    const attachments = await attachmentService.listAttachments({
      entityType: query.entityType,
      entityId: query.entityId,
      wineryId: req.user.wineryId,
      userId: req.user.id,
      userRole: req.user.role
    });

    res.json({ attachments });
  } catch (err) {
    next(err);
  }
}

async function createAttachment(req, res, next) {
  try {
    const data = validate(attachmentUploadSchema, req.body);
    const attachment = await attachmentService.createAttachment({
      wineryId: req.user.wineryId,
      userId: req.user.id,
      userRole: req.user.role,
      data
    });

    res.status(201).json({ attachment });
  } catch (err) {
    next(err);
  }
}

async function downloadAttachment(req, res, next) {
  try {
    const { attachment, absolutePath } = await attachmentService.getAttachmentForDownload({
      attachmentId: req.params.id,
      wineryId: req.user.wineryId,
      userId: req.user.id,
      userRole: req.user.role
    });

    const disposition = attachment.mimeType.startsWith('image/') ? 'inline' : 'attachment';
    const filename = path.basename(attachment.filename).replace(/"/g, '');
    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader('Content-Length', attachment.sizeBytes);
    res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);
    res.sendFile(absolutePath);
  } catch (err) {
    next(err);
  }
}

async function deleteAttachment(req, res, next) {
  try {
    await attachmentService.deleteAttachment({
      attachmentId: req.params.id,
      wineryId: req.user.wineryId,
      userId: req.user.id,
      userRole: req.user.role
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listAttachments,
  createAttachment,
  downloadAttachment,
  deleteAttachment
};
