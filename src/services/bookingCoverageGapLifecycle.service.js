const {
  BOOKING_COVERAGE_GAP_PURPOSE,
  resolveBookingCoverage
} = require('./bookingCoverageContext.service');
const lifecycleRegistry = require('./automationResourceLifecycleRegistry.service');

const MANAGED_FIELDS = Object.freeze([
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
  'payload.gapCount',
  'payload.gapDefinitions'
]);
const POLICY = Object.freeze({
  onChange: 'UPDATE_MANAGED',
  onCancel: 'CANCEL_IF_UNTOUCHED',
  onUnsafe: 'ANNOTATE',
  reopen: 'NOOP'
});

function buildConfiguration({ definition, actionData }) {
  const offset = Number(definition?.action?.timing?.dueAt?.offsetMinutes);
  return {
    leadTimeMinutes: Number.isFinite(offset) ? Math.max(0, -offset) : 0,
    category: actionData.category,
    subType: actionData.subType,
    priority: actionData.priority,
    assigneeId: actionData.assigneeId || null
  };
}

function desiredTaskSnapshot({ coverage, configuration }) {
  const gaps = coverage.checks.filter(check => check.status === 'GAP');
  const gapDefinitions = gaps.map(check => check.definitionCode).join(', ');
  const dueAt = new Date(
    new Date(coverage.booking.startAt).getTime()
    - Number(configuration.leadTimeMinutes || 0) * 60 * 1000
  ).toISOString();
  return {
    category: configuration.category,
    subType: configuration.subType,
    priority: configuration.priority,
    assigneeId: configuration.assigneeId,
    dueAt,
    suggestedAction: 'Resolve staffing coverage for booking '
      + coverage.booking.referenceCode + ': ' + gapDefinitions + '.',
    'payload.summary': 'Resolve staffing gap for booking ' + coverage.booking.referenceCode,
    'payload.automationPurpose': BOOKING_COVERAGE_GAP_PURPOSE,
    'payload.bookingId': coverage.booking.id,
    'payload.bookingReference': coverage.booking.referenceCode,
    'payload.gapCount': gaps.length,
    'payload.gapDefinitions': gapDefinitions
  };
}

async function resolveDesired({ binding, transaction }) {
  const coverage = await resolveBookingCoverage({
    wineryId: binding.wineryId,
    input: { bookingId: binding.resourceId, maxAgeSeconds: 21600 },
    transaction
  });
  if (coverage.booking.status === 'CANCELLED') {
    return {
      intent: 'CANCEL',
      reason: 'BOOKING_CANCELLED',
      annotation: 'Booking ' + coverage.booking.referenceCode
        + ' was cancelled. Staffing work was preserved because staff changed or progressed it.'
    };
  }
  if (coverage.status === 'COVERED') {
    return {
      intent: 'CANCEL',
      reason: 'WORKFORCE_COVERAGE_RESTORED',
      annotation: 'Booking ' + coverage.booking.referenceCode
        + ' now has complete staffing coverage. This Task was preserved because staff changed or progressed it.'
    };
  }
  if (coverage.status === 'UNKNOWN' || coverage.status === 'STALE') {
    return {
      intent: 'ANNOTATE',
      reason: 'WORKFORCE_COVERAGE_UNSAFE',
      annotation: 'Coverage evidence for booking ' + coverage.booking.referenceCode
        + ' is ' + coverage.status.toLowerCase() + '. Review this staffing Task manually.'
    };
  }
  return {
    intent: 'UPDATE',
    reason: 'WORKFORCE_COVERAGE_GAP_CHANGED',
    annotation: 'The staffing gap for booking ' + coverage.booking.referenceCode
      + ' changed. This Task was preserved because staff changed or progressed it.',
    snapshot: desiredTaskSnapshot({
      coverage,
      configuration: binding.configurationSnapshot
    })
  };
}

const handler = Object.freeze({
  resourceType: 'BOOKING',
  itemType: 'TASK',
  purposeKey: BOOKING_COVERAGE_GAP_PURPOSE,
  managedFields: MANAGED_FIELDS,
  policy: POLICY,
  buildConfiguration,
  resolveDesired
});

function registerBookingCoverageGapLifecycle() {
  return lifecycleRegistry.register(handler);
}

module.exports = {
  MANAGED_FIELDS,
  POLICY,
  buildConfiguration,
  desiredTaskSnapshot,
  resolveDesired,
  registerBookingCoverageGapLifecycle
};
