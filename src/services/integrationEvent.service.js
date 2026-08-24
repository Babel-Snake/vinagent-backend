const {
  IntegrationEvent,
  IntegrationEventItem,
  Notice,
  NoticeArea,
  NoticeTask,
  OperationalArea,
  OperationalRecord,
  OperationalRequest,
  Task,
  User
} = require('../models');
const { Op, UniqueConstraintError } = require('sequelize');
const taskService = require('./taskService');
const noticeService = require('./notice.service');
const operationalItemService = require('./operationalItem.service');
const operationalAreaService = require('./operationalArea.service');
const { redact } = require('../utils/sanitizer');
const { ForbiddenError, NotFoundError, ValidationError } = require('../utils/errors');
const { normalizeInboundEvent, compactString } = require('./integrations/inbound/normalizers');
const logger = require('../config/logger');

const MANAGER_ROLES = new Set(['manager', 'admin']);
const TERMINAL_STATUSES = new Set(['PROCESSED', 'IGNORED', 'ARCHIVED']);
const NOTICE_CATEGORIES = new Set([
  'GENERAL',
  'WINE',
  'VINTAGE_CHANGE',
  'PRICING',
  'STOCK',
  'CUSTOMERS',
  'MAINTENANCE',
  'EVENTS',
  'STAFF',
  'WINE_CLUB',
  'URGENT'
]);
const NOTICE_PRIORITIES = new Set(['normal', 'important', 'urgent']);

const CALL_TASK_MAP = {
  booking_enquiry: { category: 'BOOKING', subType: 'BOOKING_NEW' },
  wine_club_enquiry: { category: 'ACCOUNT', subType: 'WINE_CLUB_ENQUIRY' },
  customer_complaint: { category: 'GENERAL', subType: 'CUSTOMER_COMPLAINT' },
  supplier_call: { category: 'OPERATIONS', subType: 'SUPPLIER_CALL' },
  wholesale_enquiry: { category: 'GENERAL', subType: 'WHOLESALE_ENQUIRY' },
  callback_request: { category: 'GENERAL', subType: 'CALLBACK_REQUEST' },
  event_enquiry: { category: 'GENERAL', subType: 'EVENT_ENQUIRY' },
  opening_hours: { category: 'GENERAL', subType: 'GENERAL_ENQUIRY' },
  urgent_operational_issue: { category: 'OPERATIONS', subType: 'OPERATIONS_ESCALATION' },
  unknown: { category: 'GENERAL', subType: 'GENERAL_ENQUIRY' }
};

function assertCanReview(userRole) {
  if (!MANAGER_ROLES.has(userRole)) {
    throw new ForbiddenError('Only managers can review integration events.');
  }
}

function parsePositiveInt(value, fallback, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function toDateOrNull(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeProvider(value) {
  return compactString(value, 100) || 'unknown';
}

function serializeIntegrationEvent(event) {
  if (!event) return null;
  const plain = event.toJSON ? event.toJSON() : event;
  const linkedItems = plain.LinkedItems || [];
  return {
    ...plain,
    linkedItems,
    isTerminal: TERMINAL_STATUSES.has(plain.status)
  };
}

function getEventInclude() {
  return [
    { model: User, as: 'Creator', attributes: ['id', 'displayName', 'email', 'role'] },
    { model: User, as: 'Reviewer', attributes: ['id', 'displayName', 'email', 'role'] },
    { model: OperationalArea, as: 'SuggestedArea', attributes: ['id', 'name', 'isActive'] },
    { model: OperationalArea, as: 'ConfirmedArea', attributes: ['id', 'name', 'isActive'] },
    {
      model: IntegrationEventItem,
      as: 'LinkedItems',
      include: [{ model: User, as: 'Creator', attributes: ['id', 'displayName', 'email'] }]
    }
  ];
}

async function addEventItemLink({ event, wineryId, userId, itemType, itemId, itemKey = null, linkType = 'CREATED', transaction }) {
  return IntegrationEventItem.create({
    eventId: event.id,
    wineryId,
    itemType,
    itemId,
    itemKey,
    linkType,
    createdBy: userId
  }, { transaction });
}

function normalizeEventCreatePayload(data) {
  const provider = normalizeProvider(data.provider);
  const rawPayload = redact(data.rawPayload || {});
  const eventType = compactString(data.eventType, 100) || 'unknown.received';
  const externalEventId = compactString(data.externalEventId, 255);
  const normalizedPayload = data.normalizedPayload || normalizeInboundEvent({
    eventType,
    rawPayload,
    provider,
    externalEventId
  });
  const status = eventType === 'unknown.received' ? 'RECEIVED' : 'PENDING_REVIEW';

  return {
    provider,
    intakeMethod: compactString(data.intakeMethod, 50) || 'manual',
    eventType,
    externalEventId,
    rawPayload,
    normalizedPayload,
    status,
    receivedAt: toDateOrNull(data.receivedAt) || new Date(),
    metadata: data.metadata || null,
    suggestedAreaId: data.suggestedAreaId || null,
    areaConfidence: data.areaConfidence ?? null,
    areaMappingSource: data.areaMappingSource || (data.suggestedAreaId ? 'MANUAL' : null)
  };
}

async function createIntegrationEvent({ wineryId, userId = null, data }) {
  const payload = normalizeEventCreatePayload(data);
  if (payload.suggestedAreaId) {
    const area = await OperationalArea.findOne({
      where: { id: payload.suggestedAreaId, wineryId, isActive: true },
      attributes: ['id']
    });
    if (!area) throw new ValidationError('Suggested operational area is invalid or inactive.');
  }
  const duplicateWhere = payload.externalEventId ? {
    wineryId,
    provider: payload.provider,
    externalEventId: payload.externalEventId
  } : null;

  if (duplicateWhere) {
    const existing = await IntegrationEvent.findOne({
      where: duplicateWhere,
      include: getEventInclude()
    });

    if (existing) {
      return {
        event: serializeIntegrationEvent(existing),
        duplicate: true
      };
    }
  }

  let event;
  try {
    event = await IntegrationEvent.create({
      ...payload,
      wineryId,
      createdBy: userId
    });
  } catch (err) {
    const isDuplicate = err instanceof UniqueConstraintError || err.name === 'SequelizeUniqueConstraintError';
    if (duplicateWhere && isDuplicate) {
      const existing = await IntegrationEvent.findOne({
        where: duplicateWhere,
        include: getEventInclude()
      });

      if (existing) {
        return {
          event: serializeIntegrationEvent(existing),
          duplicate: true
        };
      }
    }

    throw err;
  }

  const fresh = await IntegrationEvent.findOne({
    where: { id: event.id, wineryId },
    include: getEventInclude()
  });

  try {
    const automationRuleService = require('./automationRule.service');
    const results = await automationRuleService.executeMatchingRulesForEvent({
      wineryId,
      eventId: fresh.id
    });
    if (results.length > 0) {
      logger.info('Evaluated integration event automation rules', {
        wineryId,
        eventId: fresh.id,
        evaluated: results.length,
        actioned: results.filter(result => result.run?.status === 'ACTIONED').length,
        failed: results.filter(result => result.error || result.run?.status === 'FAILED').length
      });
    }
  } catch (err) {
    logger.error('Integration event automation evaluation failed', {
      wineryId,
      eventId: fresh.id,
      error: err.message
    });
  }

  return {
    event: serializeIntegrationEvent(fresh),
    duplicate: false
  };
}

async function listIntegrationEvents({ wineryId, filters = {}, pagination = {} }) {
  const page = parsePositiveInt(pagination.page, 1, 1000);
  const pageSize = parsePositiveInt(pagination.pageSize, 50, 100);
  const where = { wineryId };

  if (filters.status && filters.status !== 'all') {
    where.status = filters.status;
  }
  if (filters.eventType && filters.eventType !== 'all') {
    where.eventType = filters.eventType;
  }
  if (filters.provider && filters.provider !== 'all') {
    where.provider = filters.provider;
  }
  if (filters.areaId && filters.areaId !== 'all') {
    where[Op.and] = [...(where[Op.and] || []), {
      [Op.or]: [
        { confirmedAreaId: Number(filters.areaId) },
        { confirmedAreaId: null, suggestedAreaId: Number(filters.areaId) }
      ]
    }];
  }
  if (filters.search) {
    const search = `%${String(filters.search).trim()}%`;
    where[Op.and] = [...(where[Op.and] || []), {
      [Op.or]: [
        { provider: { [Op.like]: search } },
        { eventType: { [Op.like]: search } },
        { externalEventId: { [Op.like]: search } }
      ]
    }];
  }

  const result = await IntegrationEvent.findAndCountAll({
    where,
    include: getEventInclude(),
    order: [['receivedAt', 'DESC'], ['id', 'DESC']],
    limit: pageSize,
    offset: (page - 1) * pageSize
  });

  return {
    events: result.rows.map(serializeIntegrationEvent),
    pagination: {
      page,
      pageSize,
      total: result.count,
      totalPages: Math.max(1, Math.ceil(result.count / pageSize))
    }
  };
}

async function getIntegrationEventById({ eventId, wineryId }) {
  const event = await IntegrationEvent.findOne({
    where: { id: eventId, wineryId },
    include: getEventInclude()
  });

  if (!event) {
    throw new NotFoundError('Integration event not found');
  }

  return serializeIntegrationEvent(event);
}

function getNormalizedPayload(event) {
  const normalizedPayload = event.normalizedPayload || {};
  if (!normalizedPayload || typeof normalizedPayload !== 'object') {
    throw new ValidationError('Integration event has no normalized payload.');
  }
  return normalizedPayload;
}

function buildNoticePayload(event, overrides = {}) {
  const normalized = getNormalizedPayload(event);
  const title = compactString(overrides.title || normalized.title, 200);
  const body = compactString(overrides.body || normalized.body, 10000);

  if (!title || !body) {
    throw new ValidationError('Imported notice events require a title and body before publishing.');
  }

  const category = NOTICE_CATEGORIES.has(overrides.category)
    ? overrides.category
    : (NOTICE_CATEGORIES.has(normalized.category) ? normalized.category : 'GENERAL');
  const priority = NOTICE_PRIORITIES.has(overrides.priority)
    ? overrides.priority
    : (NOTICE_PRIORITIES.has(normalized.priority) ? normalized.priority : 'normal');
  const primaryAreaId = overrides.primaryAreaId || event.confirmedAreaId || event.suggestedAreaId || null;
  const requiresAcknowledgement = Boolean(overrides.requiresAcknowledgement);

  return {
    title,
    body,
    category,
    priority,
    isPinned: Boolean(overrides.isPinned),
    requiresAcknowledgement,
    acknowledgementDueAt: requiresAcknowledgement ? toDateOrNull(overrides.acknowledgementDueAt) : null,
    audienceType: overrides.audienceType || 'all_staff',
    audienceRoles: overrides.audienceRoles || null,
    audienceUserIds: overrides.audienceUserIds || null,
    areaScope: overrides.areaScope || (primaryAreaId ? 'AREAS' : 'ORGANISATION'),
    primaryAreaId,
    linkedAreaIds: overrides.linkedAreaIds || [],
    effectiveFrom: toDateOrNull(overrides.effectiveFrom),
    expiresAt: toDateOrNull(overrides.expiresAt),
    externalSource: compactString(normalized.sourceLabel || event.provider, 100),
    externalId: compactString(normalized.externalNoticeId || event.externalEventId, 255),
    externalPostedAt: toDateOrNull(normalized.postedAt),
    externalAuthorName: compactString(normalized.externalAuthorName, 255),
    sourceEventId: event.id
  };
}

function buildCallTaskPayload(event, overrides = {}) {
  const normalized = getNormalizedPayload(event);
  const taskMap = CALL_TASK_MAP[normalized.category] || CALL_TASK_MAP.unknown;
  const requesterName = compactString(overrides.requesterName || normalized.callerName, 200);
  const requesterPhone = compactString(overrides.requesterPhone || normalized.callerPhone, 30);

  if (!requesterName && !requesterPhone) {
    throw new ValidationError('Call intake events require a caller name or phone number before task creation.');
  }

  const summary = compactString(normalized.summary, 2000);
  const recommendedAction = compactString(normalized.recommendedAction, 1000);
  const transcript = compactString(normalized.transcript, 10000);
  const priority = overrides.priority || (normalized.urgency === 'urgent' ? 'high' : 'normal');
  const contactLabel = requesterName || requesterPhone || 'the caller';
  const suggestedAction = overrides.suggestedAction
    || recommendedAction
    || `Review the call summary and follow up with ${contactLabel}.`;
  const primaryAreaId = overrides.primaryAreaId || event.confirmedAreaId || event.suggestedAreaId || null;

  return {
    taskOrigin: 'EXTERNAL',
    inboundMethod: 'phone',
    requesterName,
    requesterPhone,
    category: overrides.category || taskMap.category,
    subType: overrides.subType || taskMap.subType,
    priority,
    areaScope: overrides.areaScope || (primaryAreaId ? 'AREAS' : 'ORGANISATION'),
    primaryAreaId,
    linkedAreaIds: overrides.linkedAreaIds || [],
    sentiment: normalized.category === 'customer_complaint' ? 'NEGATIVE' : 'NEUTRAL',
    payload: {
      summary,
      originalText: transcript || summary,
      callIntake: {
        provider: event.provider,
        externalCallId: normalized.externalCallId || event.externalEventId || null,
        callTime: normalized.callTime || event.receivedAt,
        durationSeconds: normalized.durationSeconds || null,
        category: normalized.category || 'unknown',
        urgency: normalized.urgency || 'normal',
        recordingUrl: normalized.recordingUrl || null,
        recommendedAction,
        sourceEventId: event.id,
        metadata: normalized.metadata || {}
      }
    },
    suggestedChannel: 'voice',
    suggestedAction,
    dueAt: overrides.dueAt || null,
    initialNote: [
      summary ? `Call summary: ${summary}` : null,
      recommendedAction ? `Recommended action: ${recommendedAction}` : null,
      normalized.recordingUrl ? `Recording: ${normalized.recordingUrl}` : null
    ].filter(Boolean).join('\n'),
    steps: overrides.steps || [
      {
        title: 'Review call intake',
        description: summary || 'Review the call details from the external voice agent.',
        stepType: 'INTERNAL',
        waitingOn: 'STAFF',
        metadata: { sourceEventId: event.id }
      },
      {
        title: requesterPhone ? 'Call back the caller' : 'Follow up with the caller',
        description: suggestedAction,
        stepType: 'FOLLOW_UP',
        waitingOn: 'STAFF',
        suggestedChannel: 'voice',
        suggestedAction,
        metadata: { sourceEventId: event.id }
      }
    ]
  };
}

function buildTaskPayload(event, overrides = {}) {
  if (event.eventType === 'call.intake') {
    return buildCallTaskPayload(event, overrides);
  }

  const normalized = getNormalizedPayload(event);
  const title = compactString(overrides.title || normalized.title || event.eventType, 200);
  const body = compactString(overrides.body || normalized.body || normalized.summary, 4000);

  if (!title && !body) {
    throw new ValidationError('Integration event needs a title or body before task creation.');
  }
  const primaryAreaId = overrides.primaryAreaId || event.confirmedAreaId || event.suggestedAreaId || null;

  return {
    taskOrigin: 'INTERNAL',
    inboundMethod: 'other',
    category: overrides.category || 'INTERNAL',
    subType: overrides.subType || 'INTEGRATION_REVIEW',
    priority: overrides.priority || 'normal',
    areaScope: overrides.areaScope || (primaryAreaId ? 'AREAS' : 'ORGANISATION'),
    primaryAreaId,
    linkedAreaIds: overrides.linkedAreaIds || [],
    payload: {
      summary: title || body,
      originalText: body || title,
      integrationEvent: {
        sourceEventId: event.id,
        provider: event.provider,
        eventType: event.eventType,
        externalEventId: event.externalEventId
      }
    },
    suggestedChannel: 'none',
    suggestedAction: overrides.suggestedAction || 'Review the imported integration event.',
    initialNote: body || title
  };
}

async function publishNoticeFromEvent({ event, wineryId, userId, data, transaction }) {
  const noticePayload = buildNoticePayload(event, data.notice || {});
  const { primaryAreaId, linkedAreaIds, ...noticeFields } = noticePayload;
  const placement = await operationalAreaService.validateAreaPlacement({
    wineryId,
    userId,
    userRole: 'manager',
    areaScope: noticeFields.areaScope,
    primaryAreaId,
    linkedAreaIds,
    requireManage: true,
    transaction
  });
  const notice = await Notice.create({
    ...noticeFields,
    areaScope: placement.areaScope,
    wineryId,
    createdBy: userId,
    updatedBy: userId
  }, { transaction });

  if (placement.areaScope === 'AREAS') {
    await NoticeArea.bulkCreate(placement.areaIds.map(areaId => ({
      noticeId: notice.id,
      areaId,
      wineryId
    })), { transaction });
  }

  await addEventItemLink({ event, wineryId, userId, itemType: 'NOTICE', itemId: notice.id, itemKey: 'primary', transaction });

  const taskIds = Array.isArray(data.taskIds) ? data.taskIds : [];
  const uniqueTaskIds = [...new Set(taskIds.map(Number).filter(id => Number.isInteger(id) && id > 0))];
  if (uniqueTaskIds.length > 0) {
    const tasks = await Task.findAll({
      where: { id: { [Op.in]: uniqueTaskIds }, wineryId },
      attributes: ['id'],
      transaction
    });

    if (tasks.length !== uniqueTaskIds.length) {
      throw new NotFoundError('One or more linked tasks were not found.');
    }

    await NoticeTask.bulkCreate(
      uniqueTaskIds.map(taskId => ({
        noticeId: notice.id,
        taskId,
        wineryId,
        createdBy: userId
      })),
      { transaction, ignoreDuplicates: true }
    );
  }

  await event.update({
    status: 'PROCESSED',
    processingError: null,
    processedAt: new Date(),
    reviewedAt: new Date(),
    reviewedBy: userId,
    relatedRecordType: 'NOTICE',
    relatedRecordId: notice.id
  }, { transaction });

  return {
    noticeId: notice.id
  };
}

async function createTaskFromEvent({ event, wineryId, userId, userRole, data, transaction }) {
  const taskPayload = buildTaskPayload(event, data.task || {});
  const task = await taskService.createTask({
    wineryId,
    userId,
    userRole,
    source: 'integration_event',
    transaction,
    data: taskPayload
  });

  await addEventItemLink({ event, wineryId, userId, itemType: 'TASK', itemId: task.id, itemKey: 'primary', transaction });

  await event.update({
    status: 'PROCESSED',
    processingError: null,
    processedAt: new Date(),
    reviewedAt: new Date(),
    reviewedBy: userId,
    relatedRecordType: 'TASK',
    relatedRecordId: task.id
  }, { transaction });

  return {
    taskId: task.id
  };
}

async function linkEventToTask({ event, wineryId, userId, data, transaction }) {
  const taskId = Number(data.taskId);
  if (!Number.isInteger(taskId) || taskId < 1) {
    throw new ValidationError('A taskId is required when linking an event to an existing task.');
  }

  const task = await Task.findOne({ where: { id: taskId, wineryId }, transaction });
  if (!task) {
    throw new NotFoundError('Task not found');
  }

  await addEventItemLink({ event, wineryId, userId, itemType: 'TASK', itemId: task.id, itemKey: 'primary', linkType: 'LINKED', transaction });

  await event.update({
    status: 'PROCESSED',
    processingError: null,
    processedAt: new Date(),
    reviewedAt: new Date(),
    reviewedBy: userId,
    relatedRecordType: 'TASK',
    relatedRecordId: task.id
  }, { transaction });

  return {
    taskId: task.id
  };
}

function buildOperationalItemPayload(event, itemType, overrides = {}) {
  const normalized = getNormalizedPayload(event);
  const title = compactString(overrides.title || normalized.title || normalized.summary || event.eventType, 200);
  const body = compactString(overrides.body || normalized.body || normalized.summary || title, 10000);
  if (!title || !body) throw new ValidationError(`${itemType} items require a title and body.`);
  const primaryAreaId = overrides.primaryAreaId ?? event.confirmedAreaId ?? event.suggestedAreaId ?? null;
  return {
    ...overrides,
    title,
    body,
    originalText: overrides.originalText || body,
    sourceType: 'INTEGRATION',
    sourceEventId: event.id,
    priority: overrides.priority || 'normal',
    areaScope: overrides.areaScope || (primaryAreaId ? 'AREAS' : 'ORGANISATION'),
    primaryAreaId,
    linkedAreaIds: overrides.linkedAreaIds || [],
    aiSuggestedType: overrides.aiSuggestedType || null,
    aiConfidence: overrides.aiConfidence ?? null,
    aiSuggestion: overrides.aiSuggestion || null
  };
}

async function createNoticeItem({ event, wineryId, userId, data, transaction }) {
  const noticePayload = buildNoticePayload(event, data);
  const { primaryAreaId, linkedAreaIds, ...noticeFields } = noticePayload;
  const placement = await operationalAreaService.validateAreaPlacement({
    wineryId,
    userId,
    userRole: 'manager',
    areaScope: noticeFields.areaScope,
    primaryAreaId,
    linkedAreaIds,
    requireManage: true,
    transaction
  });
  const notice = await Notice.create({
    ...noticeFields,
    areaScope: placement.areaScope,
    wineryId,
    createdBy: userId,
    updatedBy: userId
  }, { transaction });
  if (placement.areaScope === 'AREAS') {
    await NoticeArea.bulkCreate(placement.areaIds.map(areaId => ({ noticeId: notice.id, areaId, wineryId })), { transaction });
  }
  return notice;
}

async function findBatchLinkTarget({ itemType, itemId, wineryId, transaction }) {
  const modelByType = {
    TASK: Task,
    NOTICE: Notice,
    REQUEST: OperationalRequest,
    NOTE: OperationalRecord
  };
  const model = modelByType[itemType];
  const item = model && await model.findOne({ where: { id: itemId, wineryId }, transaction });
  if (!item) throw new NotFoundError(`${itemType.toLowerCase()} not found`);
  return item;
}

async function createBatchItem({ event, item, index, wineryId, userId, userRole, transaction }) {
  const itemKey = item.key || `item-${index + 1}`;
  let target;
  if (item.mode === 'LINK') {
    target = await findBatchLinkTarget({ itemType: item.type, itemId: item.itemId, wineryId, transaction });
  } else if (item.type === 'TASK') {
    target = await taskService.createTask({
      wineryId,
      userId,
      userRole,
      source: 'integration_event',
      transaction,
      data: buildTaskPayload(event, item.data)
    });
  } else if (item.type === 'NOTICE') {
    target = await createNoticeItem({ event, wineryId, userId, data: item.data, transaction });
  } else if (item.type === 'REQUEST') {
    target = await operationalItemService.createRequest({
      wineryId,
      userId,
      userRole,
      transaction,
      data: buildOperationalItemPayload(event, 'REQUEST', item.data)
    });
  } else if (item.type === 'NOTE') {
    target = await operationalItemService.createRecord({
      wineryId,
      userId,
      userRole,
      transaction,
      data: buildOperationalItemPayload(event, 'NOTE', item.data)
    });
  }

  const link = await addEventItemLink({
    event,
    wineryId,
    userId,
    itemType: item.type,
    itemId: target.id,
    itemKey,
    linkType: item.mode === 'LINK' ? 'LINKED' : 'CREATED',
    transaction
  });
  return link.toJSON();
}

async function createItemsFromEvent({ event, wineryId, userId, userRole, data, transaction }) {
  const items = [];
  for (let index = 0; index < data.items.length; index += 1) {
    items.push(await createBatchItem({ event, item: data.items[index], index, wineryId, userId, userRole, transaction }));
  }
  const first = items[0];
  await event.update({
    status: 'PROCESSED',
    processingError: null,
    processedAt: new Date(),
    reviewedAt: new Date(),
    reviewedBy: userId,
    relatedRecordType: first.itemType,
    relatedRecordId: first.itemId
  }, { transaction });
  return { items };
}

function buildBatchReplay(event, data) {
  if (data.action !== 'create_items' || event.status !== 'PROCESSED' || !event.LinkedItems?.length) return null;
  const linkedByKey = new Map(event.LinkedItems.map(item => [item.itemKey, item]));
  const exactReplay = data.items.length === event.LinkedItems.length && data.items.every((item, index) => {
    const linked = linkedByKey.get(item.key || `item-${index + 1}`);
    return linked
      && linked.itemType === item.type
      && linked.linkType === (item.mode === 'LINK' ? 'LINKED' : 'CREATED')
      && (item.mode !== 'LINK' || Number(linked.itemId) === Number(item.itemId));
  });
  if (!exactReplay) throw new ValidationError('This integration event was already reviewed with a different item batch.');
  return {
    event: serializeIntegrationEvent(event),
    items: event.LinkedItems.map(item => item.toJSON()),
    duplicate: true
  };
}

async function updateEventTerminalState({ eventId, wineryId, userId, status, reason }) {
  const event = await IntegrationEvent.findOne({ where: { id: eventId, wineryId } });
  if (!event) {
    throw new NotFoundError('Integration event not found');
  }
  if (TERMINAL_STATUSES.has(event.status)) {
    throw new ValidationError('This integration event has already been reviewed.');
  }

  await event.update({
    status,
    processingError: reason || null,
    processedAt: new Date(),
    reviewedAt: new Date(),
    reviewedBy: userId
  });

  return {
    event: await getIntegrationEventById({ eventId, wineryId })
  };
}

async function reviewIntegrationEvent({ eventId, wineryId, userId, userRole, data }) {
  assertCanReview(userRole);

  if (data.action === 'ignore') {
    return updateEventTerminalState({
      eventId,
      wineryId,
      userId,
      status: 'IGNORED',
      reason: data.reason || null
    });
  }

  if (data.action === 'archive') {
    return updateEventTerminalState({
      eventId,
      wineryId,
      userId,
      status: 'ARCHIVED',
      reason: data.reason || null
    });
  }

  let event = await IntegrationEvent.findOne({ where: { id: eventId, wineryId }, include: getEventInclude() });
  if (!event) {
    throw new NotFoundError('Integration event not found');
  }
  if (TERMINAL_STATUSES.has(event.status)) {
    const replay = buildBatchReplay(event, data);
    if (replay) return replay;
    throw new ValidationError('This integration event has already been reviewed.');
  }

  const transaction = await IntegrationEvent.sequelize.transaction();
  let related = {};

  try {
    event = await IntegrationEvent.findOne({
      where: { id: eventId, wineryId },
      include: getEventInclude(),
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (TERMINAL_STATUSES.has(event.status)) {
      const replay = buildBatchReplay(event, data);
      if (replay) {
        await transaction.commit();
        return replay;
      }
      throw new ValidationError('This integration event has already been reviewed.');
    }
    const placementOverrides = data.action === 'publish_notice'
      ? (data.notice || {})
      : data.action === 'create_items'
        ? (data.items.find(item => item.mode !== 'LINK')?.data || {})
        : (data.task || {});
    const resolvedConfirmedAreaId = placementOverrides.areaScope === 'ORGANISATION'
      ? null
      : (placementOverrides.primaryAreaId || data.confirmedAreaId || event.suggestedAreaId || null);
    if (resolvedConfirmedAreaId) {
      const area = await OperationalArea.findOne({
        where: { id: resolvedConfirmedAreaId, wineryId, isActive: true },
        attributes: ['id'],
        transaction
      });
      if (!area) throw new ValidationError('Confirmed operational area is invalid or inactive.');
    }
    await event.update({
      confirmedAreaId: resolvedConfirmedAreaId,
      areaMappingSource: resolvedConfirmedAreaId ? 'MANUAL' : event.areaMappingSource
    }, { transaction });

    if (data.action === 'publish_notice') {
      related = await publishNoticeFromEvent({ event, wineryId, userId, data, transaction });
    } else if (data.action === 'create_task') {
      related = await createTaskFromEvent({ event, wineryId, userId, userRole, data, transaction });
    } else if (data.action === 'link_task') {
      related = await linkEventToTask({ event, wineryId, userId, data, transaction });
    } else if (data.action === 'create_items') {
      related = await createItemsFromEvent({ event, wineryId, userId, userRole, data, transaction });
    } else {
      throw new ValidationError('Unsupported integration event review action.');
    }

    await transaction.commit();
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    if (!TERMINAL_STATUSES.has(event.status)) {
      await event.update({
        status: 'FAILED',
        processingError: err.message,
        reviewedAt: new Date(),
        reviewedBy: userId
      }).catch(() => {});
    }
    throw err;
  }

  const response = {
    event: await getIntegrationEventById({ eventId, wineryId }),
    ...related
  };

  if (related.noticeId) {
    response.notice = await noticeService.getNoticeById({
      noticeId: related.noticeId,
      wineryId,
      userId,
      userRole
    });
  }

  if (related.taskId) {
    response.task = await taskService.getTaskById({ taskId: related.taskId, wineryId });
  }

  return response;
}

module.exports = {
  createIntegrationEvent,
  listIntegrationEvents,
  getIntegrationEventById,
  reviewIntegrationEvent,
  buildNoticePayload,
  buildTaskPayload
};
