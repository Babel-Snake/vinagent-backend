const crypto = require('crypto');
const { stableSerialize } = require('../../integrationDataFoundation.service');
const { BOOKING_FEED_SCHEMA_VERSION } = require('./bookingFeed.contract');
const {
  BOOKING_READ_ADAPTER_CONTRACT_VERSION,
  BOOKING_READ_SYNC_MODES,
  BookingReadAdapterContractError,
  normalizeBookingReadRequest,
  validateNormalizedBookingAdapterPage,
  validateBookingAdapterVerification
} = require('./bookingReadAdapter.contract');

const MAX_CONFORMANCE_PAGES = 20;
const RESTRICTED_REQUIREMENT_KINDS = new Set(['DIETARY', 'ACCESSIBILITY']);

function fail(code, message) {
  throw new BookingReadAdapterContractError(code, message);
}

function bookingAutomationFacts(booking) {
  const requirements = booking.requirements
    .filter(requirement => !RESTRICTED_REQUIREMENT_KINDS.has(requirement.kind))
    .map(requirement => ({
      kind: requirement.kind,
      code: requirement.code,
      quantity: requirement.quantity
    }))
    .sort((left, right) => `${left.kind}:${left.code}`.localeCompare(`${right.kind}:${right.code}`));
  return {
    status: booking.status,
    startAt: booking.startAt,
    endAt: booking.endAt,
    partySize: booking.partySize,
    experienceCode: booking.experience?.code || null,
    requirements,
    restrictedRequirementCount: booking.requirements.length - requirements.length,
    isSourceDeleted: Boolean(booking.deletedAt)
  };
}

function normalizeConformanceScenarios(scenarios) {
  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    fail('BOOKING_ADAPTER_CONFORMANCE_SCENARIOS_REQUIRED', 'Booking adapter conformance scenarios are required.');
  }
  const keys = new Set();
  const modes = new Set();
  const normalized = scenarios.map(scenario => {
    const key = String(scenario?.key || '').trim();
    if (!key || key.length > 120 || keys.has(key)) {
      fail('BOOKING_ADAPTER_CONFORMANCE_SCENARIO_INVALID', 'Booking adapter conformance scenario keys must be unique.');
    }
    keys.add(key);
    const request = normalizeBookingReadRequest(scenario.request);
    modes.add(request.syncMode);
    return { key, request };
  });
  if (BOOKING_READ_SYNC_MODES.some(mode => !modes.has(mode))) {
    fail(
      'BOOKING_ADAPTER_CONFORMANCE_MODE_MISSING',
      'Booking adapter conformance must cover hydration, incremental, and reconciliation.'
    );
  }
  return normalized;
}

async function collectConformanceScenario({ adapter, scenario, externalLocationId, guestDataMode }) {
  let cursor = scenario.request.cursor || null;
  let previousWatermarkAt = null;
  const seenCursors = new Set();
  const seenObservations = new Set();
  const bookings = [];
  let pageCount = 0;
  let snapshotComplete = false;

  for (; pageCount < MAX_CONFORMANCE_PAGES; pageCount += 1) {
    const page = validateNormalizedBookingAdapterPage(await adapter.fetchBookingsPage({
      ...scenario.request,
      cursor
    }), {
      externalLocationId,
      guestDataMode,
      syncMode: scenario.request.syncMode
    });
    if (page.watermarkAt && previousWatermarkAt
      && new Date(page.watermarkAt) < new Date(previousWatermarkAt)) {
      fail('BOOKING_ADAPTER_CONFORMANCE_WATERMARK_REGRESSION', 'Booking adapter watermark moved backwards within a scenario.');
    }
    previousWatermarkAt = page.watermarkAt || previousWatermarkAt;
    for (const booking of page.bookings) {
      const observationKey = `${booking.externalId}:${booking.revision}`;
      if (seenObservations.has(observationKey)) {
        fail('BOOKING_ADAPTER_CONFORMANCE_DUPLICATE_OBSERVATION', 'Booking adapter repeated an observation within one scenario.');
      }
      seenObservations.add(observationKey);
      bookings.push(booking);
    }
    snapshotComplete = page.snapshotComplete;
    if (!page.hasMore) {
      return {
        key: scenario.key,
        syncMode: scenario.request.syncMode,
        pageCount: pageCount + 1,
        watermarkAt: previousWatermarkAt,
        snapshotComplete,
        bookings,
        automationFacts: bookings.map(bookingAutomationFacts)
      };
    }
    if (seenCursors.has(page.nextCursor)) {
      fail('BOOKING_ADAPTER_CONFORMANCE_CURSOR_LOOP', 'Booking adapter repeated a page cursor.');
    }
    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }
  fail('BOOKING_ADAPTER_CONFORMANCE_PAGE_LIMIT', 'Booking adapter exceeded the conformance page limit.');
}

async function runBookingAdapterConformance({
  adapter,
  providerKey,
  externalLocationId,
  guestDataMode = 'NONE',
  scenarios
}) {
  if (!adapter || typeof adapter.verifyReadAccess !== 'function' || typeof adapter.fetchBookingsPage !== 'function') {
    fail('BOOKING_ADAPTER_CONFORMANCE_INTERFACE_INVALID', 'Booking adapter does not implement the read interface.');
  }
  const normalizedProviderKey = String(providerKey || '').trim().toLowerCase();
  const verification = validateBookingAdapterVerification(await adapter.verifyReadAccess(), {
    providerKey: normalizedProviderKey
  });
  const normalizedScenarios = normalizeConformanceScenarios(scenarios);
  const results = [];
  for (const scenario of normalizedScenarios) {
    results.push(await collectConformanceScenario({
      adapter,
      scenario,
      externalLocationId,
      guestDataMode
    }));
  }
  return {
    providerKey: normalizedProviderKey,
    adapterContractVersion: BOOKING_READ_ADAPTER_CONTRACT_VERSION,
    bookingFeedSchemaVersion: BOOKING_FEED_SCHEMA_VERSION,
    verification,
    scenarios: results
  };
}

function comparableConformanceReport(report) {
  return report.scenarios.map(scenario => ({
    key: scenario.key,
    syncMode: scenario.syncMode,
    snapshotComplete: scenario.snapshotComplete,
    automationFacts: [...scenario.automationFacts]
      .sort((left, right) => stableSerialize(left).localeCompare(stableSerialize(right)))
  }));
}

function assertEquivalentBookingConformance(reports) {
  if (!Array.isArray(reports) || reports.length < 2) {
    fail('BOOKING_ADAPTER_CONFORMANCE_COMPARISON_REQUIRED', 'At least two booking adapter reports are required.');
  }
  const expected = stableSerialize(comparableConformanceReport(reports[0]));
  if (reports.slice(1).some(report => stableSerialize(comparableConformanceReport(report)) !== expected)) {
    fail(
      'BOOKING_ADAPTER_CONFORMANCE_NOT_EQUIVALENT',
      'Booking adapters did not produce equivalent provider-neutral automation facts.'
    );
  }
  return {
    equivalent: true,
    providerKeys: reports.map(report => report.providerKey),
    scenarioCount: reports[0].scenarios.length,
    factDigest: crypto.createHash('sha256').update(expected).digest('hex')
  };
}

module.exports = {
  MAX_CONFORMANCE_PAGES,
  bookingAutomationFacts,
  normalizeConformanceScenarios,
  collectConformanceScenario,
  runBookingAdapterConformance,
  comparableConformanceReport,
  assertEquivalentBookingConformance
};
