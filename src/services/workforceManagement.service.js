const crypto = require('crypto');
const { Op } = require('sequelize');
const models = require('../models');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { stableSerialize } = require('./integrationDataFoundation.service');
const {
  ROLE_SKILL_DEFINITION_KINDS,
  STAFF_EMPLOYMENT_STATUSES,
  STAFF_ROLE_SKILL_STATUSES,
  WORKFORCE_DEMAND_MAPPING_STATUSES,
  WORKFORCE_DEMAND_SOURCE_RECORD_TYPES
} = require('./integrationDataRegistry.service');

const pagination = (result, page, pageSize) => ({
  page,
  pageSize,
  total: result.count,
  totalPages: Math.ceil(result.count / pageSize)
});

function normalizeCode(value, label = 'code') {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized || normalized.length > 160 || !/^[a-z0-9][a-z0-9_.:-]*$/.test(normalized)) {
    throw new ValidationError('Workforce ' + label + ' is invalid');
  }
  return normalized;
}

function requestHash(data) {
  const safe = { ...data };
  delete safe.requestId;
  delete safe.reason;
  return crypto.createHash('sha256').update(stableSerialize(safe)).digest('hex');
}

async function requireActor({ wineryId, actorUserId, transaction }) {
  const actor = await models.User.findOne({
    where: { id: actorUserId, wineryId },
    attributes: ['id'],
    transaction
  });
  if (!actor) throw new ValidationError('Workforce actor does not belong to the winery');
}

async function existingAudit({ wineryId, action, requestId, expectedHash, model, transaction }) {
  const audit = await models.IntegrationOperationAuditEvent.findOne({
    where: { wineryId, action, requestId },
    transaction
  });
  if (!audit) return null;
  if (audit.metadata?.requestHash !== expectedHash) {
    throw new ValidationError('requestId was already used for a different workforce change');
  }
  const row = await model.findOne({ where: { id: Number(audit.targetId), wineryId }, transaction });
  if (!row) throw new NotFoundError('Previously audited workforce target no longer exists');
  return row;
}

async function writeAudit({
  wineryId,
  actorUserId,
  action,
  targetType,
  targetId,
  connectionId = null,
  resourceType,
  requestId,
  reason,
  beforeSnapshot,
  afterSnapshot,
  hash,
  transaction
}) {
  return models.IntegrationOperationAuditEvent.create({
    wineryId,
    actorUserId,
    action,
    targetType,
    targetId: String(targetId),
    connectionId,
    resourceType,
    requestId,
    reason,
    beforeSnapshot,
    afterSnapshot,
    metadata: { requestHash: hash }
  }, { transaction });
}

const identitySnapshot = row => ({
  id: row.id,
  userId: row.userId,
  wineryContactId: row.wineryContactId,
  displayName: row.displayName,
  employmentStatus: row.employmentStatus,
  isActive: row.isActive,
  resolutionQuality: row.resolutionQuality
});

async function validateIdentityLinks({ wineryId, data, transaction }) {
  const [user, contact] = await Promise.all([
    data.userId
      ? models.User.findOne({ where: { id: data.userId, wineryId }, attributes: ['id'], transaction })
      : null,
    data.wineryContactId
      ? models.WineryContact.findOne({
        where: { id: data.wineryContactId, wineryId },
        attributes: ['id'],
        transaction
      })
      : null
  ]);
  if (data.userId && !user) throw new ValidationError('Staff identity User does not belong to the winery');
  if (data.wineryContactId && !contact) {
    throw new ValidationError('Staff identity Winery Contact does not belong to the winery');
  }
}

async function upsertStaffIdentity({ wineryId, actorUserId, data }) {
  if (!STAFF_EMPLOYMENT_STATUSES.includes(data.employmentStatus)) {
    throw new ValidationError('Staff employment status is unsupported');
  }
  const hash = requestHash(data);
  return models.sequelize.transaction(async transaction => {
    await requireActor({ wineryId, actorUserId, transaction });
    const duplicate = await existingAudit({
      wineryId,
      action: 'STAFF_IDENTITY_UPSERTED',
      requestId: data.requestId,
      expectedHash: hash,
      model: models.StaffIdentity,
      transaction
    });
    if (duplicate) return { staffIdentity: duplicate, duplicate: true };
    await validateIdentityLinks({ wineryId, data, transaction });
    const candidates = [];
    if (data.id) {
      const byId = await models.StaffIdentity.findOne({
        where: { id: data.id, wineryId },
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!byId) throw new NotFoundError('Staff identity not found');
      candidates.push(byId);
    }
    if (data.userId) {
      const byUser = await models.StaffIdentity.findOne({
        where: { userId: data.userId },
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (byUser) candidates.push(byUser);
    }
    if (data.wineryContactId) {
      const byContact = await models.StaffIdentity.findOne({
        where: { wineryContactId: data.wineryContactId },
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (byContact) candidates.push(byContact);
    }
    const uniqueIds = [...new Set(candidates.map(row => row.id))];
    if (uniqueIds.length > 1) {
      throw new ValidationError('User and Winery Contact are already linked to different staff identities');
    }
    let identity = candidates[0] || null;
    const beforeSnapshot = identity ? identitySnapshot(identity) : null;
    const values = {
      wineryId,
      userId: data.userId || null,
      wineryContactId: data.wineryContactId || null,
      displayName: String(data.displayName).trim(),
      employmentStatus: data.employmentStatus,
      isActive: data.isActive,
      resolutionQuality: 'MANAGER_CONFIRMED',
      updatedBy: actorUserId
    };
    identity = identity
      ? await identity.update(values, { transaction })
      : await models.StaffIdentity.create({
        ...values,
        createdBy: actorUserId
      }, { transaction });
    await writeAudit({
      wineryId,
      actorUserId,
      action: 'STAFF_IDENTITY_UPSERTED',
      targetType: 'STAFF_IDENTITY',
      targetId: identity.id,
      resourceType: 'STAFF_IDENTITY',
      requestId: data.requestId,
      reason: data.reason,
      beforeSnapshot,
      afterSnapshot: identitySnapshot(identity),
      hash,
      transaction
    });
    return { staffIdentity: identity, duplicate: false };
  });
}

const definitionSnapshot = row => ({
  id: row.id,
  definitionKind: row.definitionKind,
  code: row.code,
  normalizedCode: row.normalizedCode,
  name: row.name,
  description: row.description,
  isActive: row.isActive
});

async function upsertRoleSkillDefinition({ wineryId, actorUserId, data }) {
  if (!ROLE_SKILL_DEFINITION_KINDS.includes(data.definitionKind)) {
    throw new ValidationError('Role/skill definition kind is unsupported');
  }
  const normalized = normalizeCode(data.code, 'role/skill code');
  const hash = requestHash({ ...data, code: normalized });
  return models.sequelize.transaction(async transaction => {
    await requireActor({ wineryId, actorUserId, transaction });
    const duplicate = await existingAudit({
      wineryId,
      action: 'ROLE_SKILL_DEFINITION_UPSERTED',
      requestId: data.requestId,
      expectedHash: hash,
      model: models.RoleSkillDefinition,
      transaction
    });
    if (duplicate) return { roleSkillDefinition: duplicate, duplicate: true };
    let definition = data.id
      ? await models.RoleSkillDefinition.findOne({
        where: { id: data.id, wineryId },
        transaction,
        lock: transaction.LOCK.UPDATE
      })
      : await models.RoleSkillDefinition.findOne({
        where: { wineryId, definitionKind: data.definitionKind, normalizedCode: normalized },
        transaction,
        lock: transaction.LOCK.UPDATE
      });
    if (data.id && !definition) throw new NotFoundError('Role/skill definition not found');
    const beforeSnapshot = definition ? definitionSnapshot(definition) : null;
    const values = {
      wineryId,
      definitionKind: data.definitionKind,
      code: String(data.code).trim(),
      normalizedCode: normalized,
      name: String(data.name).trim(),
      description: data.description || null,
      isActive: data.isActive,
      updatedBy: actorUserId
    };
    definition = definition
      ? await definition.update(values, { transaction })
      : await models.RoleSkillDefinition.create({
        ...values,
        createdBy: actorUserId
      }, { transaction });
    await writeAudit({
      wineryId,
      actorUserId,
      action: 'ROLE_SKILL_DEFINITION_UPSERTED',
      targetType: 'ROLE_SKILL_DEFINITION',
      targetId: definition.id,
      resourceType: data.definitionKind,
      requestId: data.requestId,
      reason: data.reason,
      beforeSnapshot,
      afterSnapshot: definitionSnapshot(definition),
      hash,
      transaction
    });
    return { roleSkillDefinition: definition, duplicate: false };
  });
}

const assignmentSnapshot = row => ({
  id: row.id,
  staffIdentityId: row.staffIdentityId,
  definitionId: row.definitionId,
  status: row.status,
  proficiencyLevel: row.proficiencyLevel,
  validFrom: row.validFrom,
  validTo: row.validTo,
  confirmationStatus: row.confirmationStatus
});

async function upsertStaffRoleSkill({ wineryId, actorUserId, data }) {
  if (!STAFF_ROLE_SKILL_STATUSES.includes(data.status)) {
    throw new ValidationError('Staff role/skill status is unsupported');
  }
  if (data.validFrom && data.validTo && new Date(data.validTo) <= new Date(data.validFrom)) {
    throw new ValidationError('Staff role/skill validTo must be later than validFrom');
  }
  const hash = requestHash(data);
  return models.sequelize.transaction(async transaction => {
    await requireActor({ wineryId, actorUserId, transaction });
    const duplicate = await existingAudit({
      wineryId,
      action: 'STAFF_ROLE_SKILL_UPSERTED',
      requestId: data.requestId,
      expectedHash: hash,
      model: models.StaffRoleSkill,
      transaction
    });
    if (duplicate) return { staffRoleSkill: duplicate, duplicate: true };
    const [identity, definition] = await Promise.all([
      models.StaffIdentity.findOne({
        where: { id: data.staffIdentityId, wineryId, isActive: true },
        attributes: ['id'],
        transaction
      }),
      models.RoleSkillDefinition.findOne({
        where: { id: data.definitionId, wineryId, isActive: true },
        attributes: ['id'],
        transaction
      })
    ]);
    if (!identity) throw new ValidationError('Staff role/skill identity is not active in this winery');
    if (!definition) throw new ValidationError('Staff role/skill definition is not active in this winery');
    let assignment = await models.StaffRoleSkill.findOne({
      where: {
        staffIdentityId: data.staffIdentityId,
        definitionId: data.definitionId
      },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    const beforeSnapshot = assignment ? assignmentSnapshot(assignment) : null;
    const values = {
      wineryId,
      staffIdentityId: data.staffIdentityId,
      definitionId: data.definitionId,
      sourceReferenceId: null,
      status: data.status,
      proficiencyLevel: data.proficiencyLevel || null,
      validFrom: data.validFrom || null,
      validTo: data.validTo || null,
      confirmationStatus: 'MANAGER_CONFIRMED',
      confirmedBy: actorUserId,
      metadata: null
    };
    assignment = assignment
      ? await assignment.update(values, { transaction })
      : await models.StaffRoleSkill.create(values, { transaction });
    await writeAudit({
      wineryId,
      actorUserId,
      action: 'STAFF_ROLE_SKILL_UPSERTED',
      targetType: 'STAFF_ROLE_SKILL',
      targetId: assignment.id,
      resourceType: 'STAFF_IDENTITY',
      requestId: data.requestId,
      reason: data.reason,
      beforeSnapshot,
      afterSnapshot: assignmentSnapshot(assignment),
      hash,
      transaction
    });
    return { staffRoleSkill: assignment, duplicate: false };
  });
}

function buildDemandMappingKey(data) {
  return crypto.createHash('sha256').update(stableSerialize({
    sourceRecordType: data.sourceRecordType,
    sourceConnectionId: data.sourceConnectionId || null,
    sourceCodeNormalized: normalizeCode(data.sourceCode, 'demand source code'),
    definitionId: data.definitionId,
    areaId: data.areaId || null,
    locationId: data.locationId || null
  })).digest('hex');
}

const demandMappingSnapshot = row => ({
  id: row.id,
  sourceRecordType: row.sourceRecordType,
  sourceConnectionId: row.sourceConnectionId,
  sourceCode: row.sourceCode,
  sourceCodeNormalized: row.sourceCodeNormalized,
  mappingKey: row.mappingKey,
  definitionId: row.definitionId,
  areaId: row.areaId,
  locationId: row.locationId,
  headcountMultiplier: Number(row.headcountMultiplier),
  bufferBeforeMinutes: row.bufferBeforeMinutes,
  bufferAfterMinutes: row.bufferAfterMinutes,
  status: row.status,
  confirmationStatus: row.confirmationStatus
});

async function validateDemandMappingTargets({ wineryId, data, transaction }) {
  const [definition, area, location, connection] = await Promise.all([
    models.RoleSkillDefinition.findOne({
      where: { id: data.definitionId, wineryId, isActive: true },
      attributes: ['id'],
      transaction
    }),
    data.areaId
      ? models.OperationalArea.findOne({
        where: { id: data.areaId, wineryId, isActive: true },
        attributes: ['id'],
        transaction
      })
      : null,
    data.locationId
      ? models.WineryLocation.findOne({
        where: { id: data.locationId, wineryId, isActive: true },
        attributes: ['id'],
        transaction
      })
      : null,
    data.sourceConnectionId
      ? models.IntegrationConnection.findOne({
        where: { id: data.sourceConnectionId, wineryId },
        attributes: ['id'],
        transaction
      })
      : null
  ]);
  if (!definition) throw new ValidationError('Workforce demand definition is not active in this winery');
  if (data.areaId && !area) throw new ValidationError('Workforce demand area is not active in this winery');
  if (data.locationId && !location) {
    throw new ValidationError('Workforce demand location is not active in this winery');
  }
  if (data.sourceConnectionId && !connection) {
    throw new ValidationError('Workforce demand source connection does not belong to the winery');
  }
  if (connection) {
    const scope = await models.IntegrationConnectionScope.findOne({
      where: {
        wineryId,
        connectionId: connection.id,
        domain: 'BOOKING',
        isActive: true
      },
      attributes: ['id'],
      transaction
    });
    if (!scope) {
      throw new ValidationError('Workforce demand source connection has no active BOOKING scope');
    }
  }
}

async function upsertWorkforceDemandMapping({ wineryId, actorUserId, data }) {
  if (!WORKFORCE_DEMAND_SOURCE_RECORD_TYPES.includes(data.sourceRecordType)) {
    throw new ValidationError('Workforce demand source record type is unsupported');
  }
  if (!WORKFORCE_DEMAND_MAPPING_STATUSES.includes(data.status)) {
    throw new ValidationError('Workforce demand mapping status is unsupported');
  }
  const mappingKey = buildDemandMappingKey(data);
  const hash = requestHash({ ...data, mappingKey });
  return models.sequelize.transaction(async transaction => {
    await requireActor({ wineryId, actorUserId, transaction });
    const duplicate = await existingAudit({
      wineryId,
      action: 'WORKFORCE_DEMAND_MAPPING_UPSERTED',
      requestId: data.requestId,
      expectedHash: hash,
      model: models.WorkforceDemandMapping,
      transaction
    });
    if (duplicate) return { workforceDemandMapping: duplicate, duplicate: true };
    await validateDemandMappingTargets({ wineryId, data, transaction });
    let mapping = await models.WorkforceDemandMapping.findOne({
      where: { wineryId, mappingKey },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    const beforeSnapshot = mapping ? demandMappingSnapshot(mapping) : null;
    const values = {
      wineryId,
      sourceRecordType: data.sourceRecordType,
      sourceConnectionId: data.sourceConnectionId || null,
      sourceCode: String(data.sourceCode).trim(),
      sourceCodeNormalized: normalizeCode(data.sourceCode, 'demand source code'),
      mappingKey,
      definitionId: data.definitionId,
      areaId: data.areaId || null,
      locationId: data.locationId || null,
      headcountMultiplier: data.headcountMultiplier,
      bufferBeforeMinutes: data.bufferBeforeMinutes,
      bufferAfterMinutes: data.bufferAfterMinutes,
      status: data.status,
      confirmationStatus: 'MANAGER_CONFIRMED',
      updatedBy: actorUserId
    };
    mapping = mapping
      ? await mapping.update(values, { transaction })
      : await models.WorkforceDemandMapping.create({
        ...values,
        createdBy: actorUserId
      }, { transaction });
    await writeAudit({
      wineryId,
      actorUserId,
      action: 'WORKFORCE_DEMAND_MAPPING_UPSERTED',
      targetType: 'WORKFORCE_DEMAND_MAPPING',
      targetId: mapping.id,
      connectionId: mapping.sourceConnectionId,
      resourceType: mapping.sourceRecordType,
      requestId: data.requestId,
      reason: data.reason,
      beforeSnapshot,
      afterSnapshot: demandMappingSnapshot(mapping),
      hash,
      transaction
    });
    return { workforceDemandMapping: mapping, duplicate: false };
  });
}

async function listStaffIdentities({
  wineryId,
  page = 1,
  pageSize = 25,
  includeInactive = false,
  userId
}) {
  const where = { wineryId };
  if (!includeInactive) where.isActive = true;
  if (userId) where.userId = userId;
  const result = await models.StaffIdentity.findAndCountAll({
    where,
    include: [
      { association: 'User', attributes: ['id', 'displayName', 'role', 'isActive'] },
      { association: 'WineryContact', attributes: ['id', 'name', 'role', 'isActive'] },
      {
        association: 'RoleSkills',
        required: false,
        include: [{ association: 'Definition', attributes: ['id', 'definitionKind', 'code', 'name', 'isActive'] }]
      }
    ],
    order: [['displayName', 'ASC'], ['id', 'ASC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
    distinct: true
  });
  return { staffIdentities: result.rows, pagination: pagination(result, page, pageSize) };
}

async function listRoleSkillDefinitions({
  wineryId,
  page = 1,
  pageSize = 100,
  definitionKind,
  includeInactive = false
}) {
  const where = { wineryId };
  if (definitionKind) where.definitionKind = definitionKind;
  if (!includeInactive) where.isActive = true;
  const result = await models.RoleSkillDefinition.findAndCountAll({
    where,
    order: [['definitionKind', 'ASC'], ['name', 'ASC'], ['id', 'ASC']],
    limit: pageSize,
    offset: (page - 1) * pageSize
  });
  return { roleSkillDefinitions: result.rows, pagination: pagination(result, page, pageSize) };
}

function publicShift(row) {
  const plain = row.toJSON();
  delete plain.sourceHash;
  delete plain.providerExtensions;
  if (plain.PrimarySourceReference) delete plain.PrimarySourceReference.providerExtensions;
  return plain;
}

async function listRosterShifts({
  wineryId,
  page = 1,
  pageSize = 50,
  staffIdentityId,
  locationId,
  areaId,
  status = 'ALL',
  from,
  to
}) {
  const where = { wineryId };
  if (staffIdentityId) where.staffIdentityId = staffIdentityId;
  if (locationId) where.locationId = locationId;
  if (areaId) where.areaId = areaId;
  if (status !== 'ALL') where.canonicalStatus = status;
  if (from || to) {
    where.startAt = {};
    if (from) where.startAt[Op.gte] = new Date(from);
    if (to) where.startAt[Op.lte] = new Date(to);
  }
  const result = await models.RosterShift.findAndCountAll({
    where,
    include: [
      {
        association: 'StaffIdentity',
        attributes: ['id', 'userId', 'displayName', 'employmentStatus', 'isActive']
      },
      { association: 'Location', attributes: ['id', 'code', 'name', 'isActive'] },
      { association: 'Area', attributes: ['id', 'name', 'isActive'] },
      { association: 'RoleDefinition', attributes: ['id', 'code', 'name', 'isActive'] },
      {
        association: 'Skills',
        where: { isActive: true },
        required: false,
        include: [{ association: 'Definition', attributes: ['id', 'code', 'name', 'isActive'] }]
      },
      { association: 'AuthorityConnection', attributes: ['id', 'connectionKey', 'providerKey', 'status'] }
    ],
    order: [['startAt', 'ASC'], ['id', 'ASC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
    distinct: true
  });
  return {
    rosterShifts: result.rows.map(publicShift),
    pagination: pagination(result, page, pageSize)
  };
}

function publicAvailability(row) {
  const plain = row.toJSON();
  delete plain.sourceHash;
  delete plain.providerExtensions;
  return plain;
}

async function listStaffAvailability({
  wineryId,
  page = 1,
  pageSize = 50,
  staffIdentityId,
  availabilityType,
  status = 'ALL',
  from,
  to
}) {
  const where = { wineryId };
  if (staffIdentityId) where.staffIdentityId = staffIdentityId;
  if (availabilityType) where.availabilityType = availabilityType;
  if (status !== 'ALL') where.status = status;
  if (from || to) {
    where.startAt = {};
    if (from) where.startAt[Op.gte] = new Date(from);
    if (to) where.startAt[Op.lte] = new Date(to);
  }
  const result = await models.StaffAvailabilityEvent.findAndCountAll({
    where,
    include: [
      {
        association: 'StaffIdentity',
        attributes: ['id', 'userId', 'displayName', 'employmentStatus', 'isActive']
      },
      { association: 'AuthorityConnection', attributes: ['id', 'connectionKey', 'providerKey', 'status'] }
    ],
    order: [['startAt', 'ASC'], ['id', 'ASC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
    distinct: true
  });
  return {
    staffAvailabilityEvents: result.rows.map(publicAvailability),
    pagination: pagination(result, page, pageSize)
  };
}

async function listWorkforceDemandMappings({
  wineryId,
  page = 1,
  pageSize = 50,
  sourceRecordType,
  status = 'ALL'
}) {
  const where = { wineryId };
  if (sourceRecordType) where.sourceRecordType = sourceRecordType;
  if (status !== 'ALL') where.status = status;
  const result = await models.WorkforceDemandMapping.findAndCountAll({
    where,
    include: [
      { association: 'SourceConnection', attributes: ['id', 'connectionKey', 'providerKey', 'status'] },
      { association: 'Definition', attributes: ['id', 'definitionKind', 'code', 'name', 'isActive'] },
      { association: 'Area', attributes: ['id', 'name', 'isActive'] },
      { association: 'Location', attributes: ['id', 'code', 'name', 'isActive'] }
    ],
    order: [['sourceRecordType', 'ASC'], ['sourceCodeNormalized', 'ASC'], ['id', 'ASC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
    distinct: true
  });
  return {
    workforceDemandMappings: result.rows,
    pagination: pagination(result, page, pageSize)
  };
}

module.exports = {
  normalizeCode,
  buildDemandMappingKey,
  upsertStaffIdentity,
  upsertRoleSkillDefinition,
  upsertStaffRoleSkill,
  upsertWorkforceDemandMapping,
  listStaffIdentities,
  listRoleSkillDefinitions,
  listRosterShifts,
  listStaffAvailability,
  listWorkforceDemandMappings
};
