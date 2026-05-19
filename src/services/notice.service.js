const { CalendarEvent, CalendarEventNotice, Notice, NoticeComment, NoticeTask, Task, User } = require('../models');
const { Op } = require('sequelize');
const { ForbiddenError, NotFoundError, ValidationError } = require('../utils/errors');

const MANAGER_ROLES = new Set(['manager', 'admin']);
const AUDIENCE_TYPES = new Set(['all_staff', 'roles', 'users']);
const AUDIENCE_ROLES = new Set(['staff', 'manager', 'admin']);
const PRIORITY_RANK_SQL = "CASE `Notice`.`priority` WHEN 'urgent' THEN 0 WHEN 'important' THEN 1 ELSE 2 END";
const LINKED_TASK_ATTRIBUTES = [
  'id',
  'category',
  'subType',
  'status',
  'priority',
  'workflowState',
  'dueAt',
  'createdAt'
];
const LINKED_NOTICE_ATTRIBUTES = [
  'id',
  'title',
  'category',
  'priority',
  'isPinned',
  'audienceType',
  'audienceRoles',
  'audienceUserIds',
  'effectiveFrom',
  'expiresAt',
  'archivedAt',
  'createdAt'
];
const LINKED_CALENDAR_EVENT_ATTRIBUTES = [
  'id',
  'title',
  'description',
  'start',
  'end',
  'allDay',
  'type'
];

function canManageNotices(userRole) {
  return MANAGER_ROLES.has(userRole);
}

function assertCanManageNotices(userRole) {
  if (!canManageNotices(userRole)) {
    throw new ForbiddenError('Only managers can manage notices.');
  }
}

function parseBoolean(value) {
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return undefined;
}

function parsePositiveInt(value, fallback, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function uniqueValues(values) {
  return Array.from(new Set(values));
}

function normalizeNoticeAudiencePayload(data = {}, options = {}) {
  const partial = Boolean(options.partial);
  const hasAudienceField = ['audienceType', 'audienceRoles', 'audienceUserIds'].some((field) =>
    Object.prototype.hasOwnProperty.call(data, field)
  );

  if (partial && !hasAudienceField) {
    return {};
  }

  const audienceType = data.audienceType || 'all_staff';
  if (!AUDIENCE_TYPES.has(audienceType)) {
    throw new ValidationError('Invalid notice audience type.');
  }

  if (audienceType === 'all_staff') {
    return {
      audienceType: 'all_staff',
      audienceRoles: null,
      audienceUserIds: null
    };
  }

  if (audienceType === 'roles') {
    const audienceRoles = uniqueValues(parseJsonArray(data.audienceRoles)
      .map((role) => String(role).trim())
      .filter((role) => AUDIENCE_ROLES.has(role)));

    if (audienceRoles.length === 0) {
      throw new ValidationError('Choose at least one role for a role-targeted notice.');
    }

    return {
      audienceType: 'roles',
      audienceRoles,
      audienceUserIds: null
    };
  }

  const audienceUserIds = uniqueValues(parseJsonArray(data.audienceUserIds)
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0));

  if (audienceUserIds.length === 0) {
    throw new ValidationError('Choose at least one staff member for a user-targeted notice.');
  }

  return {
    audienceType: 'users',
    audienceRoles: null,
    audienceUserIds
  };
}

function noticeVisibleToUser(notice, { userId, userRole }) {
  if (canManageNotices(userRole)) return true;

  const plain = notice.toJSON ? notice.toJSON() : notice;
  const audienceType = plain.audienceType || 'all_staff';

  if (audienceType === 'all_staff') return true;
  if (audienceType === 'roles') {
    return parseJsonArray(plain.audienceRoles).includes(userRole);
  }
  if (audienceType === 'users') {
    return parseJsonArray(plain.audienceUserIds).map(Number).includes(Number(userId));
  }

  return true;
}

function buildNoticeWhere({ wineryId, filters = {}, now = new Date() }) {
  const where = { wineryId };
  const and = [];

  if (filters.search) {
    const search = `%${String(filters.search).trim()}%`;
    and.push({
      [Op.or]: [
        { title: { [Op.like]: search } },
        { body: { [Op.like]: search } }
      ]
    });
  }

  if (filters.category && filters.category !== 'all') {
    where.category = filters.category;
  }

  if (filters.priority && filters.priority !== 'all') {
    where.priority = filters.priority;
  }

  if (filters.authorId && filters.authorId !== 'all') {
    where.createdBy = Number(filters.authorId);
  }

  const pinned = parseBoolean(filters.pinned);
  if (pinned !== undefined) {
    where.isPinned = pinned;
  }

  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {};
    if (filters.dateFrom) where.createdAt[Op.gte] = new Date(filters.dateFrom);
    if (filters.dateTo) where.createdAt[Op.lte] = new Date(`${filters.dateTo}T23:59:59.999Z`);
  }

  if (filters.effectiveFrom || filters.effectiveTo) {
    where.effectiveFrom = {};
    if (filters.effectiveFrom) where.effectiveFrom[Op.gte] = new Date(filters.effectiveFrom);
    if (filters.effectiveTo) where.effectiveFrom[Op.lte] = new Date(`${filters.effectiveTo}T23:59:59.999Z`);
  }

  const status = filters.status || 'active';
  if (status === 'archived') {
    where.archivedAt = { [Op.ne]: null };
  } else if (status === 'expired') {
    where.archivedAt = null;
    where.expiresAt = { [Op.lt]: now };
  } else if (status === 'all') {
    // Intentionally include active, expired, and archived notices.
  } else {
    where.archivedAt = null;
    and.push({
      [Op.or]: [
        { expiresAt: null },
        { expiresAt: { [Op.gte]: now } }
      ]
    });
  }

  if (and.length > 0) {
    where[Op.and] = and;
  }

  return where;
}

function buildOrder(sortBy) {
  if (sortBy === 'oldest') {
    return [['createdAt', 'ASC']];
  }

  if (sortBy === 'effective') {
    return [
      ['isPinned', 'DESC'],
      [Notice.sequelize.literal('CASE WHEN `Notice`.`effectiveFrom` IS NULL THEN 1 ELSE 0 END'), 'ASC'],
      ['effectiveFrom', 'ASC'],
      [Notice.sequelize.literal(PRIORITY_RANK_SQL), 'ASC'],
      ['createdAt', 'DESC']
    ];
  }

  return [
    ['isPinned', 'DESC'],
    [Notice.sequelize.literal(PRIORITY_RANK_SQL), 'ASC'],
    ['createdAt', 'DESC']
  ];
}

function serializeNotice(notice, now = new Date()) {
  const plain = notice.toJSON ? notice.toJSON() : notice;
  const expiresAt = plain.expiresAt ? new Date(plain.expiresAt) : null;
  const isArchived = Boolean(plain.archivedAt);
  const isExpired = Boolean(!isArchived && expiresAt && expiresAt.getTime() < now.getTime());
  const status = isArchived ? 'archived' : isExpired ? 'expired' : 'active';
  const compactBody = String(plain.body || '').replace(/\s+/g, ' ').trim();

  return {
    ...plain,
    isArchived,
    isExpired,
    status,
    bodyPreview: compactBody.length > 180 ? `${compactBody.slice(0, 177)}...` : compactBody
  };
}

function serializeNoticeComment(comment) {
  if (!comment) return null;
  const plain = comment.toJSON ? comment.toJSON() : comment;
  return {
    ...plain,
    Replies: plain.Replies || []
  };
}

function buildCommentThreads(comments) {
  const byId = new Map();
  const roots = [];

  comments.forEach((comment) => {
    const serialized = serializeNoticeComment(comment);
    serialized.Replies = [];
    byId.set(serialized.id, serialized);
  });

  byId.forEach((comment) => {
    if (comment.parentCommentId && byId.has(comment.parentCommentId)) {
      byId.get(comment.parentCommentId).Replies.push(comment);
      return;
    }

    roots.push(comment);
  });

  return roots;
}

async function listNotices({ wineryId, userId, userRole, filters = {}, pagination = {} }) {
  const now = new Date();
  const page = parsePositiveInt(pagination.page, 1, 1000);
  const pageSize = parsePositiveInt(pagination.pageSize, 50, 100);
  const where = buildNoticeWhere({ wineryId, filters, now });

  const rows = await Notice.findAll({
    where,
    include: [
      { model: User, as: 'Author', attributes: ['id', 'displayName', 'email', 'role'] },
      { model: User, as: 'Updater', attributes: ['id', 'displayName', 'email', 'role'] },
      { model: User, as: 'Archiver', attributes: ['id', 'displayName', 'email', 'role'] },
      {
        model: Task,
        as: 'LinkedTasks',
        attributes: LINKED_TASK_ATTRIBUTES,
        through: { attributes: ['createdAt', 'createdBy'] },
        required: false
      },
      getLinkedCalendarEventInclude()
    ],
    order: buildOrder(filters.sortBy)
  });

  const visibleRows = rows.filter((notice) => noticeVisibleToUser(notice, { userId, userRole }));
  const pagedRows = visibleRows.slice((page - 1) * pageSize, page * pageSize);

  return {
    notices: pagedRows.map(notice => serializeNotice(notice, now)),
    pagination: {
      page,
      pageSize,
      total: visibleRows.length,
      totalPages: Math.max(1, Math.ceil(visibleRows.length / pageSize))
    }
  };
}

async function ensureNotice({ noticeId, wineryId, userId, userRole, transaction }) {
  const notice = await Notice.findOne({ where: { id: noticeId, wineryId }, transaction });
  if (!notice || (userId && userRole && !noticeVisibleToUser(notice, { userId, userRole }))) {
    throw new NotFoundError('Notice not found');
  }
  return notice;
}

async function getNoticeById({ noticeId, wineryId, userId, userRole }) {
  const notice = await Notice.findOne({
    where: { id: noticeId, wineryId },
    include: [
      { model: User, as: 'Author', attributes: ['id', 'displayName', 'email', 'role'] },
      { model: User, as: 'Updater', attributes: ['id', 'displayName', 'email', 'role'] },
      { model: User, as: 'Archiver', attributes: ['id', 'displayName', 'email', 'role'] },
      {
        model: Task,
        as: 'LinkedTasks',
        attributes: LINKED_TASK_ATTRIBUTES,
        through: { attributes: ['createdAt', 'createdBy'] },
        required: false
      },
      getLinkedCalendarEventInclude()
    ]
  });

  if (!notice || (userId && userRole && !noticeVisibleToUser(notice, { userId, userRole }))) {
    throw new NotFoundError('Notice not found');
  }

  return serializeNotice(notice);
}

function getLinkedNoticeInclude() {
  return {
    model: Notice,
    as: 'LinkedNotices',
    attributes: LINKED_NOTICE_ATTRIBUTES,
    through: { attributes: ['createdAt', 'createdBy'] },
    required: false
  };
}

function getLinkedCalendarEventInclude() {
  return {
    model: CalendarEvent,
    as: 'CalendarEvents',
    attributes: LINKED_CALENDAR_EVENT_ATTRIBUTES,
    through: { attributes: ['createdAt', 'createdBy'] },
    required: false
  };
}

async function linkNoticeToCalendarEvents({ noticeId, calendarEventIds = [], wineryId, userId, transaction }) {
  const uniqueEventIds = [...new Set((calendarEventIds || [])
    .map(Number)
    .filter(id => Number.isInteger(id) && id > 0))];

  if (uniqueEventIds.length === 0) return;

  const events = await CalendarEvent.findAll({
    where: { id: { [Op.in]: uniqueEventIds }, wineryId },
    attributes: ['id'],
    transaction
  });

  if (events.length !== uniqueEventIds.length) {
    throw new NotFoundError('One or more calendar events were not found.');
  }

  await CalendarEventNotice.bulkCreate(
    uniqueEventIds.map(calendarEventId => ({
      calendarEventId,
      noticeId,
      wineryId,
      createdBy: userId
    })),
    { transaction, ignoreDuplicates: true }
  );

  await CalendarEvent.update(
    { noticeId },
    {
      where: {
        id: { [Op.in]: uniqueEventIds },
        wineryId,
        noticeId: null
      },
      transaction
    }
  );
}

async function ensureNoticeAndTask({ noticeId, taskId, wineryId, transaction }) {
  const [notice, task] = await Promise.all([
    Notice.findOne({ where: { id: noticeId, wineryId }, transaction }),
    Task.findOne({ where: { id: taskId, wineryId }, transaction })
  ]);

  if (!notice) {
    throw new NotFoundError('Notice not found');
  }
  if (!task) {
    throw new NotFoundError('Task not found');
  }

  return { notice, task };
}

async function linkNoticeTask({ noticeId, taskId, wineryId, userId, userRole }) {
  assertCanManageNotices(userRole);

  const transaction = await NoticeTask.sequelize.transaction();
  try {
    await ensureNoticeAndTask({ noticeId, taskId, wineryId, transaction });
    await NoticeTask.findOrCreate({
      where: { noticeId, taskId },
      defaults: {
        noticeId,
        taskId,
        wineryId,
        createdBy: userId
      },
      transaction
    });
    await transaction.commit();
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    throw err;
  }

  return getNoticeById({ noticeId, wineryId, userId, userRole });
}

async function unlinkNoticeTask({ noticeId, taskId, wineryId, userRole }) {
  assertCanManageNotices(userRole);

  await ensureNoticeAndTask({ noticeId, taskId, wineryId });
  await NoticeTask.destroy({
    where: { noticeId, taskId, wineryId }
  });

  return getNoticeById({ noticeId, wineryId, userRole });
}

async function listNoticeComments({ noticeId, wineryId, userId, userRole }) {
  await ensureNotice({ noticeId, wineryId, userId, userRole });

  const comments = await NoticeComment.findAll({
    where: { noticeId, wineryId },
    include: [
      { model: User, as: 'Author', attributes: ['id', 'displayName', 'email', 'role'] }
    ],
    order: [['createdAt', 'ASC'], ['id', 'ASC']]
  });

  return buildCommentThreads(comments);
}

async function createNoticeComment({ noticeId, wineryId, userId, userRole, data }) {
  await ensureNotice({ noticeId, wineryId, userId, userRole });

  const parentCommentId = data.parentCommentId || null;
  if (parentCommentId) {
    const parentComment = await NoticeComment.findOne({
      where: { id: parentCommentId, noticeId, wineryId }
    });

    if (!parentComment) {
      throw new NotFoundError('Parent notice comment not found');
    }

    if (parentComment.parentCommentId) {
      throw new ValidationError('Replies can only be added to top-level comments.');
    }
  }

  const comment = await NoticeComment.create({
    noticeId,
    wineryId,
    userId,
    parentCommentId,
    body: data.body
  });

  return NoticeComment.findOne({
    where: { id: comment.id, wineryId },
    include: [
      { model: User, as: 'Author', attributes: ['id', 'displayName', 'email', 'role'] }
    ]
  }).then(serializeNoticeComment);
}

async function deleteNoticeComment({ noticeId, commentId, wineryId, userRole }) {
  assertCanManageNotices(userRole);
  await ensureNotice({ noticeId, wineryId });

  const transaction = await NoticeComment.sequelize.transaction();
  try {
    const comment = await NoticeComment.findOne({
      where: { id: commentId, noticeId, wineryId },
      transaction
    });
    if (!comment) {
      throw new NotFoundError('Notice comment not found');
    }

    await NoticeComment.destroy({
      where: { parentCommentId: comment.id, noticeId, wineryId },
      transaction
    });
    await comment.destroy({ transaction });
    await transaction.commit();
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    throw err;
  }

  return { deleted: true };
}

async function createNotice({ wineryId, userId, userRole, data }) {
  assertCanManageNotices(userRole);
  const audience = normalizeNoticeAudiencePayload(data);
  const { calendarEventIds = [], ...noticeData } = data;
  const transaction = await Notice.sequelize.transaction();
  let notice;
  try {
    notice = await Notice.create({
      ...noticeData,
      ...audience,
      wineryId,
      createdBy: userId,
      updatedBy: userId
    }, { transaction });

    await linkNoticeToCalendarEvents({
      noticeId: notice.id,
      calendarEventIds,
      wineryId,
      userId,
      transaction
    });

    await transaction.commit();
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    throw err;
  }

  return getNoticeById({ noticeId: notice.id, wineryId, userId, userRole });
}

async function updateNotice({ noticeId, wineryId, userId, userRole, updates }) {
  assertCanManageNotices(userRole);

  const notice = await Notice.findOne({ where: { id: noticeId, wineryId } });
  if (!notice) {
    throw new NotFoundError('Notice not found');
  }

  const updatePayload = { ...updates };
  const hasCalendarEventUpdate = Object.prototype.hasOwnProperty.call(updatePayload, 'calendarEventIds');
  const calendarEventIds = hasCalendarEventUpdate ? updatePayload.calendarEventIds : undefined;
  delete updatePayload.calendarEventIds;
  const archiveChange = Object.prototype.hasOwnProperty.call(updatePayload, 'isArchived')
    ? updatePayload.isArchived
    : undefined;
  delete updatePayload.isArchived;

  const hasAudienceUpdate = ['audienceType', 'audienceRoles', 'audienceUserIds'].some((field) =>
    Object.prototype.hasOwnProperty.call(updatePayload, field)
  );
  let audienceUpdates = {};
  if (hasAudienceUpdate) {
    audienceUpdates = normalizeNoticeAudiencePayload({
      audienceType: updatePayload.audienceType || notice.audienceType || 'all_staff',
      audienceRoles: Object.prototype.hasOwnProperty.call(updatePayload, 'audienceRoles')
        ? updatePayload.audienceRoles
        : notice.audienceRoles,
      audienceUserIds: Object.prototype.hasOwnProperty.call(updatePayload, 'audienceUserIds')
        ? updatePayload.audienceUserIds
        : notice.audienceUserIds
    });
    delete updatePayload.audienceType;
    delete updatePayload.audienceRoles;
    delete updatePayload.audienceUserIds;
  }

  Object.assign(notice, updatePayload, audienceUpdates);
  notice.updatedBy = userId;

  if (notice.effectiveFrom && notice.expiresAt) {
    const effectiveFrom = new Date(notice.effectiveFrom).getTime();
    const expiresAt = new Date(notice.expiresAt).getTime();
    if (expiresAt < effectiveFrom) {
      throw new ValidationError('Expiry date must be after the effective date.');
    }
  }

  if (archiveChange === true && !notice.archivedAt) {
    notice.archivedAt = new Date();
    notice.archivedBy = userId;
  } else if (archiveChange === false) {
    notice.archivedAt = null;
    notice.archivedBy = null;
  }

  await notice.save();

  if (hasCalendarEventUpdate) {
    const transaction = await Notice.sequelize.transaction();
    try {
      await CalendarEventNotice.destroy({
        where: { noticeId: notice.id },
        transaction
      });
      await CalendarEvent.update(
        { noticeId: null },
        { where: { noticeId: notice.id, wineryId }, transaction }
      );
      await linkNoticeToCalendarEvents({
        noticeId: notice.id,
        calendarEventIds,
        wineryId,
        userId,
        transaction
      });
      await transaction.commit();
    } catch (err) {
      if (!transaction.finished) await transaction.rollback();
      throw err;
    }
  }

  return getNoticeById({ noticeId: notice.id, wineryId, userId, userRole });
}

async function archiveNotice({ noticeId, wineryId, userId, userRole }) {
  assertCanManageNotices(userRole);

  const notice = await Notice.findOne({ where: { id: noticeId, wineryId } });
  if (!notice) {
    throw new NotFoundError('Notice not found');
  }

  if (!notice.archivedAt) {
    notice.archivedAt = new Date();
    notice.archivedBy = userId;
    notice.updatedBy = userId;
    await notice.save();
  }

  return getNoticeById({ noticeId: notice.id, wineryId, userId, userRole });
}

module.exports = {
  canManageNotices,
  noticeVisibleToUser,
  listNotices,
  getNoticeById,
  createNotice,
  updateNotice,
  archiveNotice,
  linkNoticeTask,
  unlinkNoticeTask,
  listNoticeComments,
  createNoticeComment,
  deleteNoticeComment,
  getLinkedNoticeInclude,
  getLinkedCalendarEventInclude
};
