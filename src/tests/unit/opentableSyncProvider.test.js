const {
  BOOKING_READ_ADAPTER_CONTRACT_VERSION
} = require('../../services/integrations/booking/bookingReadAdapter.contract');
const {
  runBookingAdapterConformance,
  assertEquivalentBookingConformance
} = require('../../services/integrations/booking/bookingAdapterConformance');
const {
  OPENTABLE_SYNC_PATH,
  OpenTableSyncRequestError,
  OpenTableSyncProvider,
  normalizeOpenTableConfiguration,
  formatOpenTableLocalTimestamp,
  mapOpenTableStatus,
  translateOpenTableRequestError
} = require('../../services/integrations/booking/providers/opentableSync');
const {
  CONFORMANCE_SCENARIOS,
  cursorTranslator,
  createCursorFixtureAdapter
} = require('../fixtures/bookingAdapterConformance.fixtures');

const providerEnvironment = {
  NODE_ENV: 'test',
  INTEGRATION_OPENTABLE_ALLOW_HTTP_FOR_TESTS: 'true',
  INTEGRATION_OPENTABLE_ALLOWED_HOSTS: 'sync.opentable.test:8443,oauth.opentable.test:8443'
};

const providerConfiguration = {
  apiBaseUrl: 'http://sync.opentable.test:8443',
  oauthBaseUrl: 'http://oauth.opentable.test:8443',
  contractVersion: '1',
  shadowMode: true,
  guestDataMode: 'NONE',
  pageSize: 50,
  timeZone: 'Australia/Adelaide',
  experienceMappings: [{
    externalId: '324887',
    code: 'paired-tasting',
    name: 'Paired Tasting',
    durationMinutes: 90
  }],
  addOnMappings: [{
    externalId: '946651ee-4252-4e3d-945f-eafb6f252b86',
    code: 'truffle-pairing',
    label: 'Paired truffle tasting',
    kind: 'ADD_ON'
  }],
  visitTagMappings: [{
    externalValue: 'Nut allergy',
    code: 'nut',
    label: 'Restricted dietary requirement',
    kind: 'DIETARY'
  }]
};

const protectedCredential = {
  credentialType: 'OAUTH_CLIENT_CREDENTIALS',
  secret: { clientId: 'partner-client-id', clientSecret: 'partner-client-secret' }
};

function reservation({ changed = false, cancelled = false } = {}) {
  return {
    id: 'opentable-reservation-700',
    sequence_id: cancelled ? 703 : changed ? 702 : 701,
    rid: 6789,
    guest_id: '6789-private-guest-id',
    state: cancelled ? 'Cancelled' : 'Confirmed',
    scheduled_time_utc: changed || cancelled
      ? '2026-08-23T03:30:00Z'
      : '2026-08-22T03:30:00Z',
    party_size: 6,
    updated_at_utc: cancelled
      ? '2026-08-18T00:06:00Z'
      : changed ? '2026-08-18T00:04:00Z' : '2026-08-18T00:00:00Z',
    created_date_utc: '2026-08-01T00:00:00Z',
    visit_tags: ['Nut allergy', 'Unmapped internal tag'],
    guest_request: 'Private free-text request must not enter canonical facts.',
    venue_notes: 'Private venue note must not enter canonical facts.',
    experience_details: {
      experience_id: 324887,
      experience_title: 'Provider-owned display title',
      add_ons: [{
        ItemID: '946651ee-4252-4e3d-945f-eafb6f252b86',
        Quantity: changed || cancelled ? 8 : 6,
        Name: 'Provider-owned truffle name',
        Description: 'Provider-owned description'
      }]
    }
  };
}

function page(items, overrides = {}) {
  return {
    hasNextPage: false,
    nextPageUrl: null,
    offset: 0,
    limit: 50,
    items,
    ...overrides
  };
}

function createProvider({ httpClient, now = () => new Date('2026-08-18T00:07:00.000Z') } = {}) {
  return new OpenTableSyncProvider({
    configuration: providerConfiguration,
    credential: protectedCredential,
    externalLocationId: '6789',
    env: providerEnvironment,
    httpClient,
    now
  });
}

describe('OpenTable Sync native Booking adapter', () => {
  test('requires exact allowlisted endpoints, shadow mode, stable mappings, and an IANA timezone', () => {
    expect(normalizeOpenTableConfiguration(providerConfiguration, { env: providerEnvironment }))
      .toEqual(providerConfiguration);
    expect(() => normalizeOpenTableConfiguration({
      ...providerConfiguration,
      apiBaseUrl: 'http://sync.opentable.test:8443/path'
    }, { env: providerEnvironment })).toThrow('exact HTTPS origins');
    expect(() => normalizeOpenTableConfiguration({
      ...providerConfiguration,
      oauthBaseUrl: 'http://unapproved.opentable.test:8443'
    }, { env: providerEnvironment })).toThrow('not operator allowlisted');
    expect(() => normalizeOpenTableConfiguration({
      ...providerConfiguration,
      shadowMode: false
    }, { env: providerEnvironment })).toThrow('configuration is invalid');
    expect(() => normalizeOpenTableConfiguration({
      ...providerConfiguration,
      timeZone: 'Not/A_Timezone'
    }, { env: providerEnvironment })).toThrow('IANA time zone');
    expect(() => normalizeOpenTableConfiguration({
      ...providerConfiguration,
      addOnMappings: [providerConfiguration.addOnMappings[0], providerConfiguration.addOnMappings[0]]
    }, { env: providerEnvironment })).toThrow('unique externalId');
  });

  test('obtains an OAuth token, converts the local query window, and emits mapped privacy-safe facts', async () => {
    const httpClient = {
      post: jest.fn().mockResolvedValue({
        data: { access_token: 'short-lived-access-token', expires_in: 300, token_type: 'Bearer' }
      }),
      get: jest.fn().mockResolvedValue({
        data: page([reservation()], {
          hasNextPage: true,
          nextPageUrl: 'https://provider.example/unsafe-next-link'
        })
      })
    };
    const provider = createProvider({ httpClient });
    const result = await provider.fetchBookingsPage({
      from: '2026-08-18T00:00:00.000Z',
      to: '2026-08-25T00:00:00.000Z',
      syncMode: 'hydration'
    });

    expect(httpClient.post).toHaveBeenCalledWith(
      'http://oauth.opentable.test:8443/api/v2/oauth/token',
      null,
      expect.objectContaining({
        auth: { username: 'partner-client-id', password: 'partner-client-secret' },
        params: { grant_type: 'client_credentials' },
        maxRedirects: 0
      })
    );
    expect(httpClient.get).toHaveBeenCalledWith(
      `http://sync.opentable.test:8443${OPENTABLE_SYNC_PATH}`,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer short-lived-access-token' }),
        params: {
          rid: '6789',
          scheduled_time_from: '2026-08-18T09:30:00',
          scheduled_time_to: '2026-08-25T09:30:00',
          updated_after: undefined,
          limit: 50,
          offset: 0
        },
        maxRedirects: 0
      })
    );
    expect(result).toMatchObject({
      hasMore: true,
      nextCursor: '1',
      snapshotComplete: false,
      bookings: [expect.objectContaining({
        externalId: 'opentable-reservation-700',
        status: 'CONFIRMED',
        startAt: '2026-08-22T03:30:00.000Z',
        endAt: '2026-08-22T05:00:00.000Z',
        partySize: 6,
        externalLocationId: '6789',
        experience: { code: 'paired-tasting', name: 'Paired Tasting' },
        requirements: [
          { kind: 'ADD_ON', code: 'truffle-pairing', label: 'Paired truffle tasting', quantity: 6 },
          { kind: 'DIETARY', code: 'nut', label: 'Restricted dietary requirement', quantity: 1 }
        ],
        guest: null,
        sourceHash: expect.stringMatching(/^[a-f0-9]{64}$/)
      })]
    });
    expect(JSON.stringify(result)).not.toContain('Private free-text');
    expect(JSON.stringify(result)).not.toContain('Private venue note');
    expect(JSON.stringify(httpClient.get.mock.calls[0][0])).not.toContain('short-lived-access-token');
  });

  test('uses updated_after for incremental reads and explicit cancellation for reconciliation', async () => {
    const httpClient = {
      post: jest.fn().mockResolvedValue({ data: { access_token: 'token', expires_in: 300 } }),
      get: jest.fn()
        .mockResolvedValueOnce({ data: page([reservation({ changed: true })]) })
        .mockResolvedValueOnce({ data: page([reservation({ changed: true, cancelled: true })]) })
    };
    const provider = createProvider({ httpClient });
    const incremental = await provider.fetchBookingsPage({
      ...CONFORMANCE_SCENARIOS[1].request
    });
    expect(httpClient.get.mock.calls[0][1].params.updated_after).toBe('2026-08-18T00:01:00.000Z');
    expect(incremental.bookings[0]).toMatchObject({
      status: 'CONFIRMED',
      startAt: '2026-08-23T03:30:00.000Z',
      requirements: expect.arrayContaining([expect.objectContaining({ code: 'truffle-pairing', quantity: 8 })])
    });

    const reconciliation = await provider.fetchBookingsPage({ ...CONFORMANCE_SCENARIOS[2].request });
    expect(reconciliation).toMatchObject({ snapshotComplete: true });
    expect(reconciliation.bookings[0]).toMatchObject({
      status: 'CANCELLED',
      deletedAt: '2026-08-18T00:06:00.000Z'
    });
    expect(httpClient.post).toHaveBeenCalledTimes(1);
  });

  test('passes the shared lifecycle corpus against the cursor reference adapter', async () => {
    const httpClient = {
      post: jest.fn().mockResolvedValue({ data: { access_token: 'token', expires_in: 300 } }),
      get: jest.fn()
        .mockResolvedValueOnce({ data: page([], { limit: 1 }) })
        .mockResolvedValueOnce({ data: page([reservation()]) })
        .mockResolvedValueOnce({ data: page([reservation({ changed: true })]) })
        .mockResolvedValueOnce({ data: page([reservation({ changed: true, cancelled: true })]) })
    };
    const [openTableReport, cursorReport] = await Promise.all([
      runBookingAdapterConformance({
        adapter: createProvider({ httpClient }),
        providerKey: 'opentable',
        externalLocationId: '6789',
        scenarios: CONFORMANCE_SCENARIOS
      }),
      runBookingAdapterConformance({
        adapter: createCursorFixtureAdapter(),
        providerKey: cursorTranslator.providerKey,
        externalLocationId: 'venue-a',
        scenarios: CONFORMANCE_SCENARIOS
      })
    ]);
    expect(assertEquivalentBookingConformance([openTableReport, cursorReport])).toMatchObject({
      equivalent: true,
      providerKeys: ['opentable', 'fixture-cursor-reservations'],
      scenarioCount: 3
    });
    expect(openTableReport.adapterContractVersion).toBe(BOOKING_READ_ADAPTER_CONTRACT_VERSION);
  });

  test('fails closed on unknown states and redacts provider authentication diagnostics', () => {
    expect(mapOpenTableStatus('No_Show')).toBe('NO_SHOW');
    expect(() => mapOpenTableStatus('NewProviderState')).toThrow(expect.objectContaining({
      code: 'OPENTABLE_STATUS_UNSUPPORTED'
    }));
    const translated = translateOpenTableRequestError({
      response: {
        status: 401,
        data: { message: 'partner-client-secret rejected', requestId: 'private-request-id' }
      }
    });
    expect(translated).toBeInstanceOf(OpenTableSyncRequestError);
    expect(translated).toMatchObject({
      code: 'OPENTABLE_AUTHENTICATION_REJECTED',
      permanent: true,
      authenticationRejected: true
    });
    expect(JSON.stringify(translated)).not.toContain('partner-client-secret');
    expect(JSON.stringify(translated)).not.toContain('private-request-id');
  });

  test('requires explicit mappings for provider experiences and selected add-ons', async () => {
    const unmappedExperienceClient = {
      post: jest.fn().mockResolvedValue({ data: { access_token: 'token', expires_in: 300 } }),
      get: jest.fn().mockResolvedValue({
        data: page([{
          ...reservation(),
          experience_details: { ...reservation().experience_details, experience_id: 999999 }
        }])
      })
    };
    await expect(createProvider({ httpClient: unmappedExperienceClient }).fetchBookingsPage({
      ...CONFORMANCE_SCENARIOS[0].request
    })).rejects.toMatchObject({ code: 'OPENTABLE_EXPERIENCE_MAPPING_REQUIRED', permanent: true });

    const unmappedAddOnClient = {
      post: jest.fn().mockResolvedValue({ data: { access_token: 'token', expires_in: 300 } }),
      get: jest.fn().mockResolvedValue({
        data: page([{
          ...reservation(),
          experience_details: {
            ...reservation().experience_details,
            add_ons: [{ ItemID: 'unmapped-addon', Quantity: 1, Name: 'Unmapped' }]
          }
        }])
      })
    };
    await expect(createProvider({ httpClient: unmappedAddOnClient }).fetchBookingsPage({
      ...CONFORMANCE_SCENARIOS[0].request
    })).rejects.toMatchObject({ code: 'OPENTABLE_ADD_ON_MAPPING_REQUIRED', permanent: true });
  });

  test('uses deterministic DST-aware local timestamps', () => {
    expect(formatOpenTableLocalTimestamp('2026-08-18T00:00:00.000Z', 'Australia/Adelaide'))
      .toBe('2026-08-18T09:30:00');
    expect(formatOpenTableLocalTimestamp('2026-01-18T00:00:00.000Z', 'Australia/Adelaide'))
      .toBe('2026-01-18T10:30:00');
  });
});
