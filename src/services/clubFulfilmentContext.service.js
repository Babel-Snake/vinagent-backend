const Joi = require('joi');
const { Op } = require('sequelize');
const models = require('../models');
const { NotFoundError } = require('../utils/errors');
const contextPackRegistry = require('./contextPackRegistry.service');
const inventoryProjection = require('./inventoryProjection.service');

const CLUB_FULFILMENT_CONTEXT_PACK = 'club.fulfilment.v1';
const inputSchema = Joi.object({
  allocationId: Joi.number().integer().positive().required(),
  maxAgeSeconds: Joi.number().integer().min(60).max(604800).default(21600)
}).unknown(false);

const nullableIso = Joi.string().isoDate().allow(null);
const nullableId = Joi.number().integer().positive().allow(null);
const outputSchema = Joi.object({
  schemaVersion: Joi.string().valid(CLUB_FULFILMENT_CONTEXT_PACK).required(),
  generatedAt: Joi.string().isoDate().required(),
  allocation: Joi.object({
    id: Joi.number().integer().positive().required(),
    cycleCode: Joi.string().max(120).required(),
    status: Joi.string().max(40).required(),
    opensAt: nullableIso,
    closesAt: nullableIso,
    chargesAt: nullableIso,
    fulfilsAt: nullableIso,
    fulfilmentMethod: Joi.string().max(80).allow(null),
    currency: Joi.string().length(3).allow(null),
    totalMinor: Joi.number().integer().allow(null),
    observedAt: Joi.string().isoDate().required()
  }).unknown(false).required(),
  membership: Joi.object({
    id: Joi.number().integer().positive().required(),
    customerId: Joi.number().integer().positive().required(),
    status: Joi.string().max(40).required(),
    programId: Joi.number().integer().positive().required(),
    programCode: Joi.string().max(120).required(),
    programName: Joi.string().max(160).required()
  }).unknown(false).required(),
  items: Joi.array().items(Joi.object({
    allocationItemId: Joi.number().integer().positive().required(),
    productVariantId: nullableId,
    productCode: Joi.string().max(120).allow(null),
    description: Joi.string().max(255).required(),
    quantity: Joi.number().positive().required(),
    unit: Joi.string().max(40).required(),
    substitutionAllowed: Joi.boolean().required(),
    commitmentIds: Joi.array().items(Joi.number().integer().positive()).max(100).required()
  }).unknown(false)).max(1000).required(),
  inventory: Joi.object({
    status: Joi.string().valid(
      'AVAILABLE',
      'SHORTAGE',
      'UNKNOWN',
      'STALE',
      'UNIT_MISMATCH',
      'SOURCE_CONFLICT'
    ).required(),
    calculationReliable: Joi.boolean().required(),
    commitmentCount: Joi.number().integer().min(0).required(),
    unmappedItemCount: Joi.number().integer().min(0).required(),
    checks: Joi.array().items(Joi.object({
      commitmentId: Joi.number().integer().positive().required(),
      productVariantId: Joi.number().integer().positive().required(),
      stockLocationId: Joi.number().integer().positive().required(),
      requiredQuantity: Joi.number().positive().required(),
      unit: Joi.string().max(40).required(),
      status: Joi.string().valid(
        'AVAILABLE',
        'SHORTAGE',
        'UNKNOWN',
        'STALE',
        'UNIT_MISMATCH',
        'SOURCE_CONFLICT'
      ).required(),
      netAvailableToPromiseQuantity: Joi.number().allow(null).required(),
      shortageQuantity: Joi.number().min(0).allow(null).required(),
      observedAt: nullableIso,
      staleAt: nullableIso
    }).unknown(false)).max(500).required()
  }).unknown(false).required(),
  order: Joi.object({
    id: Joi.number().integer().positive().required(),
    status: Joi.string().max(40).required(),
    paymentStatus: Joi.string().max(40).required(),
    fulfilmentStatus: Joi.string().max(40).required(),
    currency: Joi.string().length(3).allow(null),
    paidMinor: Joi.number().integer().allow(null),
    outstandingMinor: Joi.number().integer().allow(null)
  }).unknown(false).allow(null).required(),
  shipments: Joi.array().items(Joi.object({
    id: Joi.number().integer().positive().required(),
    status: Joi.string().max(40).required(),
    estimatedDeliveryAt: nullableIso,
    latestExceptionCategory: Joi.string().max(40).required(),
    latestTrackingOccurredAt: nullableIso
  }).unknown(false)).max(100).required(),
  readiness: Joi.object({
    status: Joi.string().valid(
      'READY',
      'STOCK_SHORTAGE',
      'PAYMENT_ATTENTION',
      'DELIVERY_EXCEPTION',
      'UNKNOWN',
      'COMPLETE',
      'CANCELLED'
    ).required(),
    calculationReliable: Joi.boolean().required()
  }).unknown(false).required(),
  openWork: Joi.object({
    taskCount: Joi.number().integer().min(0).required(),
    taskIds: Joi.array().items(Joi.number().integer().positive()).max(100).required()
  }).unknown(false).required(),
  freshness: Joi.object({
    status: Joi.string().valid('FRESH', 'STALE').required(),
    observedAt: Joi.string().isoDate().required(),
    ageSeconds: Joi.number().integer().min(0).required(),
    maxAgeSeconds: Joi.number().integer().min(60).max(604800).required()
  }).unknown(false).required(),
  automationEligible: Joi.boolean().valid(false).required(),
  explanations: Joi.array().items(Joi.string().max(160)).max(20).required()
}).unknown(false);

const iso = value => value ? new Date(value).toISOString() : null;

function summarizeInventory({ checks, unmappedItemCount }) {
  if (unmappedItemCount > 0 || checks.length === 0) {
    return { status: 'UNKNOWN', calculationReliable: false };
  }
  const precedence = [
    'SOURCE_CONFLICT',
    'STALE',
    'UNIT_MISMATCH',
    'UNKNOWN',
    'SHORTAGE',
    'AVAILABLE'
  ];
  const status = precedence.find(candidate => checks.some(check => check.status === candidate)) || 'UNKNOWN';
  return {
    status,
    calculationReliable: checks.every(check => check.calculationReliable)
      && ['AVAILABLE', 'SHORTAGE'].includes(status)
  };
}

function readiness({
  allocationStatus,
  inventory,
  order,
  shipments,
  fresh
}) {
  if (allocationStatus === 'CANCELLED') return { status: 'CANCELLED', calculationReliable: true };
  if (['FULFILLED', 'SKIPPED'].includes(allocationStatus)) {
    return { status: 'COMPLETE', calculationReliable: true };
  }
  if (!fresh) return { status: 'UNKNOWN', calculationReliable: false };
  if (shipments.some(shipment => shipment.latestExceptionCategory !== 'NONE'
    && !['DELIVERED', 'RETURNED', 'CANCELLED'].includes(shipment.canonicalStatus))) {
    return { status: 'DELIVERY_EXCEPTION', calculationReliable: true };
  }
  if (order && (
    ['FAILED', 'CHARGEBACK', 'PENDING', 'AUTHORIZED', 'PARTIALLY_PAID'].includes(order.paymentStatus)
    || Number(order.outstandingMinor || 0) > 0
  )) {
    return { status: 'PAYMENT_ATTENTION', calculationReliable: true };
  }
  if (inventory.status === 'SHORTAGE' && inventory.calculationReliable) {
    return { status: 'STOCK_SHORTAGE', calculationReliable: true };
  }
  if (!inventory.calculationReliable) return { status: 'UNKNOWN', calculationReliable: false };
  return { status: 'READY', calculationReliable: true };
}

async function loadOpenWork({ wineryId, allocationId, transaction }) {
  const links = await models.OperationalResourceLink.findAll({
    where: {
      wineryId,
      resourceType: 'WINE_CLUB_ALLOCATION',
      resourceId: allocationId,
      itemType: 'TASK',
      linkType: { [Op.in]: ['GENERATED_FOR', 'ABOUT', 'FOLLOW_UP_FOR'] }
    },
    attributes: ['itemId'],
    transaction
  });
  const taskIds = [...new Set(links.map(link => Number(link.itemId)).filter(Number.isSafeInteger))];
  if (taskIds.length === 0) return { taskCount: 0, taskIds: [] };
  const tasks = await models.Task.findAll({
    where: { wineryId, id: { [Op.in]: taskIds }, status: 'PENDING' },
    attributes: ['id'],
    order: [['id', 'ASC']],
    transaction
  });
  return { taskCount: tasks.length, taskIds: tasks.map(task => task.id) };
}

async function resolveClubFulfilment({
  wineryId,
  input,
  transaction = null,
  now = new Date()
}) {
  const allocation = await models.WineClubAllocation.findOne({
    where: { id: input.allocationId, wineryId },
    include: [
      {
        association: 'Membership',
        attributes: ['id', 'memberId', 'canonicalStatus'],
        include: [{ association: 'Program', attributes: ['id', 'code', 'name'] }]
      },
      {
        association: 'Items',
        include: [{ association: 'ProductVariant', attributes: ['id', 'code', 'name', 'unitOfMeasure'] }]
      },
      {
        association: 'SalesOrder',
        attributes: [
          'id', 'canonicalStatus', 'paymentStatus', 'fulfilmentStatus', 'currency',
          'paidMinor', 'outstandingMinor'
        ]
      },
      {
        association: 'Shipments',
        attributes: [
          'id', 'canonicalStatus', 'estimatedDeliveryAt', 'latestExceptionCategory',
          'latestTrackingOccurredAt'
        ]
      }
    ],
    transaction
  });
  if (!allocation) throw new NotFoundError('Wine Club allocation not found');
  const [commitments, openWork] = await Promise.all([
    models.InventoryCommitment.findAll({
      where: {
        wineryId,
        sourceType: 'WINE_CLUB_ALLOCATION',
        sourceId: allocation.id,
        status: { [Op.in]: ['EXPECTED', 'RESERVED'] }
      },
      order: [['id', 'ASC']],
      transaction
    }),
    loadOpenWork({ wineryId, allocationId: allocation.id, transaction })
  ]);
  const checks = [];
  for (const commitment of commitments) {
    const availability = await inventoryProjection.calculateAvailableToPromise({
      wineryId,
      productVariantId: commitment.productVariantId,
      stockLocationId: commitment.stockLocationId,
      requiredAt: commitment.requiredAt,
      additionalRequiredQuantity: 0,
      unit: commitment.unit,
      now,
      transaction
    });
    checks.push({
      commitmentId: commitment.id,
      productVariantId: commitment.productVariantId,
      stockLocationId: commitment.stockLocationId,
      requiredQuantity: Number(commitment.quantity),
      unit: commitment.unit,
      status: availability.status,
      calculationReliable: availability.calculationReliable,
      netAvailableToPromiseQuantity: availability.netAvailableToPromiseQuantity ?? null,
      shortageQuantity: availability.shortageQuantity ?? null,
      observedAt: iso(availability.position?.observedAt),
      staleAt: iso(availability.position?.staleAt)
    });
  }
  const commitmentsByVariant = new Map();
  for (const commitment of commitments) {
    const existing = commitmentsByVariant.get(commitment.productVariantId) || [];
    existing.push(commitment.id);
    commitmentsByVariant.set(commitment.productVariantId, existing);
  }
  const unmappedItemCount = allocation.Items.filter(item => (
    !item.productVariantId || !(commitmentsByVariant.get(item.productVariantId) || []).length
  )).length;
  const inventorySummary = summarizeInventory({ checks, unmappedItemCount });
  const observedAt = new Date(allocation.observedAt);
  const futureObservation = observedAt.getTime() > now.getTime() + (5 * 60 * 1000);
  const ageSeconds = Math.max(0, Math.floor((now - observedAt) / 1000));
  const fresh = !futureObservation && ageSeconds <= input.maxAgeSeconds;
  const readinessSummary = readiness({
    allocationStatus: allocation.canonicalStatus,
    inventory: inventorySummary,
    order: allocation.SalesOrder,
    shipments: allocation.Shipments,
    fresh
  });
  return {
    schemaVersion: CLUB_FULFILMENT_CONTEXT_PACK,
    generatedAt: now.toISOString(),
    allocation: {
      id: allocation.id,
      cycleCode: allocation.cycleCode,
      status: allocation.canonicalStatus,
      opensAt: iso(allocation.opensAt),
      closesAt: iso(allocation.closesAt),
      chargesAt: iso(allocation.chargesAt),
      fulfilsAt: iso(allocation.fulfilsAt),
      fulfilmentMethod: allocation.fulfilmentMethod || null,
      currency: allocation.currency || null,
      totalMinor: allocation.totalMinor ?? null,
      observedAt: iso(allocation.observedAt)
    },
    membership: {
      id: allocation.Membership.id,
      customerId: allocation.Membership.memberId,
      status: allocation.Membership.canonicalStatus,
      programId: allocation.Membership.Program.id,
      programCode: allocation.Membership.Program.code,
      programName: allocation.Membership.Program.name
    },
    items: allocation.Items.map(item => ({
      allocationItemId: item.id,
      productVariantId: item.productVariantId || null,
      productCode: item.ProductVariant?.code || null,
      description: item.description,
      quantity: Number(item.quantity),
      unit: item.unit,
      substitutionAllowed: item.substitutionAllowed,
      commitmentIds: item.productVariantId
        ? (commitmentsByVariant.get(item.productVariantId) || [])
        : []
    })),
    inventory: {
      ...inventorySummary,
      commitmentCount: commitments.length,
      unmappedItemCount,
      checks: checks.map(({ calculationReliable: _calculationReliable, ...check }) => check)
    },
    order: allocation.SalesOrder ? {
      id: allocation.SalesOrder.id,
      status: allocation.SalesOrder.canonicalStatus,
      paymentStatus: allocation.SalesOrder.paymentStatus,
      fulfilmentStatus: allocation.SalesOrder.fulfilmentStatus,
      currency: allocation.SalesOrder.currency || null,
      paidMinor: allocation.SalesOrder.paidMinor ?? null,
      outstandingMinor: allocation.SalesOrder.outstandingMinor ?? null
    } : null,
    shipments: allocation.Shipments.map(shipment => ({
      id: shipment.id,
      status: shipment.canonicalStatus,
      estimatedDeliveryAt: iso(shipment.estimatedDeliveryAt),
      latestExceptionCategory: shipment.latestExceptionCategory,
      latestTrackingOccurredAt: iso(shipment.latestTrackingOccurredAt)
    })),
    readiness: readinessSummary,
    openWork,
    freshness: {
      status: fresh ? 'FRESH' : 'STALE',
      observedAt: iso(allocation.observedAt),
      ageSeconds,
      maxAgeSeconds: input.maxAgeSeconds
    },
    automationEligible: false,
    explanations: [
      'WINE_CLUB_CANONICAL_ALLOCATION',
      'INVENTORY_COMMITMENTS_AND_ATP',
      'PAYMENT_SUMMARY_ONLY',
      'RESTRICTED_DELIVERY_DETAILS_EXCLUDED',
      readinessSummary.status,
      ...(futureObservation ? ['ALLOCATION_OBSERVATION_IN_FUTURE'] : []),
      'CLUB_FULFILMENT_AUTOMATION_NOT_ACTIVATED'
    ]
  };
}

function registerClubFulfilmentContextPack() {
  return contextPackRegistry.register({
    name: CLUB_FULFILMENT_CONTEXT_PACK,
    description: 'Returns bounded allocation, inventory, payment, shipment, and open-work readiness context.',
    inputSchema,
    outputSchema,
    resolver: resolveClubFulfilment
  });
}

module.exports = {
  CLUB_FULFILMENT_CONTEXT_PACK,
  inputSchema,
  outputSchema,
  summarizeInventory,
  readiness,
  resolveClubFulfilment,
  registerClubFulfilmentContextPack
};
