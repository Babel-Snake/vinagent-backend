const Joi = require('joi');
const { Op } = require('sequelize');
const {
  Booking,
  BookingAreaLink,
  BookingItem,
  BookingRequirement,
  InventoryCommitment,
  AutomationResourceBinding,
  OperationalResourceLink,
  Task,
  WineryBookingType,
  WineryLocation,
  OperationalArea
} = require('../models');
const { NotFoundError } = require('../utils/errors');
const contextPackRegistry = require('./contextPackRegistry.service');
const inventoryProjectionService = require('./inventoryProjection.service');
const bookingCoverageContext = require('./bookingCoverageContext.service');

const BOOKING_READINESS_CONTEXT_PACK = 'booking.readiness.v1';
const TRUFFLE_REQUIREMENT_CODE = 'truffle-pairing';
const TRUFFLE_PREPARATION_PURPOSE = 'booking.truffle_preparation';

const nullableId = Joi.number().integer().positive().allow(null);
const nullableText = max => Joi.string().max(max).allow('', null);
const inventoryDomainSchema = Joi.object({
  status: Joi.string().valid(
    'AVAILABLE',
    'SHORTAGE',
    'UNKNOWN',
    'STALE',
    'UNIT_MISMATCH',
    'SOURCE_CONFLICT'
  ).required(),
  code: Joi.string().max(120).required(),
  calculationReliable: Joi.boolean().required(),
  commitmentCount: Joi.number().integer().min(0).required(),
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
    observedAt: Joi.string().isoDate().allow(null).required(),
    staleAt: Joi.string().isoDate().allow(null).required()
  }).unknown(false)).max(100).required()
}).unknown(false);
const workforceDomainSchema = Joi.object({
  status: Joi.string().valid('COVERED', 'GAP', 'UNKNOWN', 'STALE').required(),
  code: Joi.string().max(120).required(),
  calculationReliable: Joi.boolean().required(),
  demandCount: Joi.number().integer().min(0).required(),
  gapCount: Joi.number().integer().min(0).required(),
  contextVersion: Joi.string().valid('booking.coverage.v1').required()
}).unknown(false);

const bookingReadinessInputSchema = Joi.object({
  bookingId: Joi.number().integer().positive().required(),
  maxAgeSeconds: Joi.number().integer().min(60).max(604800).default(3600)
}).unknown(false);

const bookingReadinessOutputSchema = Joi.object({
  schemaVersion: Joi.string().valid(BOOKING_READINESS_CONTEXT_PACK).required(),
  generatedAt: Joi.string().isoDate().required(),
  booking: Joi.object({
    id: Joi.number().integer().positive().required(),
    referenceCode: Joi.string().max(255).required(),
    status: Joi.string().max(40).required(),
    startAt: Joi.string().isoDate().required(),
    endAt: Joi.string().isoDate().allow(null),
    partySize: Joi.number().integer().positive().required(),
    locationId: nullableId,
    locationName: nullableText(160),
    primaryAreaId: nullableId,
    primaryAreaName: nullableText(160),
    experienceCode: nullableText(120),
    experienceName: nullableText(255),
    bookingTypeId: nullableId,
    sourceUpdatedAt: Joi.string().isoDate().required()
  }).unknown(false).required(),
  requirements: Joi.object({
    operational: Joi.array().items(Joi.object({
      kind: Joi.string().max(40).required(),
      code: Joi.string().max(120).required(),
      description: Joi.string().max(255).required(),
      quantity: Joi.number().integer().positive().required(),
      unit: nullableText(40),
      fulfilmentStatus: Joi.string().max(40).required(),
      responsibleAreaId: nullableId
    }).unknown(false)).max(100).required(),
    restrictedCount: Joi.number().integer().min(0).required()
  }).unknown(false).required(),
  preparation: Joi.object({
    required: Joi.boolean().required(),
    trufflePairing: Joi.object({
      required: Joi.boolean().required(),
      requirementCode: Joi.string().valid(TRUFFLE_REQUIREMENT_CODE).required(),
      quantity: Joi.number().integer().min(0).required(),
      unit: Joi.string().valid('portion').required()
    }).unknown(false).required()
  }).unknown(false).required(),
  inventory: inventoryDomainSchema.required(),
  workforce: workforceDomainSchema.required(),
  openWork: Joi.object({
    taskCount: Joi.number().integer().min(0).required(),
    taskIds: Joi.array().items(Joi.number().integer().positive()).max(100).required(),
    hasTrufflePreparationTask: Joi.boolean().required(),
    hasTrufflePreparationBinding: Joi.boolean().required()
  }).unknown(false).required(),
  freshness: Joi.object({
    status: Joi.string().valid('FRESH', 'STALE').required(),
    observedAt: Joi.string().isoDate().required(),
    ageSeconds: Joi.number().integer().min(0).required(),
    maxAgeSeconds: Joi.number().integer().min(60).max(604800).required()
  }).unknown(false).required(),
  explanations: Joi.array().items(Joi.string().max(160)).max(20).required()
}).unknown(false);

const toIso = value => new Date(value).toISOString();

async function loadOpenBookingWork({ wineryId, bookingId, transaction }) {
  const [links, lifecycleBinding] = await Promise.all([OperationalResourceLink.findAll({
    where: {
      wineryId,
      resourceType: 'BOOKING',
      resourceId: bookingId,
      itemType: 'TASK',
      linkType: 'GENERATED_FOR'
    },
    attributes: ['itemId', 'metadata'],
    transaction
  }), AutomationResourceBinding.findOne({
    where: {
      wineryId,
      resourceType: 'BOOKING',
      resourceId: bookingId,
      purposeKey: TRUFFLE_PREPARATION_PURPOSE
    },
    attributes: ['id'],
    transaction
  })]);
  const taskIds = [...new Set(links.map(link => Number(link.itemId)).filter(Number.isSafeInteger))];
  if (taskIds.length === 0) {
    return {
      taskCount: 0,
      taskIds: [],
      hasTrufflePreparationTask: false,
      hasTrufflePreparationBinding: Boolean(lifecycleBinding)
    };
  }
  const tasks = await Task.findAll({
    where: { id: { [Op.in]: taskIds }, wineryId, status: 'PENDING' },
    attributes: ['id', 'payload'],
    transaction
  });
  const openIds = tasks.map(task => task.id);
  const truffleLinkIds = new Set(links
    .filter(link => link.metadata?.purposeKey === TRUFFLE_PREPARATION_PURPOSE)
    .map(link => Number(link.itemId)));
  return {
    taskCount: openIds.length,
    taskIds: openIds,
    hasTrufflePreparationTask: tasks.some(task => (
      truffleLinkIds.has(task.id)
      || task.payload?.automationPurpose === TRUFFLE_PREPARATION_PURPOSE
    )),
    hasTrufflePreparationBinding: Boolean(lifecycleBinding)
  };
}

async function resolveBookingInventory({ wineryId, booking, truffleQuantity, transaction, now }) {
  if (truffleQuantity <= 0) {
    return {
      status: 'UNKNOWN',
      code: 'INVENTORY_NOT_REQUIRED',
      calculationReliable: false,
      commitmentCount: 0,
      checks: []
    };
  }
  const commitments = (await InventoryCommitment.findAll({
    where: {
      wineryId,
      sourceType: 'BOOKING',
      sourceId: booking.id,
      status: { [Op.in]: ['EXPECTED', 'RESERVED'] }
    },
    order: [['id', 'ASC']],
    transaction
  })).filter(commitment => (
    String(commitment.metadata?.requirementCode || '').trim().toLowerCase() === TRUFFLE_REQUIREMENT_CODE
  ));
  if (commitments.length === 0) {
    return {
      status: 'UNKNOWN',
      code: 'INVENTORY_DEMAND_UNMAPPED',
      calculationReliable: false,
      commitmentCount: 0,
      checks: []
    };
  }
  const checks = [];
  for (const commitment of commitments) {
    const availability = await inventoryProjectionService.calculateAvailableToPromise({
      wineryId,
      productVariantId: commitment.productVariantId,
      stockLocationId: commitment.stockLocationId,
      requiredAt: booking.startAt,
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
      netAvailableToPromiseQuantity: availability.netAvailableToPromiseQuantity ?? null,
      shortageQuantity: availability.shortageQuantity ?? null,
      observedAt: availability.position?.observedAt
        ? toIso(availability.position.observedAt)
        : null,
      staleAt: availability.position?.staleAt
        ? toIso(availability.position.staleAt)
        : null
    });
  }
  const unreliableOrder = ['SOURCE_CONFLICT', 'STALE', 'UNIT_MISMATCH', 'UNKNOWN'];
  const unreliableStatus = unreliableOrder.find(status => checks.some(check => check.status === status));
  if (unreliableStatus) {
    return {
      status: unreliableStatus,
      code: `INVENTORY_${unreliableStatus}`,
      calculationReliable: false,
      commitmentCount: commitments.length,
      checks
    };
  }
  if (checks.some(check => check.status === 'SHORTAGE')) {
    return {
      status: 'SHORTAGE',
      code: 'INVENTORY_SHORTAGE',
      calculationReliable: true,
      commitmentCount: commitments.length,
      checks
    };
  }
  return {
    status: 'AVAILABLE',
    code: 'INVENTORY_AVAILABLE',
    calculationReliable: true,
    commitmentCount: commitments.length,
    checks
  };
}

async function resolveBookingReadiness({ wineryId, input, transaction = null, now = new Date() }) {
  const booking = await Booking.findOne({
    where: { id: input.bookingId, wineryId },
    include: [
      { model: WineryLocation, as: 'Location', attributes: ['id', 'name'] },
      { model: WineryBookingType, as: 'PrimaryBookingType', attributes: ['id', 'name'] },
      {
        model: BookingAreaLink,
        as: 'AreaLinks',
        where: { relationshipType: 'PRIMARY' },
        required: false,
        include: [{ model: OperationalArea, as: 'Area', attributes: ['id', 'name'] }]
      },
      { model: BookingItem, as: 'Items', where: { isActive: true }, required: false },
      { model: BookingRequirement, as: 'Requirements', where: { isActive: true }, required: false }
    ],
    transaction
  });
  if (!booking) throw new NotFoundError('Canonical booking was not found for readiness context.');

  const primaryAreaLink = booking.AreaLinks?.[0] || null;
  const experienceItem = booking.Items?.find(item => item.itemType === 'EXPERIENCE') || null;
  const operationalRequirements = (booking.Requirements || []).filter(item => item.sensitivityClass !== 'RESTRICTED');
  const restrictedCount = (booking.Requirements || []).length - operationalRequirements.length;
  const truffleQuantity = operationalRequirements
    .filter(item => String(item.code).toLowerCase() === TRUFFLE_REQUIREMENT_CODE)
    .reduce((total, item) => total + Number(item.quantity || 0), 0);
  const observedAt = booking.resolvedAt || booking.updatedAt;
  const ageSeconds = Math.max(0, Math.floor((now.getTime() - new Date(observedAt).getTime()) / 1000));
  const [openWork, inventory, coverage] = await Promise.all([
    loadOpenBookingWork({ wineryId, bookingId: booking.id, transaction }),
    resolveBookingInventory({ wineryId, booking, truffleQuantity, transaction, now }),
    bookingCoverageContext.resolveBookingCoverage({
      wineryId,
      input: { bookingId: booking.id, maxAgeSeconds: input.maxAgeSeconds },
      transaction,
      now
    })
  ]);

  return {
    schemaVersion: BOOKING_READINESS_CONTEXT_PACK,
    generatedAt: now.toISOString(),
    booking: {
      id: booking.id,
      referenceCode: booking.referenceCode,
      status: booking.canonicalStatus,
      startAt: toIso(booking.startAt),
      endAt: booking.endAt ? toIso(booking.endAt) : null,
      partySize: booking.partySize,
      locationId: booking.locationId || null,
      locationName: booking.Location?.name || null,
      primaryAreaId: primaryAreaLink?.areaId || null,
      primaryAreaName: primaryAreaLink?.Area?.name || null,
      experienceCode: experienceItem?.externalCode || booking.providerExtensions?.experience?.code || null,
      experienceName: experienceItem?.description || booking.PrimaryBookingType?.name || null,
      bookingTypeId: booking.primaryBookingTypeId || null,
      sourceUpdatedAt: toIso(booking.sourceUpdatedAt)
    },
    requirements: {
      operational: operationalRequirements.map(item => ({
        kind: item.kind,
        code: item.code,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit || null,
        fulfilmentStatus: item.fulfilmentStatus,
        responsibleAreaId: item.responsibleAreaId || null
      })),
      restrictedCount
    },
    preparation: {
      required: operationalRequirements.length > 0,
      trufflePairing: {
        required: truffleQuantity > 0,
        requirementCode: TRUFFLE_REQUIREMENT_CODE,
        quantity: truffleQuantity,
        unit: 'portion'
      }
    },
    inventory,
    workforce: {
      status: coverage.status,
      code: coverage.code,
      calculationReliable: coverage.calculationReliable,
      demandCount: coverage.demandCount,
      gapCount: coverage.gapCount,
      contextVersion: coverage.schemaVersion
    },
    openWork,
    freshness: {
      status: ageSeconds <= input.maxAgeSeconds ? 'FRESH' : 'STALE',
      observedAt: toIso(observedAt),
      ageSeconds,
      maxAgeSeconds: input.maxAgeSeconds
    },
    explanations: [
      'BOOKING_CANONICAL_PROJECTION',
      'RESTRICTED_REQUIREMENTS_REDACTED',
      inventory.code,
      coverage.code
    ]
  };
}

function registerBookingReadinessContextPack() {
  return contextPackRegistry.register({
    name: BOOKING_READINESS_CONTEXT_PACK,
    description: 'Returns bounded, privacy-safe canonical preparation context for one booking.',
    inputSchema: bookingReadinessInputSchema,
    outputSchema: bookingReadinessOutputSchema,
    resolver: resolveBookingReadiness
  });
}

module.exports = {
  BOOKING_READINESS_CONTEXT_PACK,
  TRUFFLE_REQUIREMENT_CODE,
  TRUFFLE_PREPARATION_PURPOSE,
  bookingReadinessInputSchema,
  bookingReadinessOutputSchema,
  resolveBookingReadiness,
  resolveBookingInventory,
  registerBookingReadinessContextPack
};
