const { resolveBookingReadiness, TRUFFLE_PREPARATION_PURPOSE } = require('./bookingReadinessContext.service');
const lifecycleRegistry = require('./automationResourceLifecycleRegistry.service');

const TRUFFLE_MANAGED_FIELDS = Object.freeze([
  'category',
  'subType',
  'priority',
  'assigneeId',
  'dueAt',
  'suggestedAction',
  'payload.summary',
  'payload.automationPurpose',
  'payload.bookingId',
  'payload.bookingReference',
  'payload.requiredQuantity',
  'payload.quantityUnit',
  'payload.inventoryConclusion'
]);

const TRUFFLE_RECONCILIATION_POLICY = Object.freeze({
  onChange: 'UPDATE_MANAGED',
  onCancel: 'CANCEL_IF_UNTOUCHED',
  onUnsafe: 'ANNOTATE',
  reopen: 'NOOP'
});

function buildConfiguration({ definition, actionData }) {
  const timingOffset = Number(definition?.action?.timing?.dueAt?.offsetMinutes);
  const leadTimeMinutes = Number.isFinite(timingOffset) ? Math.max(0, -timingOffset) : 0;
  return {
    leadTimeMinutes,
    category: actionData.category,
    subType: actionData.subType,
    priority: actionData.priority,
    assigneeId: actionData.assigneeId || null,
    inventoryConclusion: actionData.payload?.inventoryConclusion || 'UNKNOWN_REQUIRES_HUMAN_CHECK'
  };
}

function desiredTaskSnapshot({ readiness, configuration }) {
  const quantity = readiness.preparation.trufflePairing.quantity;
  const reference = readiness.booking.referenceCode;
  const dueAt = new Date(
    new Date(readiness.booking.startAt).getTime() - Number(configuration.leadTimeMinutes || 0) * 60 * 1000
  ).toISOString();
  return {
    category: configuration.category,
    subType: configuration.subType,
    priority: configuration.priority,
    assigneeId: configuration.assigneeId,
    dueAt,
    suggestedAction: `Check stock and prepare ${quantity} truffle-pairing portions for booking ${reference}.`,
    'payload.summary': `Check truffle stock for booking ${reference}`,
    'payload.automationPurpose': TRUFFLE_PREPARATION_PURPOSE,
    'payload.bookingId': readiness.booking.id,
    'payload.bookingReference': reference,
    'payload.requiredQuantity': quantity,
    'payload.quantityUnit': readiness.preparation.trufflePairing.unit,
    'payload.inventoryConclusion': configuration.inventoryConclusion
  };
}

async function resolveDesired({ binding, event, transaction }) {
  const readiness = await resolveBookingReadiness({
    wineryId: binding.wineryId,
    input: { bookingId: binding.resourceId, maxAgeSeconds: 3600 },
    transaction
  });
  const status = readiness.booking.status;
  const reference = readiness.booking.referenceCode;
  const sourceDeleted = event.normalizedPayload?.data?.isSourceDeleted === true;

  if (status === 'CANCELLED' || sourceDeleted) {
    return {
      intent: 'CANCEL',
      reason: 'BOOKING_CANCELLED',
      annotation: `Booking ${reference} was cancelled. This preparation Task was preserved because staff had already changed or progressed it.`
    };
  }
  if (status === 'CONFIRMED' && !readiness.preparation.trufflePairing.required) {
    return {
      intent: 'CANCEL',
      reason: 'TRUFFLE_REQUIREMENT_REMOVED',
      annotation: `The truffle-pairing requirement was removed from booking ${reference}. This Task was preserved because staff had already changed or progressed it.`
    };
  }
  if (status !== 'CONFIRMED') {
    return {
      intent: 'ANNOTATE',
      reason: 'BOOKING_NO_LONGER_PREPARATION_EDITABLE',
      annotation: `Booking ${reference} is now ${status}. Review this preparation Task manually.`
    };
  }
  return {
    intent: 'UPDATE',
    reason: 'BOOKING_PREPARATION_CHANGED',
    annotation: `Booking ${reference} preparation details changed. This Task was preserved for manual review because staff had already changed or progressed it.`,
    snapshot: desiredTaskSnapshot({ readiness, configuration: binding.configurationSnapshot })
  };
}

const handler = Object.freeze({
  resourceType: 'BOOKING',
  itemType: 'TASK',
  purposeKey: TRUFFLE_PREPARATION_PURPOSE,
  managedFields: TRUFFLE_MANAGED_FIELDS,
  policy: TRUFFLE_RECONCILIATION_POLICY,
  buildConfiguration,
  resolveDesired
});

function registerBookingPreparationLifecycle() {
  return lifecycleRegistry.register(handler);
}

module.exports = {
  TRUFFLE_MANAGED_FIELDS,
  TRUFFLE_RECONCILIATION_POLICY,
  buildConfiguration,
  desiredTaskSnapshot,
  resolveDesired,
  registerBookingPreparationLifecycle
};
