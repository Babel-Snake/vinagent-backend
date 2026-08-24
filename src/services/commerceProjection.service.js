const crypto = require('crypto');
const Joi = require('joi');
const { Op } = require('sequelize');
const {
  ExternalResourceReference,
  IntegrationConnection,
  IntegrationConnectionScope,
  Member,
  PaymentSummaryEvent,
  ProjectionIssue,
  ProductVariant,
  RefundSummary,
  SalesOrder,
  SalesOrderLine,
  WineryLocation,
  WineryProduct,
  sequelize
} = require('../models');
const { NotFoundError, ValidationError } = require('../utils/errors');
const {
  ENTITY_RESOLUTION_STATUSES,
  FULFILMENT_SUMMARY_STATUSES,
  PAYMENT_METHOD_CLASSES,
  PAYMENT_SUMMARY_EVENT_TYPES,
  PAYMENT_SUMMARY_STATUSES,
  REFUND_SUMMARY_STATUSES,
  SALES_ORDER_CHANNELS,
  SALES_ORDER_LINE_TYPES,
  SALES_ORDER_STATUSES
} = require('./integrationDataRegistry.service');
const {
  buildProjectionIssueFingerprint,
  stableSerialize
} = require('./integrationDataFoundation.service');

const FORBIDDEN_SNAPSHOT_KEY = /(?:password|passphrase|secret|token|credential|api[_-]?key|private[_-]?key|authorization|email|phone|address|dateOfBirth|card|cvv|bank[_-]?account|account[_-]?number|routing[_-]?number|\bpan\b|iban|\bbsb\b)/i;
const nullableIsoDate = Joi.date().iso().allow(null);
const stableKey = max => Joi.string().trim().pattern(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/).max(max);
const money = Joi.number().integer().min(0).max(Number.MAX_SAFE_INTEGER).allow(null);
const nullableText = max => Joi.string().trim().max(max).allow('', null);

const salesOrderLineSchema = Joi.object({
  lineKey: stableKey(160).required(),
  lineType: Joi.string().trim().uppercase().valid(...SALES_ORDER_LINE_TYPES).required(),
  wineryProductId: Joi.number().integer().positive().allow(null),
  productVariantId: Joi.number().integer().positive().allow(null),
  productResolutionStatus: Joi.string().trim().uppercase().valid(...ENTITY_RESOLUTION_STATUSES).required(),
  providerSku: nullableText(160),
  description: Joi.string().trim().min(1).max(255).required(),
  quantity: Joi.number().positive().precision(3).required(),
  fulfilledQuantity: Joi.number().min(0).precision(3).default(0),
  refundedQuantity: Joi.number().min(0).precision(3).default(0),
  unit: Joi.string().trim().uppercase().pattern(/^[A-Z0-9_.-]+$/).max(40).required(),
  currency: Joi.string().trim().uppercase().length(3).allow(null),
  unitPriceMinor: money,
  discountMinor: money,
  taxMinor: money,
  totalMinor: money,
  providerExtensions: Joi.object().unknown(true).allow(null)
}).unknown(false);

const paymentSummaryEventSchema = Joi.object({
  eventKey: stableKey(180).required(),
  eventType: Joi.string().trim().uppercase().valid(...PAYMENT_SUMMARY_EVENT_TYPES).required(),
  canonicalStatus: Joi.string().trim().uppercase().valid(...PAYMENT_SUMMARY_STATUSES).required(),
  providerTransactionReference: nullableText(255),
  paymentMethodClass: Joi.string().trim().uppercase().valid(...PAYMENT_METHOD_CLASSES).default('UNKNOWN'),
  amountMinor: money,
  currency: Joi.string().trim().uppercase().length(3).allow(null),
  effectiveAt: Joi.date().iso().required(),
  failureCategory: nullableText(120),
  metadata: Joi.object().unknown(true).allow(null)
}).unknown(false);

const refundSummarySchema = Joi.object({
  externalId: Joi.string().trim().min(1).max(255).required(),
  lineKey: stableKey(160).allow(null),
  canonicalStatus: Joi.string().trim().uppercase().valid(...REFUND_SUMMARY_STATUSES).required(),
  providerStatus: nullableText(120),
  providerTransactionReference: nullableText(255),
  amountMinor: Joi.number().integer().min(0).max(Number.MAX_SAFE_INTEGER).required(),
  currency: Joi.string().trim().uppercase().length(3).required(),
  reasonCategory: nullableText(120),
  requestedAt: nullableIsoDate,
  effectiveAt: Joi.date().iso().required(),
  completedAt: nullableIsoDate,
  sourceRevision: Joi.string().trim().min(1).max(255).required(),
  sourceUpdatedAt: Joi.date().iso().required(),
  observedAt: Joi.date().iso().required(),
  deletedAtSource: nullableIsoDate,
  providerExtensions: Joi.object().unknown(true).allow(null)
}).unknown(false);

const commerceOrderSnapshotSchema = Joi.object({
  contractVersion: Joi.string().valid('commerce-order-shadow.v1').required(),
  externalId: Joi.string().trim().min(1).max(255).required(),
  memberId: Joi.number().integer().positive().allow(null),
  customerResolutionStatus: Joi.string().trim().uppercase().valid(...ENTITY_RESOLUTION_STATUSES).required(),
  locationId: Joi.number().integer().positive().allow(null),
  orderNumber: Joi.string().trim().min(1).max(255).required(),
  sourceChannel: Joi.string().trim().uppercase().valid(...SALES_ORDER_CHANNELS).required(),
  canonicalStatus: Joi.string().trim().uppercase().valid(...SALES_ORDER_STATUSES).required(),
  providerStatus: nullableText(120),
  paymentStatus: Joi.string().trim().uppercase().valid(...PAYMENT_SUMMARY_STATUSES).required(),
  fulfilmentStatus: Joi.string().trim().uppercase().valid(...FULFILMENT_SUMMARY_STATUSES).required(),
  placedAt: nullableIsoDate,
  paidAt: nullableIsoDate,
  cancelledAt: nullableIsoDate,
  fulfilledAt: nullableIsoDate,
  currency: Joi.string().trim().uppercase().length(3).allow(null),
  subtotalMinor: money,
  discountMinor: money,
  taxMinor: money,
  shippingMinor: money,
  totalMinor: money,
  paidMinor: money,
  refundedMinor: money,
  outstandingMinor: money,
  sourceRevision: Joi.string().trim().min(1).max(255).required(),
  sourceUpdatedAt: Joi.date().iso().required(),
  observedAt: Joi.date().iso().required(),
  deletedAtSource: nullableIsoDate,
  providerExtensions: Joi.object().unknown(true).allow(null),
  linesComplete: Joi.boolean().valid(true).required(),
  lines: Joi.array().items(salesOrderLineSchema).max(1000).required(),
  paymentEvents: Joi.array().items(paymentSummaryEventSchema).max(1000).default([]),
  refunds: Joi.array().items(refundSummarySchema).max(500).default([])
}).unknown(false);

function validateSnapshot(input) {
  const { value, error } = commerceOrderSnapshotSchema.validate(input, {
    abortEarly: false,
    stripUnknown: false,
    convert: true
  });
  if (error) throw new ValidationError('Commerce order snapshot contract validation failed', error.details);
  const inspect = (item, path = 'snapshot') => {
    if (Array.isArray(item)) return item.forEach((child, index) => inspect(child, `${path}[${index}]`));
    if (!item || typeof item !== 'object' || item instanceof Date) return;
    for (const [key, child] of Object.entries(item)) {
      if (FORBIDDEN_SNAPSHOT_KEY.test(key)) {
        throw new ValidationError(`Commerce order snapshot contains a forbidden field at ${path}.${key}`);
      }
      inspect(child, `${path}.${key}`);
    }
  };
  inspect(value);
  if ((value.customerResolutionStatus === 'RESOLVED') !== Boolean(value.memberId)) {
    throw new ValidationError('Resolved commerce customers require exactly one explicit memberId mapping');
  }
  const orderMoneyPresent = [
    'subtotalMinor', 'discountMinor', 'taxMinor', 'shippingMinor', 'totalMinor',
    'paidMinor', 'refundedMinor', 'outstandingMinor'
  ].some(field => value[field] != null);
  if (orderMoneyPresent && !value.currency) {
    throw new ValidationError('Commerce order currency is required when monetary summaries are present');
  }
  for (const line of value.lines) {
    if ((line.productResolutionStatus === 'RESOLVED') !== Boolean(line.wineryProductId)) {
      throw new ValidationError(`Resolved commerce line ${line.lineKey} requires exactly one wineryProductId mapping`);
    }
    if (line.productVariantId && line.productResolutionStatus !== 'RESOLVED') {
      throw new ValidationError(`Commerce line ${line.lineKey} cannot map a variant while its product is unresolved`);
    }
    if (line.fulfilledQuantity > line.quantity || line.refundedQuantity > line.quantity) {
      throw new ValidationError(`Commerce line ${line.lineKey} quantities cannot exceed ordered quantity`);
    }
    const lineMoneyPresent = ['unitPriceMinor', 'discountMinor', 'taxMinor', 'totalMinor']
      .some(field => line[field] != null);
    if (lineMoneyPresent && !line.currency) {
      throw new ValidationError(`Commerce line ${line.lineKey} currency is required for monetary summaries`);
    }
  }
  for (const event of value.paymentEvents) {
    if (event.amountMinor != null && !event.currency) {
      throw new ValidationError(`Payment event ${event.eventKey} currency is required when amount is present`);
    }
  }
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
  resourceType = 'SALES_ORDER',
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
    sourceVersion,
    observationCount: 1,
    detectedAt: new Date(),
    lastObservedAt: new Date()
  }, { transaction });
}

async function requireCommerceConnection({ wineryId, connectionId, transaction }) {
  const connection = await IntegrationConnection.findOne({
    where: { id: connectionId, wineryId },
    attributes: ['id', 'connectionKey', 'providerKey', 'status'],
    transaction
  });
  if (!connection) throw new NotFoundError('Integration connection not found');
  const scope = await IntegrationConnectionScope.findOne({
    where: { wineryId, connectionId, domain: 'COMMERCE', isActive: true },
    transaction
  });
  if (!scope) throw new ValidationError('Connection does not have an active COMMERCE scope');
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

async function resolveLocalMappings({ wineryId, snapshot, transaction }) {
  const [member, location] = await Promise.all([
    snapshot.memberId
      ? Member.findOne({ where: { id: snapshot.memberId, wineryId }, attributes: ['id'], transaction })
      : null,
    snapshot.locationId
      ? WineryLocation.findOne({ where: { id: snapshot.locationId, wineryId }, attributes: ['id'], transaction })
      : null
  ]);
  if (snapshot.memberId && !member) throw new ValidationError('Commerce order customer does not belong to the winery');
  if (snapshot.locationId && !location) throw new ValidationError('Commerce order location does not belong to the winery');
  const mappedProductIds = [...new Set(snapshot.lines.map(line => line.wineryProductId).filter(Boolean))];
  if (mappedProductIds.length > 0) {
    const count = await WineryProduct.count({ where: { id: mappedProductIds, wineryId }, transaction });
    if (count !== mappedProductIds.length) {
      throw new ValidationError('One or more commerce products do not belong to the winery');
    }
  }
  const mappedVariantIds = [...new Set(snapshot.lines.map(line => line.productVariantId).filter(Boolean))];
  if (mappedVariantIds.length > 0) {
    const variants = await ProductVariant.findAll({
      where: { id: mappedVariantIds, wineryId, isActive: true },
      attributes: ['id', 'wineryProductId'],
      transaction
    });
    if (variants.length !== mappedVariantIds.length) {
      throw new ValidationError('One or more commerce variants are not active winery mappings');
    }
    const variantById = new Map(variants.map(variant => [variant.id, variant]));
    for (const line of snapshot.lines.filter(item => item.productVariantId)) {
      if (variantById.get(line.productVariantId).wineryProductId !== line.wineryProductId) {
        throw new ValidationError(`Commerce line ${line.lineKey} variant does not belong to its mapped product`);
      }
    }
  }
}

async function projectRefunds({ wineryId, connectionId, order, lineByKey, snapshot, transaction }) {
  let projected = 0;
  let staleIgnored = 0;
  for (const input of snapshot.refunds) {
    const referenceResult = await upsertReference({
      wineryId,
      connectionId,
      resourceType: 'REFUND_SUMMARY',
      externalId: input.externalId,
      sourceRevision: input.sourceRevision,
      sourceUpdatedAt: input.sourceUpdatedAt,
      observedAt: input.observedAt,
      providerExtensions: input.providerExtensions,
      payload: input,
      transaction
    });
    if (referenceResult.stale) {
      await recordIssue({
        wineryId,
        connectionId,
        referenceId: referenceResult.reference.id,
        externalId: input.externalId,
        resourceType: 'REFUND_SUMMARY',
        issueType: 'OUT_OF_ORDER',
        title: 'Older commerce refund update ignored',
        summary: 'The refund update predates the currently projected source state.',
        evidence: {
          incomingUpdatedAt: new Date(input.sourceUpdatedAt).toISOString(),
          currentUpdatedAt: new Date(referenceResult.reference.providerUpdatedAt).toISOString()
        },
        sourceVersion: snapshot.contractVersion,
        transaction
      });
      staleIgnored += 1;
      continue;
    }
    const refundReference = referenceResult.reference;
    let refund = await RefundSummary.findOne({
      where: { primarySourceReferenceId: refundReference.id },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (refund && refund.salesOrderId !== order.id) {
      await refundReference.update({ resolutionStatus: 'AMBIGUOUS' }, { transaction });
      await recordIssue({
        wineryId,
        connectionId,
        referenceId: refundReference.id,
        externalId: input.externalId,
        resourceType: 'REFUND_SUMMARY',
        issueType: 'SOURCE_CONFLICT',
        title: 'Commerce refund is attached to another order',
        summary: 'The existing refund summary belongs to another canonical order; it was not moved.',
        evidence: { existingSalesOrderId: refund.salesOrderId, incomingSalesOrderId: order.id },
        sourceVersion: snapshot.contractVersion,
        severity: 'BLOCKING',
        transaction
      });
      continue;
    }
    const salesOrderLineId = input.lineKey ? lineByKey.get(input.lineKey)?.id : null;
    if (input.lineKey && !salesOrderLineId) {
      throw new ValidationError(`Refund ${input.externalId} references an unknown order lineKey`);
    }
    const values = {
      wineryId,
      salesOrderId: order.id,
      salesOrderLineId,
      primarySourceReferenceId: refundReference.id,
      authorityConnectionId: connectionId,
      canonicalStatus: input.canonicalStatus,
      providerStatus: input.providerStatus || null,
      providerTransactionReference: input.providerTransactionReference || null,
      amountMinor: input.amountMinor,
      currency: input.currency,
      reasonCategory: input.reasonCategory || null,
      requestedAt: input.requestedAt || null,
      effectiveAt: input.effectiveAt,
      completedAt: input.completedAt || null,
      sourceRevision: input.sourceRevision,
      sourceUpdatedAt: input.sourceUpdatedAt,
      observedAt: input.observedAt,
      sourceHash: sourceHash(input),
      projectionQuality: 'SOURCE_ASSERTED',
      deletedAtSource: input.deletedAtSource || null,
      providerExtensions: input.providerExtensions || null
    };
    refund = refund
      ? await refund.update(values, { transaction })
      : await RefundSummary.create(values, { transaction });
    await refundReference.update({
      canonicalType: 'REFUND_SUMMARY',
      canonicalId: refund.id,
      resolutionStatus: 'RESOLVED',
      resolutionMethod: 'ORDER_REFUND_EXTERNAL_ID',
      resolutionConfidence: 1,
      resolvedAt: new Date()
    }, { transaction });
    projected += 1;
  }
  return { projected, staleIgnored };
}

async function projectCommerceOrderSnapshotInternal({ wineryId, connectionId, input, transaction }) {
  const snapshot = validateSnapshot(input);
  await requireCommerceConnection({ wineryId, connectionId, transaction });
  await resolveLocalMappings({ wineryId, snapshot, transaction });
  const referenceResult = await upsertReference({
    wineryId,
    connectionId,
    resourceType: 'SALES_ORDER',
    externalId: snapshot.externalId,
    sourceRevision: snapshot.sourceRevision,
    sourceUpdatedAt: snapshot.sourceUpdatedAt,
    observedAt: snapshot.observedAt,
    providerExtensions: snapshot.providerExtensions,
    payload: snapshot,
    transaction
  });
  if (referenceResult.stale) {
    await recordIssue({
      wineryId,
      connectionId,
      referenceId: referenceResult.reference.id,
      externalId: snapshot.externalId,
      issueType: 'OUT_OF_ORDER',
      title: 'Older commerce order update ignored',
      summary: 'The provider order update predates the currently projected source state.',
      evidence: {
        incomingUpdatedAt: new Date(snapshot.sourceUpdatedAt).toISOString(),
        currentUpdatedAt: new Date(referenceResult.reference.providerUpdatedAt).toISOString()
      },
      sourceVersion: snapshot.contractVersion,
      transaction
    });
    return { status: 'STALE_IGNORED', salesOrderId: referenceResult.reference.canonicalId || null };
  }
  const reference = referenceResult.reference;
  let order = await SalesOrder.findOne({
    where: { primarySourceReferenceId: reference.id },
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  const numberConflict = await SalesOrder.findOne({
    where: {
      authorityConnectionId: connectionId,
      orderNumber: snapshot.orderNumber,
      ...(order ? { id: { [Op.ne]: order.id } } : {})
    },
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (numberConflict) {
    await reference.update({ resolutionStatus: 'AMBIGUOUS' }, { transaction });
    await recordIssue({
      wineryId,
      connectionId,
      referenceId: reference.id,
      externalId: snapshot.externalId,
      issueType: 'SOURCE_CONFLICT',
      title: 'Commerce order number maps to another source record',
      summary: 'Two source identifiers from one connection claim the same order number; neither was merged.',
      evidence: { orderNumber: snapshot.orderNumber, existingSalesOrderId: numberConflict.id },
      sourceVersion: snapshot.contractVersion,
      severity: 'BLOCKING',
      transaction
    });
    return { status: 'SOURCE_CONFLICT', salesOrderId: numberConflict.id };
  }
  const values = {
    wineryId,
    memberId: snapshot.memberId || null,
    locationId: snapshot.locationId || null,
    primarySourceReferenceId: reference.id,
    authorityConnectionId: connectionId,
    customerResolutionStatus: snapshot.customerResolutionStatus,
    canonicalStatus: snapshot.canonicalStatus,
    providerStatus: snapshot.providerStatus || null,
    orderNumber: snapshot.orderNumber,
    sourceChannel: snapshot.sourceChannel,
    paymentStatus: snapshot.paymentStatus,
    fulfilmentStatus: snapshot.fulfilmentStatus,
    placedAt: snapshot.placedAt || null,
    paidAt: snapshot.paidAt || null,
    cancelledAt: snapshot.cancelledAt || null,
    fulfilledAt: snapshot.fulfilledAt || null,
    currency: snapshot.currency || null,
    subtotalMinor: snapshot.subtotalMinor ?? null,
    discountMinor: snapshot.discountMinor ?? null,
    taxMinor: snapshot.taxMinor ?? null,
    shippingMinor: snapshot.shippingMinor ?? null,
    totalMinor: snapshot.totalMinor ?? null,
    paidMinor: snapshot.paidMinor ?? null,
    refundedMinor: snapshot.refundedMinor ?? null,
    outstandingMinor: snapshot.outstandingMinor ?? null,
    sourceRevision: snapshot.sourceRevision,
    sourceUpdatedAt: snapshot.sourceUpdatedAt,
    observedAt: snapshot.observedAt,
    sourceHash: sourceHash(snapshot),
    projectionQuality: 'SOURCE_ASSERTED',
    deletedAtSource: snapshot.deletedAtSource || null,
    providerExtensions: snapshot.providerExtensions || null
  };
  order = order ? await order.update(values, { transaction }) : await SalesOrder.create(values, { transaction });
  await reference.update({
    canonicalType: 'SALES_ORDER',
    canonicalId: order.id,
    resolutionStatus: 'RESOLVED',
    resolutionMethod: 'CONNECTION_EXTERNAL_ID',
    resolutionConfidence: 1,
    resolvedAt: new Date()
  }, { transaction });

  const incomingLineKeys = snapshot.lines.map(line => line.lineKey);
  if (incomingLineKeys.length === 0) {
    await SalesOrderLine.destroy({ where: { wineryId, salesOrderId: order.id }, transaction });
  } else {
    await SalesOrderLine.destroy({
      where: { wineryId, salesOrderId: order.id, lineKey: { [Op.notIn]: incomingLineKeys } },
      transaction
    });
  }
  const lineByKey = new Map();
  for (const inputLine of snapshot.lines) {
    const [line] = await SalesOrderLine.findOrCreate({
      where: { salesOrderId: order.id, lineKey: inputLine.lineKey },
      defaults: {
        wineryId,
        salesOrderId: order.id,
        ...inputLine,
        wineryProductId: inputLine.wineryProductId || null,
        productVariantId: inputLine.productVariantId || null
      },
      transaction
    });
    await line.update({
      wineryId,
      salesOrderId: order.id,
      ...inputLine,
      wineryProductId: inputLine.wineryProductId || null,
      productVariantId: inputLine.productVariantId || null
    }, { transaction });
    lineByKey.set(inputLine.lineKey, line);
  }

  let paymentEventsCreated = 0;
  let paymentEventConflicts = 0;
  for (const event of snapshot.paymentEvents) {
    const eventHash = sourceHash(event);
    const existing = await PaymentSummaryEvent.findOne({
      where: { salesOrderId: order.id, eventKey: event.eventKey },
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
          title: 'Payment event key was reused with different facts',
          summary: 'The immutable payment summary event was retained and the conflicting replay was ignored.',
          evidence: { eventKey: event.eventKey, existingHash: existing.sourceHash, incomingHash: eventHash },
          sourceVersion: snapshot.contractVersion,
          severity: 'BLOCKING',
          transaction
        });
        paymentEventConflicts += 1;
      }
      continue;
    }
    await PaymentSummaryEvent.create({
      wineryId,
      salesOrderId: order.id,
      ...event,
      providerTransactionReference: event.providerTransactionReference || null,
      amountMinor: event.amountMinor ?? null,
      currency: event.currency || null,
      failureCategory: event.failureCategory || null,
      sourceReferenceId: reference.id,
      sourceHash: eventHash
    }, { transaction });
    paymentEventsCreated += 1;
  }
  const refunds = await projectRefunds({
    wineryId,
    connectionId,
    order,
    lineByKey,
    snapshot,
    transaction
  });
  return {
    status: 'PROJECTED_SHADOW',
    salesOrderId: order.id,
    linesProjected: snapshot.lines.length,
    paymentEventsCreated,
    paymentEventConflicts,
    refundsProjected: refunds.projected,
    staleRefundsIgnored: refunds.staleIgnored,
    automationEligible: false,
    rollupsUpdated: false
  };
}

async function projectCommerceOrderSnapshot(options) {
  if (options.transaction) return projectCommerceOrderSnapshotInternal(options);
  return sequelize.transaction(transaction => projectCommerceOrderSnapshotInternal({ ...options, transaction }));
}

function withoutProviderExtensions(row) {
  const plain = row.toJSON ? row.toJSON() : row;
  delete plain.providerExtensions;
  return plain;
}

async function listSalesOrders({
  wineryId,
  page = 1,
  pageSize = 25,
  status = 'ALL',
  memberId,
  connectionId,
  from,
  to
}) {
  const where = { wineryId };
  if (status !== 'ALL') where.canonicalStatus = status;
  if (memberId) where.memberId = memberId;
  if (connectionId) where.authorityConnectionId = connectionId;
  if (from && to) where.placedAt = { [Op.gte]: from, [Op.lt]: to };
  const result = await SalesOrder.findAndCountAll({
    where,
    include: [
      { association: 'Member', attributes: ['id', 'firstName', 'lastName'] },
      { association: 'Location', attributes: ['id', 'code', 'name'] },
      { association: 'AuthorityConnection', attributes: ['id', 'connectionKey', 'providerKey', 'status'] }
    ],
    order: [['placedAt', 'DESC'], ['id', 'DESC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
    distinct: true
  });
  return {
    salesOrders: result.rows.map(withoutProviderExtensions),
    pagination: { page, pageSize, total: result.count, totalPages: Math.ceil(result.count / pageSize) }
  };
}

async function getSalesOrder({ wineryId, salesOrderId }) {
  const order = await SalesOrder.findOne({
    where: { id: salesOrderId, wineryId },
    include: [
      { association: 'Member', attributes: ['id', 'firstName', 'lastName'] },
      { association: 'Location', attributes: ['id', 'code', 'name'] },
      { association: 'AuthorityConnection', attributes: ['id', 'connectionKey', 'providerKey', 'status'] },
      { association: 'PrimarySourceReference', attributes: ['id', 'externalId', 'providerVersion', 'providerUpdatedAt'] },
      { association: 'Lines', include: [{ association: 'WineryProduct', attributes: ['id', 'name', 'vintage'] }] },
      { association: 'PaymentEvents' },
      { association: 'Refunds', include: [{ association: 'SalesOrderLine', attributes: ['id', 'lineKey', 'description'] }] },
      { association: 'WineClubAllocations', attributes: ['id', 'membershipId', 'cycleCode', 'canonicalStatus'] }
    ]
  });
  if (!order) throw new NotFoundError('Sales order not found');
  const plain = withoutProviderExtensions(order);
  for (const line of plain.Lines || []) delete line.providerExtensions;
  for (const refund of plain.Refunds || []) delete refund.providerExtensions;
  return plain;
}

module.exports = {
  commerceOrderSnapshotSchema,
  validateSnapshot,
  projectCommerceOrderSnapshot,
  listSalesOrders,
  getSalesOrder
};
