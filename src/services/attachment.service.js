const crypto = require('crypto');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { Attachment, Notice, Task, TaskAction, TaskStep, User } = require('../models');
const { ForbiddenError, NotFoundError, ValidationError } = require('../utils/errors');
const recordVisibility = require('./recordVisibility.service');

const MANAGER_ROLES = new Set(['manager', 'admin']);
const ENTITY_TYPES = new Set(['TASK', 'TASK_STEP', 'TASK_OUTCOME', 'TASK_FOLLOW_UP', 'NOTICE', 'REQUEST', 'NOTE', 'PROJECT']);
const TASK_ENTITY_TYPES = new Set(['TASK', 'TASK_OUTCOME', 'TASK_FOLLOW_UP']);
const MAX_ATTACHMENT_BYTES = Number(process.env.ATTACHMENT_MAX_BYTES || 5 * 1024 * 1024);
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]);

function isMissingAttachmentsTableError(err) {
  const message = String(err?.message || err?.parent?.message || err?.original?.message || '').toLowerCase();
  return err?.parent?.code === 'ER_NO_SUCH_TABLE'
    || err?.original?.code === 'ER_NO_SUCH_TABLE'
    || err?.parent?.errno === 1146
    || err?.original?.errno === 1146
    || message.includes('no such table: attachments')
    || message.includes("table 'attachments'");
}

function isPrivileged(userRole) {
  return MANAGER_ROLES.has(userRole);
}

function getStorageRoot() {
  if (process.env.ATTACHMENT_STORAGE_ROOT) {
    return path.resolve(process.env.ATTACHMENT_STORAGE_ROOT);
  }

  if (process.env.NODE_ENV === 'test') {
    return path.join(os.tmpdir(), 'vinagent-test-attachments');
  }

  return path.resolve(process.cwd(), 'uploads', 'attachments');
}

function sanitizeFilename(filename) {
  const base = path.basename(String(filename || 'attachment')).replace(/[^\w.\- ()]+/g, '_').trim();
  return (base || 'attachment').slice(0, 180);
}

function extensionFor(filename) {
  const ext = path.extname(filename).toLowerCase().replace(/[^.\w]/g, '');
  return ext.length <= 12 ? ext : '';
}

function storagePathFor(storageKey) {
  const root = getStorageRoot();
  const resolved = path.resolve(root, storageKey);
  if (!resolved.startsWith(root)) {
    throw new ValidationError('Invalid attachment storage path.');
  }
  return resolved;
}

function decodeBase64Content(contentBase64) {
  const raw = String(contentBase64 || '');
  const commaIndex = raw.indexOf(',');
  const encoded = raw.startsWith('data:') && commaIndex >= 0 ? raw.slice(commaIndex + 1) : raw;
  if (!encoded.trim()) {
    throw new ValidationError('Attachment content is required.');
  }

  let buffer;
  try {
    buffer = Buffer.from(encoded, 'base64');
  } catch (err) {
    throw new ValidationError('Attachment content must be valid base64.');
  }

  if (!buffer.length) {
    throw new ValidationError('Attachment content is empty.');
  }
  if (buffer.length > MAX_ATTACHMENT_BYTES) {
    throw new ValidationError(`Attachment is too large. Maximum size is ${Math.floor(MAX_ATTACHMENT_BYTES / 1024 / 1024)}MB.`);
  }

  return buffer;
}

function assertAllowedMimeType(mimeType) {
  const normalized = String(mimeType || '').toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(normalized)) {
    throw new ValidationError('This file type is not supported for attachments.');
  }
  return normalized;
}

function assertCanMutateTask(task, { userId, userRole }) {
  if (isPrivileged(userRole)) return;
  if (!userId) throw new ForbiddenError('You do not have permission to attach files to this task.');
  if (task.assigneeId && Number(task.assigneeId) !== Number(userId)) {
    throw new ForbiddenError('This task is assigned to another staff member.');
  }
}

function assertCanMutateTaskStep(step, task, { userId, userRole }) {
  if (isPrivileged(userRole)) return;
  if (!userId) throw new ForbiddenError('You do not have permission to attach files to this workflow step.');
  if (step.ownerUserId && Number(step.ownerUserId) !== Number(userId)) {
    throw new ForbiddenError('This workflow step is assigned to another staff member.');
  }
  if (!step.ownerUserId && task.assigneeId && Number(task.assigneeId) !== Number(userId)) {
    throw new ForbiddenError('This task is assigned to another staff member.');
  }
}

async function resolveEntity({ entityType, entityId, wineryId, userId, userRole, mode = 'view' }) {
  if (!ENTITY_TYPES.has(entityType)) {
    throw new ValidationError('Invalid attachment target.');
  }

  if (TASK_ENTITY_TYPES.has(entityType)) {
    const task = await Task.findOne({ where: { id: entityId, wineryId } });
    if (!task) throw new NotFoundError('Task not found');
    if (mode === 'mutate') {
      assertCanMutateTask(task, { userId, userRole });
      await recordVisibility.assertCanMutateTask(task, { wineryId, userId, userRole });
    } else {
      await recordVisibility.assertCanViewTask(task, { wineryId, userId, userRole });
    }
    return { task, targetTaskId: task.id };
  }

  if (entityType === 'TASK_STEP') {
    const step = await TaskStep.findOne({
      where: { id: entityId },
      include: [{ model: Task, attributes: ['id', 'wineryId', 'assigneeId'] }]
    });
    if (!step || !step.Task || Number(step.Task.wineryId) !== Number(wineryId)) {
      throw new NotFoundError('Task step not found');
    }
    if (mode === 'mutate') {
      assertCanMutateTaskStep(step, step.Task, { userId, userRole });
      await recordVisibility.assertCanMutateTask(step.Task, { wineryId, userId, userRole });
    } else {
      await recordVisibility.assertCanViewTask(step.Task, { wineryId, userId, userRole });
    }
    return { step, task: step.Task, targetTaskId: step.Task.id };
  }

  if (entityType === 'REQUEST' || entityType === 'NOTE') {
    const operationalItemService = require('./operationalItem.service');
    const item = await operationalItemService.getVisibleOperationalItem({
      itemType: entityType,
      itemId: entityId,
      wineryId,
      userId,
      userRole
    });
    return { operationalItem: item, operationalItemType: entityType };
  }

  if (entityType === 'PROJECT') {
    const projectService = require('./project.service');
    const projectVisibility = require('./projectVisibility.service');
    const project = await projectService.loadProject(entityId, wineryId);
    if (!project) throw new NotFoundError('Project not found');
    if (mode === 'mutate') {
      await projectVisibility.assertCanManageProject(project, { wineryId, userId, userRole });
    } else {
      await projectVisibility.assertCanViewProject(project, { wineryId, userId, userRole });
    }
    return { project };
  }

  const notice = await Notice.findOne({ where: { id: entityId, wineryId } });
  if (!notice || !(await recordVisibility.canViewNotice(notice, { wineryId, userId, userRole }))) {
    throw new NotFoundError('Notice not found');
  }
  if (mode === 'mutate' && !(await recordVisibility.canManageNotice(notice, { wineryId, userId, userRole }))) {
    throw new ForbiddenError('Only managers can manage notice attachments.');
  }
  return { notice };
}

function serializeAttachment(attachment) {
  const plain = attachment.toJSON ? attachment.toJSON() : attachment;
  return {
    id: plain.id,
    entityType: plain.entityType,
    entityId: plain.entityId,
    wineryId: plain.wineryId,
    filename: plain.filename,
    originalFilename: plain.originalFilename,
    mimeType: plain.mimeType,
    sizeBytes: plain.sizeBytes,
    uploadedBy: plain.uploadedBy,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
    Uploader: plain.Uploader || null,
    downloadUrl: `/api/attachments/${plain.id}/download`
  };
}

async function listAttachments({ entityType, entityId, wineryId, userId, userRole }) {
  await resolveEntity({ entityType, entityId, wineryId, userId, userRole, mode: 'view' });

  let attachments;
  try {
    attachments = await Attachment.findAll({
      where: { entityType, entityId, wineryId, deletedAt: null },
      include: [{ model: User, as: 'Uploader', attributes: ['id', 'displayName', 'email', 'role'] }],
      order: [['createdAt', 'ASC'], ['id', 'ASC']]
    });
  } catch (err) {
    if (isMissingAttachmentsTableError(err)) {
      return [];
    }
    throw err;
  }

  return attachments.map(serializeAttachment);
}

async function logTaskAttachmentAction({ actionType, targetTaskId, attachment, userId, details = {} }) {
  if (!targetTaskId) return;
  await TaskAction.create({
    taskId: targetTaskId,
    userId,
    actionType,
    details: {
      attachmentId: attachment.id,
      entityType: attachment.entityType,
      entityId: attachment.entityId,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      ...details
    }
  });
}

async function createAttachment({ wineryId, userId, userRole, data }) {
  const entityType = data.entityType;
  const entityId = Number(data.entityId);
  const normalizedMimeType = assertAllowedMimeType(data.mimeType);
  const buffer = decodeBase64Content(data.contentBase64);

  if (data.sizeBytes && Number(data.sizeBytes) !== buffer.length) {
    throw new ValidationError('Attachment size does not match the uploaded content.');
  }

  const resolved = await resolveEntity({
    entityType,
    entityId,
    wineryId,
    userId,
    userRole,
    mode: 'mutate'
  });

  const filename = sanitizeFilename(data.filename);
  const storageKey = path.join(String(wineryId), `${crypto.randomUUID()}${extensionFor(filename)}`);
  const absolutePath = storagePathFor(storageKey);

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buffer, { flag: 'wx' });

  let attachment;
  try {
    attachment = await Attachment.create({
      entityType,
      entityId,
      wineryId,
      filename,
      originalFilename: filename,
      mimeType: normalizedMimeType,
      sizeBytes: buffer.length,
      storageKey,
      uploadedBy: userId
    });

    await logTaskAttachmentAction({
      actionType: 'ATTACHMENT_ADDED',
      targetTaskId: resolved.targetTaskId,
      attachment,
      userId
    });
    if (resolved.operationalItemType) {
      const operationalItemService = require('./operationalItem.service');
      await operationalItemService.logAudit({
        itemType: resolved.operationalItemType,
        itemId: entityId,
        eventType: 'ATTACHMENT_ADDED',
        wineryId,
        actorUserId: userId,
        metadata: { attachmentId: attachment.id, filename: attachment.filename, mimeType: attachment.mimeType }
      });
    }
    if (resolved.project) {
      const projectService = require('./project.service');
      await projectService.logProjectAudit({
        projectId: resolved.project.id,
        wineryId,
        actorUserId: userId,
        eventType: 'ATTACHMENT_ADDED',
        metadata: { attachmentId: attachment.id, filename: attachment.filename, mimeType: attachment.mimeType }
      });
    }
  } catch (err) {
    await fs.rm(absolutePath, { force: true }).catch(() => {});
    throw err;
  }

  return Attachment.findOne({
    where: { id: attachment.id, wineryId },
    include: [{ model: User, as: 'Uploader', attributes: ['id', 'displayName', 'email', 'role'] }]
  }).then(serializeAttachment);
}

async function getAttachmentForDownload({ attachmentId, wineryId, userId, userRole }) {
  const attachment = await Attachment.findOne({
    where: { id: attachmentId, wineryId, deletedAt: null },
    include: [{ model: User, as: 'Uploader', attributes: ['id', 'displayName', 'email', 'role'] }]
  });
  if (!attachment) throw new NotFoundError('Attachment not found');

  await resolveEntity({
    entityType: attachment.entityType,
    entityId: attachment.entityId,
    wineryId,
    userId,
    userRole,
    mode: 'view'
  });

  const absolutePath = storagePathFor(attachment.storageKey);
  try {
    await fs.access(absolutePath);
  } catch (err) {
    throw new NotFoundError('Attachment file not found');
  }

  return { attachment: serializeAttachment(attachment), absolutePath };
}

async function deleteAttachment({ attachmentId, wineryId, userId, userRole }) {
  const attachment = await Attachment.findOne({ where: { id: attachmentId, wineryId, deletedAt: null } });
  if (!attachment) throw new NotFoundError('Attachment not found');

  const resolved = await resolveEntity({
    entityType: attachment.entityType,
    entityId: attachment.entityId,
    wineryId,
    userId,
    userRole,
    mode: 'view'
  });

  if (attachment.entityType === 'NOTICE') {
    if (!(await recordVisibility.canManageNotice(resolved.notice, { wineryId, userId, userRole }))) {
      throw new ForbiddenError('Only managers can delete notice attachments.');
    }
  } else if (attachment.entityType === 'REQUEST' || attachment.entityType === 'NOTE') {
    const operationalItemService = require('./operationalItem.service');
    const canManage = await operationalItemService.canManageOperationalItem({
      itemType: attachment.entityType,
      item: resolved.operationalItem,
      wineryId,
      userId,
      userRole
    });
    if (!canManage && Number(attachment.uploadedBy) !== Number(userId)) {
      throw new ForbiddenError('You can only delete attachments you uploaded.');
    }
  } else if (attachment.entityType === 'PROJECT') {
    await resolveEntity({
      entityType: attachment.entityType,
      entityId: attachment.entityId,
      wineryId,
      userId,
      userRole,
      mode: 'mutate'
    });
  } else if (!isPrivileged(userRole)) {
    if (Number(attachment.uploadedBy) !== Number(userId)) {
      throw new ForbiddenError('You can only delete attachments you uploaded.');
    }
    await resolveEntity({
      entityType: attachment.entityType,
      entityId: attachment.entityId,
      wineryId,
      userId,
      userRole,
      mode: 'mutate'
    });
  }

  const absolutePath = storagePathFor(attachment.storageKey);
  attachment.deletedAt = new Date();
  attachment.deletedBy = userId;
  await attachment.save();
  await fs.rm(absolutePath, { force: true }).catch(() => {});

  await logTaskAttachmentAction({
    actionType: 'ATTACHMENT_DELETED',
    targetTaskId: resolved.targetTaskId,
    attachment,
    userId
  });
  if (resolved.operationalItemType) {
    const operationalItemService = require('./operationalItem.service');
    await operationalItemService.logAudit({
      itemType: resolved.operationalItemType,
      itemId: attachment.entityId,
      eventType: 'ATTACHMENT_DELETED',
      wineryId,
      actorUserId: userId,
      metadata: { attachmentId: attachment.id, filename: attachment.filename }
    });
  }
  if (resolved.project) {
    const projectService = require('./project.service');
    await projectService.logProjectAudit({
      projectId: resolved.project.id,
      wineryId,
      actorUserId: userId,
      eventType: 'ATTACHMENT_DELETED',
      metadata: { attachmentId: attachment.id, filename: attachment.filename }
    });
  }

  return { deleted: true };
}

module.exports = {
  MAX_ATTACHMENT_BYTES,
  listAttachments,
  createAttachment,
  getAttachmentForDownload,
  deleteAttachment
};
