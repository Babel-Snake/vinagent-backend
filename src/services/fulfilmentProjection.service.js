const crypto = require('crypto');
const Joi = require('joi');
const { Op } = require('sequelize');
const models = require('../models');
const { NotFoundError, ValidationError } = require('../utils/errors');
const {
  ENTITY_RESOLUTION_STATUSES,
  SHIPMENT_EXCEPTION_CATEGORIES,
  SHIPMENT_STATUSES,
  SHIPMENT_TRACKING_EVENT_CODES
} = require('./integrationDataRegistry.service');
const {
  buildProjectionIssueFingerprint,
  stableSerialize
} = require('./integrationDataFoundation.service');

const CONTRACT_VERSION = 'shipment-shadow.v1';
const FORBIDDEN_KEY = /(?:password|passphrase|secret|token|credential|api[_-]?key|private[_-]?key|authorization|email|phone|address|dateOfBirth|card|cvv|bank[_-]?account|account[_-]?number|routing[_-]?number|recipient|tracking(?:Number|Reference)?|\bpan\b|iban|\bbsb\b)/i;
const stableKey = max => Joi.string().trim().pattern(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/).max(max);
const unit = max => Joi.string().trim().uppercase().pattern(/^[A-Z0-9_.-]+$/).max(max);
const nullableText = max => Joi.string().trim().max(max).allow('', null);
const nullableIsoDate = Joi.date().iso().allow(null);
const positiveMeasure = Joi.number().positive().precision(3).max(999999999.999).allow(null);

const packageSchema = Joi.object({
  packageKey: stableKey(160).required(),
  trackingReference: Joi.string().trim().min(3).max(255).allow(null),
  packageType: nullableText(80),
  weight: positiveMeasure,
  weightUnit: unit(20).allow(null),
  length: positiveMeasure,
  width: positiveMeasure,
  height: positiveMeasure,
  dimensionUnit: unit(20).allow(null),
  providerExtensions: Joi.object().unknown(true).allow(null)
}).unknown(false);

const itemSchema = Joi.object({
  itemKey: stableKey(160).required(),
  packageKey: stableKey(160).allow(null),
  salesOrderLineId: Joi.number().integer().positive().allow(null),
  lineResolutionStatus: Joi.string().trim().uppercase().valid(...ENTITY_RESOLUTION_STATUSES).required(),
  productVariantId: Joi.number().integer().positive().allow(null),
  productResolutionStatus: Joi.string().trim().uppercase().valid(...ENTITY_RESOLUTION_STATUSES).required(),
  providerSku: nullableText(160),
  description: Joi.string().trim().min(1).max(255).required(),
  quantity: Joi.number().positive().precision(3).max(999999999.999).required(),
  unit: unit(40).required(),
  providerExtensions: Joi.object().unknown(true).allow(null)
}).unknown(false);

const trackingEventSchema = Joi.object({
  eventKey: stableKey(180).required(),
  packageKey: stableKey(160).allow(null),
  canonicalCode: Joi.string().trim().uppercase().valid(...SHIPMENT_TRACKING_EVENT_CODES).required(),
  providerCode: nullableText(120),
  description: nullableText(255),
  occurredAt: Joi.date().iso().required(),
  locationSummary: nullableText(160),
  exceptionCategory: Joi.string().trim().uppercase().valid(...SHIPMENT_EXCEPTION_CATEGORIES).default('NONE'),
  metadata: Joi.object().unknown(true).allow(null)
}).unknown(false);

const shipmentSnapshotSchema = Joi.object({
  contractVersion: Joi.string().valid(CONTRACT_VERSION).required(),
  externalId: Joi.string().trim().min(1).max(255).required(),
  memberId: Joi.number().integer().positive().allow(null),
  customerResolutionStatus: Joi.string().trim().uppercase().valid(...ENTITY_RESOLUTION_STATUSES).required(),
  salesOrderId: Joi.number().integer().positive().allow(null),
  orderResolutionStatus: Joi.string().trim().uppercase().valid(...ENTITY_RESOLUTION_STATUSES).required(),
  wineClubAllocationId: Joi.number().integer().positive().allow(null),
  allocationResolutionStatus: Joi.string().trim().uppercase().valid(...ENTITY_RESOLUTION_STATUSES).required(),
  restrictedAddressId: Joi.number().integer().positive().allow(null),
  carrierKey: unit(120).required(),
  serviceLevel: nullableText(120),
  trackingReference: Joi.string().trim().min(3).max(255).allow(null),
  canonicalStatus: Joi.string().trim().uppercase().valid(...SHIPMENT_STATUSES).required(),
  providerStatus: nullableText(120),
  promisedDeliveryAt: nullableIsoDate,
  shippedAt: nullableIsoDate,
  estimatedDeliveryAt: nullableIsoDate,
  deliveredAt: nullableIsoDate,
  returnedAt: nullableIsoDate,
  destinationCountry: Joi.string().trim().uppercase().length(2).allow(null),
  destinationRegion: nullableText(80),
  destinationPostcodePrefix: Joi.string().trim().uppercase().pattern(/^[A-Z0-9]{1,4}$/).allow(null),
  sourceRevision: Joi.string().trim().min(1).max(255).required(),
  sourceUpdatedAt: Joi.date().iso().required(),
  observedAt: Joi.date().iso().required(),
  deletedAtSource: nullableIsoDate,
  providerExtensions: Joi.object().unknown(true).allow(null),
  packagesComplete: Joi.boolean().valid(true).required(),
  packages: Joi.array().items(packageSchema).max(100).required(),
  itemsComplete: Joi.boolean().valid(true).required(),
  items: Joi.array().items(itemSchema).max(1000).required(),
  trackingEvents: Joi.array().items(trackingEventSchema).max(2000).default([])
}).unknown(false);

function assertPublicObject(value, path) {
  if (value == null) return;
  const inspect = (current, currentPath) => {
    if (Array.isArray(current)) return current.forEach((item, index) => inspect(item, `${currentPath}[${index}]`));
    if (!current || typeof current !== 'object' || current instanceof Date) return;
    for (const [key, child] of Object.entries(current)) {
      if (FORBIDDEN_KEY.test(key)) throw new ValidationError(`Shipment snapshot contains a forbidden field at ${currentPath}.${key}`);
      inspect(child, `${currentPath}.${key}`);
    }
  };
  inspect(value, path);
}

function validateSnapshot(input) {
  const { value, error } = shipmentSnapshotSchema.validate(input, {
    abortEarly: false,
    stripUnknown: false,
    convert: true
  });
  if (error) throw new ValidationError('Shipment snapshot contract validation failed', error.details);
  assertPublicObject(value.providerExtensions, 'providerExtensions');
  for (const pkg of value.packages) {
    assertPublicObject(pkg.providerExtensions, `packages.${pkg.packageKey}.providerExtensions`);
    const dimensions = [pkg.length, pkg.width, pkg.height];
    const dimensionsPresent = dimensions.filter(item => item != null).length;
    if (dimensionsPresent !== 0 && (dimensionsPresent !== 3 || !pkg.dimensionUnit)) {
      throw new ValidationError(`Shipment package ${pkg.packageKey} requires all dimensions and dimensionUnit`);
    }
    if ((pkg.weight == null) !== (pkg.weightUnit == null)) {
      throw new ValidationError(`Shipment package ${pkg.packageKey} weight and weightUnit must appear together`);
    }
  }
  const packageKeys = new Set(value.packages.map(pkg => pkg.packageKey));
  if (packageKeys.size !== value.packages.length) throw new ValidationError('Shipment package keys must be unique');
  const itemKeys = new Set();
  for (const item of value.items) {
    assertPublicObject(item.providerExtensions, `items.${item.itemKey}.providerExtensions`);
    if (itemKeys.has(item.itemKey)) throw new ValidationError('Shipment item keys must be unique');
    itemKeys.add(item.itemKey);
    if (item.packageKey && !packageKeys.has(item.packageKey)) {
      throw new ValidationError(`Shipment item ${item.itemKey} references an unknown packageKey`);
    }
    if ((item.lineResolutionStatus === 'RESOLVED') !== Boolean(item.salesOrderLineId)) {
      throw new ValidationError(`Shipment item ${item.itemKey} line resolution requires exactly one explicit line mapping`);
    }
    if ((item.productResolutionStatus === 'RESOLVED') !== Boolean(item.productVariantId)) {
      throw new ValidationError(`Shipment item ${item.itemKey} product resolution requires exactly one explicit variant mapping`);
    }
  }
  const eventKeys = new Set();
  for (const event of value.trackingEvents) {
    assertPublicObject(event.metadata, `trackingEvents.${event.eventKey}.metadata`);
    if (eventKeys.has(event.eventKey)) throw new ValidationError('Shipment tracking event keys must be unique in one snapshot');
    eventKeys.add(event.eventKey);
    if (event.packageKey && !packageKeys.has(event.packageKey)) {
      throw new ValidationError(`Shipment event ${event.eventKey} references an unknown packageKey`);
    }
    if (event.exceptionCategory !== 'NONE'
      && !['DELAYED', 'EXCEPTION', 'DELIVERY_ATTEMPTED', 'RETURN_IN_TRANSIT', 'RETURNED'].includes(event.canonicalCode)) {
      throw new ValidationError(`Shipment event ${event.eventKey} exception category is inconsistent with its canonical code`);
    }
  }
  for (const [statusField, idField, label] of [
    ['customerResolutionStatus', 'memberId', 'customer'],
    ['orderResolutionStatus', 'salesOrderId', 'order'],
    ['allocationResolutionStatus', 'wineClubAllocationId', 'allocation']
  ]) {
    if ((value[statusField] === 'RESOLVED') !== Boolean(value[idField])) {
      throw new ValidationError(`Resolved shipment ${label} requires exactly one explicit ID mapping`);
    }
  }
  if (value.restrictedAddressId && !value.memberId) {
    throw new ValidationError('Shipment restricted address requires an explicitly resolved customer');
  }
  return value;
}

const sourceHash = value => crypto.createHash('sha256').update(stableSerialize(value)).digest('hex');

function protectedReference(wineryId, value) {
  if (!value) return { hash: null, last4: null };
  const normalized = String(value).trim().toUpperCase();
  return {
    hash: crypto.createHash('sha256').update(`${wineryId}:shipment-reference:${normalized}`).digest('hex'),
    last4: normalized.slice(-4)
  };
}

async function requireFulfilmentConnection({ wineryId, connectionId, transaction }) {
  const connection = await models.IntegrationConnection.findOne({
    where: { id: connectionId, wineryId },
    attributes: ['id', 'connectionKey', 'providerKey', 'status'],
    transaction
  });
  if (!connection) throw new NotFoundError('Integration connection not found');
  const scope = await models.IntegrationConnectionScope.findOne({
    where: { wineryId, connectionId, domain: 'FULFILMENT', isActive: true },
    attributes: ['id'],
    transaction
  });
  if (!scope) throw new ValidationError('Connection does not have an active FULFILMENT scope');
  return connection;
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
    resourceType: 'SHIPMENT',
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
    where: { connectionId, resourceType: 'SHIPMENT', externalId: snapshot.externalId },
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (reference?.providerUpdatedAt) {
    const incoming = new Date(snapshot.sourceUpdatedAt).getTime();
    const current = new Date(reference.providerUpdatedAt).getTime();
    if (incoming < current) return { reference, state: 'STALE' };
    if (incoming === current && reference.sourceHash && reference.sourceHash !== payloadHash) {
      return { reference, state: 'CONFLICT' };
    }
  }
  const values = {
    wineryId,
    connectionId,
    resourceType: 'SHIPMENT',
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
    : await models.ExternalResourceReference.create({ ...values, resolutionStatus: 'UNRESOLVED' }, { transaction });
  return { reference, state: 'CURRENT' };
}

async function resolveMappings({ wineryId, snapshot, transaction }) {
  const [member, order, allocation, address] = await Promise.all([
    snapshot.memberId
      ? models.Member.findOne({ where: { id: snapshot.memberId, wineryId }, attributes: ['id'], transaction })
      : null,
    snapshot.salesOrderId
      ? models.SalesOrder.findOne({ where: { id: snapshot.salesOrderId, wineryId }, transaction })
      : null,
    snapshot.wineClubAllocationId
      ? models.WineClubAllocation.findOne({
        where: { id: snapshot.wineClubAllocationId, wineryId },
        include: [{ association: 'Membership', attributes: ['id', 'memberId'] }],
        transaction
      })
      : null,
    snapshot.restrictedAddressId
      ? models.CustomerAddress.findOne({ where: { id: snapshot.restrictedAddressId, wineryId }, transaction })
      : null
  ]);
  if (snapshot.memberId && !member) throw new ValidationError('Shipment customer does not belong to the winery');
  if (snapshot.salesOrderId && !order) throw new ValidationError('Shipment order does not belong to the winery');
  if (snapshot.wineClubAllocationId && !allocation) throw new ValidationError('Shipment allocation does not belong to the winery');
  if (snapshot.restrictedAddressId && (!address || address.memberId !== snapshot.memberId)) {
    throw new ValidationError('Shipment restricted address does not belong to the resolved customer');
  }
  if (order?.memberId && snapshot.memberId && order.memberId !== snapshot.memberId) {
    throw new ValidationError('Shipment customer conflicts with the mapped order customer');
  }
  if (allocation?.Membership?.memberId && snapshot.memberId && allocation.Membership.memberId !== snapshot.memberId) {
    throw new ValidationError('Shipment customer conflicts with the mapped allocation customer');
  }
  if (allocation?.salesOrderId && snapshot.salesOrderId && allocation.salesOrderId !== snapshot.salesOrderId) {
    throw new ValidationError('Shipment order conflicts with the mapped allocation order');
  }
  const lineIds = [...new Set(snapshot.items.map(item => item.salesOrderLineId).filter(Boolean))];
  if (lineIds.length > 0) {
    if (!order) throw new ValidationError('Shipment line mappings require a resolved Sales Order');
    const lines = await models.SalesOrderLine.findAll({
      where: { id: lineIds, wineryId, salesOrderId: order.id },
      attributes: ['id', 'productVariantId'],
      transaction
    });
    if (lines.length !== lineIds.length) throw new ValidationError('One or more shipment lines do not belong to the mapped order');
    const lineById = new Map(lines.map(line => [line.id, line]));
    for (const item of snapshot.items.filter(candidate => candidate.salesOrderLineId && candidate.productVariantId)) {
      const mappedVariantId = lineById.get(item.salesOrderLineId).productVariantId;
      if (mappedVariantId && mappedVariantId !== item.productVariantId) {
        throw new ValidationError(`Shipment item ${item.itemKey} conflicts with its order-line variant`);
      }
    }
  }
  const variantIds = [...new Set(snapshot.items.map(item => item.productVariantId).filter(Boolean))];
  if (variantIds.length > 0) {
    const count = await models.ProductVariant.count({
      where: { id: variantIds, wineryId, isActive: true },
      transaction
    });
    if (count !== variantIds.length) throw new ValidationError('One or more shipment variants are not active winery mappings');
  }
}

async function syncPackages({ wineryId, shipment, snapshot, transaction }) {
  const activeKeys = [];
  const packageByKey = new Map();
  for (const input of snapshot.packages) {
    activeKeys.push(input.packageKey);
    const tracking = protectedReference(wineryId, input.trackingReference);
    const values = {
      wineryId,
      shipmentId: shipment.id,
      packageKey: input.packageKey,
      trackingReferenceHash: tracking.hash,
      trackingReferenceLast4: tracking.last4,
      packageType: input.packageType || null,
      weight: input.weight ?? null,
      weightUnit: input.weightUnit || null,
      length: input.length ?? null,
      width: input.width ?? null,
      height: input.height ?? null,
      dimensionUnit: input.dimensionUnit || null,
      isActive: true,
      removedAt: null,
      providerExtensions: input.providerExtensions || null
    };
    const [pkg] = await models.ShipmentPackage.findOrCreate({
      where: { shipmentId: shipment.id, packageKey: input.packageKey },
      defaults: values,
      transaction
    });
    await pkg.update(values, { transaction });
    packageByKey.set(input.packageKey, pkg);
  }
  await models.ShipmentPackage.update({ isActive: false, removedAt: new Date() }, {
    where: {
      wineryId,
      shipmentId: shipment.id,
      isActive: true,
      ...(activeKeys.length > 0 ? { packageKey: { [Op.notIn]: activeKeys } } : {})
    },
    transaction
  });
  return packageByKey;
}

async function syncItems({ wineryId, shipment, snapshot, packageByKey, transaction }) {
  const activeKeys = [];
  for (const input of snapshot.items) {
    activeKeys.push(input.itemKey);
    const values = {
      wineryId,
      shipmentId: shipment.id,
      packageId: input.packageKey ? packageByKey.get(input.packageKey).id : null,
      salesOrderLineId: input.salesOrderLineId || null,
      lineResolutionStatus: input.lineResolutionStatus,
      productVariantId: input.productVariantId || null,
      productResolutionStatus: input.productResolutionStatus,
      itemKey: input.itemKey,
      providerSku: input.providerSku || null,
      description: input.description,
      quantity: input.quantity,
      unit: input.unit,
      isActive: true,
      removedAt: null,
      providerExtensions: input.providerExtensions || null
    };
    const [item] = await models.ShipmentItem.findOrCreate({
      where: { shipmentId: shipment.id, itemKey: input.itemKey },
      defaults: values,
      transaction
    });
    await item.update(values, { transaction });
  }
  await models.ShipmentItem.update({ isActive: false, removedAt: new Date() }, {
    where: {
      wineryId,
      shipmentId: shipment.id,
      isActive: true,
      ...(activeKeys.length > 0 ? { itemKey: { [Op.notIn]: activeKeys } } : {})
    },
    transaction
  });
}

async function appendTrackingEvents({
  wineryId,
  connectionId,
  shipment,
  reference,
  snapshot,
  packageByKey,
  sourceEventId,
  transaction
}) {
  let eventsCreated = 0;
  let eventConflicts = 0;
  for (const input of snapshot.trackingEvents) {
    const eventHash = sourceHash(input);
    const existing = await models.ShipmentTrackingEvent.findOne({
      where: { shipmentId: shipment.id, eventKey: input.eventKey },
      transaction
    });
    if (existing) {
      if (existing.sourceHash !== eventHash) {
        await recordIssue({
          wineryId,
          connectionId,
          referenceId: reference.id,
          externalId: snapshot.externalId,
          issueType: 'SOURCE_CONFLICT',
          title: 'Shipment tracking event key was reused',
          summary: 'The immutable carrier event was retained and the conflicting replay was ignored.',
          evidence: { eventKey: input.eventKey, existingHash: existing.sourceHash, incomingHash: eventHash },
          sourceVersion: snapshot.sourceRevision,
          severity: 'BLOCKING',
          transaction
        });
        eventConflicts += 1;
      }
      continue;
    }
    await models.ShipmentTrackingEvent.create({
      wineryId,
      shipmentId: shipment.id,
      packageId: input.packageKey ? packageByKey.get(input.packageKey).id : null,
      sourceReferenceId: reference.id,
      sourceEventId,
      eventKey: input.eventKey,
      canonicalCode: input.canonicalCode,
      providerCode: input.providerCode || null,
      description: input.description || null,
      occurredAt: input.occurredAt,
      locationSummary: input.locationSummary || null,
      exceptionCategory: input.exceptionCategory,
      sourceHash: eventHash,
      metadata: input.metadata || null
    }, { transaction });
    eventsCreated += 1;
  }
  const latest = await models.ShipmentTrackingEvent.findOne({
    where: { wineryId, shipmentId: shipment.id },
    order: [['occurredAt', 'DESC'], ['id', 'DESC']],
    transaction
  });
  if (latest) {
    const hasException = latest.exceptionCategory !== 'NONE';
    await shipment.update({
      latestTrackingOccurredAt: latest.occurredAt,
      latestExceptionCategory: hasException ? latest.exceptionCategory : 'NONE',
      latestExceptionCode: hasException ? (latest.providerCode || latest.canonicalCode) : null,
      latestExceptionSummary: hasException ? (latest.description || latest.canonicalCode) : null
    }, { transaction });
  }
  return { eventsCreated, eventConflicts };
}

async function projectShipmentSnapshotInternal({
  wineryId,
  connectionId,
  input,
  sourceEventId = null,
  transaction
}) {
  const snapshot = validateSnapshot(input);
  await requireFulfilmentConnection({ wineryId, connectionId, transaction });
  await resolveMappings({ wineryId, snapshot, transaction });
  if (sourceEventId) {
    const event = await models.IntegrationEvent.findOne({
      where: { id: sourceEventId, wineryId, connectionId },
      attributes: ['id'],
      transaction
    });
    if (!event) throw new ValidationError('Shipment source event does not belong to the connection');
  }
  const payloadHash = sourceHash(snapshot);
  const referenceResult = await inspectReference({ wineryId, connectionId, snapshot, payloadHash, transaction });
  const reference = referenceResult.reference;
  if (referenceResult.state === 'STALE') {
    await recordIssue({
      wineryId,
      connectionId,
      referenceId: reference.id,
      externalId: snapshot.externalId,
      issueType: 'OUT_OF_ORDER',
      title: 'Older shipment update ignored',
      summary: 'The incoming shipment state predates the current source observation.',
      evidence: {
        incomingUpdatedAt: new Date(snapshot.sourceUpdatedAt).toISOString(),
        currentUpdatedAt: new Date(reference.providerUpdatedAt).toISOString()
      },
      sourceVersion: snapshot.sourceRevision,
      transaction
    });
    return { status: 'STALE_IGNORED', shipmentId: reference.canonicalId || null };
  }
  if (referenceResult.state === 'CONFLICT') {
    await reference.update({ resolutionStatus: 'AMBIGUOUS' }, { transaction });
    await recordIssue({
      wineryId,
      connectionId,
      referenceId: reference.id,
      externalId: snapshot.externalId,
      issueType: 'SOURCE_CONFLICT',
      title: 'Shipment revision contains conflicting state',
      summary: 'The same provider update time was observed with different shipment content.',
      evidence: { sourceUpdatedAt: new Date(snapshot.sourceUpdatedAt).toISOString() },
      sourceVersion: snapshot.sourceRevision,
      severity: 'BLOCKING',
      transaction
    });
    return { status: 'SOURCE_CONFLICT', shipmentId: reference.canonicalId || null };
  }
  const tracking = protectedReference(wineryId, snapshot.trackingReference);
  let shipment = await models.Shipment.findOne({
    where: { primarySourceReferenceId: reference.id },
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (tracking.hash) {
    const trackingOwner = await models.Shipment.findOne({
      where: {
        authorityConnectionId: connectionId,
        trackingReferenceHash: tracking.hash,
        ...(shipment ? { id: { [Op.ne]: shipment.id } } : {})
      },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (trackingOwner) {
      await reference.update({ resolutionStatus: 'AMBIGUOUS' }, { transaction });
      await trackingOwner.update({ projectionQuality: 'CONFLICTING' }, { transaction });
      await recordIssue({
        wineryId,
        connectionId,
        referenceId: reference.id,
        externalId: snapshot.externalId,
        issueType: 'SOURCE_CONFLICT',
        title: 'Tracking reference maps to another shipment',
        summary: 'Two source shipment IDs claim the same protected tracking reference.',
        evidence: { existingShipmentId: trackingOwner.id, trackingReferenceLast4: tracking.last4 },
        sourceVersion: snapshot.sourceRevision,
        severity: 'BLOCKING',
        transaction
      });
      return { status: 'SOURCE_CONFLICT', shipmentId: trackingOwner.id };
    }
  }
  const values = {
    wineryId,
    memberId: snapshot.memberId || null,
    customerResolutionStatus: snapshot.customerResolutionStatus,
    salesOrderId: snapshot.salesOrderId || null,
    orderResolutionStatus: snapshot.orderResolutionStatus,
    wineClubAllocationId: snapshot.wineClubAllocationId || null,
    allocationResolutionStatus: snapshot.allocationResolutionStatus,
    restrictedAddressId: snapshot.restrictedAddressId || null,
    primarySourceReferenceId: reference.id,
    authorityConnectionId: connectionId,
    carrierKey: snapshot.carrierKey,
    serviceLevel: snapshot.serviceLevel || null,
    trackingReferenceHash: tracking.hash,
    trackingReferenceLast4: tracking.last4,
    canonicalStatus: snapshot.canonicalStatus,
    providerStatus: snapshot.providerStatus || null,
    promisedDeliveryAt: snapshot.promisedDeliveryAt || null,
    shippedAt: snapshot.shippedAt || null,
    estimatedDeliveryAt: snapshot.estimatedDeliveryAt || null,
    deliveredAt: snapshot.deliveredAt || null,
    returnedAt: snapshot.returnedAt || null,
    destinationCountry: snapshot.destinationCountry || null,
    destinationRegion: snapshot.destinationRegion || null,
    destinationPostcodePrefix: snapshot.destinationPostcodePrefix || null,
    sourceRevision: snapshot.sourceRevision,
    sourceUpdatedAt: snapshot.sourceUpdatedAt,
    observedAt: snapshot.observedAt,
    sourceHash: payloadHash,
    projectionQuality: 'SOURCE_ASSERTED',
    deletedAtSource: snapshot.deletedAtSource || null,
    providerExtensions: snapshot.providerExtensions || null
  };
  shipment = shipment
    ? await shipment.update(values, { transaction })
    : await models.Shipment.create({
      ...values,
      latestExceptionCategory: 'NONE'
    }, { transaction });
  const packageByKey = await syncPackages({ wineryId, shipment, snapshot, transaction });
  await syncItems({ wineryId, shipment, snapshot, packageByKey, transaction });
  const trackingResult = await appendTrackingEvents({
    wineryId,
    connectionId,
    shipment,
    reference,
    snapshot,
    packageByKey,
    sourceEventId,
    transaction
  });
  await reference.update({
    canonicalType: 'SHIPMENT',
    canonicalId: shipment.id,
    resolutionStatus: 'RESOLVED',
    resolutionMethod: 'EXPLICIT_FULFILMENT_MAPPING',
    resolutionConfidence: 1,
    resolvedAt: new Date()
  }, { transaction });
  return {
    status: 'PROJECTED_SHADOW',
    shipmentId: shipment.id,
    packagesProjected: snapshot.packages.length,
    itemsProjected: snapshot.items.length,
    ...trackingResult,
    automationEligible: false
  };
}

async function projectShipmentSnapshot(options) {
  if (options.transaction) return projectShipmentSnapshotInternal(options);
  return models.sequelize.transaction(transaction => projectShipmentSnapshotInternal({
    ...options,
    transaction
  }));
}

module.exports = {
  CONTRACT_VERSION,
  shipmentSnapshotSchema,
  validateSnapshot,
  protectedReference,
  projectShipmentSnapshot
};
