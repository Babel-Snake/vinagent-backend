const { Op } = require('sequelize');
const {
  IntegrationEvent,
  Attachment,
  Member,
  OperationalArea,
  OperationalItemComment,
  OperationalItemAuditEvent,
  OperationalRecord,
  OperationalRecordArea,
  OperationalRecordRecipient,
  OperationalRequest,
  OperationalRequestArea,
  UserAreaMembership,
  User
} = require('../models');
const operationalAreaService = require('./operationalArea.service');
const { ForbiddenError, NotFoundError, ValidationError } = require('../utils/errors');

const USER_ATTRIBUTES = ['id', 'displayName', 'email', 'role'];

function areaInclude(wineryId) {
  return {
    model: OperationalArea,
    as: 'OperationalAreas',
    where: { wineryId },
    attributes: ['id', 'name', 'description', 'isActive', 'sortOrder'],
    through: { attributes: ['relationshipType'], where: { wineryId } },
    required: false
  };
}

function requestIncludes(wineryId) {
  return [
    areaInclude(wineryId),
    { model: User, as: 'Creator', where: { wineryId }, attributes: USER_ATTRIBUTES, required: false },
    { model: User, as: 'RequestedFrom', where: { wineryId }, attributes: USER_ATTRIBUTES, required: false },
    { model: User, as: 'DecisionMaker', where: { wineryId }, attributes: USER_ATTRIBUTES, required: false },
    { model: User, as: 'Confirmer', where: { wineryId }, attributes: USER_ATTRIBUTES, required: false }
  ];
}

function recordIncludes(wineryId) {
  return [
    areaInclude(wineryId),
    {
      model: User,
      as: 'Recipients',
      where: { wineryId },
      attributes: USER_ATTRIBUTES,
      through: { attributes: [], where: { wineryId } },
      required: false
    },
    { model: User, as: 'Creator', where: { wineryId }, attributes: USER_ATTRIBUTES, required: false },
    { model: User, as: 'Confirmer', where: { wineryId }, attributes: USER_ATTRIBUTES, required: false },
    { model: Member, where: { wineryId }, attributes: ['id', 'firstName', 'lastName', 'email', 'phone'], required: false }
  ];
}

function plain(value) {
  return value?.toJSON ? value.toJSON() : value;
}

function serializeItem(value) {
  const item = plain(value);
  if (!item) return item;
  const areas = item.OperationalAreas || [];
  const primary = areas.find(area => area.OperationalRequestArea?.relationshipType === 'PRIMARY'
    || area.OperationalRecordArea?.relationshipType === 'PRIMARY');
  return {
    ...item,
    aiConfidence: item.aiConfidence == null ? null : Number(item.aiConfidence),
    primaryAreaId: primary?.id || null,
    linkedAreaIds: areas.filter(area => Number(area.id) !== Number(primary?.id)).map(area => area.id),
    recipientUserIds: (item.Recipients || []).map(recipient => Number(recipient.id))
  };
}

function snapshot(value) {
  const item = serializeItem(value);
  if (!item) return null;
  return {
    id: item.id,
    title: item.title,
    body: item.body,
    subtype: item.subtype,
    recordType: item.recordType,
    status: item.status,
    priority: item.priority,
    response: item.response,
    dueAt: item.dueAt,
    occurredAt: item.occurredAt,
    requestedFromUserId: item.requestedFromUserId,
    memberId: item.memberId,
    recipientUserIds: item.recipientUserIds,
    areaScope: item.areaScope,
    primaryAreaId: item.primaryAreaId,
    linkedAreaIds: item.linkedAreaIds,
    updatedAt: item.updatedAt
  };
}

async function logAudit({ itemType, itemId, eventType, wineryId, actorUserId, beforeSnapshot = null, afterSnapshot = null, metadata = null, transaction }) {
  await OperationalItemAuditEvent.create({
    itemType,
    itemId,
    eventType,
    wineryId,
    actorUserId,
    beforeSnapshot,
    afterSnapshot,
    metadata
  }, { transaction });
}

async function replaceAreas({ joinModel, foreignKey, itemId, wineryId, placement, transaction }) {
  await joinModel.destroy({ where: { [foreignKey]: itemId, wineryId }, transaction });
  if (placement.areaScope !== 'AREAS') return;
  await joinModel.bulkCreate(placement.areaIds.map(areaId => ({
    [foreignKey]: itemId,
    areaId,
    wineryId,
    relationshipType: Number(areaId) === Number(placement.primaryAreaId) ? 'PRIMARY' : 'LINKED'
  })), { transaction });
}

async function replaceRecordRecipients({ recordId, wineryId, recipientUserIds, transaction }) {
  await OperationalRecordRecipient.destroy({ where: { recordId, wineryId }, transaction });
  if (recipientUserIds.length === 0) return;
  await OperationalRecordRecipient.bulkCreate(recipientUserIds.map(userId => ({
    wineryId,
    recordId,
    userId
  })), { transaction });
}

async function validateRecordRecipients({ recipientUserIds = [], wineryId, placement, transaction }) {
  const normalizedIds = [...new Set(recipientUserIds.map(Number).filter(Number.isInteger))];
  if (normalizedIds.length === 0) return [];

  const users = await User.findAll({
    where: { id: { [Op.in]: normalizedIds }, wineryId, isActive: true },
    attributes: USER_ATTRIBUTES,
    include: [{
      model: UserAreaMembership,
      as: 'AreaMemberships',
      where: { wineryId },
      attributes: ['areaId'],
      required: false
    }],
    transaction
  });
  if (users.length !== normalizedIds.length) {
    throw new ValidationError('One or more note recipients are invalid or inactive.');
  }

  if (placement.areaScope === 'AREAS') {
    const areaIds = new Set(placement.areaIds.map(Number));
    const cannotView = users.filter(user => {
      if (operationalAreaService.isGlobalManager(user.role)) return false;
      return !(user.AreaMemberships || []).some(membership => areaIds.has(Number(membership.areaId)));
    });
    if (cannotView.length > 0) {
      throw new ValidationError('Every note recipient must be able to view at least one selected operational area.');
    }
  }

  return normalizedIds;
}

async function validateRelatedUser(userId, wineryId, transaction) {
  if (!userId) return;
  const user = await User.findOne({ where: { id: userId, wineryId, isActive: true }, attributes: ['id'], transaction });
  if (!user) throw new ValidationError('Requested person is invalid or inactive.');
}

async function validateMember(memberId, wineryId, transaction) {
  if (!memberId) return;
  const member = await Member.findOne({ where: { id: memberId, wineryId }, attributes: ['id'], transaction });
  if (!member) throw new ValidationError('Related customer is invalid.');
}

async function validateSourceEvent(sourceEventId, wineryId, transaction) {
  if (!sourceEventId) return;
  const event = await IntegrationEvent.findOne({ where: { id: sourceEventId, wineryId }, attributes: ['id'], transaction });
  if (!event) throw new ValidationError('Source integration event is invalid.');
}

async function getItemAreaIds({ joinModel, foreignKey, itemId, wineryId, transaction = null }) {
  const rows = await joinModel.findAll({ where: { [foreignKey]: itemId, wineryId }, attributes: ['areaId'], transaction });
  return rows.map(row => Number(row.areaId));
}

async function canViewItem(item, { wineryId, userId, userRole, joinModel, foreignKey, transaction = null }) {
  const value = plain(item);
  if (!value || Number(value.wineryId) !== Number(wineryId)) return false;
  if (operationalAreaService.isGlobalManager(userRole)) return true;
  if (value.areaScope !== 'AREAS') return true;
  const itemAreaIds = await getItemAreaIds({ joinModel, foreignKey, itemId: value.id, wineryId, transaction });
  const { areaIds } = await operationalAreaService.getUserAreaAccess({ userId, wineryId, transaction });
  return itemAreaIds.some(areaId => areaIds.includes(areaId));
}

async function canManageItem(item, { wineryId, userId, userRole, joinModel, foreignKey, transaction = null }) {
  const value = plain(item);
  if (!value || Number(value.wineryId) !== Number(wineryId)) return false;
  if (operationalAreaService.isGlobalManager(userRole)) return true;
  if (value.areaScope !== 'AREAS') return false;
  const itemAreaIds = await getItemAreaIds({ joinModel, foreignKey, itemId: value.id, wineryId, transaction });
  const { managedAreaIds } = await operationalAreaService.getUserAreaAccess({ userId, wineryId, transaction });
  return itemAreaIds.length > 0 && itemAreaIds.every(areaId => managedAreaIds.includes(areaId));
}

async function visibleWhere({ wineryId, userId, userRole, joinModel, foreignKey }) {
  if (operationalAreaService.isGlobalManager(userRole)) return { wineryId };
  const { areaIds } = await operationalAreaService.getUserAreaAccess({ userId, wineryId });
  const rows = areaIds.length > 0
    ? await joinModel.findAll({ where: { wineryId, areaId: { [Op.in]: areaIds } }, attributes: [foreignKey] })
    : [];
  const itemIds = [...new Set(rows.map(row => Number(row[foreignKey])))];
  return {
    wineryId,
    [Op.or]: [
      { areaScope: 'ORGANISATION' },
      ...(itemIds.length > 0 ? [{ id: { [Op.in]: itemIds } }] : [])
    ]
  };
}

async function applyAreaFilter({ where, areaId, wineryId, joinModel, foreignKey }) {
  if (!areaId || areaId === 'all') return true;
  if (areaId === 'organisation') {
    where.areaScope = 'ORGANISATION';
    return true;
  }
  const rows = await joinModel.findAll({
    where: { wineryId, areaId: Number(areaId) },
    attributes: [foreignKey]
  });
  const itemIds = rows.map(row => Number(row[foreignKey]));
  if (itemIds.length === 0) return false;
  where.id = { [Op.in]: itemIds };
  return true;
}

async function getAuditEvents({ itemType, itemId, wineryId }) {
  return OperationalItemAuditEvent.findAll({
    where: { itemType, itemId, wineryId },
    include: [{ model: User, as: 'Actor', where: { wineryId }, attributes: USER_ATTRIBUTES, required: false }],
    order: [['createdAt', 'DESC'], ['id', 'DESC']]
  }).then(rows => rows.map(plain));
}

async function getVisibleOperationalItem({ itemType, itemId, wineryId, userId, userRole, transaction = null }) {
  const normalizedType = String(itemType || '').toUpperCase();
  const isRequest = normalizedType === 'REQUEST';
  const Model = isRequest ? OperationalRequest : normalizedType === 'NOTE' ? OperationalRecord : null;
  if (!Model) throw new ValidationError('Operational item type must be REQUEST or NOTE.');
  const joinModel = isRequest ? OperationalRequestArea : OperationalRecordArea;
  const foreignKey = isRequest ? 'requestId' : 'recordId';
  const item = await Model.findOne({ where: { id: itemId, wineryId }, transaction });
  if (!item || !(await canViewItem(item, { wineryId, userId, userRole, joinModel, foreignKey, transaction }))) {
    throw new NotFoundError(isRequest ? 'Request not found' : 'Operational record not found');
  }
  return item;
}

async function canManageOperationalItem({ itemType, item, wineryId, userId, userRole, transaction = null }) {
  const normalizedType = String(itemType || '').toUpperCase();
  const isRequest = normalizedType === 'REQUEST';
  if (!isRequest && normalizedType !== 'NOTE') return false;
  return canManageItem(item, {
    wineryId,
    userId,
    userRole,
    joinModel: isRequest ? OperationalRequestArea : OperationalRecordArea,
    foreignKey: isRequest ? 'requestId' : 'recordId',
    transaction
  });
}

async function createRequest({ wineryId, userId, userRole, data, transaction: externalTransaction = null }) {
  const ownsTransaction = !externalTransaction;
  const transaction = externalTransaction || await OperationalRequest.sequelize.transaction();
  try {
    const placement = await operationalAreaService.validateAreaPlacement({
      wineryId,
      userId,
      userRole,
      areaScope: data.areaScope,
      primaryAreaId: data.primaryAreaId,
      linkedAreaIds: data.linkedAreaIds,
      requireAccess: userRole === 'staff',
      transaction
    });
    await validateRelatedUser(data.requestedFromUserId, wineryId, transaction);
    await validateSourceEvent(data.sourceEventId, wineryId, transaction);
    const now = new Date();
    const item = await OperationalRequest.create({
      wineryId,
      title: data.title,
      body: data.body,
      originalText: data.originalText || data.body,
      subtype: data.subtype || null,
      priority: data.priority,
      dueAt: data.dueAt || null,
      requestedFromUserId: data.requestedFromUserId || null,
      sourceType: data.sourceType,
      sourceEventId: data.sourceEventId || null,
      areaScope: placement.areaScope,
      aiSuggestedType: data.aiSuggestedType || null,
      aiConfidence: data.aiConfidence ?? null,
      aiSuggestion: data.aiSuggestion || null,
      humanConfirmedType: 'REQUEST',
      confirmedBy: userId,
      confirmedAt: now,
      createdBy: userId,
      updatedBy: userId
    }, { transaction });
    await replaceAreas({ joinModel: OperationalRequestArea, foreignKey: 'requestId', itemId: item.id, wineryId, placement, transaction });
    await logAudit({
      itemType: 'REQUEST',
      itemId: item.id,
      eventType: 'CREATED',
      wineryId,
      actorUserId: userId,
      afterSnapshot: { id: item.id, title: item.title, status: item.status, areaScope: placement.areaScope, areaIds: placement.areaIds },
      metadata: { sourceType: item.sourceType, aiSuggestedType: item.aiSuggestedType, humanConfirmedType: 'REQUEST' },
      transaction
    });
    if (ownsTransaction) {
      await transaction.commit();
      return getRequestById({ requestId: item.id, wineryId, userId, userRole });
    }
    return { ...item.toJSON(), primaryAreaId: placement.primaryAreaId, linkedAreaIds: placement.areaIds.filter(id => id !== placement.primaryAreaId) };
  } catch (err) {
    if (ownsTransaction && !transaction.finished) await transaction.rollback();
    throw err;
  }
}

async function listRequests({ wineryId, userId, userRole, filters }) {
  const where = await visibleWhere({ wineryId, userId, userRole, joinModel: OperationalRequestArea, foreignKey: 'requestId' });
  if (filters.status && filters.status !== 'all') where.status = filters.status;
  if (filters.search) {
    const term = `%${filters.search}%`;
    const [commentRows, attachmentRows] = await Promise.all([
      OperationalItemComment.findAll({
        where: { wineryId, itemType: 'REQUEST', body: { [Op.like]: term } },
        attributes: ['itemId'], group: ['itemId']
      }),
      Attachment.findAll({
        where: { wineryId, entityType: 'REQUEST', deletedAt: null, [Op.or]: [{ filename: { [Op.like]: term } }, { originalFilename: { [Op.like]: term } }] },
        attributes: ['entityId']
      })
    ]);
    const commentItemIds = [...new Set([...commentRows.map(row => Number(row.itemId)), ...attachmentRows.map(row => Number(row.entityId))])];
    where[Op.and] = [{
      [Op.or]: [
        { title: { [Op.like]: term } },
        { body: { [Op.like]: term } },
        { originalText: { [Op.like]: term } },
        { subtype: { [Op.like]: term } },
        ...(commentItemIds.length > 0 ? [{ id: { [Op.in]: commentItemIds } }] : [])
      ]
    }];
  }
  if (!(await applyAreaFilter({ where, areaId: filters.areaId, wineryId, joinModel: OperationalRequestArea, foreignKey: 'requestId' }))) {
    return { requests: [], pagination: { page: filters.page, pageSize: filters.pageSize, total: 0, totalPages: 0 } };
  }
  const { rows, count } = await OperationalRequest.findAndCountAll({
    where,
    include: requestIncludes(wineryId),
    distinct: true,
    order: [['createdAt', filters.sortBy === 'oldest' ? 'ASC' : 'DESC'], ['id', filters.sortBy === 'oldest' ? 'ASC' : 'DESC']],
    limit: filters.pageSize,
    offset: (filters.page - 1) * filters.pageSize
  });
  return {
    requests: rows.map(serializeItem),
    pagination: { page: filters.page, pageSize: filters.pageSize, total: count, totalPages: Math.ceil(count / filters.pageSize) }
  };
}

async function getRequestById({ requestId, wineryId, userId, userRole, transaction = null }) {
  const item = await OperationalRequest.findOne({ where: { id: requestId, wineryId }, include: requestIncludes(wineryId), transaction });
  if (!item || !(await canViewItem(item, { wineryId, userId, userRole, joinModel: OperationalRequestArea, foreignKey: 'requestId', transaction }))) {
    throw new NotFoundError('Request not found');
  }
  const result = serializeItem(item);
  result.AuditEvents = await getAuditEvents({ itemType: 'REQUEST', itemId: item.id, wineryId });
  return result;
}

async function updateRequest({ requestId, wineryId, userId, userRole, data }) {
  const transaction = await OperationalRequest.sequelize.transaction();
  try {
    const item = await OperationalRequest.findOne({ where: { id: requestId, wineryId }, transaction });
    if (!item || !(await canViewItem(item, { wineryId, userId, userRole, joinModel: OperationalRequestArea, foreignKey: 'requestId', transaction }))) {
      throw new NotFoundError('Request not found');
    }
    if (item.status !== 'PENDING') throw new ValidationError('Only pending requests can be edited.');
    const manager = await canManageItem(item, { wineryId, userId, userRole, joinModel: OperationalRequestArea, foreignKey: 'requestId', transaction });
    if (!manager && Number(item.createdBy) !== Number(userId)) throw new ForbiddenError('You cannot update this request.');
    const before = snapshot(item);
    let placement = null;
    if (data.areaScope !== undefined || data.primaryAreaId !== undefined || data.linkedAreaIds !== undefined) {
      const current = await OperationalRequestArea.findAll({ where: { requestId: item.id, wineryId }, transaction });
      const primary = current.find(link => link.relationshipType === 'PRIMARY');
      placement = await operationalAreaService.validateAreaPlacement({
        wineryId,
        userId,
        userRole,
        areaScope: data.areaScope || item.areaScope,
        primaryAreaId: data.primaryAreaId !== undefined ? data.primaryAreaId : primary?.areaId || null,
        linkedAreaIds: data.linkedAreaIds !== undefined ? data.linkedAreaIds : current.filter(link => link.relationshipType !== 'PRIMARY').map(link => link.areaId),
        requireManage: true,
        transaction
      });
    }
    await validateRelatedUser(data.requestedFromUserId, wineryId, transaction);
    for (const field of ['title', 'body', 'subtype', 'priority', 'dueAt', 'requestedFromUserId']) {
      if (data[field] !== undefined) item[field] = data[field] || null;
    }
    if (placement) item.areaScope = placement.areaScope;
    item.updatedBy = userId;
    await item.save({ transaction });
    if (placement) await replaceAreas({ joinModel: OperationalRequestArea, foreignKey: 'requestId', itemId: item.id, wineryId, placement, transaction });
    await logAudit({ itemType: 'REQUEST', itemId: item.id, eventType: 'UPDATED', wineryId, actorUserId: userId, beforeSnapshot: before, afterSnapshot: snapshot(item), transaction });
    await transaction.commit();
    return getRequestById({ requestId: item.id, wineryId, userId, userRole });
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    throw err;
  }
}

async function decideRequest({ requestId, wineryId, userId, userRole, data }) {
  const transaction = await OperationalRequest.sequelize.transaction();
  try {
    const item = await OperationalRequest.findOne({ where: { id: requestId, wineryId }, transaction });
    if (!item || !(await canViewItem(item, { wineryId, userId, userRole, joinModel: OperationalRequestArea, foreignKey: 'requestId', transaction }))) {
      throw new NotFoundError('Request not found');
    }
    if (item.status !== 'PENDING') throw new ValidationError('This request has already been decided or cancelled.');
    const manager = await canManageItem(item, { wineryId, userId, userRole, joinModel: OperationalRequestArea, foreignKey: 'requestId', transaction });
    const isTarget = Number(item.requestedFromUserId) === Number(userId);
    const isCreator = Number(item.createdBy) === Number(userId);
    if (data.status === 'CANCELLED') {
      if (!manager && !isCreator) throw new ForbiddenError('Only the requester or a relevant manager can cancel this request.');
    } else if (!manager && !isTarget) {
      throw new ForbiddenError('Only the requested person or a relevant manager can decide this request.');
    }
    const before = snapshot(item);
    item.status = data.status;
    item.response = data.response || null;
    item.decisionBy = userId;
    item.decidedAt = new Date();
    item.updatedBy = userId;
    await item.save({ transaction });
    await logAudit({ itemType: 'REQUEST', itemId: item.id, eventType: data.status, wineryId, actorUserId: userId, beforeSnapshot: before, afterSnapshot: snapshot(item), transaction });
    await transaction.commit();
    return getRequestById({ requestId: item.id, wineryId, userId, userRole });
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    throw err;
  }
}

async function createRecord({ wineryId, userId, userRole, data, transaction: externalTransaction = null }) {
  const ownsTransaction = !externalTransaction;
  const transaction = externalTransaction || await OperationalRecord.sequelize.transaction();
  try {
    const placement = await operationalAreaService.validateAreaPlacement({
      wineryId,
      userId,
      userRole,
      areaScope: data.areaScope,
      primaryAreaId: data.primaryAreaId,
      linkedAreaIds: data.linkedAreaIds,
      requireAccess: userRole === 'staff',
      transaction
    });
    await validateMember(data.memberId, wineryId, transaction);
    await validateSourceEvent(data.sourceEventId, wineryId, transaction);
    const recipientUserIds = await validateRecordRecipients({
      recipientUserIds: data.recipientUserIds,
      wineryId,
      placement,
      transaction
    });
    const now = new Date();
    const item = await OperationalRecord.create({
      wineryId,
      title: data.title,
      body: data.body,
      originalText: data.originalText || data.body,
      recordType: data.recordType || null,
      sourceType: data.sourceType,
      sourceReference: data.sourceReference || null,
      occurredAt: data.occurredAt || now,
      memberId: data.memberId || null,
      sourceEventId: data.sourceEventId || null,
      metadata: data.metadata || null,
      areaScope: placement.areaScope,
      aiSuggestedType: data.aiSuggestedType || null,
      aiConfidence: data.aiConfidence ?? null,
      aiSuggestion: data.aiSuggestion || null,
      humanConfirmedType: 'NOTE',
      confirmedBy: userId,
      confirmedAt: now,
      createdBy: userId,
      updatedBy: userId
    }, { transaction });
    await replaceAreas({ joinModel: OperationalRecordArea, foreignKey: 'recordId', itemId: item.id, wineryId, placement, transaction });
    await replaceRecordRecipients({ recordId: item.id, wineryId, recipientUserIds, transaction });
    await logAudit({
      itemType: 'NOTE',
      itemId: item.id,
      eventType: 'CREATED',
      wineryId,
      actorUserId: userId,
      afterSnapshot: { id: item.id, title: item.title, areaScope: placement.areaScope, areaIds: placement.areaIds, recipientUserIds },
      metadata: { sourceType: item.sourceType, aiSuggestedType: item.aiSuggestedType, humanConfirmedType: 'NOTE' },
      transaction
    });
    if (ownsTransaction) {
      await transaction.commit();
      return getRecordById({ recordId: item.id, wineryId, userId, userRole });
    }
    return { ...item.toJSON(), primaryAreaId: placement.primaryAreaId, linkedAreaIds: placement.areaIds.filter(id => id !== placement.primaryAreaId), recipientUserIds };
  } catch (err) {
    if (ownsTransaction && !transaction.finished) await transaction.rollback();
    throw err;
  }
}

async function listRecords({ wineryId, userId, userRole, filters }) {
  const where = await visibleWhere({ wineryId, userId, userRole, joinModel: OperationalRecordArea, foreignKey: 'recordId' });
  if (filters.directedToMe) {
    const { areaIds } = await operationalAreaService.getUserAreaAccess({ userId, wineryId });
    const [directRows, areaRows] = await Promise.all([
      OperationalRecordRecipient.findAll({ where: { wineryId, userId }, attributes: ['recordId'] }),
      areaIds.length > 0
        ? OperationalRecordArea.findAll({ where: { wineryId, areaId: { [Op.in]: areaIds } }, attributes: ['recordId'] })
        : Promise.resolve([])
    ]);
    const targetedIds = [...new Set([
      ...directRows.map(row => Number(row.recordId)),
      ...areaRows.map(row => Number(row.recordId))
    ])];
    if (targetedIds.length === 0) {
      return { records: [], pagination: { page: filters.page, pageSize: filters.pageSize, total: 0, totalPages: 0 } };
    }
    where[Op.and] = [...(where[Op.and] || []), { id: { [Op.in]: targetedIds } }];
  }
  if (filters.search) {
    const term = `%${filters.search}%`;
    const [commentRows, memberRows, attachmentRows] = await Promise.all([
      OperationalItemComment.findAll({
        where: { wineryId, itemType: 'NOTE', body: { [Op.like]: term } },
        attributes: ['itemId'],
        group: ['itemId']
      }),
      Member.findAll({
        where: {
          wineryId,
          [Op.or]: [
            { firstName: { [Op.like]: term } },
            { lastName: { [Op.like]: term } },
            { email: { [Op.like]: term } },
            { phone: { [Op.like]: term } }
          ]
        },
        attributes: ['id']
      }),
      Attachment.findAll({
        where: { wineryId, entityType: 'NOTE', deletedAt: null, [Op.or]: [{ filename: { [Op.like]: term } }, { originalFilename: { [Op.like]: term } }] },
        attributes: ['entityId']
      })
    ]);
    const commentItemIds = [...new Set([...commentRows.map(row => Number(row.itemId)), ...attachmentRows.map(row => Number(row.entityId))])];
    const memberIds = memberRows.map(row => Number(row.id));
    where[Op.and] = [...(where[Op.and] || []), {
      [Op.or]: [
        { title: { [Op.like]: term } },
        { body: { [Op.like]: term } },
        { originalText: { [Op.like]: term } },
        { recordType: { [Op.like]: term } },
        { sourceReference: { [Op.like]: term } },
        ...(commentItemIds.length > 0 ? [{ id: { [Op.in]: commentItemIds } }] : []),
        ...(memberIds.length > 0 ? [{ memberId: { [Op.in]: memberIds } }] : [])
      ]
    }];
  }
  if (!(await applyAreaFilter({ where, areaId: filters.areaId, wineryId, joinModel: OperationalRecordArea, foreignKey: 'recordId' }))) {
    return { records: [], pagination: { page: filters.page, pageSize: filters.pageSize, total: 0, totalPages: 0 } };
  }
  const { rows, count } = await OperationalRecord.findAndCountAll({
    where,
    include: recordIncludes(wineryId),
    distinct: true,
    order: [['occurredAt', filters.sortBy === 'oldest' ? 'ASC' : 'DESC'], ['id', filters.sortBy === 'oldest' ? 'ASC' : 'DESC']],
    limit: filters.pageSize,
    offset: (filters.page - 1) * filters.pageSize
  });
  return {
    records: rows.map(serializeItem),
    pagination: { page: filters.page, pageSize: filters.pageSize, total: count, totalPages: Math.ceil(count / filters.pageSize) }
  };
}

async function getRecordById({ recordId, wineryId, userId, userRole, transaction = null }) {
  const item = await OperationalRecord.findOne({ where: { id: recordId, wineryId }, include: recordIncludes(wineryId), transaction });
  if (!item || !(await canViewItem(item, { wineryId, userId, userRole, joinModel: OperationalRecordArea, foreignKey: 'recordId', transaction }))) {
    throw new NotFoundError('Operational record not found');
  }
  const result = serializeItem(item);
  result.AuditEvents = await getAuditEvents({ itemType: 'NOTE', itemId: item.id, wineryId });
  return result;
}

async function updateRecord({ recordId, wineryId, userId, userRole, data }) {
  const transaction = await OperationalRecord.sequelize.transaction();
  try {
    const item = await OperationalRecord.findOne({ where: { id: recordId, wineryId }, transaction });
    if (!item || !(await canViewItem(item, { wineryId, userId, userRole, joinModel: OperationalRecordArea, foreignKey: 'recordId', transaction }))) {
      throw new NotFoundError('Operational record not found');
    }
    const manager = await canManageItem(item, { wineryId, userId, userRole, joinModel: OperationalRecordArea, foreignKey: 'recordId', transaction });
    if (!manager && Number(item.createdBy) !== Number(userId)) throw new ForbiddenError('You cannot update this operational record.');
    const [currentAreaLinks, currentRecipientLinks] = await Promise.all([
      OperationalRecordArea.findAll({ where: { recordId: item.id, wineryId }, transaction }),
      OperationalRecordRecipient.findAll({ where: { recordId: item.id, wineryId }, attributes: ['userId'], transaction })
    ]);
    const currentRecipientUserIds = currentRecipientLinks.map(link => Number(link.userId));
    const before = { ...snapshot(item), recipientUserIds: currentRecipientUserIds };
    let placement = null;
    if (data.areaScope !== undefined || data.primaryAreaId !== undefined || data.linkedAreaIds !== undefined) {
      const primary = currentAreaLinks.find(link => link.relationshipType === 'PRIMARY');
      placement = await operationalAreaService.validateAreaPlacement({
        wineryId,
        userId,
        userRole,
        areaScope: data.areaScope || item.areaScope,
        primaryAreaId: data.primaryAreaId !== undefined ? data.primaryAreaId : primary?.areaId || null,
        linkedAreaIds: data.linkedAreaIds !== undefined ? data.linkedAreaIds : currentAreaLinks.filter(link => link.relationshipType !== 'PRIMARY').map(link => link.areaId),
        requireManage: true,
        transaction
      });
    }
    const currentPrimary = currentAreaLinks.find(link => link.relationshipType === 'PRIMARY');
    const recipientPlacement = placement || {
      areaScope: item.areaScope,
      primaryAreaId: currentPrimary?.areaId || null,
      areaIds: currentAreaLinks.map(link => Number(link.areaId))
    };
    const recipientUserIds = await validateRecordRecipients({
      recipientUserIds: data.recipientUserIds !== undefined ? data.recipientUserIds : currentRecipientUserIds,
      wineryId,
      placement: recipientPlacement,
      transaction
    });
    await validateMember(data.memberId, wineryId, transaction);
    for (const field of ['title', 'body', 'recordType', 'sourceReference', 'occurredAt', 'memberId', 'metadata']) {
      if (data[field] !== undefined) item[field] = data[field] || null;
    }
    if (placement) item.areaScope = placement.areaScope;
    item.updatedBy = userId;
    await item.save({ transaction });
    if (placement) await replaceAreas({ joinModel: OperationalRecordArea, foreignKey: 'recordId', itemId: item.id, wineryId, placement, transaction });
    if (data.recipientUserIds !== undefined) await replaceRecordRecipients({ recordId: item.id, wineryId, recipientUserIds, transaction });
    await logAudit({ itemType: 'NOTE', itemId: item.id, eventType: 'UPDATED', wineryId, actorUserId: userId, beforeSnapshot: before, afterSnapshot: { ...snapshot(item), recipientUserIds }, transaction });
    await transaction.commit();
    return getRecordById({ recordId: item.id, wineryId, userId, userRole });
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    throw err;
  }
}

module.exports = {
  createRequest,
  listRequests,
  getRequestById,
  updateRequest,
  decideRequest,
  createRecord,
  listRecords,
  getRecordById,
  updateRecord,
  getVisibleOperationalItem,
  canManageOperationalItem,
  logAudit
};
