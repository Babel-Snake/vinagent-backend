const crypto = require('crypto');
const { Op, UniqueConstraintError } = require('sequelize');
const models = require('../models');
const { NotFoundError, ValidationError } = require('../utils/errors');
const {
  BUSINESS_ENTITY_LINK_DERIVATION_TYPES,
  BUSINESS_ENTITY_RELATIONSHIP_TYPES,
  CANONICAL_RESOURCE_TYPES,
  includesRegistryValue
} = require('./integrationDataRegistry.service');
const { stableSerialize } = require('./integrationDataFoundation.service');

const RELATIONSHIP_DEFINITIONS = Object.freeze({
  BOOKING_RESULTED_IN_ORDER: Object.freeze({
    sourceType: 'BOOKING',
    targetType: 'SALES_ORDER',
    symmetric: false,
    description: 'A booking is evidenced as having resulted in a sales order.'
  }),
  POSSIBLE_SAME_CUSTOMER: Object.freeze({
    sourceType: 'CUSTOMER',
    targetType: 'CUSTOMER',
    symmetric: true,
    description: 'Two customer records may represent the same person; confirmation does not merge them.'
  }),
  POSSIBLE_SAME_SALES_ORDER: Object.freeze({
    sourceType: 'SALES_ORDER',
    targetType: 'SALES_ORDER',
    symmetric: true,
    description: 'Two source-backed sales orders may represent the same sale; confirmation does not merge them.'
  })
});

const RESOURCE_MODEL_NAMES = Object.freeze({
  CUSTOMER: 'Member',
  BOOKING: 'Booking',
  WINE_CLUB_MEMBERSHIP: 'WineClubMembership',
  WINE_CLUB_ALLOCATION: 'WineClubAllocation',
  SALES_ORDER: 'SalesOrder',
  WINERY_PRODUCT: 'WineryProduct'
});

const SENSITIVE_METADATA_KEY = /(?:password|passphrase|secret|token|credential|api[_-]?key|private[_-]?key|authorization|email|phone|address|dateOfBirth|card|cvv|bank[_-]?account|account[_-]?number|routing[_-]?number|\bpan\b|iban|\bbsb\b)/i;
const EVIDENCE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

const normalizeRegistry = (registry, value, fieldName) => {
  const normalized = String(value || '').trim().toUpperCase();
  if (!includesRegistryValue(registry, normalized)) throw new ValidationError(`${fieldName} is not supported`);
  return normalized;
};

const positiveId = (value, fieldName) => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new ValidationError(`${fieldName} must be a positive integer`);
  return id;
};

function validatePublicMetadata(metadata) {
  if (metadata == null) return null;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new ValidationError('Business entity link evidence metadata must be an object');
  }
  if (Buffer.byteLength(JSON.stringify(metadata), 'utf8') > 8192) {
    throw new ValidationError('Business entity link evidence metadata is too large');
  }
  const inspect = (value, path = 'metadata') => {
    if (Array.isArray(value)) return value.forEach((item, index) => inspect(item, `${path}[${index}]`));
    if (!value || typeof value !== 'object') return;
    for (const [key, nested] of Object.entries(value)) {
      if (SENSITIVE_METADATA_KEY.test(key)) {
        throw new ValidationError(`Business entity link evidence contains a forbidden field at ${path}.${key}`);
      }
      inspect(nested, `${path}.${key}`);
    }
  };
  inspect(metadata);
  return metadata;
}

function normalizeEndpoints({ relationshipType, sourceType, sourceId, targetType, targetId }) {
  const normalizedRelationshipType = normalizeRegistry(
    BUSINESS_ENTITY_RELATIONSHIP_TYPES,
    relationshipType,
    'relationshipType'
  );
  const definition = RELATIONSHIP_DEFINITIONS[normalizedRelationshipType];
  if (!definition) throw new ValidationError('Business entity relationship definition is unavailable');
  let source = {
    type: normalizeRegistry(CANONICAL_RESOURCE_TYPES, sourceType, 'sourceType'),
    id: positiveId(sourceId, 'sourceId')
  };
  let target = {
    type: normalizeRegistry(CANONICAL_RESOURCE_TYPES, targetType, 'targetType'),
    id: positiveId(targetId, 'targetId')
  };
  if (source.type !== definition.sourceType || target.type !== definition.targetType) {
    throw new ValidationError(
      `${normalizedRelationshipType} requires ${definition.sourceType} -> ${definition.targetType}`
    );
  }
  if (source.type === target.type && source.id === target.id) {
    throw new ValidationError('A business entity cannot be related to itself');
  }
  if (definition.symmetric && `${source.type}:${source.id}` > `${target.type}:${target.id}`) {
    [source, target] = [target, source];
  }
  return { relationshipType: normalizedRelationshipType, definition, source, target };
}

function buildLinkKey({ relationshipType, source, target }) {
  return crypto.createHash('sha256').update(stableSerialize({
    relationshipType,
    sourceType: source.type,
    sourceId: source.id,
    targetType: target.type,
    targetId: target.id
  })).digest('hex');
}

function evidenceHash(value) {
  return crypto.createHash('sha256').update(stableSerialize(value)).digest('hex');
}

async function requireTenantRecord({ wineryId, modelName, id, label, transaction }) {
  const model = models[modelName];
  if (!model) throw new ValidationError(`${label} is not available in the current canonical schema`);
  const record = await model.findOne({ where: { id, wineryId }, attributes: ['id'], transaction });
  if (!record) throw new NotFoundError(`${label} was not found in this winery`);
  return record;
}

async function validateEvidenceRelationships({
  wineryId,
  sourceConnectionId,
  sourceEventId,
  sourceReferenceId,
  createdBy,
  transaction
}) {
  const [connection, event, reference] = await Promise.all([
    sourceConnectionId
      ? requireTenantRecord({
        wineryId,
        modelName: 'IntegrationConnection',
        id: positiveId(sourceConnectionId, 'sourceConnectionId'),
        label: 'Source connection',
        transaction
      })
      : null,
    sourceEventId
      ? models.IntegrationEvent.findOne({
        where: { id: positiveId(sourceEventId, 'sourceEventId'), wineryId },
        attributes: ['id', 'connectionId', 'externalResourceReferenceId'],
        transaction
      })
      : null,
    sourceReferenceId
      ? models.ExternalResourceReference.findOne({
        where: { id: positiveId(sourceReferenceId, 'sourceReferenceId'), wineryId },
        attributes: ['id', 'connectionId'],
        transaction
      })
      : null
  ]);
  if (sourceEventId && !event) throw new NotFoundError('Source event was not found in this winery');
  if (sourceReferenceId && !reference) throw new NotFoundError('Source reference was not found in this winery');
  if (connection && reference && connection.id !== reference.connectionId) {
    throw new ValidationError('Source reference does not belong to the declared connection');
  }
  if (connection && event?.connectionId && connection.id !== event.connectionId) {
    throw new ValidationError('Source event does not belong to the declared connection');
  }
  if (reference && event?.externalResourceReferenceId && reference.id !== event.externalResourceReferenceId) {
    throw new ValidationError('Source event does not belong to the declared resource reference');
  }
  if (createdBy) {
    await requireTenantRecord({
      wineryId,
      modelName: 'User',
      id: positiveId(createdBy, 'createdBy'),
      label: 'Evidence creator',
      transaction
    });
  }
  return { connection, event, reference };
}

function normalizeProposal(input, { allowManagerConfirmed = false } = {}) {
  const endpoints = normalizeEndpoints(input);
  const derivationType = normalizeRegistry(
    BUSINESS_ENTITY_LINK_DERIVATION_TYPES,
    input.derivationType,
    'derivationType'
  );
  if (derivationType === 'MANAGER_CONFIRMED' && !allowManagerConfirmed) {
    throw new ValidationError('Manager-confirmed relationships require the audited manager command');
  }
  const evidenceKey = String(input.evidenceKey || '').trim();
  if (!EVIDENCE_KEY_PATTERN.test(evidenceKey) || evidenceKey.length > 180) {
    throw new ValidationError('evidenceKey must be a stable key of at most 180 characters');
  }
  const evidenceSummary = String(input.evidenceSummary || '').trim();
  if (evidenceSummary.length < 10 || evidenceSummary.length > 1000) {
    throw new ValidationError('evidenceSummary must be between 10 and 1000 characters');
  }
  const confidence = input.confidence == null ? null : Number(input.confidence);
  if (confidence != null && (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)) {
    throw new ValidationError('confidence must be between 0 and 1');
  }
  if (derivationType === 'AI_INFERRED' && confidence == null) {
    throw new ValidationError('AI-inferred relationships require confidence');
  }
  const observedAt = new Date(input.observedAt || Date.now());
  if (Number.isNaN(observedAt.getTime())) throw new ValidationError('observedAt must be a valid date');
  const derivationVersion = input.derivationVersion == null ? null : String(input.derivationVersion).trim();
  if (derivationVersion && derivationVersion.length > 120) {
    throw new ValidationError('derivationVersion is too long');
  }
  return {
    ...endpoints,
    linkKey: buildLinkKey(endpoints),
    derivationType,
    derivationVersion,
    evidenceKey,
    evidenceSummary,
    confidence,
    observedAt,
    metadata: validatePublicMetadata(input.metadata),
    sourceConnectionId: input.sourceConnectionId ? positiveId(input.sourceConnectionId, 'sourceConnectionId') : null,
    sourceEventId: input.sourceEventId ? positiveId(input.sourceEventId, 'sourceEventId') : null,
    sourceReferenceId: input.sourceReferenceId ? positiveId(input.sourceReferenceId, 'sourceReferenceId') : null,
    createdBy: input.createdBy ? positiveId(input.createdBy, 'createdBy') : null
  };
}

function snapshotLink(link) {
  return {
    id: link.id,
    sourceType: link.sourceType,
    sourceId: link.sourceId,
    targetType: link.targetType,
    targetId: link.targetId,
    relationshipType: link.relationshipType,
    confirmationStatus: link.confirmationStatus,
    confidence: link.confidence == null ? null : Number(link.confidence),
    isActive: link.isActive,
    validFrom: link.validFrom,
    validTo: link.validTo,
    confirmedBy: link.confirmedBy,
    confirmedAt: link.confirmedAt,
    invalidatedBy: link.invalidatedBy,
    invalidatedAt: link.invalidatedAt,
    invalidationReason: link.invalidationReason
  };
}

async function proposeBusinessEntityLinkInternal({ wineryId, input, transaction, allowManagerConfirmed = false }) {
  const proposal = normalizeProposal(input, { allowManagerConfirmed });
  await Promise.all([
    requireTenantRecord({
      wineryId,
      modelName: RESOURCE_MODEL_NAMES[proposal.source.type],
      id: proposal.source.id,
      label: proposal.source.type,
      transaction
    }),
    requireTenantRecord({
      wineryId,
      modelName: RESOURCE_MODEL_NAMES[proposal.target.type],
      id: proposal.target.id,
      label: proposal.target.type,
      transaction
    }),
    validateEvidenceRelationships({ wineryId, ...proposal, transaction })
  ]);
  let link = await models.BusinessEntityLink.findOne({
    where: { wineryId, linkKey: proposal.linkKey },
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  let linkCreated = false;
  if (!link) {
    const confirmed = proposal.derivationType === 'MANAGER_CONFIRMED';
    const now = new Date();
    try {
      link = await models.BusinessEntityLink.create({
        wineryId,
        linkKey: proposal.linkKey,
        sourceType: proposal.source.type,
        sourceId: proposal.source.id,
        targetType: proposal.target.type,
        targetId: proposal.target.id,
        relationshipType: proposal.relationshipType,
        confirmationStatus: confirmed ? 'CONFIRMED' : 'UNREVIEWED',
        confidence: proposal.confidence,
        isActive: true,
        validFrom: proposal.observedAt,
        createdBy: proposal.createdBy,
        confirmedBy: confirmed ? proposal.createdBy : null,
        confirmedAt: confirmed ? now : null
      }, { transaction });
      linkCreated = true;
    } catch (error) {
      if (!(error instanceof UniqueConstraintError || error.name === 'SequelizeUniqueConstraintError')) throw error;
      link = await models.BusinessEntityLink.findOne({
        where: { wineryId, linkKey: proposal.linkKey },
        transaction,
        lock: transaction.LOCK.UPDATE
      });
    }
  }
  if (!link) throw new ValidationError('Business entity link could not be established');
  if (!link.isActive || ['REJECTED', 'INVALIDATED'].includes(link.confirmationStatus)) {
    throw new ValidationError('The business entity link was previously rejected or invalidated');
  }
  if (proposal.derivationType === 'MANAGER_CONFIRMED' && link.confirmationStatus === 'UNREVIEWED') {
    await link.update({
      confirmationStatus: 'CONFIRMED',
      confirmedBy: proposal.createdBy,
      confirmedAt: new Date(),
      confidence: 1
    }, { transaction });
  }
  const hashedEvidence = evidenceHash({
    derivationType: proposal.derivationType,
    derivationVersion: proposal.derivationVersion,
    evidenceSummary: proposal.evidenceSummary,
    confidence: proposal.confidence,
    sourceConnectionId: proposal.sourceConnectionId,
    sourceEventId: proposal.sourceEventId,
    sourceReferenceId: proposal.sourceReferenceId,
    metadata: proposal.metadata
  });
  let evidence = await models.BusinessEntityLinkEvidence.findOne({
    where: { businessEntityLinkId: link.id, evidenceKey: proposal.evidenceKey },
    transaction
  });
  if (evidence && evidence.evidenceHash !== hashedEvidence) {
    throw new ValidationError('evidenceKey was already used with different relationship evidence');
  }
  let evidenceCreated = false;
  if (!evidence) {
    try {
      evidence = await models.BusinessEntityLinkEvidence.create({
        wineryId,
        businessEntityLinkId: link.id,
        evidenceKey: proposal.evidenceKey,
        derivationType: proposal.derivationType,
        derivationVersion: proposal.derivationVersion,
        evidenceSummary: proposal.evidenceSummary,
        evidenceHash: hashedEvidence,
        confidence: proposal.confidence,
        sourceConnectionId: proposal.sourceConnectionId,
        sourceEventId: proposal.sourceEventId,
        sourceReferenceId: proposal.sourceReferenceId,
        observedAt: proposal.observedAt,
        metadata: proposal.metadata,
        createdBy: proposal.createdBy
      }, { transaction });
      evidenceCreated = true;
    } catch (error) {
      if (!(error instanceof UniqueConstraintError || error.name === 'SequelizeUniqueConstraintError')) throw error;
      evidence = await models.BusinessEntityLinkEvidence.findOne({
        where: { businessEntityLinkId: link.id, evidenceKey: proposal.evidenceKey },
        transaction
      });
      if (!evidence || evidence.evidenceHash !== hashedEvidence) {
        throw new ValidationError('Concurrent relationship evidence conflicted with this proposal');
      }
    }
  }
  if (proposal.confidence != null && (link.confidence == null || proposal.confidence > Number(link.confidence))) {
    await link.update({ confidence: proposal.confidence }, { transaction });
  }
  return {
    link,
    evidence,
    linkCreated,
    evidenceCreated,
    duplicate: !linkCreated && !evidenceCreated,
    automationEligible: false
  };
}

async function proposeBusinessEntityLink({ wineryId, input, transaction }) {
  if (transaction) return proposeBusinessEntityLinkInternal({ wineryId, input, transaction });
  return models.sequelize.transaction(inner => proposeBusinessEntityLinkInternal({
    wineryId,
    input,
    transaction: inner
  }));
}

async function requireActor({ wineryId, actorUserId, transaction }) {
  return requireTenantRecord({
    wineryId,
    modelName: 'User',
    id: actorUserId,
    label: 'Actor',
    transaction
  });
}

async function existingAudit({ wineryId, action, requestId, linkId, transaction }) {
  const audit = await models.IntegrationOperationAuditEvent.findOne({
    where: { wineryId, action, requestId },
    transaction
  });
  if (audit && linkId != null && Number(audit.targetId) !== Number(linkId)) {
    throw new ValidationError('requestId was already used for another business entity link');
  }
  return audit;
}

async function loadLink({ wineryId, linkId, transaction, lock = false, includeEvidence = false }) {
  const link = await models.BusinessEntityLink.findOne({
    where: { id: linkId, wineryId },
    ...(includeEvidence ? {
      include: [{
        association: 'Evidence',
        include: [
          { association: 'SourceConnection', attributes: ['id', 'connectionKey', 'providerKey'], required: false },
          { association: 'SourceReference', attributes: ['id', 'resourceType', 'externalId'], required: false }
        ]
      }]
    } : {}),
    transaction,
    ...(lock ? { lock: transaction.LOCK.UPDATE } : {})
  });
  if (!link) throw new NotFoundError('Business entity link not found');
  return link;
}

async function createManagerConfirmedLink({ wineryId, actorUserId, data }) {
  return models.sequelize.transaction(async transaction => {
    await requireActor({ wineryId, actorUserId, transaction });
    const prior = await existingAudit({
      wineryId,
      action: 'BUSINESS_ENTITY_LINK_CREATED',
      requestId: data.requestId,
      transaction
    });
    if (prior) {
      const endpoints = normalizeEndpoints(data);
      const expectedLinkKey = buildLinkKey(endpoints);
      const priorLink = await loadLink({
        wineryId,
        linkId: Number(prior.targetId),
        transaction,
        includeEvidence: true
      });
      if (priorLink.linkKey !== expectedLinkKey) {
        throw new ValidationError('requestId was already used for another business entity relationship');
      }
      return {
        link: priorLink,
        duplicate: true,
        automationEligible: false
      };
    }
    const result = await proposeBusinessEntityLinkInternal({
      wineryId,
      transaction,
      allowManagerConfirmed: true,
      input: {
        ...data,
        evidenceKey: `manager:${data.requestId}`,
        evidenceSummary: data.reason,
        derivationType: 'MANAGER_CONFIRMED',
        derivationVersion: 'manager-command-v1',
        confidence: 1,
        observedAt: new Date(),
        createdBy: actorUserId,
        metadata: null
      }
    });
    await models.IntegrationOperationAuditEvent.create({
      wineryId,
      actorUserId,
      action: 'BUSINESS_ENTITY_LINK_CREATED',
      targetType: 'BUSINESS_ENTITY_LINK',
      targetId: String(result.link.id),
      requestId: data.requestId,
      reason: data.reason,
      beforeSnapshot: null,
      afterSnapshot: snapshotLink(result.link),
      metadata: { relationshipType: result.link.relationshipType }
    }, { transaction });
    return { ...result, duplicate: false };
  });
}

const TRANSITIONS = Object.freeze({
  CONFIRM: Object.freeze({
    action: 'BUSINESS_ENTITY_LINK_CONFIRMED',
    from: ['UNREVIEWED'],
    status: 'CONFIRMED'
  }),
  REJECT: Object.freeze({
    action: 'BUSINESS_ENTITY_LINK_REJECTED',
    from: ['UNREVIEWED'],
    status: 'REJECTED'
  }),
  INVALIDATE: Object.freeze({
    action: 'BUSINESS_ENTITY_LINK_INVALIDATED',
    from: ['UNREVIEWED', 'CONFIRMED'],
    status: 'INVALIDATED'
  })
});

async function transitionBusinessEntityLink({ wineryId, linkId, actorUserId, action, requestId, reason }) {
  const normalizedAction = String(action || '').trim().toUpperCase();
  const transition = TRANSITIONS[normalizedAction];
  if (!transition) throw new ValidationError('Business entity link action is not supported');
  return models.sequelize.transaction(async transaction => {
    await requireActor({ wineryId, actorUserId, transaction });
    const prior = await existingAudit({
      wineryId,
      action: transition.action,
      requestId,
      linkId,
      transaction
    });
    if (prior) {
      return {
        link: await loadLink({ wineryId, linkId, transaction, includeEvidence: true }),
        duplicate: true,
        automationEligible: false
      };
    }
    const link = await loadLink({ wineryId, linkId, transaction, lock: true });
    if (!transition.from.includes(link.confirmationStatus)) {
      throw new ValidationError(
        `Business entity link cannot ${normalizedAction.toLowerCase()} from ${link.confirmationStatus}`
      );
    }
    const before = snapshotLink(link);
    const now = new Date();
    if (transition.status === 'CONFIRMED') {
      await link.update({
        confirmationStatus: 'CONFIRMED',
        confirmedBy: actorUserId,
        confirmedAt: now
      }, { transaction });
    } else {
      await link.update({
        confirmationStatus: transition.status,
        isActive: false,
        validTo: now,
        invalidatedBy: actorUserId,
        invalidatedAt: now,
        invalidationReason: reason
      }, { transaction });
    }
    await models.IntegrationOperationAuditEvent.create({
      wineryId,
      actorUserId,
      action: transition.action,
      targetType: 'BUSINESS_ENTITY_LINK',
      targetId: String(link.id),
      requestId,
      reason,
      beforeSnapshot: before,
      afterSnapshot: snapshotLink(link),
      metadata: { relationshipType: link.relationshipType }
    }, { transaction });
    return {
      link: await loadLink({ wineryId, linkId, transaction, includeEvidence: true }),
      duplicate: false,
      automationEligible: false
    };
  });
}

function listRelationshipDefinitions() {
  return BUSINESS_ENTITY_RELATIONSHIP_TYPES.map(relationshipType => ({
    relationshipType,
    ...RELATIONSHIP_DEFINITIONS[relationshipType],
    managerConfirmationRequiredForAutomation: true,
    currentlyAutomationEligible: false
  }));
}

async function listBusinessEntityLinks({
  wineryId,
  page = 1,
  pageSize = 25,
  relationshipType = 'ALL',
  confirmationStatus = 'ALL',
  entityType,
  entityId
}) {
  const where = { wineryId };
  if (relationshipType !== 'ALL') where.relationshipType = relationshipType;
  if (confirmationStatus !== 'ALL') where.confirmationStatus = confirmationStatus;
  if (entityType && entityId) {
    where[Op.or] = [
      { sourceType: entityType, sourceId: entityId },
      { targetType: entityType, targetId: entityId }
    ];
  }
  const result = await models.BusinessEntityLink.findAndCountAll({
    where,
    include: [{ association: 'Evidence', attributes: ['id'] }],
    order: [['updatedAt', 'DESC'], ['id', 'DESC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
    distinct: true
  });
  return {
    businessEntityLinks: result.rows.map(row => ({
      ...snapshotLink(row),
      evidenceCount: row.Evidence?.length || 0,
      automationEligible: false
    })),
    pagination: { page, pageSize, total: result.count, totalPages: Math.ceil(result.count / pageSize) }
  };
}

async function getBusinessEntityLink({ wineryId, linkId }) {
  const link = await loadLink({ wineryId, linkId, includeEvidence: true });
  const plain = link.toJSON();
  return {
    ...plain,
    confidence: plain.confidence == null ? null : Number(plain.confidence),
    automationEligible: false
  };
}

async function retargetCustomerLinksForMerge({ wineryId, sourceMemberId, targetMemberId, transaction }) {
  if (!transaction) throw new ValidationError('Business entity link merge retarget requires a transaction');
  const links = await models.BusinessEntityLink.findAll({
    where: {
      wineryId,
      [Op.or]: [
        { sourceType: 'CUSTOMER', sourceId: sourceMemberId },
        { targetType: 'CUSTOMER', targetId: sourceMemberId }
      ]
    },
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  const report = { retargeted: 0, invalidated: 0, duplicateLinksInvalidated: 0 };
  const now = new Date();
  for (const link of links) {
    let source = {
      type: link.sourceType,
      id: link.sourceType === 'CUSTOMER' && link.sourceId === sourceMemberId
        ? targetMemberId
        : link.sourceId
    };
    let target = {
      type: link.targetType,
      id: link.targetType === 'CUSTOMER' && link.targetId === sourceMemberId
        ? targetMemberId
        : link.targetId
    };
    if (source.type === target.type && source.id === target.id) {
      await link.update({
        confirmationStatus: 'INVALIDATED',
        isActive: false,
        validTo: now,
        invalidatedAt: now,
        invalidationReason: 'Customer merge collapsed both relationship endpoints.'
      }, { transaction });
      report.invalidated += 1;
      continue;
    }
    const definition = RELATIONSHIP_DEFINITIONS[link.relationshipType];
    if (definition?.symmetric && source.type === target.type
      && `${source.type}:${source.id}` > `${target.type}:${target.id}`) {
      [source, target] = [target, source];
    }
    const linkKey = buildLinkKey({ relationshipType: link.relationshipType, source, target });
    const duplicate = await models.BusinessEntityLink.findOne({
      where: { wineryId, linkKey, id: { [Op.ne]: link.id } },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (duplicate) {
      await link.update({
        confirmationStatus: 'INVALIDATED',
        isActive: false,
        validTo: now,
        invalidatedAt: now,
        invalidationReason: `Customer merge produced existing relationship #${duplicate.id}.`
      }, { transaction });
      report.duplicateLinksInvalidated += 1;
      continue;
    }
    await link.update({
      sourceType: source.type,
      sourceId: source.id,
      targetType: target.type,
      targetId: target.id,
      linkKey
    }, { transaction });
    report.retargeted += 1;
  }
  return report;
}

module.exports = {
  RELATIONSHIP_DEFINITIONS,
  RESOURCE_MODEL_NAMES,
  normalizeEndpoints,
  buildLinkKey,
  validatePublicMetadata,
  proposeBusinessEntityLink,
  createManagerConfirmedLink,
  transitionBusinessEntityLink,
  listRelationshipDefinitions,
  listBusinessEntityLinks,
  getBusinessEntityLink,
  retargetCustomerLinksForMerge
};
