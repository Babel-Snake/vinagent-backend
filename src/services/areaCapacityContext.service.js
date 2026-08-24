const Joi = require('joi');
const { Op } = require('sequelize');
const models = require('../models');
const { NotFoundError } = require('../utils/errors');
const contextPackRegistry = require('./contextPackRegistry.service');
const bookingReadiness = require('./bookingReadinessContext.service');

const AREA_CAPACITY_CONTEXT_PACK = 'area.capacity.v1';
const inputSchema = Joi.object({
  areaId: Joi.number().integer().positive().required(),
  from: Joi.date().iso().required(),
  to: Joi.date().iso().greater(Joi.ref('from')).required(),
  maxAgeSeconds: Joi.number().integer().min(60).max(604800).default(21600),
  maxBookings: Joi.number().integer().min(1).max(200).default(100)
}).unknown(false);

const nullableId = Joi.number().integer().positive().allow(null);
const nullableText = max => Joi.string().max(max).allow(null);
const outputSchema = Joi.object({
  schemaVersion: Joi.string().valid(AREA_CAPACITY_CONTEXT_PACK).required(),
  generatedAt: Joi.string().isoDate().required(),
  area: Joi.object({
    id: Joi.number().integer().positive().required(),
    name: Joi.string().max(255).required()
  }).unknown(false).required(),
  window: Joi.object({
    from: Joi.string().isoDate().required(),
    to: Joi.string().isoDate().required(),
    truncated: Joi.boolean().required(),
    maxBookings: Joi.number().integer().min(1).max(200).required()
  }).unknown(false).required(),
  demand: Joi.object({
    bookingCount: Joi.number().integer().min(0).required(),
    totalCovers: Joi.number().integer().min(0).required(),
    experienceBreakdown: Joi.array().items(Joi.object({
      bookingTypeId: nullableId,
      bookingTypeName: nullableText(255),
      bookingCount: Joi.number().integer().min(0).required(),
      covers: Joi.number().integer().min(0).required()
    }).unknown(false)).max(200).required()
  }).unknown(false).required(),
  physicalCapacity: Joi.object({
    status: Joi.string().valid('UNCONFIGURED').required(),
    configuredCovers: Joi.valid(null).required(),
    utilisationPercent: Joi.valid(null).required()
  }).unknown(false).required(),
  readiness: Joi.object({
    status: Joi.string().valid('NO_BOOKINGS', 'READY', 'ATTENTION', 'UNKNOWN').required(),
    calculationReliable: Joi.boolean().required(),
    readyBookingCount: Joi.number().integer().min(0).required(),
    attentionBookingCount: Joi.number().integer().min(0).required(),
    unknownBookingCount: Joi.number().integer().min(0).required(),
    inventoryShortageBookingCount: Joi.number().integer().min(0).required(),
    workforceGapBookingCount: Joi.number().integer().min(0).required()
  }).unknown(false).required(),
  bookings: Joi.array().items(Joi.object({
    id: Joi.number().integer().positive().required(),
    referenceCode: Joi.string().max(255).required(),
    status: Joi.string().max(40).required(),
    startAt: Joi.string().isoDate().required(),
    endAt: Joi.string().isoDate().allow(null),
    partySize: Joi.number().integer().positive().required(),
    bookingTypeId: nullableId,
    bookingTypeName: nullableText(255),
    inventoryStatus: Joi.string().max(40).required(),
    workforceStatus: Joi.string().max(40).required(),
    readinessStatus: Joi.string().valid('READY', 'ATTENTION', 'UNKNOWN').required()
  }).unknown(false)).max(200).required(),
  openWork: Joi.object({
    taskCount: Joi.number().integer().min(0).required(),
    taskIds: Joi.array().items(Joi.number().integer().positive()).max(500).required()
  }).unknown(false).required(),
  freshness: Joi.object({
    status: Joi.string().valid('FRESH', 'STALE').required(),
    oldestSourceUpdatedAt: Joi.string().isoDate().allow(null),
    maxAgeSeconds: Joi.number().integer().min(60).max(604800).required()
  }).unknown(false).required(),
  automationEligible: Joi.boolean().valid(false).required(),
  explanations: Joi.array().items(Joi.string().max(160)).max(20).required()
}).unknown(false);

function bookingReadinessStatus(context) {
  if (context.inventory.status === 'SHORTAGE' || context.workforce.status === 'GAP') {
    return 'ATTENTION';
  }
  const inventoryUnknown = context.inventory.commitmentCount > 0
    && !context.inventory.calculationReliable;
  const workforceUnknown = context.workforce.demandCount > 0
    && !context.workforce.calculationReliable;
  return inventoryUnknown || workforceUnknown ? 'UNKNOWN' : 'READY';
}

async function loadOpenWork({ wineryId, bookingIds, transaction }) {
  if (bookingIds.length === 0) return { taskCount: 0, taskIds: [] };
  const links = await models.OperationalResourceLink.findAll({
    where: {
      wineryId,
      resourceType: 'BOOKING',
      resourceId: { [Op.in]: bookingIds },
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
    limit: 500,
    transaction
  });
  return { taskCount: tasks.length, taskIds: tasks.map(task => task.id) };
}

async function resolveAreaCapacity({
  wineryId,
  input,
  transaction = null,
  now = new Date()
}) {
  const area = await models.OperationalArea.findOne({
    where: { id: input.areaId, wineryId, isActive: true },
    attributes: ['id', 'name'],
    transaction
  });
  if (!area) throw new NotFoundError('Operational area not found');
  const bookings = await models.Booking.findAll({
    where: {
      wineryId,
      canonicalStatus: {
        [Op.in]: ['TENTATIVE', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'UNKNOWN']
      },
      startAt: { [Op.gte]: new Date(input.from), [Op.lt]: new Date(input.to) },
      isSourceDeleted: false
    },
    attributes: [
      'id', 'referenceCode', 'canonicalStatus', 'startAt', 'endAt', 'partySize',
      'primaryBookingTypeId', 'sourceUpdatedAt'
    ],
    include: [
      {
        association: 'AreaLinks',
        where: { areaId: area.id, relationshipType: 'PRIMARY' },
        attributes: []
      },
      { association: 'PrimaryBookingType', attributes: ['id', 'name'] }
    ],
    order: [['startAt', 'ASC'], ['id', 'ASC']],
    limit: input.maxBookings + 1,
    transaction
  });
  const truncated = bookings.length > input.maxBookings;
  const boundedBookings = bookings.slice(0, input.maxBookings);
  const bookingContexts = [];
  for (const booking of boundedBookings) {
    const context = await bookingReadiness.resolveBookingReadiness({
      wineryId,
      input: { bookingId: booking.id, maxAgeSeconds: input.maxAgeSeconds },
      transaction,
      now
    });
    bookingContexts.push({
      booking,
      context,
      readinessStatus: bookingReadinessStatus(context)
    });
  }
  const experienceMap = new Map();
  for (const { booking } of bookingContexts) {
    const key = booking.primaryBookingTypeId ? String(booking.primaryBookingTypeId) : 'unmapped';
    const current = experienceMap.get(key) || {
      bookingTypeId: booking.primaryBookingTypeId || null,
      bookingTypeName: booking.PrimaryBookingType?.name || null,
      bookingCount: 0,
      covers: 0
    };
    current.bookingCount += 1;
    current.covers += booking.partySize;
    experienceMap.set(key, current);
  }
  const readyBookingCount = bookingContexts.filter(item => item.readinessStatus === 'READY').length;
  const attentionBookingCount = bookingContexts.filter(item => item.readinessStatus === 'ATTENTION').length;
  const unknownBookingCount = bookingContexts.filter(item => item.readinessStatus === 'UNKNOWN').length;
  const sourceTimes = boundedBookings.map(booking => new Date(booking.sourceUpdatedAt));
  const oldestSourceUpdatedAt = sourceTimes.length
    ? new Date(Math.min(...sourceTimes.map(value => value.getTime())))
    : null;
  const futureSource = sourceTimes.some(value => value.getTime() > now.getTime() + (5 * 60 * 1000));
  const staleSource = sourceTimes.some(value => (
    (now.getTime() - value.getTime()) / 1000 > input.maxAgeSeconds
  ));
  const fresh = !futureSource && !staleSource;
  let readinessStatus = 'READY';
  if (boundedBookings.length === 0) readinessStatus = 'NO_BOOKINGS';
  else if (attentionBookingCount > 0) readinessStatus = 'ATTENTION';
  else if (unknownBookingCount > 0 || truncated || !fresh) readinessStatus = 'UNKNOWN';
  const openWork = await loadOpenWork({
    wineryId,
    bookingIds: boundedBookings.map(booking => booking.id),
    transaction
  });
  return {
    schemaVersion: AREA_CAPACITY_CONTEXT_PACK,
    generatedAt: now.toISOString(),
    area: { id: area.id, name: area.name },
    window: {
      from: new Date(input.from).toISOString(),
      to: new Date(input.to).toISOString(),
      truncated,
      maxBookings: input.maxBookings
    },
    demand: {
      bookingCount: boundedBookings.length,
      totalCovers: boundedBookings.reduce((sum, booking) => sum + booking.partySize, 0),
      experienceBreakdown: [...experienceMap.values()]
    },
    physicalCapacity: {
      status: 'UNCONFIGURED',
      configuredCovers: null,
      utilisationPercent: null
    },
    readiness: {
      status: readinessStatus,
      calculationReliable: !truncated && fresh && unknownBookingCount === 0,
      readyBookingCount,
      attentionBookingCount,
      unknownBookingCount,
      inventoryShortageBookingCount: bookingContexts.filter(
        item => item.context.inventory.status === 'SHORTAGE'
      ).length,
      workforceGapBookingCount: bookingContexts.filter(
        item => item.context.workforce.status === 'GAP'
      ).length
    },
    bookings: bookingContexts.map(({ booking, context, readinessStatus: status }) => ({
      id: booking.id,
      referenceCode: booking.referenceCode,
      status: booking.canonicalStatus,
      startAt: new Date(booking.startAt).toISOString(),
      endAt: booking.endAt ? new Date(booking.endAt).toISOString() : null,
      partySize: booking.partySize,
      bookingTypeId: booking.primaryBookingTypeId || null,
      bookingTypeName: booking.PrimaryBookingType?.name || null,
      inventoryStatus: context.inventory.status,
      workforceStatus: context.workforce.status,
      readinessStatus: status
    })),
    openWork,
    freshness: {
      status: fresh ? 'FRESH' : 'STALE',
      oldestSourceUpdatedAt: oldestSourceUpdatedAt?.toISOString() || null,
      maxAgeSeconds: input.maxAgeSeconds
    },
    automationEligible: false,
    explanations: [
      'CANONICAL_BOOKING_DEMAND',
      'BOOKING_READINESS_COMPOSITION',
      'PHYSICAL_CAPACITY_NOT_CONFIGURED',
      ...(truncated ? ['WINDOW_TRUNCATED'] : []),
      ...(futureSource ? ['BOOKING_SOURCE_OBSERVED_IN_FUTURE'] : []),
      'AREA_CAPACITY_AUTOMATION_NOT_ACTIVATED'
    ]
  };
}

function registerAreaCapacityContextPack() {
  return contextPackRegistry.register({
    name: AREA_CAPACITY_CONTEXT_PACK,
    description: 'Returns bounded area booking demand and cross-domain readiness without inventing venue capacity.',
    inputSchema,
    outputSchema,
    resolver: resolveAreaCapacity
  });
}

module.exports = {
  AREA_CAPACITY_CONTEXT_PACK,
  inputSchema,
  outputSchema,
  bookingReadinessStatus,
  resolveAreaCapacity,
  registerAreaCapacityContextPack
};
