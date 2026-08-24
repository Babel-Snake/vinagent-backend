const crypto = require('crypto');
const { Op } = require('sequelize');
const models = require('../models');
const { NotFoundError, ValidationError } = require('../utils/errors');
const inventoryProjectionService = require('./inventoryProjection.service');
const { stableSerialize } = require('./integrationDataFoundation.service');
const {
  INVENTORY_DEMAND_MAPPING_STATUSES,
  INVENTORY_DEMAND_SOURCE_RECORD_TYPES
} = require('./integrationDataRegistry.service');

const SOURCE_DOMAINS = Object.freeze({
  BOOKING_REQUIREMENT: 'BOOKING',
  WINE_CLUB_ALLOCATION_ITEM: 'CLUB',
  SALES_ORDER_LINE: 'COMMERCE'
});
const BOOKING_TERMINAL_STATUSES = Object.freeze({
  COMPLETED: 'CONSUMED',
  CANCELLED: 'CANCELLED',
  NO_SHOW: 'CANCELLED'
});
const BOOKING_PURPOSE_PREFIX = 'requirement:';

function normalizeSourceCode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized || normalized.length > 160) throw new ValidationError('Inventory demand sourceCode is invalid');
  return normalized;
}

function buildMappingKey({ sourceRecordType, sourceConnectionId, sourceCode }) {
  return crypto.createHash('sha256').update(stableSerialize({
    sourceRecordType,
    scope: sourceConnectionId ? `connection:${sourceConnectionId}` : 'winery',
    sourceCode: normalizeSourceCode(sourceCode)
  })).digest('hex');
}

function snapshotMapping(mapping) {
  return {
    id: mapping.id,
    sourceRecordType: mapping.sourceRecordType,
    sourceConnectionId: mapping.sourceConnectionId,
    sourceCode: mapping.sourceCode,
    sourceCodeNormalized: mapping.sourceCodeNormalized,
    mappingKey: mapping.mappingKey,
    productVariantId: mapping.productVariantId,
    stockLocationId: mapping.stockLocationId,
    quantityMultiplier: Number(mapping.quantityMultiplier),
    unit: mapping.unit,
    status: mapping.status,
    confirmationStatus: mapping.confirmationStatus,
    updatedAt: mapping.updatedAt
  };
}

async function requireActor({ wineryId, actorUserId, transaction }) {
  const actor = await models.User.findOne({
    where: { id: actorUserId, wineryId },
    attributes: ['id'],
    transaction
  });
  if (!actor) throw new ValidationError('Inventory demand mapping actor does not belong to the winery');
}

async function validateTarget({ wineryId, data, transaction }) {
  const [variant, stockLocation] = await Promise.all([
    models.ProductVariant.findOne({
      where: { id: data.productVariantId, wineryId, isActive: true },
      transaction
    }),
    models.StockLocation.findOne({
      where: { id: data.stockLocationId, wineryId, isActive: true },
      transaction
    })
  ]);
  if (!variant) throw new ValidationError('Inventory demand product variant is not active in this winery');
  if (!stockLocation) throw new ValidationError('Inventory demand stock location is not active in this winery');
  if (variant.unitOfMeasure !== data.unit) {
    throw new ValidationError('Inventory demand unit must match the canonical product variant unit');
  }
}

async function validateSourceConnection({ wineryId, data, transaction }) {
  if (!data.sourceConnectionId) return;
  const domain = SOURCE_DOMAINS[data.sourceRecordType];
  const connection = await models.IntegrationConnection.findOne({
    where: { id: data.sourceConnectionId, wineryId },
    attributes: ['id'],
    transaction
  });
  if (!connection) throw new ValidationError('Inventory demand source connection does not belong to the winery');
  const scope = await models.IntegrationConnectionScope.findOne({
    where: {
      wineryId,
      connectionId: data.sourceConnectionId,
      domain,
      isActive: true
    },
    attributes: ['id'],
    transaction
  });
  if (!scope) throw new ValidationError(`Inventory demand source connection has no active ${domain} scope`);
}

async function refreshBookingsForMapping({ wineryId, mapping, transaction }) {
  if (mapping.sourceRecordType !== 'BOOKING_REQUIREMENT') return { bookingsMatched: 0, commitmentsUpserted: 0, commitmentsCancelled: 0 };
  const requirements = await models.BookingRequirement.findAll({
    where: {
      wineryId,
      [Op.and]: models.sequelize.where(
        models.sequelize.fn('LOWER', models.sequelize.col('code')),
        mapping.sourceCodeNormalized
      )
    },
    attributes: ['bookingId'],
    transaction
  });
  const bookingIds = [...new Set(requirements.map(requirement => requirement.bookingId))];
  const result = { bookingsMatched: bookingIds.length, commitmentsUpserted: 0, commitmentsCancelled: 0 };
  for (const bookingId of bookingIds) {
    const refreshed = await syncBookingInventoryCommitments({ wineryId, bookingId, transaction });
    result.commitmentsUpserted += refreshed.upserted;
    result.commitmentsCancelled += refreshed.cancelled;
  }
  return result;
}

async function upsertInventoryDemandMapping({ wineryId, actorUserId, data }) {
  if (!INVENTORY_DEMAND_SOURCE_RECORD_TYPES.includes(data.sourceRecordType)) {
    throw new ValidationError('Inventory demand source record type is unsupported');
  }
  if (!INVENTORY_DEMAND_MAPPING_STATUSES.includes(data.status)) {
    throw new ValidationError('Inventory demand mapping status is unsupported');
  }
  return models.sequelize.transaction(async transaction => {
    await requireActor({ wineryId, actorUserId, transaction });
    await validateTarget({ wineryId, data, transaction });
    await validateSourceConnection({ wineryId, data, transaction });
    const mappingKey = buildMappingKey(data);
    const priorAudit = await models.IntegrationOperationAuditEvent.findOne({
      where: { wineryId, action: 'INVENTORY_DEMAND_MAPPING_UPSERTED', requestId: data.requestId },
      transaction
    });
    if (priorAudit) {
      const mapping = await models.InventoryDemandMapping.findOne({
        where: { id: Number(priorAudit.targetId), wineryId },
        transaction
      });
      if (!mapping) throw new NotFoundError('Previously audited inventory demand mapping no longer exists');
      if (mapping.mappingKey !== mappingKey) {
        throw new ValidationError('requestId was already used for another inventory demand mapping');
      }
      return { mapping, duplicate: true, refresh: { bookingsMatched: 0, commitmentsUpserted: 0, commitmentsCancelled: 0 } };
    }
    let mapping = await models.InventoryDemandMapping.findOne({
      where: { wineryId, mappingKey },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    const beforeSnapshot = mapping ? snapshotMapping(mapping) : null;
    const values = {
      wineryId,
      sourceRecordType: data.sourceRecordType,
      sourceConnectionId: data.sourceConnectionId || null,
      sourceCode: String(data.sourceCode).trim(),
      sourceCodeNormalized: normalizeSourceCode(data.sourceCode),
      mappingKey,
      productVariantId: data.productVariantId,
      stockLocationId: data.stockLocationId,
      quantityMultiplier: data.quantityMultiplier,
      unit: data.unit,
      status: data.status,
      confirmationStatus: 'MANAGER_CONFIRMED',
      updatedBy: actorUserId
    };
    mapping = mapping
      ? await mapping.update(values, { transaction })
      : await models.InventoryDemandMapping.create({
        ...values,
        createdBy: actorUserId
      }, { transaction });
    const refresh = await refreshBookingsForMapping({ wineryId, mapping, transaction });
    await models.IntegrationOperationAuditEvent.create({
      wineryId,
      actorUserId,
      action: 'INVENTORY_DEMAND_MAPPING_UPSERTED',
      targetType: 'INVENTORY_DEMAND_MAPPING',
      targetId: String(mapping.id),
      connectionId: mapping.sourceConnectionId,
      resourceType: mapping.sourceRecordType,
      requestId: data.requestId,
      reason: data.reason,
      beforeSnapshot,
      afterSnapshot: snapshotMapping(mapping),
      metadata: refresh
    }, { transaction });
    return { mapping, duplicate: false, refresh };
  });
}

async function listInventoryDemandMappings({
  wineryId,
  page = 1,
  pageSize = 25,
  sourceRecordType,
  status = 'ALL'
}) {
  const where = { wineryId };
  if (sourceRecordType) where.sourceRecordType = sourceRecordType;
  if (status !== 'ALL') where.status = status;
  const result = await models.InventoryDemandMapping.findAndCountAll({
    where,
    include: [
      { association: 'SourceConnection', attributes: ['id', 'connectionKey', 'providerKey', 'status'] },
      { association: 'ProductVariant', attributes: ['id', 'code', 'name', 'sku', 'unitOfMeasure', 'isActive'] },
      { association: 'StockLocation', attributes: ['id', 'code', 'name', 'locationType', 'isActive'] }
    ],
    order: [['sourceRecordType', 'ASC'], ['sourceCodeNormalized', 'ASC'], ['id', 'ASC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
    distinct: true
  });
  return {
    inventoryDemandMappings: result.rows,
    pagination: {
      page,
      pageSize,
      total: result.count,
      totalPages: Math.ceil(result.count / pageSize)
    }
  };
}

function commitmentStatusForBooking(booking) {
  if (booking.isSourceDeleted) return 'CANCELLED';
  return BOOKING_TERMINAL_STATUSES[booking.canonicalStatus] || 'EXPECTED';
}

function commitmentKey({ productVariantId, stockLocationId, purposeKey }) {
  return `${productVariantId}:${stockLocationId}:${purposeKey}`;
}

async function syncBookingInventoryCommitments({
  wineryId,
  bookingId,
  sourceEventId = null,
  transaction,
  now = new Date()
}) {
  if (!transaction) {
    return models.sequelize.transaction(nested => syncBookingInventoryCommitments({
      wineryId, bookingId, sourceEventId, transaction: nested, now
    }));
  }
  const booking = await models.Booking.findOne({
    where: { id: bookingId, wineryId },
    include: [{
      association: 'Requirements',
      where: { isActive: true },
      required: false
    }],
    transaction
  });
  if (!booking) throw new NotFoundError('Booking not found for inventory demand synchronization');
  const requirements = (booking.Requirements || []).filter(requirement => requirement.sensitivityClass !== 'RESTRICTED');
  const codes = [...new Set(requirements.map(requirement => normalizeSourceCode(requirement.code)))];
  const mappings = codes.length === 0 ? [] : await models.InventoryDemandMapping.findAll({
    where: {
      wineryId,
      sourceRecordType: 'BOOKING_REQUIREMENT',
      sourceCodeNormalized: { [Op.in]: codes },
      status: 'ACTIVE',
      [Op.or]: [
        { sourceConnectionId: null },
        { sourceConnectionId: booking.authorityConnectionId }
      ]
    },
    include: [
      { association: 'ProductVariant', where: { isActive: true }, required: true, attributes: ['id'] },
      { association: 'StockLocation', where: { isActive: true }, required: true, attributes: ['id'] }
    ],
    order: [['sourceConnectionId', 'DESC'], ['id', 'ASC']],
    transaction
  });
  const mappingByCode = new Map();
  for (const mapping of mappings) {
    if (!mappingByCode.has(mapping.sourceCodeNormalized)
      || mapping.sourceConnectionId === booking.authorityConnectionId) {
      mappingByCode.set(mapping.sourceCodeNormalized, mapping);
    }
  }
  const desired = new Set();
  let upserted = 0;
  for (const requirement of requirements) {
    const mapping = mappingByCode.get(normalizeSourceCode(requirement.code));
    if (!mapping) continue;
    const purposeKey = `${BOOKING_PURPOSE_PREFIX}${requirement.requirementKey}`;
    desired.add(commitmentKey({
      productVariantId: mapping.productVariantId,
      stockLocationId: mapping.stockLocationId,
      purposeKey
    }));
    const mappedQuantity = Number((Number(requirement.quantity) * Number(mapping.quantityMultiplier)).toFixed(3));
    if (mappedQuantity <= 0) continue;
    await inventoryProjectionService.upsertInventoryCommitment({
      wineryId,
      transaction,
      input: {
        productVariantId: mapping.productVariantId,
        stockLocationId: mapping.stockLocationId,
        sourceType: 'BOOKING',
        sourceId: booking.id,
        purposeKey,
        quantity: mappedQuantity,
        unit: mapping.unit,
        requiredAt: booking.startAt,
        status: commitmentStatusForBooking(booking),
        confidence: 1,
        derivation: 'DETERMINISTIC',
        derivationVersion: `inventory-demand-mapping:${mapping.id}`,
        sourceReferenceId: requirement.sourceReferenceId,
        sourceEventId,
        sourceUpdatedAt: booking.sourceUpdatedAt,
        observedAt: now,
        metadata: {
          mappingId: mapping.id,
          bookingRequirementId: requirement.id,
          requirementCode: requirement.code
        }
      }
    });
    upserted += 1;
  }
  const existing = await models.InventoryCommitment.findAll({
    where: {
      wineryId,
      sourceType: 'BOOKING',
      sourceId: booking.id,
      purposeKey: { [Op.like]: `${BOOKING_PURPOSE_PREFIX}%` },
      status: { [Op.in]: ['EXPECTED', 'RESERVED'] }
    },
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  let cancelled = 0;
  for (const commitment of existing) {
    const key = commitmentKey(commitment);
    if (desired.has(key)) continue;
    await commitment.update({
      status: 'CANCELLED',
      releasedAt: now,
      observedAt: now,
      sourceUpdatedAt: now
    }, { transaction });
    cancelled += 1;
  }
  return { bookingId: booking.id, mappingsMatched: mappingByCode.size, upserted, cancelled };
}

module.exports = {
  SOURCE_DOMAINS,
  BOOKING_PURPOSE_PREFIX,
  normalizeSourceCode,
  buildMappingKey,
  upsertInventoryDemandMapping,
  listInventoryDemandMappings,
  syncBookingInventoryCommitments
};
