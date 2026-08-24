const Joi = require('joi');
const { Op } = require('sequelize');
const {
  OperationalResourceLink,
  Shipment,
  ShipmentItem,
  Task
} = require('../models');
const { NotFoundError } = require('../utils/errors');
const contextPackRegistry = require('./contextPackRegistry.service');

const SHIPMENT_EXCEPTION_CONTEXT_PACK = 'shipment.exception.v1';

const inputSchema = Joi.object({
  shipmentId: Joi.number().integer().positive().required(),
  maxAgeSeconds: Joi.number().integer().min(60).max(604800).default(21600)
}).unknown(false);

const outputSchema = Joi.object({
  schemaVersion: Joi.string().valid(SHIPMENT_EXCEPTION_CONTEXT_PACK).required(),
  generatedAt: Joi.string().isoDate().required(),
  shipment: Joi.object({
    id: Joi.number().integer().positive().required(),
    status: Joi.string().max(40).required(),
    carrierKey: Joi.string().max(120).required(),
    serviceLevel: Joi.string().max(120).allow(null),
    promisedDeliveryAt: Joi.string().isoDate().allow(null),
    estimatedDeliveryAt: Joi.string().isoDate().allow(null),
    deliveredAt: Joi.string().isoDate().allow(null),
    returnedAt: Joi.string().isoDate().allow(null),
    latestTrackingOccurredAt: Joi.string().isoDate().allow(null),
    destinationCountry: Joi.string().length(2).allow(null),
    destinationRegion: Joi.string().max(80).allow(null)
  }).unknown(false).required(),
  relationships: Joi.object({
    memberId: Joi.number().integer().positive().allow(null),
    customerResolutionStatus: Joi.string().max(40).required(),
    salesOrderId: Joi.number().integer().positive().allow(null),
    orderResolutionStatus: Joi.string().max(40).required(),
    wineClubAllocationId: Joi.number().integer().positive().allow(null),
    allocationResolutionStatus: Joi.string().max(40).required()
  }).unknown(false).required(),
  exception: Joi.object({
    active: Joi.boolean().required(),
    category: Joi.string().max(40).required(),
    code: Joi.string().max(120).allow(null),
    summary: Joi.string().max(255).allow(null),
    severity: Joi.string().valid('NONE', 'LOW', 'MEDIUM', 'HIGH').required()
  }).unknown(false).required(),
  timing: Joi.object({
    status: Joi.string().valid(
      'UNKNOWN',
      'ON_TIME',
      'AT_RISK',
      'LATE',
      'DELIVERED_ON_TIME',
      'DELIVERED_LATE'
    ).required(),
    varianceMinutes: Joi.number().integer().allow(null)
  }).unknown(false).required(),
  affectedItems: Joi.array().items(Joi.object({
    shipmentItemId: Joi.number().integer().positive().required(),
    productVariantId: Joi.number().integer().positive().allow(null),
    productResolutionStatus: Joi.string().max(40).required(),
    description: Joi.string().max(255).required(),
    quantity: Joi.number().positive().required(),
    unit: Joi.string().max(40).required()
  }).unknown(false)).max(1000).required(),
  openWork: Joi.object({
    taskCount: Joi.number().integer().min(0).required(),
    taskIds: Joi.array().items(Joi.number().integer().positive()).max(100).required(),
    hasResolutionTask: Joi.boolean().required()
  }).unknown(false).required(),
  freshness: Joi.object({
    status: Joi.string().valid('FRESH', 'STALE').required(),
    observedAt: Joi.string().isoDate().required(),
    ageSeconds: Joi.number().integer().min(0).required(),
    maxAgeSeconds: Joi.number().integer().min(60).max(604800).required()
  }).unknown(false).required(),
  explanations: Joi.array().items(Joi.string().max(160)).max(20).required()
}).unknown(false);

const iso = value => value ? new Date(value).toISOString() : null;

function exceptionSeverity(category) {
  if (['LOST', 'DAMAGED', 'ADDRESS_ISSUE'].includes(category)) return 'HIGH';
  if (['DELAYED', 'CUSTOMS', 'WEATHER', 'CARRIER', 'RETURN'].includes(category)) return 'MEDIUM';
  if (['RECIPIENT_UNAVAILABLE', 'OTHER', 'UNKNOWN'].includes(category)) return 'LOW';
  return 'NONE';
}

function deliveryTiming(shipment, now) {
  const promised = shipment.promisedDeliveryAt ? new Date(shipment.promisedDeliveryAt) : null;
  if (!promised) return { status: 'UNKNOWN', varianceMinutes: null };
  if (shipment.deliveredAt) {
    const varianceMinutes = Math.round((new Date(shipment.deliveredAt) - promised) / 60000);
    return {
      status: varianceMinutes <= 0 ? 'DELIVERED_ON_TIME' : 'DELIVERED_LATE',
      varianceMinutes
    };
  }
  const comparison = shipment.estimatedDeliveryAt ? new Date(shipment.estimatedDeliveryAt) : now;
  const varianceMinutes = Math.round((comparison - promised) / 60000);
  if (now > promised) return { status: 'LATE', varianceMinutes };
  if (varianceMinutes > 0) return { status: 'AT_RISK', varianceMinutes };
  return { status: 'ON_TIME', varianceMinutes };
}

async function loadOpenWork({ wineryId, shipmentId, transaction }) {
  const links = await OperationalResourceLink.findAll({
    where: {
      wineryId,
      resourceType: 'SHIPMENT',
      resourceId: shipmentId,
      itemType: 'TASK',
      linkType: { [Op.in]: ['GENERATED_FOR', 'ABOUT', 'FOLLOW_UP_FOR'] }
    },
    attributes: ['itemId', 'metadata'],
    transaction
  });
  const taskIds = [...new Set(links.map(link => Number(link.itemId)).filter(Number.isSafeInteger))];
  if (taskIds.length === 0) return { taskCount: 0, taskIds: [], hasResolutionTask: false };
  const tasks = await Task.findAll({
    where: { id: { [Op.in]: taskIds }, wineryId, status: 'PENDING' },
    attributes: ['id', 'payload'],
    transaction
  });
  return {
    taskCount: tasks.length,
    taskIds: tasks.map(task => task.id),
    hasResolutionTask: tasks.some(task => task.payload?.automationPurpose === 'shipment.exception_resolution')
  };
}

async function resolveShipmentException({ wineryId, input, transaction = null, now = new Date() }) {
  const shipment = await Shipment.findOne({
    where: { id: input.shipmentId, wineryId },
    transaction
  });
  if (!shipment) throw new NotFoundError('Canonical shipment was not found for exception context');
  const [items, openWork] = await Promise.all([
    ShipmentItem.findAll({
      where: { wineryId, shipmentId: shipment.id, isActive: true },
      order: [['id', 'ASC']],
      transaction
    }),
    loadOpenWork({ wineryId, shipmentId: shipment.id, transaction })
  ]);
  const observedAt = shipment.observedAt;
  const futureObservation = new Date(observedAt).getTime() > now.getTime() + (5 * 60 * 1000);
  const ageSeconds = Math.max(0, Math.floor((now - new Date(observedAt)) / 1000));
  const exceptionActive = shipment.latestExceptionCategory !== 'NONE'
    && !['DELIVERED', 'RETURNED', 'CANCELLED'].includes(shipment.canonicalStatus);
  const exception = {
    active: exceptionActive,
    category: exceptionActive ? shipment.latestExceptionCategory : 'NONE',
    code: exceptionActive ? shipment.latestExceptionCode : null,
    summary: exceptionActive ? shipment.latestExceptionSummary : null,
    severity: exceptionActive ? exceptionSeverity(shipment.latestExceptionCategory) : 'NONE'
  };
  const timing = deliveryTiming(shipment, now);
  return {
    schemaVersion: SHIPMENT_EXCEPTION_CONTEXT_PACK,
    generatedAt: now.toISOString(),
    shipment: {
      id: shipment.id,
      status: shipment.canonicalStatus,
      carrierKey: shipment.carrierKey,
      serviceLevel: shipment.serviceLevel || null,
      promisedDeliveryAt: iso(shipment.promisedDeliveryAt),
      estimatedDeliveryAt: iso(shipment.estimatedDeliveryAt),
      deliveredAt: iso(shipment.deliveredAt),
      returnedAt: iso(shipment.returnedAt),
      latestTrackingOccurredAt: iso(shipment.latestTrackingOccurredAt),
      destinationCountry: shipment.destinationCountry || null,
      destinationRegion: shipment.destinationRegion || null
    },
    relationships: {
      memberId: shipment.memberId || null,
      customerResolutionStatus: shipment.customerResolutionStatus,
      salesOrderId: shipment.salesOrderId || null,
      orderResolutionStatus: shipment.orderResolutionStatus,
      wineClubAllocationId: shipment.wineClubAllocationId || null,
      allocationResolutionStatus: shipment.allocationResolutionStatus
    },
    exception,
    timing,
    affectedItems: items.map(item => ({
      shipmentItemId: item.id,
      productVariantId: item.productVariantId || null,
      productResolutionStatus: item.productResolutionStatus,
      description: item.description,
      quantity: Number(item.quantity),
      unit: item.unit
    })),
    openWork,
    freshness: {
      status: !futureObservation && ageSeconds <= input.maxAgeSeconds ? 'FRESH' : 'STALE',
      observedAt: new Date(observedAt).toISOString(),
      ageSeconds,
      maxAgeSeconds: input.maxAgeSeconds
    },
    explanations: [
      'SHIPMENT_CANONICAL_PROJECTION',
      exception.active ? `SHIPMENT_EXCEPTION_${exception.category}` : 'SHIPMENT_NO_ACTIVE_EXCEPTION',
      `SHIPMENT_TIMING_${timing.status}`,
      ...(futureObservation ? ['SHIPMENT_OBSERVATION_IN_FUTURE'] : []),
      'RESTRICTED_ADDRESS_EXCLUDED'
    ]
  };
}

function registerShipmentExceptionContextPack() {
  return contextPackRegistry.register({
    name: SHIPMENT_EXCEPTION_CONTEXT_PACK,
    description: 'Returns bounded, privacy-safe delivery exception context for one canonical shipment.',
    inputSchema,
    outputSchema,
    resolver: resolveShipmentException
  });
}

module.exports = {
  SHIPMENT_EXCEPTION_CONTEXT_PACK,
  inputSchema,
  outputSchema,
  exceptionSeverity,
  deliveryTiming,
  resolveShipmentException,
  registerShipmentExceptionContextPack
};
