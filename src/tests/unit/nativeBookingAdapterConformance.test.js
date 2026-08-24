const { bookingSourceHash, BOOKING_FEED_SCHEMA_VERSION } = require('../../services/integrations/booking/bookingFeed.contract');
const {
  BOOKING_READ_ADAPTER_CONTRACT_VERSION,
  validateNormalizedBookingAdapterPage
} = require('../../services/integrations/booking/bookingReadAdapter.contract');
const {
  defineNativeBookingTranslator,
  assertRuntimeNativeBookingTranslator
} = require('../../services/integrations/booking/nativeBookingAdapter');
const {
  runBookingAdapterConformance,
  assertEquivalentBookingConformance
} = require('../../services/integrations/booking/bookingAdapterConformance');
const {
  defineShadowBookingConnectorManifest,
  listShadowBookingConnectorManifests
} = require('../../services/integrations/booking/shadowConnectorRegistry');
const { mapBookingStatus, statusEventType } = require('../../services/bookingProjection.service');
const {
  CONFORMANCE_SCENARIOS,
  cursorTranslator,
  offsetTranslator,
  createCursorFixtureAdapter,
  createOffsetFixtureAdapter
} = require('../fixtures/bookingAdapterConformance.fixtures');

function lifecycleTrace(report) {
  let priorStatus = null;
  return report.scenarios.map((scenario, index) => {
    const facts = scenario.automationFacts[0];
    const canonicalStatus = mapBookingStatus(facts.status);
    const eventType = statusEventType({
      created: index === 0,
      fromStatus: priorStatus,
      toStatus: canonicalStatus
    });
    priorStatus = canonicalStatus;
    return {
      scenario: scenario.key,
      eventType,
      canonicalStatus,
      startAt: facts.startAt,
      partySize: facts.partySize,
      experienceCode: facts.experienceCode,
      truffleQuantity: facts.requirements.find(requirement => requirement.code === 'truffle-pairing')?.quantity || 0,
      restrictedRequirementCount: facts.restrictedRequirementCount,
      isSourceDeleted: facts.isSourceDeleted
    };
  });
}

describe('native Booking adapter contract and conformance kit', () => {
  test('defines an explicit runtime manifest boundary and refuses fixture translators', () => {
    expect(cursorTranslator).toMatchObject({
      providerKey: 'fixture-cursor-reservations',
      adapterContractVersion: BOOKING_READ_ADAPTER_CONTRACT_VERSION,
      paginationStrategy: 'CURSOR',
      kind: 'CONFORMANCE_FIXTURE'
    });
    expect(offsetTranslator).toMatchObject({ paginationStrategy: 'OFFSET' });
    expect(() => assertRuntimeNativeBookingTranslator(cursorTranslator))
      .toThrow('cannot be registered as runtime');

    const listed = listShadowBookingConnectorManifests();
    expect(listed).toEqual(expect.arrayContaining([
      expect.objectContaining({
        providerKey: 'vinagent-booking-feed',
        adapterKind: 'FEED_GATEWAY',
        adapterContractVersion: BOOKING_READ_ADAPTER_CONTRACT_VERSION
      }),
      expect.objectContaining({
        providerKey: 'opentable',
        adapterKind: 'NATIVE_PROVIDER',
        supportedCredentialTypes: ['OAUTH_CLIENT_CREDENTIALS']
      })
    ]));
    expect(listed).toHaveLength(2);
    expect(() => defineShadowBookingConnectorManifest({
      providerKey: 'unsafe-fixture',
      domain: 'BOOKING',
      mode: 'READ_ONLY_POLLING',
      adapterKind: 'FIXTURE',
      supportedSyncModes: ['HYDRATION'],
      contractVersion: '1',
      adapterContractVersion: BOOKING_READ_ADAPTER_CONTRACT_VERSION,
      supportedCredentialTypes: ['API_KEY'],
      validateConfiguration: value => value,
      createAdapter: () => ({})
    })).toThrow('manifest is invalid');
  });

  test('converges cursor reservations and offset visits on the same automation facts', async () => {
    const cursorReport = await runBookingAdapterConformance({
      adapter: createCursorFixtureAdapter(),
      providerKey: cursorTranslator.providerKey,
      externalLocationId: 'venue-a',
      scenarios: CONFORMANCE_SCENARIOS
    });
    const offsetReport = await runBookingAdapterConformance({
      adapter: createOffsetFixtureAdapter(),
      providerKey: offsetTranslator.providerKey,
      externalLocationId: 'site-99',
      scenarios: CONFORMANCE_SCENARIOS
    });

    expect(cursorReport.scenarios.map(scenario => scenario.pageCount)).toEqual([2, 1, 1]);
    expect(offsetReport.scenarios.map(scenario => scenario.pageCount)).toEqual([1, 1, 1]);
    expect(cursorReport.scenarios[0].bookings[0]).toMatchObject({
      startAt: '2026-08-22T03:30:00.000Z',
      guest: null
    });
    expect(offsetReport.scenarios[0].bookings[0]).toMatchObject({
      startAt: '2026-08-22T03:30:00.000Z',
      guest: null
    });
    expect(JSON.stringify([cursorReport, offsetReport])).not.toContain('Private.Cursor');
    expect(JSON.stringify([cursorReport, offsetReport])).not.toContain('Private.Offset');
    expect(assertEquivalentBookingConformance([cursorReport, offsetReport])).toMatchObject({
      equivalent: true,
      providerKeys: ['fixture-cursor-reservations', 'fixture-offset-visits'],
      scenarioCount: 3,
      factDigest: expect.stringMatching(/^[a-f0-9]{64}$/)
    });
  });

  test('produces identical canonical event and generated-work lifecycle inputs', async () => {
    const reports = await Promise.all([
      runBookingAdapterConformance({
        adapter: createCursorFixtureAdapter(),
        providerKey: cursorTranslator.providerKey,
        externalLocationId: 'venue-a',
        scenarios: CONFORMANCE_SCENARIOS
      }),
      runBookingAdapterConformance({
        adapter: createOffsetFixtureAdapter(),
        providerKey: offsetTranslator.providerKey,
        externalLocationId: 'site-99',
        scenarios: CONFORMANCE_SCENARIOS
      })
    ]);
    const traces = reports.map(lifecycleTrace);
    expect(traces[1]).toEqual(traces[0]);
    expect(traces[0]).toEqual([
      expect.objectContaining({
        scenario: 'confirmed',
        eventType: 'booking.confirmed',
        canonicalStatus: 'CONFIRMED',
        truffleQuantity: 6,
        restrictedRequirementCount: 1,
        isSourceDeleted: false
      }),
      expect.objectContaining({
        scenario: 'rescheduled',
        eventType: 'booking.changed',
        canonicalStatus: 'CONFIRMED',
        startAt: '2026-08-23T03:30:00.000Z',
        truffleQuantity: 8
      }),
      expect.objectContaining({
        scenario: 'cancelled',
        eventType: 'booking.cancelled',
        canonicalStatus: 'CANCELLED',
        truffleQuantity: 8,
        isSourceDeleted: true
      })
    ]);
  });

  test('rejects accidental provider fields, incomplete reconciliation, and tampered normalized facts', async () => {
    const leakingTranslator = defineNativeBookingTranslator({
      providerKey: 'fixture-leaking-provider',
      adapterVersion: '1',
      paginationStrategy: 'PAGE',
      supportedSyncModes: ['reconciliation'],
      kind: 'CONFORMANCE_FIXTURE',
      translatePage() {
        return {
          schemaVersion: BOOKING_FEED_SCHEMA_VERSION,
          bookings: [{ paymentToken: 'sensitive-token' }],
          nextCursor: null,
          hasMore: false,
          watermarkAt: '2026-08-18T00:07:00.000Z',
          snapshotComplete: true
        };
      }
    });
    expect(() => leakingTranslator.translateProviderPage({}, {
      request: { ...CONFORMANCE_SCENARIOS[2].request },
      externalLocationId: 'site-1',
      guestDataMode: 'NONE'
    })).toThrow(expect.objectContaining({ code: 'BOOKING_FEED_SCHEMA_INVALID' }));

    const adapter = createOffsetFixtureAdapter();
    const page = await adapter.fetchBookingsPage(CONFORMANCE_SCENARIOS[0].request);
    const tamperedBooking = { ...page.bookings[0], partySize: 99 };
    expect(() => validateNormalizedBookingAdapterPage({
      ...page,
      bookings: [tamperedBooking]
    }, { externalLocationId: 'site-99', guestDataMode: 'NONE', syncMode: 'hydration' }))
      .toThrow(expect.objectContaining({ code: 'BOOKING_ADAPTER_SOURCE_HASH_INVALID' }));

    const excessiveGuestBooking = {
      ...page.bookings[0],
      guest: { externalId: 'guest-1', email: 'private@example.test' }
    };
    excessiveGuestBooking.sourceHash = bookingSourceHash(excessiveGuestBooking);
    expect(() => validateNormalizedBookingAdapterPage({
      ...page,
      bookings: [excessiveGuestBooking]
    }, { externalLocationId: 'site-99', guestDataMode: 'NONE', syncMode: 'hydration' }))
      .toThrow(expect.objectContaining({ code: 'BOOKING_ADAPTER_GUEST_DATA_EXCEEDED' }));

    expect(() => validateNormalizedBookingAdapterPage({
      ...page,
      snapshotComplete: false
    }, { externalLocationId: 'site-99', guestDataMode: 'NONE', syncMode: 'reconciliation' }))
      .toThrow(expect.objectContaining({ code: 'BOOKING_ADAPTER_RECONCILIATION_INCOMPLETE' }));
  });
});
