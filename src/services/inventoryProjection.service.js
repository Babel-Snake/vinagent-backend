const crypto = require('crypto');
const Joi = require('joi');
const { Op } = require('sequelize');
const models = require('../models');
const { NotFoundError, ValidationError } = require('../utils/errors');
const {
  INVENTORY_COMMITMENT_DERIVATIONS,
  INVENTORY_COMMITMENT_SOURCE_TYPES,
  INVENTORY_COMMITMENT_STATUSES,
  INVENTORY_POSITION_QUALITY_STATES
} = require('./integrationDataRegistry.service');
const {
  buildProjectionIssueFingerprint,
  stableSerialize
} = require('./integrationDataFoundation.service');

const CONTRACT_VERSION = 'inventory-position-shadow.v1';
const ACTIVE_COMMITMENT_STATUSES = Object.freeze(['EXPECTED', 'RESERVED']);
const FORBIDDEN_KEY = /(?:password|passphrase|secret|token|credential|api[_-]?key|private[_-]?key|authorization|email|phone|address|dateOfBirth|card|cvv|bank[_-]?account|account[_-]?number|routing[_-]?number|\bpan\b|iban|\bbsb\b)/i;
const stableKey = max => Joi.string().trim().pattern(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/).max(max);
const unitSchema = Joi.string().trim().uppercase().pattern(/^[A-Z0-9_.-]+$/).max(40);
const quantity = Joi.number().min(-999999999.999).max(999999999.999).precision(3);
const nonNegativeQuantity = Joi.number().min(0).max(999999999.999).precision(3);
const nullableIsoDate = Joi.date().iso().allow(null);

const inventoryPositionSnapshotSchema = Joi.object({
  contractVersion: Joi.string().valid(CONTRACT_VERSION).required(),
  externalId: Joi.string().trim().min(1).max(255).required(),
  productVariantId: Joi.number().integer().positive().required(),
  stockLocationId: Joi.number().integer().positive().required(),
  onHandQuantity: quantity.required(),
  availableQuantity: quantity.required(),
  reservedQuantity: nonNegativeQuantity.default(0),
  incomingQuantity: nonNegativeQuantity.default(0),
  damagedQuantity: nonNegativeQuantity.default(0),
  heldQuantity: nonNegativeQuantity.default(0),
  unit: unitSchema.required(),
  incomingExpectedAt: nullableIsoDate,
  sourceAssertedAt: Joi.date().iso().required(),
  sourceUpdatedAt: Joi.date().iso().required(),
  observedAt: Joi.date().iso().required(),
  staleAt: Joi.date().iso().required(),
  sourceRevision: Joi.string().trim().min(1).max(255).required(),
  authorityPolicyVersion: stableKey(120).required(),
  qualityState: Joi.string().trim().uppercase()
    .valid(...INVENTORY_POSITION_QUALITY_STATES).default('SOURCE_ASSERTED'),
  deletedAtSource: nullableIsoDate,
  providerExtensions: Joi.object().unknown(true).allow(null)
}).unknown(false);

const inventoryCommitmentSchema = Joi.object({
  productVariantId: Joi.number().integer().positive().required(),
  stockLocationId: Joi.number().integer().positive().required(),
  sourceType: Joi.string().trim().uppercase().valid(...INVENTORY_COMMITMENT_SOURCE_TYPES).required(),
  sourceId: Joi.number().integer().positive().required(),
  purposeKey: stableKey(180).required(),
  quantity: nonNegativeQuantity.greater(0).required(),
  unit: unitSchema.required(),
  requiredAt: Joi.date().iso().required(),
  status: Joi.string().trim().uppercase().valid(...INVENTORY_COMMITMENT_STATUSES).required(),
  confidence: Joi.number().min(0).max(1).precision(4).default(1),
  derivation: Joi.string().trim().uppercase().valid(...INVENTORY_COMMITMENT_DERIVATIONS).required(),
  derivationVersion: stableKey(120).required(),
  sourceReferenceId: Joi.number().integer().positive().allow(null),
  sourceEventId: Joi.number().integer().positive().allow(null),
  sourceUpdatedAt: Joi.date().iso().required(),
  observedAt: Joi.date().iso().required(),
  metadata: Joi.object().unknown(true).allow(null)
}).unknown(false);

function assertPublicObject(value, path) {
  if (value == null) return;
  const inspect = (current, currentPath) => {
    if (Array.isArray(current)) return current.forEach((item, index) => inspect(item, `${currentPath}[${index}]`));
    if (!current || typeof current !== 'object' || current instanceof Date) return;
    for (const [key, nested] of Object.entries(current)) {
      if (FORBIDDEN_KEY.test(key)) throw new ValidationError(`${path} contains a forbidden field at ${currentPath}.${key}`);
      inspect(nested, `${currentPath}.${key}`);
    }
  };
  inspect(value, path);
}

function validatePositionSnapshot(input) {
  const { value, error } = inventoryPositionSnapshotSchema.validate(input, {
    abortEarly: false, stripUnknown: false, convert: true
  });
  if (error) throw new ValidationError('Inventory position snapshot contract validation failed', error.details);
  assertPublicObject(value.providerExtensions, 'providerExtensions');
  if (new Date(value.staleAt) <= new Date(value.observedAt)) {
    throw new ValidationError('Inventory staleAt must be later than observedAt');
  }
  if (new Date(value.sourceAssertedAt) > new Date(value.observedAt)) {
    throw new ValidationError('Inventory sourceAssertedAt cannot be later than observedAt');
  }
  if (value.incomingQuantity > 0 && !value.incomingExpectedAt) {
    throw new ValidationError('Inventory incomingExpectedAt is required when incoming quantity is present');
  }
  if (value.qualityState === 'MANAGER_CONFIRMED') {
    throw new ValidationError('Provider inventory projections cannot assert manager-confirmed quality');
  }
  return value;
}

function validateCommitment(input) {
  const { value, error } = inventoryCommitmentSchema.validate(input, {
    abortEarly: false, stripUnknown: false, convert: true
  });
  if (error) throw new ValidationError('Inventory commitment validation failed', error.details);
  assertPublicObject(value.metadata, 'metadata');
  return value;
}

const hashValue = value => crypto.createHash('sha256').update(stableSerialize(value)).digest('hex');

async function requireInventoryConnection({ wineryId, connectionId, transaction }) {
  const connection = await models.IntegrationConnection.findOne({
    where: { id: connectionId, wineryId },
    attributes: ['id', 'connectionKey', 'providerKey', 'status'],
    transaction
  });
  if (!connection) throw new NotFoundError('Integration connection not found');
  const scope = await models.IntegrationConnectionScope.findOne({
    where: { wineryId, connectionId, domain: 'INVENTORY', isActive: true },
    transaction
  });
  if (!scope) throw new ValidationError('Connection does not have an active INVENTORY scope');
  return connection;
}

async function requireMappings({ wineryId, productVariantId, stockLocationId, transaction, active = true }) {
  const [productVariant, stockLocation] = await Promise.all([
    models.ProductVariant.findOne({
      where: { id: productVariantId, wineryId, ...(active ? { isActive: true } : {}) },
      transaction
    }),
    models.StockLocation.findOne({
      where: { id: stockLocationId, wineryId, ...(active ? { isActive: true } : {}) },
      transaction
    })
  ]);
  if (!productVariant) throw new ValidationError('Inventory product variant is not an active winery mapping');
  if (!stockLocation) throw new ValidationError('Inventory stock location is not an active winery mapping');
  return { productVariant, stockLocation };
}

async function recordIssue({
  wineryId,
  connectionId,
  referenceId,
  externalId,
  issueType,
  title,
  summary,
  evidence,
  sourceVersion,
  severity = 'ERROR',
  transaction
}) {
  const fingerprint = buildProjectionIssueFingerprint({
    connectionId,
    resourceType: 'INVENTORY_POSITION',
    externalId,
    issueType,
    evidence,
    sourceVersion
  });
  const existing = await models.ProjectionIssue.findOne({ where: { wineryId, fingerprint }, transaction });
  if (existing) {
    await existing.update({
      status: 'OPEN',
      severity,
      lastObservedAt: new Date(),
      observationCount: Number(existing.observationCount || 0) + 1
    }, { transaction });
    return existing;
  }
  return models.ProjectionIssue.create({
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
    sourceVersion,
    observationCount: 1,
    detectedAt: new Date(),
    lastObservedAt: new Date()
  }, { transaction });
}

async function inspectReference({ wineryId, connectionId, snapshot, payloadHash, transaction }) {
  let reference = await models.ExternalResourceReference.findOne({
    where: { connectionId, resourceType: 'INVENTORY_POSITION', externalId: snapshot.externalId },
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (reference?.providerUpdatedAt) {
    const incomingTime = new Date(snapshot.sourceUpdatedAt).getTime();
    const currentTime = new Date(reference.providerUpdatedAt).getTime();
    if (incomingTime < currentTime) return { reference, state: 'STALE' };
    if (incomingTime === currentTime && reference.sourceHash && reference.sourceHash !== payloadHash) {
      return { reference, state: 'CONFLICT' };
    }
  }
  const values = {
    wineryId,
    connectionId,
    resourceType: 'INVENTORY_POSITION',
    externalId: snapshot.externalId,
    providerVersion: snapshot.sourceRevision,
    sourceHash: payloadHash,
    providerUpdatedAt: snapshot.sourceUpdatedAt,
    observedAt: snapshot.observedAt,
    lastSyncedAt: snapshot.observedAt,
    deletedAtSource: snapshot.deletedAtSource || null,
    providerExtensions: snapshot.providerExtensions || null
  };
  reference = reference
    ? await reference.update(values, { transaction })
    : await models.ExternalResourceReference.create({
      ...values,
      resolutionStatus: 'UNRESOLVED'
    }, { transaction });
  return { reference, state: 'CURRENT' };
}

function positionValues({ wineryId, connectionId, referenceId, snapshot, payloadHash }) {
  return {
    wineryId,
    productVariantId: snapshot.productVariantId,
    stockLocationId: snapshot.stockLocationId,
    primarySourceReferenceId: referenceId,
    authorityConnectionId: connectionId,
    onHandQuantity: snapshot.onHandQuantity,
    availableQuantity: snapshot.availableQuantity,
    reservedQuantity: snapshot.reservedQuantity,
    incomingQuantity: snapshot.incomingQuantity,
    damagedQuantity: snapshot.damagedQuantity,
    heldQuantity: snapshot.heldQuantity,
    unit: snapshot.unit,
    incomingExpectedAt: snapshot.incomingExpectedAt || null,
    sourceAssertedAt: snapshot.sourceAssertedAt,
    sourceUpdatedAt: snapshot.sourceUpdatedAt,
    observedAt: snapshot.observedAt,
    staleAt: snapshot.staleAt,
    sourceRevision: snapshot.sourceRevision,
    sourceHash: payloadHash,
    authorityPolicyVersion: snapshot.authorityPolicyVersion,
    qualityState: snapshot.qualityState,
    deletedAtSource: snapshot.deletedAtSource || null,
    providerExtensions: snapshot.providerExtensions || null
  };
}

async function projectInventoryPositionSnapshotInternal({
  wineryId,
  connectionId,
  input,
  sourceEventId = null,
  transaction
}) {
  const snapshot = validatePositionSnapshot(input);
  await requireInventoryConnection({ wineryId, connectionId, transaction });
  await requireMappings({
    wineryId,
    productVariantId: snapshot.productVariantId,
    stockLocationId: snapshot.stockLocationId,
    transaction
  });
  if (sourceEventId) {
    const sourceEvent = await models.IntegrationEvent.findOne({
      where: { id: sourceEventId, wineryId, connectionId },
      attributes: ['id'],
      transaction
    });
    if (!sourceEvent) throw new ValidationError('Inventory source event does not belong to the connection');
  }
  const payloadHash = hashValue(snapshot);
  const referenceResult = await inspectReference({
    wineryId, connectionId, snapshot, payloadHash, transaction
  });
  const reference = referenceResult.reference;
  if (referenceResult.state === 'STALE') {
    await recordIssue({
      wineryId,
      connectionId,
      referenceId: reference.id,
      externalId: snapshot.externalId,
      issueType: 'OUT_OF_ORDER',
      title: 'Older inventory update ignored',
      summary: 'The incoming inventory state predates the current source observation.',
      evidence: {
        incomingUpdatedAt: new Date(snapshot.sourceUpdatedAt).toISOString(),
        currentUpdatedAt: new Date(reference.providerUpdatedAt).toISOString()
      },
      sourceVersion: snapshot.sourceRevision,
      transaction
    });
    return { status: 'STALE_IGNORED', inventoryPositionId: reference.canonicalId || null };
  }
  if (referenceResult.state === 'CONFLICT') {
    await reference.update({ resolutionStatus: 'AMBIGUOUS' }, { transaction });
    await recordIssue({
      wineryId,
      connectionId,
      referenceId: reference.id,
      externalId: snapshot.externalId,
      issueType: 'SOURCE_CONFLICT',
      title: 'Inventory revision contains conflicting state',
      summary: 'The same source update time was observed with different inventory content.',
      evidence: { sourceUpdatedAt: new Date(snapshot.sourceUpdatedAt).toISOString() },
      sourceVersion: snapshot.sourceRevision,
      severity: 'BLOCKING',
      transaction
    });
    return { status: 'SOURCE_CONFLICT', inventoryPositionId: reference.canonicalId || null };
  }

  let position = await models.InventoryPosition.findOne({
    where: { primarySourceReferenceId: reference.id },
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  const keyOwner = await models.InventoryPosition.findOne({
    where: {
      wineryId,
      productVariantId: snapshot.productVariantId,
      stockLocationId: snapshot.stockLocationId,
      ...(position ? { id: { [Op.ne]: position.id } } : {})
    },
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (keyOwner) {
    await reference.update({ resolutionStatus: 'AMBIGUOUS' }, { transaction });
    await keyOwner.update({ qualityState: 'CONFLICTING' }, { transaction });
    await recordIssue({
      wineryId,
      connectionId,
      referenceId: reference.id,
      externalId: snapshot.externalId,
      issueType: 'SOURCE_CONFLICT',
      title: 'Inventory authority conflict',
      summary: 'Another source already owns the current variant and stock-location position.',
      evidence: {
        productVariantId: snapshot.productVariantId,
        stockLocationId: snapshot.stockLocationId,
        existingPositionId: keyOwner.id,
        existingAuthorityConnectionId: keyOwner.authorityConnectionId
      },
      sourceVersion: snapshot.sourceRevision,
      severity: 'BLOCKING',
      transaction
    });
    return { status: 'SOURCE_CONFLICT', inventoryPositionId: keyOwner.id };
  }

  const values = positionValues({ wineryId, connectionId, referenceId: reference.id, snapshot, payloadHash });
  position = position
    ? await position.update(values, { transaction })
    : await models.InventoryPosition.create(values, { transaction });
  const snapshotKey = `inventory:${hashValue({
    sourceRevision: snapshot.sourceRevision,
    sourceUpdatedAt: snapshot.sourceUpdatedAt,
    sourceHash: payloadHash
  })}`;
  const [history, snapshotCreated] = await models.InventorySnapshot.findOrCreate({
    where: { inventoryPositionId: position.id, snapshotKey },
    defaults: {
      wineryId,
      inventoryPositionId: position.id,
      productVariantId: snapshot.productVariantId,
      stockLocationId: snapshot.stockLocationId,
      sourceReferenceId: reference.id,
      sourceEventId,
      authorityConnectionId: connectionId,
      snapshotKey,
      onHandQuantity: snapshot.onHandQuantity,
      availableQuantity: snapshot.availableQuantity,
      reservedQuantity: snapshot.reservedQuantity,
      incomingQuantity: snapshot.incomingQuantity,
      damagedQuantity: snapshot.damagedQuantity,
      heldQuantity: snapshot.heldQuantity,
      unit: snapshot.unit,
      incomingExpectedAt: snapshot.incomingExpectedAt || null,
      sourceAssertedAt: snapshot.sourceAssertedAt,
      sourceUpdatedAt: snapshot.sourceUpdatedAt,
      observedAt: snapshot.observedAt,
      staleAt: snapshot.staleAt,
      sourceRevision: snapshot.sourceRevision,
      sourceHash: payloadHash,
      authorityPolicyVersion: snapshot.authorityPolicyVersion,
      qualityState: snapshot.qualityState
    },
    transaction
  });
  if (!snapshotCreated && history.sourceHash !== payloadHash) {
    throw new ValidationError('Inventory snapshot key collision detected');
  }
  await reference.update({
    canonicalType: 'INVENTORY_POSITION',
    canonicalId: position.id,
    resolutionStatus: 'RESOLVED',
    resolutionMethod: 'EXPLICIT_VARIANT_LOCATION_MAPPING',
    resolutionConfidence: 1,
    resolvedAt: new Date()
  }, { transaction });
  return {
    status: 'PROJECTED_SHADOW',
    inventoryPositionId: position.id,
    snapshotCreated,
    automationEligible: false
  };
}

async function projectInventoryPositionSnapshot(options) {
  if (options.transaction) return projectInventoryPositionSnapshotInternal(options);
  return models.sequelize.transaction(transaction => projectInventoryPositionSnapshotInternal({
    ...options, transaction
  }));
}

const SOURCE_MODELS = Object.freeze({
  BOOKING: 'Booking',
  WINE_CLUB_ALLOCATION: 'WineClubAllocation',
  SALES_ORDER: 'SalesOrder'
});

async function validateCommitmentSource({ wineryId, input, transaction }) {
  if (input.sourceType === 'INTERNAL_EVENT') return;
  const model = models[SOURCE_MODELS[input.sourceType]];
  const source = await model.findOne({ where: { id: input.sourceId, wineryId }, attributes: ['id'], transaction });
  if (!source) throw new ValidationError('Inventory commitment source does not belong to the winery');
}

async function upsertInventoryCommitmentInternal({ wineryId, input, transaction }) {
  const value = validateCommitment(input);
  await requireMappings({
    wineryId,
    productVariantId: value.productVariantId,
    stockLocationId: value.stockLocationId,
    transaction
  });
  await validateCommitmentSource({ wineryId, input: value, transaction });
  if (value.sourceReferenceId) {
    const reference = await models.ExternalResourceReference.findOne({
      where: { id: value.sourceReferenceId, wineryId },
      attributes: ['id'],
      transaction
    });
    if (!reference) throw new ValidationError('Inventory commitment source reference does not belong to the winery');
  }
  if (value.sourceEventId) {
    const event = await models.IntegrationEvent.findOne({
      where: { id: value.sourceEventId, wineryId },
      attributes: ['id'],
      transaction
    });
    if (!event) throw new ValidationError('Inventory commitment source event does not belong to the winery');
  }
  const where = {
    wineryId,
    sourceType: value.sourceType,
    sourceId: value.sourceId,
    productVariantId: value.productVariantId,
    stockLocationId: value.stockLocationId,
    purposeKey: value.purposeKey
  };
  let commitment = await models.InventoryCommitment.findOne({
    where, transaction, lock: transaction.LOCK.UPDATE
  });
  if (commitment && new Date(value.sourceUpdatedAt) < new Date(commitment.sourceUpdatedAt)) {
    return { status: 'STALE_IGNORED', commitment, created: false };
  }
  const released = ['RELEASED', 'CANCELLED'].includes(value.status);
  const values = {
    ...where,
    quantity: value.quantity,
    unit: value.unit,
    requiredAt: value.requiredAt,
    status: value.status,
    confidence: value.confidence,
    derivation: value.derivation,
    derivationVersion: value.derivationVersion,
    sourceReferenceId: value.sourceReferenceId || null,
    sourceEventId: value.sourceEventId || null,
    sourceUpdatedAt: value.sourceUpdatedAt,
    observedAt: value.observedAt,
    releasedAt: released ? (commitment?.releasedAt || new Date()) : null,
    metadata: value.metadata || null
  };
  const created = !commitment;
  commitment = commitment
    ? await commitment.update(values, { transaction })
    : await models.InventoryCommitment.create(values, { transaction });
  return { status: 'UPSERTED', commitment, created };
}

async function upsertInventoryCommitment(options) {
  if (options.transaction) return upsertInventoryCommitmentInternal(options);
  return models.sequelize.transaction(transaction => upsertInventoryCommitmentInternal({
    ...options, transaction
  }));
}

function toMilli(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new ValidationError('Inventory quantity is not finite');
  return Math.round(numeric * 1000);
}

const fromMilli = value => value / 1000;

async function calculateAvailableToPromise({
  wineryId,
  productVariantId,
  stockLocationId,
  requiredAt = new Date(),
  additionalRequiredQuantity = 0,
  includeIncoming = false,
  unit = null,
  now = new Date(),
  transaction
}) {
  const mappings = await requireMappings({
    wineryId, productVariantId, stockLocationId, transaction, active: false
  });
  const base = {
    productVariant: mappings.productVariant,
    stockLocation: mappings.stockLocation,
    requiredAt: new Date(requiredAt),
    evaluatedAt: new Date(now),
    additionalRequiredQuantity: Number(additionalRequiredQuantity || 0),
    includeIncoming: Boolean(includeIncoming),
    automationEligible: false
  };
  const position = await models.InventoryPosition.findOne({
    where: { wineryId, productVariantId, stockLocationId },
    transaction
  });
  if (!position) return { ...base, status: 'UNKNOWN', reason: 'POSITION_MISSING', calculationReliable: false };
  const positionSummary = {
    id: position.id,
    unit: position.unit,
    availableQuantity: Number(position.availableQuantity),
    incomingQuantity: Number(position.incomingQuantity),
    incomingExpectedAt: position.incomingExpectedAt,
    observedAt: position.observedAt,
    staleAt: position.staleAt,
    qualityState: position.qualityState,
    authorityConnectionId: position.authorityConnectionId
  };
  if (position.deletedAtSource) {
    return { ...base, position: positionSummary, status: 'UNKNOWN', reason: 'POSITION_DELETED_AT_SOURCE', calculationReliable: false };
  }
  if (!mappings.productVariant.isActive || !mappings.stockLocation.isActive) {
    return { ...base, position: positionSummary, status: 'UNKNOWN', reason: 'MAPPING_INACTIVE', calculationReliable: false };
  }
  if (position.qualityState === 'CONFLICTING') {
    return { ...base, position: positionSummary, status: 'SOURCE_CONFLICT', reason: 'POSITION_AUTHORITY_CONFLICT', calculationReliable: false };
  }
  if (!['SOURCE_ASSERTED', 'MANAGER_CONFIRMED'].includes(position.qualityState)) {
    return { ...base, position: positionSummary, status: 'UNKNOWN', reason: 'POSITION_QUALITY_UNKNOWN', calculationReliable: false };
  }
  if (new Date(position.staleAt) <= new Date(now)) {
    return { ...base, position: positionSummary, status: 'STALE', reason: 'POSITION_STALE', calculationReliable: false };
  }
  if (new Date(position.observedAt).getTime() > new Date(now).getTime() + (5 * 60 * 1000)) {
    return {
      ...base,
      position: positionSummary,
      status: 'UNKNOWN',
      reason: 'POSITION_OBSERVED_IN_FUTURE',
      calculationReliable: false
    };
  }
  const normalizedUnit = unit ? String(unit).trim().toUpperCase() : position.unit;
  if (normalizedUnit !== position.unit) {
    return { ...base, position: positionSummary, status: 'UNIT_MISMATCH', reason: 'REQUEST_UNIT_MISMATCH', calculationReliable: false };
  }
  const commitments = await models.InventoryCommitment.findAll({
    where: {
      wineryId,
      productVariantId,
      stockLocationId,
      status: { [Op.in]: ACTIVE_COMMITMENT_STATUSES },
      requiredAt: { [Op.lte]: new Date(requiredAt) }
    },
    order: [['requiredAt', 'ASC'], ['id', 'ASC']],
    transaction
  });
  const mismatched = commitments.filter(commitment => commitment.unit !== position.unit);
  if (mismatched.length > 0) {
    return {
      ...base,
      position: positionSummary,
      status: 'UNIT_MISMATCH',
      reason: 'COMMITMENT_UNIT_MISMATCH',
      mismatchedCommitmentIds: mismatched.map(commitment => commitment.id),
      calculationReliable: false
    };
  }
  const incomingIncluded = Boolean(includeIncoming)
    && Number(position.incomingQuantity) > 0
    && position.incomingExpectedAt
    && new Date(position.incomingExpectedAt) <= new Date(requiredAt);
  const supplyMilli = toMilli(position.availableQuantity)
    + (incomingIncluded ? toMilli(position.incomingQuantity) : 0);
  const committedMilli = commitments.reduce((sum, commitment) => sum + toMilli(commitment.quantity), 0);
  const additionalMilli = toMilli(additionalRequiredQuantity || 0);
  const netMilli = supplyMilli - committedMilli;
  const shortageMilli = Math.max(0, additionalMilli - netMilli);
  return {
    ...base,
    position: positionSummary,
    status: shortageMilli > 0 ? 'SHORTAGE' : 'AVAILABLE',
    reason: null,
    calculationReliable: true,
    unit: position.unit,
    supplyQuantity: fromMilli(supplyMilli),
    activeCommittedQuantity: fromMilli(committedMilli),
    netAvailableToPromiseQuantity: fromMilli(netMilli),
    shortageQuantity: fromMilli(shortageMilli),
    incomingIncluded,
    commitmentCount: commitments.length,
    commitments: commitments.map(commitment => ({
      id: commitment.id,
      sourceType: commitment.sourceType,
      sourceId: commitment.sourceId,
      purposeKey: commitment.purposeKey,
      quantity: Number(commitment.quantity),
      status: commitment.status,
      requiredAt: commitment.requiredAt
    }))
  };
}

module.exports = {
  CONTRACT_VERSION,
  ACTIVE_COMMITMENT_STATUSES,
  inventoryPositionSnapshotSchema,
  inventoryCommitmentSchema,
  validatePositionSnapshot,
  validateCommitment,
  projectInventoryPositionSnapshot,
  upsertInventoryCommitment,
  calculateAvailableToPromise
};
