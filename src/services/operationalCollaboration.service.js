const { Op } = require('sequelize');
const {
  Notice,
  OperationalItemComment,
  OperationalItemRelation,
  OperationalRecordArea,
  OperationalRequestArea,
  Task,
  User
} = require('../models');
const operationalItemService = require('./operationalItem.service');
const recordVisibility = require('./recordVisibility.service');
const taskService = require('./taskService');
const { ForbiddenError, NotFoundError, ValidationError } = require('../utils/errors');

const ITEM_TYPES = new Set(['TASK', 'NOTICE', 'REQUEST', 'NOTE']);

function normalizeType(value) {
  const type = String(value || '').toUpperCase();
  if (!ITEM_TYPES.has(type)) throw new ValidationError('Invalid operational item type.');
  return type;
}

async function resolveVisibleItem({ itemType, itemId, wineryId, userId, userRole, transaction = null }) {
  const type = normalizeType(itemType);
  if (type === 'TASK') {
    const item = await Task.findOne({ where: { id: itemId, wineryId }, transaction });
    if (!item) throw new NotFoundError('Task not found');
    await recordVisibility.assertCanViewTask(item, { wineryId, userId, userRole, transaction });
    return item;
  }
  if (type === 'NOTICE') {
    const item = await Notice.findOne({ where: { id: itemId, wineryId }, transaction });
    if (!item || !(await recordVisibility.canViewNotice(item, { wineryId, userId, userRole, transaction }))) {
      throw new NotFoundError('Notice not found');
    }
    return item;
  }
  return operationalItemService.getVisibleOperationalItem({ itemType: type, itemId, wineryId, userId, userRole, transaction });
}

async function canChangeSource({ itemType, item, wineryId, userId, userRole, transaction = null }) {
  const type = normalizeType(itemType);
  if (type === 'TASK') return recordVisibility.canMutateTask(item, { wineryId, userId, userRole, transaction });
  if (type === 'NOTICE') return recordVisibility.canManageNotice(item, { wineryId, userId, userRole, transaction });
  const manager = await operationalItemService.canManageOperationalItem({ itemType: type, item, wineryId, userId, userRole, transaction });
  return manager || Number(item.createdBy) === Number(userId);
}

function serializeComment(comment) {
  const value = comment?.toJSON ? comment.toJSON() : comment;
  return { ...value, Replies: value.Replies || [] };
}

function buildCommentThreads(rows) {
  const byId = new Map();
  const roots = [];
  rows.forEach(row => {
    const item = serializeComment(row);
    item.Replies = [];
    byId.set(Number(item.id), item);
  });
  byId.forEach(item => {
    if (item.parentCommentId && byId.has(Number(item.parentCommentId))) {
      byId.get(Number(item.parentCommentId)).Replies.push(item);
    } else {
      roots.push(item);
    }
  });
  return roots;
}

async function listComments({ itemType, itemId, wineryId, userId, userRole }) {
  const type = normalizeType(itemType);
  if (!['REQUEST', 'NOTE'].includes(type)) throw new ValidationError('Comments are supported for Requests and Notes.');
  await resolveVisibleItem({ itemType: type, itemId, wineryId, userId, userRole });
  const comments = await OperationalItemComment.findAll({
    where: { wineryId, itemType: type, itemId },
    include: [{ model: User, as: 'Author', attributes: ['id', 'displayName', 'email', 'role'] }],
    order: [['createdAt', 'ASC'], ['id', 'ASC']]
  });
  return buildCommentThreads(comments);
}

async function createComment({ itemType, itemId, wineryId, userId, userRole, data }) {
  const type = normalizeType(itemType);
  if (!['REQUEST', 'NOTE'].includes(type)) throw new ValidationError('Comments are supported for Requests and Notes.');
  const transaction = await OperationalItemComment.sequelize.transaction();
  try {
    await resolveVisibleItem({ itemType: type, itemId, wineryId, userId, userRole, transaction });
    if (data.parentCommentId) {
      const parent = await OperationalItemComment.findOne({
        where: { id: data.parentCommentId, wineryId, itemType: type, itemId },
        transaction
      });
      if (!parent) throw new NotFoundError('Parent comment not found');
      if (parent.parentCommentId) throw new ValidationError('Replies can only be added to top-level comments.');
    }
    const comment = await OperationalItemComment.create({
      wineryId,
      itemType: type,
      itemId,
      userId,
      parentCommentId: data.parentCommentId || null,
      body: data.body
    }, { transaction });
    await operationalItemService.logAudit({
      itemType: type,
      itemId,
      eventType: 'COMMENT_ADDED',
      wineryId,
      actorUserId: userId,
      metadata: { commentId: comment.id, parentCommentId: comment.parentCommentId },
      transaction
    });
    await transaction.commit();
    return OperationalItemComment.findOne({
      where: { id: comment.id, wineryId },
      include: [{ model: User, as: 'Author', attributes: ['id', 'displayName', 'email', 'role'] }]
    }).then(serializeComment);
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    throw err;
  }
}

async function deleteComment({ itemType, itemId, commentId, wineryId, userId, userRole }) {
  const type = normalizeType(itemType);
  const transaction = await OperationalItemComment.sequelize.transaction();
  try {
    const item = await resolveVisibleItem({ itemType: type, itemId, wineryId, userId, userRole, transaction });
    const comment = await OperationalItemComment.findOne({ where: { id: commentId, wineryId, itemType: type, itemId }, transaction });
    if (!comment) throw new NotFoundError('Comment not found');
    const manager = await operationalItemService.canManageOperationalItem({ itemType: type, item, wineryId, userId, userRole, transaction });
    if (!manager && Number(comment.userId) !== Number(userId)) throw new ForbiddenError('You can only delete your own comments.');
    await OperationalItemComment.destroy({ where: { parentCommentId: comment.id, wineryId, itemType: type, itemId }, transaction });
    await comment.destroy({ transaction });
    await operationalItemService.logAudit({
      itemType: type,
      itemId,
      eventType: 'COMMENT_DELETED',
      wineryId,
      actorUserId: userId,
      metadata: { commentId },
      transaction
    });
    await transaction.commit();
    return { deleted: true };
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    throw err;
  }
}

async function listRelations({ itemType, itemId, wineryId, userId, userRole }) {
  const type = normalizeType(itemType);
  await resolveVisibleItem({ itemType: type, itemId, wineryId, userId, userRole });
  const rows = await OperationalItemRelation.findAll({
    where: {
      wineryId,
      [Op.or]: [
        { sourceType: type, sourceId: itemId },
        { targetType: type, targetId: itemId }
      ]
    },
    include: [{ model: User, as: 'Creator', attributes: ['id', 'displayName', 'email', 'role'] }],
    order: [['createdAt', 'DESC'], ['id', 'DESC']]
  });
  const visible = [];
  for (const row of rows) {
    const oppositeType = row.sourceType === type && Number(row.sourceId) === Number(itemId) ? row.targetType : row.sourceType;
    const oppositeId = row.sourceType === type && Number(row.sourceId) === Number(itemId) ? row.targetId : row.sourceId;
    try {
      await resolveVisibleItem({ itemType: oppositeType, itemId: oppositeId, wineryId, userId, userRole });
      visible.push(row.toJSON());
    } catch (err) {
      if (!(err instanceof NotFoundError)) throw err;
    }
  }
  return visible;
}

async function createRelation({ sourceType, sourceId, wineryId, userId, userRole, data }) {
  const type = normalizeType(sourceType);
  const targetType = normalizeType(data.targetType);
  if (type === targetType && Number(sourceId) === Number(data.targetId)) throw new ValidationError('An item cannot relate to itself.');
  const transaction = await OperationalItemRelation.sequelize.transaction();
  try {
    const source = await resolveVisibleItem({ itemType: type, itemId: sourceId, wineryId, userId, userRole, transaction });
    if (!(await canChangeSource({ itemType: type, item: source, wineryId, userId, userRole, transaction }))) {
      throw new ForbiddenError('You cannot add relationships to this item.');
    }
    await resolveVisibleItem({ itemType: targetType, itemId: data.targetId, wineryId, userId, userRole, transaction });
    const [relation] = await OperationalItemRelation.findOrCreate({
      where: { wineryId, sourceType: type, sourceId, targetType, targetId: data.targetId, relationType: data.relationType },
      defaults: { wineryId, sourceType: type, sourceId, targetType, targetId: data.targetId, relationType: data.relationType, metadata: data.metadata || null, createdBy: userId },
      transaction
    });
    if (['REQUEST', 'NOTE'].includes(type)) {
      await operationalItemService.logAudit({
        itemType: type,
        itemId: sourceId,
        eventType: 'RELATION_ADDED',
        wineryId,
        actorUserId: userId,
        metadata: { relationId: relation.id, targetType, targetId: data.targetId, relationType: data.relationType },
        transaction
      });
    }
    await transaction.commit();
    return relation.toJSON();
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    throw err;
  }
}

async function deleteRelation({ itemType, itemId, relationId, wineryId, userId, userRole }) {
  const type = normalizeType(itemType);
  const transaction = await OperationalItemRelation.sequelize.transaction();
  try {
    const source = await resolveVisibleItem({ itemType: type, itemId, wineryId, userId, userRole, transaction });
    if (!(await canChangeSource({ itemType: type, item: source, wineryId, userId, userRole, transaction }))) {
      throw new ForbiddenError('You cannot remove relationships from this item.');
    }
    const relation = await OperationalItemRelation.findOne({
      where: {
        id: relationId,
        wineryId,
        [Op.or]: [{ sourceType: type, sourceId: itemId }, { targetType: type, targetId: itemId }]
      },
      transaction
    });
    if (!relation) throw new NotFoundError('Relationship not found');
    await relation.destroy({ transaction });
    if (['REQUEST', 'NOTE'].includes(type)) {
      await operationalItemService.logAudit({
        itemType: type,
        itemId,
        eventType: 'RELATION_DELETED',
        wineryId,
        actorUserId: userId,
        metadata: { relationId },
        transaction
      });
    }
    await transaction.commit();
    return { deleted: true };
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    throw err;
  }
}

async function convertToTask({ itemType, itemId, wineryId, userId, userRole, data }) {
  const type = normalizeType(itemType);
  if (!['REQUEST', 'NOTE'].includes(type)) throw new ValidationError('Only Requests and Notes can be converted through this endpoint.');
  const transaction = await OperationalItemRelation.sequelize.transaction();
  try {
    const source = await operationalItemService.getVisibleOperationalItem({ itemType: type, itemId, wineryId, userId, userRole, transaction });
    const manager = await operationalItemService.canManageOperationalItem({ itemType: type, item: source, wineryId, userId, userRole, transaction });
    if (type === 'REQUEST') {
      if (source.status !== 'APPROVED') throw new ValidationError('A Request must be approved before creating its Task.');
      if (!manager && Number(source.requestedFromUserId) !== Number(userId)) throw new ForbiddenError('Only the requested person or a relevant manager can create this Task.');
    } else if (!manager && Number(source.createdBy) !== Number(userId)) {
      throw new ForbiddenError('Only the Note author or a relevant manager can create its Task.');
    }

    const existingRelation = await OperationalItemRelation.findOne({
      where: {
        wineryId,
        sourceType: type,
        sourceId: source.id,
        targetType: 'TASK',
        relationType: 'GENERATED_TASK'
      },
      order: [['id', 'ASC']],
      transaction
    });
    if (existingRelation) {
      const existingTask = await Task.findOne({ where: { id: existingRelation.targetId, wineryId }, transaction });
      if (existingTask) {
        await transaction.commit();
        return { task: existingTask, relation: existingRelation.toJSON(), duplicate: true };
      }
    }

    const joinModel = type === 'REQUEST' ? OperationalRequestArea : OperationalRecordArea;
    const foreignKey = type === 'REQUEST' ? 'requestId' : 'recordId';
    const areaLinks = await joinModel.findAll({ where: { wineryId, [foreignKey]: itemId }, transaction });
    const primary = areaLinks.find(link => link.relationshipType === 'PRIMARY');
    const linkedAreaIds = areaLinks.filter(link => link.relationshipType !== 'PRIMARY').map(link => link.areaId);
    const defaultAction = type === 'REQUEST' ? `Complete approved request: ${source.title}` : `Follow up on operational note: ${source.title}`;
    const task = await taskService.createTask({
      wineryId,
      userId,
      userRole,
      source: `${type.toLowerCase()}_conversion`,
      transaction,
      data: {
        category: data.category,
        subType: data.subType || (type === 'REQUEST' ? source.subtype || 'REQUEST_FOLLOW_UP' : 'NOTE_FOLLOW_UP'),
        priority: data.priority,
        assigneeId: data.assigneeId || null,
        dueAt: data.dueAt || source.dueAt || null,
        taskOrigin: 'INTERNAL',
        inboundMethod: 'internal',
        areaScope: source.areaScope,
        primaryAreaId: primary?.areaId || null,
        linkedAreaIds,
        payload: {
          summary: source.title,
          originalText: source.originalText || source.body,
          operationalSource: { itemType: type, itemId: source.id }
        },
        suggestedChannel: 'none',
        suggestedAction: data.suggestedAction || defaultAction,
        initialNote: `Created from ${type === 'REQUEST' ? 'Request' : 'Note'} #${source.id}: ${source.body}`,
        steps: [{
          title: data.suggestedAction || defaultAction,
          description: source.body,
          stepType: 'INTERNAL',
          waitingOn: 'STAFF',
          ownerUserId: data.assigneeId || null
        }]
      }
    });
    const relation = await OperationalItemRelation.create({
      wineryId,
      sourceType: type,
      sourceId: source.id,
      targetType: 'TASK',
      targetId: task.id,
      relationType: 'GENERATED_TASK',
      metadata: { conversionVersion: 1 },
      createdBy: userId
    }, { transaction });
    await operationalItemService.logAudit({
      itemType: type,
      itemId: source.id,
      eventType: 'CONVERTED_TO_TASK',
      wineryId,
      actorUserId: userId,
      metadata: { taskId: task.id, relationId: relation.id },
      transaction
    });
    await transaction.commit();
    return { task, relation: relation.toJSON(), duplicate: false };
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    throw err;
  }
}

module.exports = {
  resolveVisibleItem,
  listComments,
  createComment,
  deleteComment,
  listRelations,
  createRelation,
  deleteRelation,
  convertToTask
};
