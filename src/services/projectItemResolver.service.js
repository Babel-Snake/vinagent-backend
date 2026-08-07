const {
  CalendarEvent,
  Notice,
  OperationalArea,
  OperationalRecord,
  OperationalRequest,
  Task,
  User
} = require('../models');
const operationalAreaService = require('./operationalArea.service');
const operationalItemService = require('./operationalItem.service');
const involvementService = require('./involvement.service');
const { getTaskAreaInclude } = require('./taskArea.service');
const recordVisibility = require('./recordVisibility.service');
const { NotFoundError, ValidationError } = require('../utils/errors');

const ITEM_TYPES = new Set(['TASK', 'REQUEST', 'NOTICE', 'NOTE', 'CALENDAR_EVENT']);

function operationalAreaInclude() {
  return {
    model: OperationalArea,
    as: 'OperationalAreas',
    attributes: ['id', 'name'],
    through: { attributes: [] },
    required: false
  };
}

function normalizeProjectItemType(value) {
  const type = String(value || '').toUpperCase();
  if (!ITEM_TYPES.has(type)) throw new ValidationError('Invalid Project item type.');
  return type;
}

function plain(record) {
  return record?.toJSON ? record.toJSON() : record;
}

async function canViewCalendarEvent(event, context) {
  const value = plain(event);
  if (!value || Number(value.wineryId) !== Number(context.wineryId)) return false;
  if (operationalAreaService.isGlobalManager(context.userRole)) return true;
  const tasks = [...(value.LinkedTasks || []), ...(value.LinkedTask ? [value.LinkedTask] : [])];
  const notices = [...(value.LinkedNotices || []), ...(value.LinkedNotice ? [value.LinkedNotice] : [])];
  if (tasks.length === 0 && notices.length === 0) return true;
  for (const task of tasks) {
    if (await recordVisibility.canViewTask(task, context)) return true;
  }
  for (const notice of notices) {
    if (await recordVisibility.canViewNotice(notice, context)) return true;
  }
  return false;
}

async function loadCalendarEvent(itemId, wineryId, transaction = null) {
  return CalendarEvent.findOne({
    where: { id: itemId, wineryId },
    include: [
      { model: Task, as: 'LinkedTask', required: false },
      { model: Task, as: 'LinkedTasks', through: { attributes: [] }, required: false },
      { model: Notice, as: 'LinkedNotice', required: false },
      { model: Notice, as: 'LinkedNotices', through: { attributes: [] }, required: false },
      { model: User, as: 'Creator', attributes: ['id', 'displayName', 'email'], required: false }
    ],
    transaction
  });
}

async function resolveVisibleProjectItem({ itemType, itemId, wineryId, userId, userRole, transaction = null }) {
  const type = normalizeProjectItemType(itemType);
  const context = { wineryId, userId, userRole, transaction };
  if (type === 'TASK') {
    const item = await Task.findOne({
      where: { id: itemId, wineryId },
      include: [
        { model: User, as: 'Assignee', attributes: ['id', 'displayName', 'email', 'role'], required: false },
        { model: User, as: 'Creator', attributes: ['id', 'displayName', 'email', 'role'], required: false },
        getTaskAreaInclude()
      ],
      transaction
    });
    if (!item || !(await recordVisibility.canViewTask(item, context))) throw new NotFoundError('Task not found');
    return item;
  }
  if (type === 'NOTICE') {
    const item = await Notice.findOne({
      where: { id: itemId, wineryId },
      include: [
        { model: User, as: 'Author', attributes: ['id', 'displayName', 'email', 'role'], required: false },
        operationalAreaInclude()
      ],
      transaction
    });
    if (!item || !(await recordVisibility.canViewNotice(item, context))) throw new NotFoundError('Notice not found');
    return item;
  }
  if (type === 'REQUEST' || type === 'NOTE') {
    return operationalItemService.getVisibleOperationalItem({
      itemType: type,
      itemId,
      wineryId,
      userId,
      userRole,
      transaction
    });
  }
  const item = await loadCalendarEvent(itemId, wineryId, transaction);
  if (!item || !(await canViewCalendarEvent(item, context))) throw new NotFoundError('Calendar Event not found');
  return item;
}

async function resolveProjectItemForManager({ itemType, itemId, wineryId, transaction = null }) {
  const type = normalizeProjectItemType(itemType);
  if (type === 'TASK') return Task.findOne({
    where: { id: itemId, wineryId },
    include: [
      { model: User, as: 'Assignee', attributes: ['id', 'displayName', 'email', 'role'], required: false },
      getTaskAreaInclude()
    ],
    transaction
  });
  if (type === 'NOTICE') return Notice.findOne({
    where: { id: itemId, wineryId },
    include: [operationalAreaInclude()],
    transaction
  });
  if (type === 'REQUEST') return OperationalRequest.findOne({
    where: { id: itemId, wineryId },
    include: [
      { model: User, as: 'RequestedFrom', attributes: ['id', 'displayName', 'email', 'role'], required: false },
      operationalAreaInclude()
    ],
    transaction
  });
  if (type === 'NOTE') return OperationalRecord.findOne({
    where: { id: itemId, wineryId },
    include: [
      { model: User, as: 'Recipients', attributes: ['id', 'displayName', 'email', 'role'], through: { attributes: [] }, required: false },
      operationalAreaInclude()
    ],
    transaction
  });
  return loadCalendarEvent(itemId, wineryId, transaction);
}

function serializeProjectItemSource(itemType, source, context = {}) {
  const type = normalizeProjectItemType(itemType);
  const value = plain(source) || {};
  const involvement = involvementService.classifyItem(type, value, context);
  if (type === 'TASK') {
    return {
      id: value.id,
      title: value.payload?.summary || value.nextStepSummary || String(value.subType || value.category || 'Task').replace(/_/g, ' '),
      status: value.status,
      workflowState: value.workflowState,
      waitingOn: value.waitingOn,
      blockedReason: value.blockedReason,
      dueAt: value.dueAt,
      priority: value.priority,
      owner: value.Assignee || null,
      involvement,
      href: `/tasks?taskId=${value.id}`
    };
  }
  if (type === 'REQUEST') {
    return {
      id: value.id,
      title: value.title,
      status: value.status,
      dueAt: value.dueAt,
      priority: value.priority,
      owner: value.RequestedFrom || null,
      involvement,
      href: `/requests?requestId=${value.id}`
    };
  }
  if (type === 'NOTICE') {
    return {
      id: value.id,
      title: value.title,
      status: value.archivedAt ? 'ARCHIVED' : 'ACTIVE',
      dueAt: value.expiresAt,
      priority: value.priority,
      owner: null,
      involvement,
      href: `/noticeboard?noticeId=${value.id}`
    };
  }
  if (type === 'NOTE') {
    return {
      id: value.id,
      title: value.title,
      status: 'RECORDED',
      dueAt: null,
      priority: null,
      owner: null,
      involvement,
      href: `/notes?recordId=${value.id}`
    };
  }
  return {
    id: value.id,
    title: value.title,
    status: 'SCHEDULED',
    dueAt: value.start,
    start: value.start,
    end: value.end,
    allDay: Boolean(value.allDay),
    priority: null,
    owner: value.Creator || null,
    involvement,
    href: `/calendar?eventId=${value.id}`
  };
}

module.exports = {
  ITEM_TYPES,
  normalizeProjectItemType,
  canViewCalendarEvent,
  resolveVisibleProjectItem,
  resolveProjectItemForManager,
  serializeProjectItemSource
};
