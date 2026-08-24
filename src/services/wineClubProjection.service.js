const Joi = require('joi');
const { Op } = require('sequelize');
const {
  ExternalResourceReference,
  IntegrationConnection,
  IntegrationConnectionScope,
  Member,
  ProjectionIssue,
  ProductVariant,
  User,
  WineClubAllocation,
  WineClubAllocationItem,
  WineClubMembership,
  WineClubMembershipEvent,
  WineClubProgram,
  sequelize
} = require('../models');
const { NotFoundError, ValidationError } = require('../utils/errors');
const {
  WINE_CLUB_ALLOCATION_STATUSES,
  WINE_CLUB_MEMBERSHIP_STATUSES
} = require('./integrationDataRegistry.service');
const {
  buildProjectionIssueFingerprint,
  stableSerialize
} = require('./integrationDataFoundation.service');
const crypto = require('crypto');

const FORBIDDEN_SNAPSHOT_KEY = /(?:password|passphrase|secret|token|credential|api[_-]?key|private[_-]?key|authorization|email|phone|address|dateOfBirth|card|cvv)/i;

const nullableIsoDate = Joi.date().iso().allow(null);
const stableKey = max => Joi.string().trim().pattern(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/).max(max);
const money = Joi.number().integer().min(0).max(Number.MAX_SAFE_INTEGER).allow(null);

const allocationItemSchema = Joi.object({
  lineKey: stableKey(160).required(),
  productVariantId: Joi.number().integer().positive().allow(null),
  providerSku: Joi.string().trim().max(160).allow('', null),
  description: Joi.string().trim().min(1).max(255).required(),
  quantity: Joi.number().positive().precision(3).required(),
  unit: Joi.string().trim().uppercase().pattern(/^[A-Z0-9_.-]+$/).max(40).required(),
  substitutionAllowed: Joi.boolean().default(false),
  substitutedFromSku: Joi.string().trim().max(160).allow('', null),
  currency: Joi.string().trim().uppercase().length(3).allow(null),
  unitPriceMinor: money,
  totalMinor: money,
  providerExtensions: Joi.object().unknown(true).allow(null)
}).unknown(false);

const allocationSchema = Joi.object({
  externalId: Joi.string().trim().min(1).max(255).required(),
  cycleCode: stableKey(120).required(),
  canonicalStatus: Joi.string().trim().uppercase().valid(...WINE_CLUB_ALLOCATION_STATUSES).required(),
  providerStatus: Joi.string().trim().max(120).allow('', null),
  opensAt: nullableIsoDate,
  closesAt: nullableIsoDate,
  chargesAt: nullableIsoDate,
  fulfilsAt: nullableIsoDate,
  fulfilmentMethod: Joi.string().trim().uppercase().max(80).allow('', null),
  currency: Joi.string().trim().uppercase().length(3).allow(null),
  totalMinor: money,
  salesOrderId: Joi.number().integer().positive().allow(null),
  sourceRevision: Joi.string().trim().min(1).max(255).required(),
  sourceUpdatedAt: Joi.date().iso().required(),
  observedAt: Joi.date().iso().required(),
  deletedAtSource: nullableIsoDate,
  providerExtensions: Joi.object().unknown(true).allow(null),
  itemsComplete: Joi.boolean().valid(true).required(),
  items: Joi.array().items(allocationItemSchema).max(500).required()
}).unknown(false);

const membershipEventSchema = Joi.object({
  eventKey: stableKey(180).required(),
  eventType: Joi.string().trim().uppercase().pattern(/^[A-Z0-9_.-]+$/).max(80).required(),
  fromStatus: Joi.string().trim().uppercase().valid(...WINE_CLUB_MEMBERSHIP_STATUSES).allow(null),
  toStatus: Joi.string().trim().uppercase().valid(...WINE_CLUB_MEMBERSHIP_STATUSES).allow(null),
  effectiveAt: Joi.date().iso().required(),
  reason: Joi.string().trim().max(255).allow('', null),
  sourceEventId: Joi.number().integer().positive().allow(null),
  metadata: Joi.object().unknown(true).allow(null)
}).unknown(false);

const wineClubSnapshotSchema = Joi.object({
  contractVersion: Joi.string().valid('wine-club-shadow.v1').required(),
  externalId: Joi.string().trim().min(1).max(255).required(),
  memberId: Joi.number().integer().positive().required(),
  programId: Joi.number().integer().positive().required(),
  canonicalStatus: Joi.string().trim().uppercase().valid(...WINE_CLUB_MEMBERSHIP_STATUSES).required(),
  providerStatus: Joi.string().trim().max(120).allow('', null),
  joinedAt: nullableIsoDate,
  activatedAt: nullableIsoDate,
  pausedAt: nullableIsoDate,
  nextReviewAt: nullableIsoDate,
  nextChargeAt: nullableIsoDate,
  cancelledAt: nullableIsoDate,
  endedAt: nullableIsoDate,
  statusReason: Joi.string().trim().max(255).allow('', null),
  preferences: Joi.object().unknown(true).allow(null),
  fulfilmentMethod: Joi.string().trim().uppercase().max(80).allow('', null),
  sourceRevision: Joi.string().trim().min(1).max(255).required(),
  sourceUpdatedAt: Joi.date().iso().required(),
  observedAt: Joi.date().iso().required(),
  deletedAtSource: nullableIsoDate,
  providerExtensions: Joi.object().unknown(true).allow(null),
  events: Joi.array().items(membershipEventSchema).max(500).default([]),
  allocations: Joi.array().items(allocationSchema).max(200).default([])
}).unknown(false);

function validateSnapshot(input) {
  const { value, error } = wineClubSnapshotSchema.validate(input, {
    abortEarly: false,
    stripUnknown: false,
    convert: true
  });
  if (error) throw new ValidationError('Wine Club snapshot contract validation failed', error.details);
  const inspect = (item, path = 'snapshot') => {
    if (Array.isArray(item)) return item.forEach((child, index) => inspect(child, `${path}[${index}]`));
    if (!item || typeof item !== 'object' || item instanceof Date) return;
    for (const [key, child] of Object.entries(item)) {
      if (FORBIDDEN_SNAPSHOT_KEY.test(key)) {
        throw new ValidationError(`Wine Club snapshot contains a forbidden field at ${path}.${key}`);
      }
      inspect(child, `${path}.${key}`);
    }
  };
  inspect(value);
  return value;
}

function sourceHash(value) {
  return crypto.createHash('sha256').update(stableSerialize(value)).digest('hex');
}

async function recordIssue({
  wineryId,
  connectionId,
  referenceId,
  externalId,
  resourceType = 'WINE_CLUB_MEMBERSHIP',
  issueType,
  title,
  summary,
  evidence,
  candidates = null,
  sourceVersion,
  severity = 'ERROR',
  transaction
}) {
  const fingerprint = buildProjectionIssueFingerprint({
    connectionId,
    resourceType,
    externalId,
    issueType,
    evidence,
    sourceVersion
  });
  const existing = await ProjectionIssue.findOne({ where: { wineryId, fingerprint }, transaction });
  if (existing) {
    await existing.update({
      status: 'OPEN',
      severity,
      lastObservedAt: new Date(),
      observationCount: Number(existing.observationCount || 0) + 1
    }, { transaction });
    return existing;
  }
  return ProjectionIssue.create({
    wineryId,
    connectionId,
    externalResourceReferenceId: referenceId,
    issueType,
    fingerprint,
    status: 'OPEN',
    severity,
    title,
    summary,
    evidence,
    candidates,
    sourceVersion,
    observationCount: 1,
    detectedAt: new Date(),
    lastObservedAt: new Date()
  }, { transaction });
}

async function requireClubConnection({ wineryId, connectionId, transaction }) {
  const connection = await IntegrationConnection.findOne({
    where: { id: connectionId, wineryId },
    attributes: ['id', 'connectionKey', 'providerKey', 'status'],
    transaction
  });
  if (!connection) throw new NotFoundError('Integration connection not found');
  const scope = await IntegrationConnectionScope.findOne({
    where: { wineryId, connectionId, domain: 'CLUB', isActive: true },
    transaction
  });
  if (!scope) throw new ValidationError('Connection does not have an active CLUB scope');
  return connection;
}

async function upsertReference({
  wineryId,
  connectionId,
  resourceType,
  externalId,
  sourceRevision,
  sourceUpdatedAt,
  observedAt,
  providerExtensions,
  payload,
  transaction
}) {
  let reference = await ExternalResourceReference.findOne({
    where: { connectionId, resourceType, externalId },
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  const stale = Boolean(reference?.providerUpdatedAt
    && new Date(sourceUpdatedAt).getTime() < new Date(reference.providerUpdatedAt).getTime());
  if (stale) return { reference, stale: true };
  const values = {
    wineryId,
    connectionId,
    resourceType,
    externalId,
    providerVersion: sourceRevision,
    sourceHash: sourceHash(payload),
    providerUpdatedAt: sourceUpdatedAt,
    observedAt,
    lastSyncedAt: observedAt,
    deletedAtSource: payload.deletedAtSource || null,
    providerExtensions: providerExtensions || null
  };
  reference = reference
    ? await reference.update(values, { transaction })
    : await ExternalResourceReference.create({ ...values, resolutionStatus: 'UNRESOLVED' }, { transaction });
  return { reference, stale: false };
}

async function projectWineClubSnapshotInternal({ wineryId, connectionId, input, transaction }) {
  const snapshot = validateSnapshot(input);
  const connection = await requireClubConnection({ wineryId, connectionId, transaction });
  const [member, program] = await Promise.all([
    Member.findOne({ where: { id: snapshot.memberId, wineryId }, attributes: ['id'], transaction }),
    WineClubProgram.findOne({ where: { id: snapshot.programId, wineryId, isActive: true }, transaction })
  ]);
  if (!member) throw new ValidationError('Wine Club membership customer does not belong to the winery');
  if (!program) throw new ValidationError('Wine Club program does not belong to the winery or is inactive');
  const productVariantIds = [...new Set(snapshot.allocations.flatMap(allocation => (
    allocation.items.map(item => item.productVariantId).filter(Boolean)
  )))];
  if (productVariantIds.length > 0) {
    const mappedVariantCount = await ProductVariant.count({
      where: { id: productVariantIds, wineryId, isActive: true },
      transaction
    });
    if (mappedVariantCount !== productVariantIds.length) {
      throw new ValidationError('One or more Wine Club allocation variants are not active winery mappings');
    }
  }

  const membershipReferenceResult = await upsertReference({
    wineryId,
    connectionId,
    resourceType: 'WINE_CLUB_MEMBERSHIP',
    externalId: snapshot.externalId,
    sourceRevision: snapshot.sourceRevision,
    sourceUpdatedAt: snapshot.sourceUpdatedAt,
    observedAt: snapshot.observedAt,
    providerExtensions: snapshot.providerExtensions,
    payload: snapshot,
    transaction
  });
  if (membershipReferenceResult.stale) {
    await recordIssue({
      wineryId,
      connectionId,
      referenceId: membershipReferenceResult.reference.id,
      externalId: snapshot.externalId,
      issueType: 'OUT_OF_ORDER',
      title: 'Older Wine Club membership update ignored',
      summary: 'The provider update predates the currently projected source state.',
      evidence: {
        incomingUpdatedAt: new Date(snapshot.sourceUpdatedAt).toISOString(),
        currentUpdatedAt: new Date(membershipReferenceResult.reference.providerUpdatedAt).toISOString()
      },
      sourceVersion: snapshot.contractVersion,
      transaction
    });
    return { status: 'STALE_IGNORED', membershipId: membershipReferenceResult.reference.canonicalId || null };
  }
  const reference = membershipReferenceResult.reference;
  let membership = await WineClubMembership.findOne({
    where: { wineryId, programId: program.id, memberId: member.id },
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (membership && membership.authorityConnectionId !== connectionId) {
    await reference.update({ resolutionStatus: 'AMBIGUOUS' }, { transaction });
    const authorityConnection = await IntegrationConnection.findByPk(membership.authorityConnectionId, {
      attributes: ['connectionKey'],
      transaction
    });
    await recordIssue({
      wineryId,
      connectionId,
      referenceId: reference.id,
      externalId: snapshot.externalId,
      issueType: 'SOURCE_CONFLICT',
      title: 'Wine Club membership has another shadow authority',
      summary: 'The existing canonical membership is owned by a different connection; no source was chosen.',
      evidence: {
        programId: program.id,
        memberId: member.id,
        existingConnectionId: membership.authorityConnectionId,
        incomingConnectionId: connectionId
      },
      candidates: [authorityConnection?.connectionKey, connection.connectionKey].filter(Boolean),
      sourceVersion: snapshot.contractVersion,
      severity: 'BLOCKING',
      transaction
    });
    return { status: 'SOURCE_CONFLICT', membershipId: membership.id };
  }
  const membershipValues = {
    wineryId,
    memberId: member.id,
    programId: program.id,
    primarySourceReferenceId: reference.id,
    authorityConnectionId: connectionId,
    canonicalStatus: snapshot.canonicalStatus,
    providerStatus: snapshot.providerStatus || null,
    joinedAt: snapshot.joinedAt || null,
    activatedAt: snapshot.activatedAt || null,
    pausedAt: snapshot.pausedAt || null,
    nextReviewAt: snapshot.nextReviewAt || null,
    nextChargeAt: snapshot.nextChargeAt || null,
    cancelledAt: snapshot.cancelledAt || null,
    endedAt: snapshot.endedAt || null,
    statusReason: snapshot.statusReason || null,
    preferences: snapshot.preferences || null,
    fulfilmentMethod: snapshot.fulfilmentMethod || null,
    sourceRevision: snapshot.sourceRevision,
    sourceUpdatedAt: snapshot.sourceUpdatedAt,
    observedAt: snapshot.observedAt,
    projectionQuality: 'SOURCE_ASSERTED',
    deletedAtSource: snapshot.deletedAtSource || null,
    providerExtensions: snapshot.providerExtensions || null
  };
  membership = membership
    ? await membership.update(membershipValues, { transaction })
    : await WineClubMembership.create(membershipValues, { transaction });
  await reference.update({
    canonicalType: 'WINE_CLUB_MEMBERSHIP',
    canonicalId: membership.id,
    resolutionStatus: 'RESOLVED',
    resolutionMethod: 'EXPLICIT_MEMBER_PROGRAM_MAPPING',
    resolutionConfidence: 1,
    resolvedAt: new Date()
  }, { transaction });

  let eventsCreated = 0;
  for (const event of snapshot.events) {
    const [, created] = await WineClubMembershipEvent.findOrCreate({
      where: { membershipId: membership.id, eventKey: event.eventKey },
      defaults: {
        wineryId,
        membershipId: membership.id,
        ...event,
        sourceReferenceId: reference.id
      },
      transaction
    });
    if (created) eventsCreated += 1;
  }

  let allocationsProjected = 0;
  let allocationItemsProjected = 0;
  for (const allocationInput of snapshot.allocations) {
    const allocationReferenceResult = await upsertReference({
      wineryId,
      connectionId,
      resourceType: 'WINE_CLUB_ALLOCATION',
      externalId: allocationInput.externalId,
      sourceRevision: allocationInput.sourceRevision,
      sourceUpdatedAt: allocationInput.sourceUpdatedAt,
      observedAt: allocationInput.observedAt,
      providerExtensions: allocationInput.providerExtensions,
      payload: allocationInput,
      transaction
    });
    if (allocationReferenceResult.stale) {
      await recordIssue({
        wineryId,
        connectionId,
        referenceId: allocationReferenceResult.reference.id,
        externalId: allocationInput.externalId,
        resourceType: 'WINE_CLUB_ALLOCATION',
        issueType: 'OUT_OF_ORDER',
        title: 'Older Wine Club allocation update ignored',
        summary: 'The provider allocation update predates the currently projected source state.',
        evidence: {
          incomingUpdatedAt: new Date(allocationInput.sourceUpdatedAt).toISOString(),
          currentUpdatedAt: new Date(allocationReferenceResult.reference.providerUpdatedAt).toISOString()
        },
        sourceVersion: snapshot.contractVersion,
        transaction
      });
      continue;
    }
    const allocationReference = allocationReferenceResult.reference;
    let allocation = await WineClubAllocation.findOne({
      where: { wineryId, membershipId: membership.id, cycleCode: allocationInput.cycleCode },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (allocation && allocation.authorityConnectionId !== connectionId) {
      await allocationReference.update({ resolutionStatus: 'AMBIGUOUS' }, { transaction });
      const authorityConnection = await IntegrationConnection.findByPk(allocation.authorityConnectionId, {
        attributes: ['connectionKey'],
        transaction
      });
      await recordIssue({
        wineryId,
        connectionId,
        referenceId: allocationReference.id,
        externalId: allocationInput.externalId,
        resourceType: 'WINE_CLUB_ALLOCATION',
        issueType: 'SOURCE_CONFLICT',
        title: 'Wine Club allocation has another shadow authority',
        summary: 'The existing canonical allocation is owned by a different connection; no source was chosen.',
        evidence: {
          membershipId: membership.id,
          cycleCode: allocationInput.cycleCode,
          existingConnectionId: allocation.authorityConnectionId,
          incomingConnectionId: connectionId
        },
        candidates: [authorityConnection?.connectionKey, connection.connectionKey].filter(Boolean),
        sourceVersion: snapshot.contractVersion,
        severity: 'BLOCKING',
        transaction
      });
      continue;
    }
    const allocationValues = {
      wineryId,
      membershipId: membership.id,
      programId: program.id,
      primarySourceReferenceId: allocationReference.id,
      authorityConnectionId: connectionId,
      cycleCode: allocationInput.cycleCode,
      canonicalStatus: allocationInput.canonicalStatus,
      providerStatus: allocationInput.providerStatus || null,
      opensAt: allocationInput.opensAt || null,
      closesAt: allocationInput.closesAt || null,
      chargesAt: allocationInput.chargesAt || null,
      fulfilsAt: allocationInput.fulfilsAt || null,
      fulfilmentMethod: allocationInput.fulfilmentMethod || null,
      currency: allocationInput.currency || null,
      totalMinor: allocationInput.totalMinor ?? null,
      salesOrderId: allocationInput.salesOrderId || null,
      sourceRevision: allocationInput.sourceRevision,
      sourceUpdatedAt: allocationInput.sourceUpdatedAt,
      observedAt: allocationInput.observedAt,
      projectionQuality: 'SOURCE_ASSERTED',
      deletedAtSource: allocationInput.deletedAtSource || null,
      providerExtensions: allocationInput.providerExtensions || null
    };
    allocation = allocation
      ? await allocation.update(allocationValues, { transaction })
      : await WineClubAllocation.create(allocationValues, { transaction });
    await allocationReference.update({
      canonicalType: 'WINE_CLUB_ALLOCATION',
      canonicalId: allocation.id,
      resolutionStatus: 'RESOLVED',
      resolutionMethod: 'MEMBERSHIP_CYCLE_KEY',
      resolutionConfidence: 1,
      resolvedAt: new Date()
    }, { transaction });
    const incomingLineKeys = allocationInput.items.map(item => item.lineKey);
    if (incomingLineKeys.length === 0) {
      await WineClubAllocationItem.destroy({ where: { wineryId, allocationId: allocation.id }, transaction });
    } else {
      await WineClubAllocationItem.destroy({
        where: { wineryId, allocationId: allocation.id, lineKey: { [Op.notIn]: incomingLineKeys } },
        transaction
      });
    }
    for (const item of allocationInput.items) {
      const [record] = await WineClubAllocationItem.findOrCreate({
        where: { allocationId: allocation.id, lineKey: item.lineKey },
        defaults: { wineryId, allocationId: allocation.id, ...item },
        transaction
      });
      await record.update({ wineryId, allocationId: allocation.id, ...item }, { transaction });
      allocationItemsProjected += 1;
    }
    allocationsProjected += 1;
  }
  return {
    status: 'PROJECTED_SHADOW',
    membershipId: membership.id,
    eventsCreated,
    allocationsProjected,
    allocationItemsProjected,
    automationEligible: false
  };
}

async function projectWineClubSnapshot(options) {
  if (options.transaction) return projectWineClubSnapshotInternal(options);
  return sequelize.transaction(transaction => projectWineClubSnapshotInternal({ ...options, transaction }));
}

async function createProgram({ wineryId, actorUserId, data }) {
  const actor = await User.findOne({ where: { id: actorUserId, wineryId }, attributes: ['id'] });
  if (!actor) throw new ValidationError('Wine Club program actor does not belong to the winery');
  try {
    return await WineClubProgram.create({ ...data, wineryId, createdBy: actorUserId, updatedBy: actorUserId });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      throw new ValidationError('Wine Club program code already exists in this winery');
    }
    throw error;
  }
}

async function listPrograms({ wineryId, includeInactive = false }) {
  return WineClubProgram.findAll({
    where: { wineryId, ...(includeInactive ? {} : { isActive: true }) },
    order: [['isActive', 'DESC'], ['name', 'ASC'], ['id', 'ASC']]
  });
}

async function listMemberships({ wineryId, page = 1, pageSize = 25, status = 'ALL', memberId, programId }) {
  const where = { wineryId };
  if (status !== 'ALL') where.canonicalStatus = status;
  if (memberId) where.memberId = memberId;
  if (programId) where.programId = programId;
  const result = await WineClubMembership.findAndCountAll({
    where,
    include: [
      { association: 'Member', attributes: ['id', 'firstName', 'lastName'] },
      { association: 'Program', attributes: ['id', 'code', 'name', 'tier'] },
      { association: 'AuthorityConnection', attributes: ['id', 'connectionKey', 'providerKey', 'status'] }
    ],
    order: [['nextChargeAt', 'ASC'], ['id', 'ASC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
    distinct: true
  });
  return {
    memberships: result.rows.map(row => {
      const plain = row.toJSON();
      delete plain.providerExtensions;
      return plain;
    }),
    pagination: { page, pageSize, total: result.count, totalPages: Math.ceil(result.count / pageSize) }
  };
}

async function getMembership({ wineryId, membershipId }) {
  const membership = await WineClubMembership.findOne({
    where: { id: membershipId, wineryId },
    include: [
      { association: 'Member', attributes: ['id', 'firstName', 'lastName'] },
      { association: 'Program' },
      { association: 'AuthorityConnection', attributes: ['id', 'connectionKey', 'providerKey', 'status'] },
      { association: 'PrimarySourceReference', attributes: ['id', 'externalId', 'providerVersion', 'providerUpdatedAt'] },
      { association: 'Events' },
      { association: 'Allocations', include: [{ association: 'Items' }] }
    ]
  });
  if (!membership) throw new NotFoundError('Wine Club membership not found');
  const plain = membership.toJSON();
  delete plain.providerExtensions;
  for (const allocation of plain.Allocations || []) delete allocation.providerExtensions;
  for (const allocation of plain.Allocations || []) {
    for (const item of allocation.Items || []) delete item.providerExtensions;
  }
  return plain;
}

module.exports = {
  wineClubSnapshotSchema,
  validateSnapshot,
  projectWineClubSnapshot,
  createProgram,
  listPrograms,
  listMemberships,
  getMembership
};
