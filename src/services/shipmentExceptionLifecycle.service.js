const {
  resolveShipmentException
} = require('./shipmentExceptionContext.service');
const lifecycleRegistry = require('./automationResourceLifecycleRegistry.service');

const SHIPMENT_EXCEPTION_PURPOSE = 'shipment.exception_resolution';
const MANAGED_FIELDS = Object.freeze([
  'category',
  'subType',
  'priority',
  'assigneeId',
  'memberId',
  'dueAt',
  'suggestedAction',
  'payload.summary',
  'payload.automationPurpose',
  'payload.shipmentId',
  'payload.exceptionCategory',
  'payload.exceptionSeverity',
  'payload.shipmentStatus',
  'payload.carrierKey'
]);
const POLICY = Object.freeze({
  onChange: 'UPDATE_MANAGED',
  onCancel: 'CANCEL_IF_UNTOUCHED',
  onUnsafe: 'ANNOTATE',
  reopen: 'NOOP'
});

function buildConfiguration({ definition, actionData }) {
  const timingOffset = Number(definition?.action?.timing?.dueAt?.offsetMinutes);
  return {
    responseMinutes: Number.isFinite(timingOffset) ? Math.max(0, timingOffset) : 0,
    category: actionData.category,
    subType: actionData.subType,
    priority: actionData.priority,
    assigneeId: actionData.assigneeId || null
  };
}

function desiredTaskSnapshot({ context, configuration }) {
  const referenceTime = context.shipment.latestTrackingOccurredAt || context.generatedAt;
  const dueAt = new Date(
    new Date(referenceTime).getTime() + Number(configuration.responseMinutes || 0) * 60 * 1000
  ).toISOString();
  return {
    category: configuration.category,
    subType: configuration.subType,
    priority: configuration.priority,
    assigneeId: configuration.assigneeId,
    memberId: context.relationships.memberId,
    dueAt,
    suggestedAction: `Resolve ${context.exception.category.toLowerCase()} delivery exception for shipment #${context.shipment.id} with ${context.shipment.carrierKey}.`,
    'payload.summary': `Resolve shipment #${context.shipment.id} delivery exception`,
    'payload.automationPurpose': SHIPMENT_EXCEPTION_PURPOSE,
    'payload.shipmentId': context.shipment.id,
    'payload.exceptionCategory': context.exception.category,
    'payload.exceptionSeverity': context.exception.severity,
    'payload.shipmentStatus': context.shipment.status,
    'payload.carrierKey': context.shipment.carrierKey
  };
}

async function resolveDesired({ binding, transaction }) {
  const context = await resolveShipmentException({
    wineryId: binding.wineryId,
    input: { shipmentId: binding.resourceId, maxAgeSeconds: 21600 },
    transaction
  });
  if (['DELIVERED', 'RETURNED', 'CANCELLED'].includes(context.shipment.status) || !context.exception.active) {
    return {
      intent: 'CANCEL',
      reason: 'SHIPMENT_EXCEPTION_CLEARED',
      annotation: `Shipment #${context.shipment.id} no longer has an active delivery exception. This Task was preserved because staff had already changed or progressed it.`
    };
  }
  if (context.freshness.status !== 'FRESH') {
    return {
      intent: 'ANNOTATE',
      reason: 'SHIPMENT_CONTEXT_STALE',
      annotation: `Shipment #${context.shipment.id} still has an exception but carrier state is stale. Review this Task manually.`
    };
  }
  return {
    intent: 'UPDATE',
    reason: 'SHIPMENT_EXCEPTION_CHANGED',
    annotation: `Shipment #${context.shipment.id} exception details changed. This Task was preserved for manual review because staff had already changed or progressed it.`,
    snapshot: desiredTaskSnapshot({ context, configuration: binding.configurationSnapshot })
  };
}

const handler = Object.freeze({
  resourceType: 'SHIPMENT',
  itemType: 'TASK',
  purposeKey: SHIPMENT_EXCEPTION_PURPOSE,
  managedFields: MANAGED_FIELDS,
  policy: POLICY,
  buildConfiguration,
  resolveDesired
});

function registerShipmentExceptionLifecycle() {
  return lifecycleRegistry.register(handler);
}

module.exports = {
  SHIPMENT_EXCEPTION_PURPOSE,
  MANAGED_FIELDS,
  POLICY,
  buildConfiguration,
  desiredTaskSnapshot,
  resolveDesired,
  registerShipmentExceptionLifecycle
};
