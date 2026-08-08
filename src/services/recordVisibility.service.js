const { Op } = require('sequelize');
const { NoticeArea, Notification, Project, ProjectItem, Task, TaskArea } = require('../models');
const operationalAreaService = require('./operationalArea.service');
const { ForbiddenError, NotFoundError } = require('../utils/errors');

function plain(record) {
  return record?.toJSON ? record.toJSON() : record;
}

function jsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function jsonObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function linkedAreaIds(record) {
  const value = plain(record) || {};
  if (Array.isArray(value.AreaLinks)) return value.AreaLinks.map(link => Number(link.areaId));
  if (Array.isArray(value.OperationalAreas)) return value.OperationalAreas.map(area => Number(area.id));
  return [];
}

async function getTaskAreaIds(taskId, wineryId, transaction = null) {
  const rows = await TaskArea.findAll({
    where: { taskId, wineryId },
    attributes: ['areaId'],
    transaction
  });
  return rows.map(row => Number(row.areaId));
}

async function getNoticeAreaIds(noticeId, wineryId, transaction = null) {
  const rows = await NoticeArea.findAll({
    where: { noticeId, wineryId },
    attributes: ['areaId'],
    transaction
  });
  return rows.map(row => Number(row.areaId));
}

async function getMentionTaskIds(userId, wineryId, transaction = null) {
  if (!Notification?.findAll) return [];
  const notifications = await Notification.findAll({
    where: { userId, type: 'MENTION' },
    attributes: ['data'],
    transaction
  });
  const candidateIds = [...new Set(notifications
    .map(notification => Number(jsonObject(notification.data).taskId))
    .filter(taskId => Number.isInteger(taskId) && taskId > 0))];
  if (candidateIds.length === 0) return [];

  const tasks = await Task.findAll({
    where: { id: { [Op.in]: candidateIds }, wineryId },
    attributes: ['id'],
    transaction
  });
  return tasks.map(task => Number(task.id));
}

async function getDelegatedLeadTaskIds({ wineryId, userId, transaction = null }) {
  if (!userId) return [];
  const links = await ProjectItem.findAll({
    where: {
      wineryId,
      itemType: 'TASK',
      linkType: 'DELEGATED_WORK'
    },
    attributes: ['itemId'],
    include: [{
      model: Project,
      attributes: [],
      required: true,
      where: {
        wineryId,
        leadUserId: userId,
        status: { [Op.notIn]: ['COMPLETED', 'CANCELLED'] }
      }
    }],
    transaction
  });
  return [...new Set(links.map(link => Number(link.itemId)))];
}

async function isDelegatedProjectLeadForTask(taskId, context) {
  return (await getDelegatedLeadTaskIds(context)).includes(Number(taskId));
}

async function buildTaskVisibilityPredicate({ wineryId, userId, userRole }) {
  if (operationalAreaService.isGlobalManager(userRole)) return null;
  const { areaIds } = await operationalAreaService.getUserAreaAccess({ userId, wineryId });
  const mentionedTaskIds = await getMentionTaskIds(userId, wineryId);
  const delegatedLeadTaskIds = await getDelegatedLeadTaskIds({ wineryId, userId });
  const areaTaskRows = areaIds.length > 0
    ? await TaskArea.findAll({
      where: { wineryId, areaId: { [Op.in]: areaIds } },
      attributes: ['taskId'],
      group: ['taskId']
    })
    : [];
  const taskIds = areaTaskRows.map(row => Number(row.taskId));

  return {
    [Op.or]: [
      { assigneeId: userId },
      { createdBy: userId },
      { areaScope: 'ORGANISATION', assigneeId: null },
      ...(mentionedTaskIds.length > 0 ? [{ id: { [Op.in]: mentionedTaskIds } }] : []),
      ...(delegatedLeadTaskIds.length > 0 ? [{ id: { [Op.in]: delegatedLeadTaskIds } }] : []),
      ...(taskIds.length > 0 ? [{ id: { [Op.in]: taskIds } }] : [])
    ]
  };
}

async function canViewTask(task, { wineryId, userId, userRole, transaction = null }) {
  const value = plain(task);
  if (!value || Number(value.wineryId) !== Number(wineryId)) return false;
  if (operationalAreaService.isGlobalManager(userRole)) return true;
  if (Number(value.assigneeId) === Number(userId) || Number(value.createdBy) === Number(userId)) return true;
  if (await isDelegatedProjectLeadForTask(value.id, { wineryId, userId, transaction })) return true;
  if ((await getMentionTaskIds(userId, wineryId, transaction)).includes(Number(value.id))) return true;
  if (value.areaScope !== 'AREAS') return !value.assigneeId;

  const taskAreaIds = linkedAreaIds(value);
  const resolvedAreaIds = taskAreaIds.length > 0
    ? taskAreaIds
    : await getTaskAreaIds(value.id, wineryId, transaction);
  if (resolvedAreaIds.length === 0) return false;
  const { areaIds } = await operationalAreaService.getUserAreaAccess({ userId, wineryId, transaction });
  return resolvedAreaIds.some(areaId => areaIds.includes(areaId));
}

async function canMutateTask(task, context) {
  const value = plain(task);
  if (!(await canViewTask(task, context))) return false;
  if (await isDelegatedProjectLeadForTask(value.id, context)) return true;
  if (await canManageTask(task, context)) return true;
  if (Number(value.assigneeId) === Number(context.userId) || Number(value.createdBy) === Number(context.userId)) return true;
  if (value.areaScope !== 'AREAS') return !value.assigneeId;

  const taskAreaIds = linkedAreaIds(value);
  const resolvedAreaIds = taskAreaIds.length > 0
    ? taskAreaIds
    : await getTaskAreaIds(value.id, context.wineryId, context.transaction);
  const { managedAreaIds } = await operationalAreaService.getUserAreaAccess(context);
  if (resolvedAreaIds.some(areaId => managedAreaIds.includes(areaId))) return true;
  return !value.assigneeId;
}

async function canManageTask(task, { wineryId, userId, userRole, transaction = null }) {
  const value = plain(task);
  if (!value || Number(value.wineryId) !== Number(wineryId)) return false;
  if (operationalAreaService.isGlobalManager(userRole)) return true;
  if (value.areaScope !== 'AREAS') return false;
  const taskAreaIds = linkedAreaIds(value);
  const resolvedAreaIds = taskAreaIds.length > 0
    ? taskAreaIds
    : await getTaskAreaIds(value.id, wineryId, transaction);
  const { managedAreaIds } = await operationalAreaService.getUserAreaAccess({ userId, wineryId, transaction });
  return resolvedAreaIds.length > 0 && resolvedAreaIds.every(areaId => managedAreaIds.includes(areaId));
}

async function assertCanViewTask(task, context) {
  if (!(await canViewTask(task, context))) throw new NotFoundError('Task not found');
}

async function assertCanMutateTask(task, context) {
  if (!(await canMutateTask(task, context))) throw new ForbiddenError('You do not have permission to update this task.');
}

function audienceAllowsNotice(notice, { userId, userRole }) {
  const value = plain(notice) || {};
  const audienceType = value.audienceType || 'all_staff';
  if (audienceType === 'all_staff') return true;
  if (audienceType === 'roles') return jsonArray(value.audienceRoles).includes(userRole);
  if (audienceType === 'users') return jsonArray(value.audienceUserIds).map(Number).includes(Number(userId));
  return false;
}

async function canViewNotice(notice, { wineryId, userId, userRole, areaIds = null, transaction = null }) {
  const value = plain(notice);
  if (!value || Number(value.wineryId) !== Number(wineryId)) return false;
  if (operationalAreaService.isGlobalManager(userRole)) return true;

  const directlyTargeted = value.audienceType === 'users'
    && jsonArray(value.audienceUserIds).map(Number).includes(Number(userId));
  if (directlyTargeted) return true;
  if (!audienceAllowsNotice(value, { userId, userRole })) return false;
  if (value.areaScope !== 'AREAS') return true;

  const noticeAreaIds = linkedAreaIds(value);
  const resolvedAreaIds = noticeAreaIds.length > 0
    ? noticeAreaIds
    : await getNoticeAreaIds(value.id, wineryId, transaction);
  const accessAreaIds = areaIds || (await operationalAreaService.getUserAreaAccess({ userId, wineryId, transaction })).areaIds;
  return resolvedAreaIds.some(areaId => accessAreaIds.includes(areaId));
}

async function canManageNotice(notice, { wineryId, userId, userRole, transaction = null }) {
  const value = plain(notice);
  if (!value || Number(value.wineryId) !== Number(wineryId)) return false;
  if (operationalAreaService.isGlobalManager(userRole)) return true;
  if (value.areaScope !== 'AREAS') return false;
  const noticeAreaIds = linkedAreaIds(value);
  const resolvedAreaIds = noticeAreaIds.length > 0
    ? noticeAreaIds
    : await getNoticeAreaIds(value.id, wineryId, transaction);
  const { managedAreaIds } = await operationalAreaService.getUserAreaAccess({ userId, wineryId, transaction });
  return resolvedAreaIds.length > 0 && resolvedAreaIds.every(areaId => managedAreaIds.includes(areaId));
}

module.exports = {
  linkedAreaIds,
  getDelegatedLeadTaskIds,
  buildTaskVisibilityPredicate,
  canViewTask,
  canMutateTask,
  canManageTask,
  assertCanViewTask,
  assertCanMutateTask,
  audienceAllowsNotice,
  canViewNotice,
  canManageNotice
};
