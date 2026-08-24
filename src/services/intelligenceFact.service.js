const crypto = require('crypto');
const { Op, UniqueConstraintError } = require('sequelize');
const models = require('../models');
const { ValidationError } = require('../utils/errors');
const {
  INTELLIGENCE_FACT_DERIVATION_TYPES,
  INTELLIGENCE_FACT_QUALITY_CLASSES,
  includesRegistryValue
} = require('./integrationDataRegistry.service');
const { stableSerialize } = require('./integrationDataFoundation.service');
const {
  requireCanonicalResource
} = require('./canonicalResourceResolver.service');
const factRegistry = require('./intelligenceFactRegistry.service');
const bookingReadiness = require('./bookingReadinessContext.service');
const shipmentException = require('./shipmentExceptionContext.service');

const FAILURE_DELIVERY_STATUSES = new Set(['DEFERRED', 'BOUNCED', 'FAILED', 'UNDELIVERABLE']);
const SENSITIVE_KEY = /(?:password|passphrase|secret|token|credential|api[_-]?key|private[_-]?key|authorization|email|phone|address|contact|recipient|sender|subject|body|content|transcript|recording|dateOfBirth|card|cvv|bank[_-]?account|account[_-]?number|routing[_-]?number|\bpan\b|iban|\bbsb\b)/i;
const MATERIALIZER_VERSION = 'v1';

const hash = value => crypto.createHash('sha256').update(stableSerialize(value)).digest('hex');
const normalizeRegistry = (registry, value, fieldName) => {
  const normalized = String(value || '').trim().toUpperCase();
  if (!includesRegistryValue(registry, normalized)) {
    throw new ValidationError(fieldName + ' is not supported');
  }
  return normalized;
};

function validateEvidence(evidence) {
  if (evidence == null) return null;
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    throw new ValidationError('Fact evidence must be an object');
  }
  if (Buffer.byteLength(JSON.stringify(evidence), 'utf8') > 16384) {
    throw new ValidationError('Fact evidence is too large');
  }
  const inspect = (current, path) => {
    if (Array.isArray(current)) {
      current.forEach((item, index) => inspect(item, path + '[' + index + ']'));
      return;
    }
    if (!current || typeof current !== 'object' || current instanceof Date) return;
    for (const [key, child] of Object.entries(current)) {
      if (SENSITIVE_KEY.test(key)) {
        throw new ValidationError('Fact evidence contains a forbidden field at ' + path + '.' + key);
      }
      inspect(child, path + '.' + key);
    }
  };
  inspect(evidence, 'evidence');
  return evidence;
}

function validateTimes(input, now) {
  const observedAt = new Date(input.observedAt);
  if (Number.isNaN(observedAt.getTime())) throw new ValidationError('observedAt must be a valid date');
  if (observedAt.getTime() > now.getTime() + (5 * 60 * 1000)) {
    throw new ValidationError('observedAt is implausibly in the future');
  }
  const effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : null;
  const effectiveTo = input.effectiveTo ? new Date(input.effectiveTo) : null;
  const staleAt = input.staleAt ? new Date(input.staleAt) : null;
  if (effectiveFrom && Number.isNaN(effectiveFrom.getTime())) {
    throw new ValidationError('effectiveFrom must be a valid date');
  }
  if (effectiveTo && Number.isNaN(effectiveTo.getTime())) {
    throw new ValidationError('effectiveTo must be a valid date');
  }
  if (effectiveFrom && effectiveTo && effectiveTo <= effectiveFrom) {
    throw new ValidationError('effectiveTo must be later than effectiveFrom');
  }
  if (staleAt && (Number.isNaN(staleAt.getTime()) || staleAt <= observedAt)) {
    throw new ValidationError('staleAt must be later than observedAt');
  }
  return { observedAt, effectiveFrom, effectiveTo, staleAt };
}

async function validateOptionalTenantLinks({
  wineryId,
  areaId,
  sourceConnectionId,
  sourceEventId,
  sourceReferenceId,
  createdBy,
  transaction
}) {
  const [area, connection, event, reference, creator] = await Promise.all([
    areaId ? models.OperationalArea.findOne({ where: { id: areaId, wineryId }, attributes: ['id'], transaction }) : null,
    sourceConnectionId
      ? models.IntegrationConnection.findOne({
        where: { id: sourceConnectionId, wineryId },
        attributes: ['id'],
        transaction
      })
      : null,
    sourceEventId
      ? models.IntegrationEvent.findOne({
        where: { id: sourceEventId, wineryId },
        attributes: ['id', 'connectionId', 'externalResourceReferenceId'],
        transaction
      })
      : null,
    sourceReferenceId
      ? models.ExternalResourceReference.findOne({
        where: { id: sourceReferenceId, wineryId },
        attributes: ['id', 'connectionId'],
        transaction
      })
      : null,
    createdBy ? models.User.findOne({ where: { id: createdBy, wineryId }, attributes: ['id'], transaction }) : null
  ]);
  if (areaId && !area) throw new ValidationError('Fact area does not belong to the winery');
  if (sourceConnectionId && !connection) throw new ValidationError('Fact source connection does not belong to the winery');
  if (sourceEventId && !event) throw new ValidationError('Fact source event does not belong to the winery');
  if (sourceReferenceId && !reference) throw new ValidationError('Fact source reference does not belong to the winery');
  if (createdBy && !creator) throw new ValidationError('Fact creator does not belong to the winery');
  if (connection && reference && connection.id !== reference.connectionId) {
    throw new ValidationError('Fact source reference does not belong to its declared connection');
  }
  if (connection && event?.connectionId && connection.id !== event.connectionId) {
    throw new ValidationError('Fact source event does not belong to its declared connection');
  }
  if (reference && event?.externalResourceReferenceId
    && reference.id !== event.externalResourceReferenceId) {
    throw new ValidationError('Fact source event does not belong to its declared reference');
  }
}

async function writeFact({
  wineryId,
  subjectType,
  subjectId,
  factKey,
  value,
  qualityClass,
  derivationType,
  derivationKey,
  derivationVersion,
  areaId = null,
  confidence = null,
  effectiveFrom = null,
  effectiveTo = null,
  observedAt,
  staleAt = null,
  sourceConnectionId = null,
  sourceEventId = null,
  sourceReferenceId = null,
  evidence = null,
  materializationRunId = null,
  createdBy = null,
  transaction,
  now = new Date()
}) {
  if (!transaction) throw new ValidationError('Fact writes require a transaction');
  const definition = factRegistry.requireFactDefinition(factKey);
  const subject = await requireCanonicalResource({
    wineryId,
    resourceType: subjectType,
    resourceId: subjectId,
    transaction
  });
  if (!definition.subjectTypes.includes(subject.resourceType)) {
    throw new ValidationError(definition.factKey + ' does not support subject type ' + subject.resourceType);
  }
  const normalizedValue = factRegistry.validateFactValue(definition, value);
  const normalizedQuality = normalizeRegistry(
    INTELLIGENCE_FACT_QUALITY_CLASSES,
    qualityClass,
    'qualityClass'
  );
  const normalizedDerivation = normalizeRegistry(
    INTELLIGENCE_FACT_DERIVATION_TYPES,
    derivationType,
    'derivationType'
  );
  const normalizedConfidence = confidence == null ? null : Number(confidence);
  if (normalizedConfidence != null && (
    !Number.isFinite(normalizedConfidence)
    || normalizedConfidence < 0
    || normalizedConfidence > 1
  )) {
    throw new ValidationError('Fact confidence must be between 0 and 1');
  }
  if ((normalizedDerivation === 'AI_INFERRED') !== (normalizedQuality === 'AI_INFERRED')) {
    throw new ValidationError('AI fact derivation and quality must agree');
  }
  if (normalizedDerivation === 'AI_INFERRED' && normalizedConfidence == null) {
    throw new ValidationError('AI-inferred facts require confidence');
  }
  const normalizedDerivationKey = String(derivationKey || '').trim().toLowerCase();
  const normalizedDerivationVersion = String(derivationVersion || '').trim();
  if (!/^[a-z0-9][a-z0-9._:-]*$/.test(normalizedDerivationKey)
    || normalizedDerivationKey.length > 160) {
    throw new ValidationError('derivationKey must be a stable key of at most 160 characters');
  }
  if (!normalizedDerivationVersion || normalizedDerivationVersion.length > 80) {
    throw new ValidationError('derivationVersion must be between 1 and 80 characters');
  }
  const times = validateTimes({ observedAt, effectiveFrom, effectiveTo, staleAt }, now);
  const publicEvidence = validateEvidence(evidence);
  await validateOptionalTenantLinks({
    wineryId,
    areaId,
    sourceConnectionId,
    sourceEventId,
    sourceReferenceId,
    createdBy,
    transaction
  });
  const factIdentityKey = hash({
    subjectType: subject.resourceType,
    subjectId: subject.resourceId,
    factKey: definition.factKey,
    derivationKey: normalizedDerivationKey,
    sourceConnectionId: sourceConnectionId || null
  });
  const factVersionKey = hash({
    factIdentityKey,
    value: normalizedValue,
    qualityClass: normalizedQuality,
    confidence: normalizedConfidence,
    effectiveFrom: times.effectiveFrom?.toISOString() || null,
    effectiveTo: times.effectiveTo?.toISOString() || null,
    observedAt: times.observedAt.toISOString(),
    staleAt: times.staleAt?.toISOString() || null,
    sourceEventId: sourceEventId || null,
    sourceReferenceId: sourceReferenceId || null,
    derivationVersion: normalizedDerivationVersion,
    evidence: publicEvidence
  });
  const existing = await models.IntelligenceFact.findOne({
    where: { wineryId, factVersionKey },
    transaction
  });
  if (existing) return { fact: existing, duplicate: true, superseded: 0 };
  const current = await models.IntelligenceFact.findOne({
    where: { wineryId, factIdentityKey, supersededAt: null },
    order: [['observedAt', 'DESC'], ['id', 'DESC']],
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (current && new Date(current.observedAt) >= times.observedAt) {
    throw new ValidationError(
      new Date(current.observedAt).getTime() === times.observedAt.getTime()
        ? 'Fact evidence conflicts with the current fact at the same observedAt'
        : 'Fact evidence is older than the current fact and cannot regress it'
    );
  }
  const [superseded] = await models.IntelligenceFact.update({
    supersededAt: times.observedAt
  }, {
    where: { wineryId, factIdentityKey, supersededAt: null },
    transaction
  });
  const fact = await models.IntelligenceFact.create({
    wineryId,
    areaId,
    subjectType: subject.resourceType,
    subjectId: subject.resourceId,
    factKey: definition.factKey,
    factIdentityKey,
    factVersionKey,
    valueType: definition.valueType,
    valueJson: normalizedValue,
    unit: definition.unit,
    valueSchemaVersion: definition.valueSchemaVersion,
    qualityClass: normalizedQuality,
    confidence: normalizedConfidence,
    effectiveFrom: times.effectiveFrom,
    effectiveTo: times.effectiveTo,
    observedAt: times.observedAt,
    staleAt: times.staleAt,
    sourceConnectionId,
    sourceEventId,
    sourceReferenceId,
    derivationType: normalizedDerivation,
    derivationKey: normalizedDerivationKey,
    derivationVersion: normalizedDerivationVersion,
    evidence: publicEvidence,
    sensitivity: definition.sensitivity,
    materializationRunId,
    createdBy
  }, { transaction });
  return { fact, duplicate: false, superseded };
}

const staleFrom = (observedAt, maxAgeSeconds) => (
  new Date(new Date(observedAt).getTime() + (maxAgeSeconds * 1000))
);

async function materializeBooking({ wineryId, subjectId, maxAgeSeconds, transaction, now }) {
  const context = await bookingReadiness.resolveBookingReadiness({
    wineryId,
    input: { bookingId: subjectId, maxAgeSeconds },
    transaction,
    now
  });
  const common = {
    subjectType: 'BOOKING',
    subjectId,
    areaId: context.booking.primaryAreaId || null,
    qualityClass: 'DETERMINISTIC_DERIVED',
    derivationType: 'DETERMINISTIC',
    derivationKey: 'booking.readiness.v1',
    derivationVersion: MATERIALIZER_VERSION,
    observedAt: context.generatedAt,
    staleAt: staleFrom(context.generatedAt, maxAgeSeconds)
  };
  return [
    {
      ...common,
      factKey: 'booking.inventory_status',
      value: context.inventory.status,
      evidence: { contextPack: context.schemaVersion, code: context.inventory.code }
    },
    {
      ...common,
      factKey: 'booking.inventory_shortfall_count',
      value: context.inventory.checks.filter(check => check.status === 'SHORTAGE').length,
      evidence: {
        contextPack: context.schemaVersion,
        commitmentCount: context.inventory.commitmentCount
      }
    },
    {
      ...common,
      factKey: 'booking.workforce_status',
      value: context.workforce.status,
      evidence: { contextPack: context.workforce.contextVersion, code: context.workforce.code }
    },
    {
      ...common,
      factKey: 'booking.workforce_gap_count',
      value: context.workforce.gapCount,
      evidence: {
        contextPack: context.workforce.contextVersion,
        demandCount: context.workforce.demandCount
      }
    },
    {
      ...common,
      factKey: 'booking.operational_requirement_count',
      value: context.requirements.operational.length,
      evidence: {
        contextPack: context.schemaVersion,
        restrictedRequirementCountExcluded: context.requirements.restrictedCount
      }
    }
  ];
}

async function materializeShipment({ wineryId, subjectId, maxAgeSeconds, transaction, now }) {
  const context = await shipmentException.resolveShipmentException({
    wineryId,
    input: { shipmentId: subjectId, maxAgeSeconds },
    transaction,
    now
  });
  const common = {
    subjectType: 'SHIPMENT',
    subjectId,
    qualityClass: 'DETERMINISTIC_DERIVED',
    derivationType: 'DETERMINISTIC',
    derivationKey: 'shipment.exception.v1',
    derivationVersion: MATERIALIZER_VERSION,
    observedAt: context.generatedAt,
    staleAt: staleFrom(context.generatedAt, maxAgeSeconds)
  };
  return [
    {
      ...common,
      factKey: 'shipment.exception_active',
      value: context.exception.active,
      evidence: { contextPack: context.schemaVersion, category: context.exception.category }
    },
    {
      ...common,
      factKey: 'shipment.exception_severity',
      value: context.exception.severity,
      evidence: { contextPack: context.schemaVersion, category: context.exception.category }
    },
    {
      ...common,
      factKey: 'shipment.delivery_timing_status',
      value: context.timing.status,
      evidence: {
        contextPack: context.schemaVersion,
        varianceMinutes: context.timing.varianceMinutes
      }
    }
  ];
}

async function materializeMessage({ wineryId, subjectId, transaction, now }) {
  const { record: message } = await requireCanonicalResource({
    wineryId,
    resourceType: 'MESSAGE',
    resourceId: subjectId,
    attributes: [
      'id',
      'canonicalDeliveryStatus',
      'deliveryStatusOccurredAt',
      'deliveryFailureCategory',
      'updatedAt'
    ],
    transaction
  });
  const observedAt = message.deliveryStatusOccurredAt || message.updatedAt || now;
  const common = {
    subjectType: 'MESSAGE',
    subjectId,
    qualityClass: message.canonicalDeliveryStatus === 'UNKNOWN'
      ? 'UNKNOWN'
      : 'CANONICAL_RESOLVED',
    derivationType: 'DETERMINISTIC',
    derivationKey: 'message.delivery.v1',
    derivationVersion: MATERIALIZER_VERSION,
    observedAt
  };
  return [
    {
      ...common,
      factKey: 'message.delivery_status',
      value: message.canonicalDeliveryStatus,
      evidence: { currentFailureCategory: message.deliveryFailureCategory }
    },
    {
      ...common,
      factKey: 'message.delivery_failure_active',
      value: FAILURE_DELIVERY_STATUSES.has(message.canonicalDeliveryStatus),
      evidence: { currentFailureCategory: message.deliveryFailureCategory }
    }
  ];
}

const MATERIALIZERS = Object.freeze({
  'booking.readiness.v1': Object.freeze({
    subjectType: 'BOOKING',
    version: MATERIALIZER_VERSION,
    resolve: materializeBooking
  }),
  'shipment.exception.v1': Object.freeze({
    subjectType: 'SHIPMENT',
    version: MATERIALIZER_VERSION,
    resolve: materializeShipment
  }),
  'message.delivery.v1': Object.freeze({
    subjectType: 'MESSAGE',
    version: MATERIALIZER_VERSION,
    resolve: materializeMessage
  })
});

function listMaterializers() {
  return Object.entries(MATERIALIZERS).map(([materializerKey, definition]) => ({
    materializerKey,
    subjectType: definition.subjectType,
    version: definition.version
  }));
}

function requestIdentity(wineryId, requestId) {
  return hash({ wineryId, requestId: String(requestId).toLowerCase() });
}

function publicRun(run) {
  const plain = run.toJSON ? run.toJSON() : { ...run };
  delete plain.runKey;
  delete plain.requestHash;
  return plain;
}

async function materializeFacts({
  wineryId,
  actorUserId,
  data,
  now = new Date()
}) {
  const materializerKey = String(data.materializerKey || '').trim().toLowerCase();
  const materializer = MATERIALIZERS[materializerKey];
  if (!materializer) throw new ValidationError('materializerKey is not registered');
  const requestHash = hash({
    materializerKey,
    subjectId: data.subjectId,
    maxAgeSeconds: data.maxAgeSeconds,
    reason: data.reason
  });
  const runKey = requestIdentity(wineryId, data.requestId);
  const existing = await models.IntelligenceFactMaterializationRun.findOne({
    where: { wineryId, runKey }
  });
  if (existing) {
    if (existing.requestHash !== requestHash) {
      throw new ValidationError('requestId was already used for a different fact materialization');
    }
    return { run: publicRun(existing), duplicate: true };
  }
  await requireCanonicalResource({
    wineryId,
    resourceType: materializer.subjectType,
    resourceId: data.subjectId
  });
  const actor = await models.User.findOne({
    where: { id: actorUserId, wineryId },
    attributes: ['id']
  });
  if (!actor) throw new ValidationError('Fact materialization actor does not belong to the winery');
  let run;
  try {
    run = await models.IntelligenceFactMaterializationRun.create({
      wineryId,
      runKey,
      requestHash,
      materializerKey,
      materializerVersion: materializer.version,
      subjectType: materializer.subjectType,
      subjectId: data.subjectId,
      status: 'RUNNING',
      startedAt: now,
      reason: data.reason,
      requestedBy: actorUserId
    });
  } catch (error) {
    if (error instanceof UniqueConstraintError || error.name === 'SequelizeUniqueConstraintError') {
      const duplicate = await models.IntelligenceFactMaterializationRun.findOne({
        where: { wineryId, runKey }
      });
      if (duplicate?.requestHash === requestHash) {
        return { run: publicRun(duplicate), duplicate: true };
      }
    }
    throw error;
  }
  try {
    const counts = await models.sequelize.transaction(async transaction => {
      const inputs = await materializer.resolve({
        wineryId,
        subjectId: data.subjectId,
        maxAgeSeconds: data.maxAgeSeconds,
        transaction,
        now
      });
      const result = { factsCreated: 0, factsSuperseded: 0, duplicateFacts: 0 };
      for (const input of inputs) {
        const written = await writeFact({
          wineryId,
          ...input,
          materializationRunId: run.id,
          createdBy: actorUserId,
          transaction,
          now
        });
        if (written.duplicate) result.duplicateFacts += 1;
        else result.factsCreated += 1;
        result.factsSuperseded += written.superseded;
      }
      return result;
    });
    await run.update({
      status: 'COMPLETE',
      ...counts,
      completedAt: new Date()
    });
    return { run: publicRun(run), duplicate: false };
  } catch (error) {
    await run.update({
      status: 'FAILED',
      completedAt: new Date(),
      errorCode: String(error.code || 'FACT_MATERIALIZATION_FAILED').slice(0, 120),
      errorSummary: String(error.message || 'Fact materialization failed').slice(0, 500)
    });
    throw error;
  }
}

function publicFact(row, now = new Date()) {
  const plain = row.toJSON();
  delete plain.factIdentityKey;
  delete plain.factVersionKey;
  plain.freshness = plain.staleAt && new Date(plain.staleAt) <= now ? 'STALE' : 'CURRENT';
  return plain;
}

async function listFacts({
  wineryId,
  page = 1,
  pageSize = 50,
  subjectType,
  subjectId,
  factKey,
  qualityClass,
  freshness = 'ALL',
  currentOnly = true,
  now = new Date()
}) {
  const where = { wineryId };
  if (subjectType) where.subjectType = subjectType;
  if (subjectId) where.subjectId = subjectId;
  if (factKey) where.factKey = factKey;
  if (qualityClass) where.qualityClass = qualityClass;
  if (currentOnly) where.supersededAt = null;
  if (freshness === 'CURRENT') {
    where[Op.or] = [{ staleAt: null }, { staleAt: { [Op.gt]: now } }];
  } else if (freshness === 'STALE') {
    where.staleAt = { [Op.lte]: now };
  }
  const result = await models.IntelligenceFact.findAndCountAll({
    where,
    include: [
      { association: 'Area', attributes: ['id', 'name'] },
      {
        association: 'SourceConnection',
        attributes: ['id', 'connectionKey', 'providerKey', 'displayName', 'status']
      },
      {
        association: 'SourceReference',
        attributes: ['id', 'connectionId', 'providerVersion', 'observedAt', 'resolutionStatus']
      },
      {
        association: 'MaterializationRun',
        attributes: ['id', 'materializerKey', 'materializerVersion', 'status', 'startedAt']
      }
    ],
    order: [['observedAt', 'DESC'], ['id', 'DESC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
    distinct: true
  });
  return {
    intelligenceFacts: result.rows.map(row => publicFact(row, now)),
    pagination: {
      page,
      pageSize,
      total: result.count,
      totalPages: Math.ceil(result.count / pageSize)
    }
  };
}

async function listMaterializationRuns({
  wineryId,
  page = 1,
  pageSize = 25,
  materializerKey,
  subjectType,
  subjectId,
  status = 'ALL'
}) {
  const where = { wineryId };
  if (materializerKey) where.materializerKey = materializerKey;
  if (subjectType) where.subjectType = subjectType;
  if (subjectId) where.subjectId = subjectId;
  if (status !== 'ALL') where.status = status;
  const result = await models.IntelligenceFactMaterializationRun.findAndCountAll({
    where,
    attributes: { exclude: ['runKey', 'requestHash'] },
    include: [{ association: 'Requester', attributes: ['id', 'displayName', 'role'] }],
    order: [['startedAt', 'DESC'], ['id', 'DESC']],
    limit: pageSize,
    offset: (page - 1) * pageSize
  });
  return {
    materializationRuns: result.rows,
    pagination: {
      page,
      pageSize,
      total: result.count,
      totalPages: Math.ceil(result.count / pageSize)
    }
  };
}

module.exports = {
  MATERIALIZER_VERSION,
  MATERIALIZERS,
  validateEvidence,
  writeFact,
  listMaterializers,
  materializeFacts,
  publicRun,
  publicFact,
  listFacts,
  listMaterializationRuns
};
