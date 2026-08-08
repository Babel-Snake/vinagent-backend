const { Op } = require('sequelize');
const { Member, Task, User } = require('../models');
const { NotFoundError, ValidationError } = require('../utils/errors');

function normalizeId(value) {
  if (value === null || value === undefined || value === '') return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function requireWineryContext(wineryId) {
  const normalizedWineryId = normalizeId(wineryId);
  if (!normalizedWineryId) {
    throw new ValidationError('A valid winery context is required.');
  }
  return normalizedWineryId;
}

async function getMemberForWinery({ memberId, wineryId, transaction = null, attributes }) {
  const normalizedMemberId = normalizeId(memberId);
  if (!normalizedMemberId) return null;

  const member = await Member.findOne({
    where: { id: normalizedMemberId, wineryId: requireWineryContext(wineryId) },
    ...(attributes ? { attributes } : {}),
    transaction
  });

  if (!member) throw new NotFoundError('Member not found');
  return member;
}

async function getUserForWinery({
  userId,
  wineryId,
  transaction = null,
  attributes,
  notFoundMessage = 'User not found',
  notFoundCode = 'NOT_FOUND'
}) {
  const normalizedUserId = normalizeId(userId);
  if (!normalizedUserId) return null;

  const user = await User.findOne({
    where: { id: normalizedUserId, wineryId: requireWineryContext(wineryId) },
    ...(attributes ? { attributes } : {}),
    transaction
  });

  if (!user) {
    const error = new NotFoundError(notFoundMessage);
    error.code = notFoundCode;
    throw error;
  }
  return user;
}

async function getTaskForWinery({ taskId, wineryId, transaction = null, attributes }) {
  const normalizedTaskId = normalizeId(taskId);
  if (!normalizedTaskId) return null;

  const task = await Task.findOne({
    where: { id: normalizedTaskId, wineryId: requireWineryContext(wineryId) },
    ...(attributes ? { attributes } : {}),
    transaction
  });

  if (!task) throw new NotFoundError('Parent task not found');
  return task;
}

async function getUsersForWinery({ userIds = [], wineryId, transaction = null }) {
  const normalizedUserIds = [...new Set(userIds.map(normalizeId).filter(Boolean))];
  if (normalizedUserIds.length === 0) return [];

  const users = await User.findAll({
    where: {
      id: { [Op.in]: normalizedUserIds },
      wineryId: requireWineryContext(wineryId)
    },
    attributes: ['id'],
    transaction
  });
  const foundIds = new Set(users.map(user => Number(user.id)));
  if (normalizedUserIds.some(userId => !foundIds.has(userId))) {
    throw new NotFoundError('One or more assigned users were not found');
  }
  return users;
}

/**
 * Validates every foreign key accepted by authenticated task mutation endpoints.
 * The authenticated winery is always supplied separately and is never inferred
 * from a related record or accepted from request data.
 */
async function assertTaskRelationshipsBelongToWinery({
  wineryId,
  memberId = null,
  assigneeId = null,
  parentTaskId = null,
  steps = [],
  currentTaskId = null,
  transaction = null
}) {
  const normalizedWineryId = requireWineryContext(wineryId);
  const normalizedParentTaskId = normalizeId(parentTaskId);
  const normalizedCurrentTaskId = normalizeId(currentTaskId);
  if (normalizedParentTaskId && normalizedCurrentTaskId === normalizedParentTaskId) {
    throw new ValidationError('A task cannot be its own parent.');
  }

  const stepOwnerUserIds = (Array.isArray(steps) ? steps : [])
    .map(step => normalizeId(step?.ownerUserId))
    .filter(Boolean);

  const [member, parentTask, users] = await Promise.all([
    getMemberForWinery({
      memberId,
      wineryId: normalizedWineryId,
      transaction,
      attributes: ['id']
    }),
    getTaskForWinery({
      taskId: normalizedParentTaskId,
      wineryId: normalizedWineryId,
      transaction,
      attributes: ['id']
    }),
    getUsersForWinery({
      userIds: [assigneeId, ...stepOwnerUserIds],
      wineryId: normalizedWineryId,
      transaction
    })
  ]);

  return { member, parentTask, users };
}

module.exports = {
  assertTaskRelationshipsBelongToWinery,
  getMemberForWinery,
  getTaskForWinery,
  getUserForWinery
};
