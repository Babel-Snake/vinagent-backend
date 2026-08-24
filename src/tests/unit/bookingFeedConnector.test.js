const {
  BOOKING_FEED_SCHEMA_VERSION,
  validateAndNormalizeBookingPage
} = require('../../services/integrations/booking/bookingFeed.contract');
const {
  BookingFeedRequestError,
  VinAgentBookingFeedProvider,
  normalizeBookingFeedConfiguration,
  translateRequestError
} = require('../../services/integrations/booking/providers/vinagentBookingFeed');

const connectorEnvironment = {
  NODE_ENV: 'test',
  INTEGRATION_BOOKING_FEED_ALLOW_HTTP_FOR_TESTS: 'true',
  INTEGRATION_BOOKING_FEED_ALLOWED_HOSTS: 'feed.example.test:8443'
};

const connectionConfiguration = {
  baseUrl: 'http://feed.example.test:8443',
  contractVersion: '1',
  shadowMode: true,
  guestDataMode: 'NONE',
  pageSize: 50
};

const bookingPayload = (overrides = {}) => ({
  id: 'booking-100',
  revision: '7',
  status: 'CONFIRMED',
  startAt: '2026-08-22T03:30:00.000Z',
  endAt: '2026-08-22T05:00:00.000Z',
  partySize: 6,
  locationId: 'cellar-door-provider-id',
  experience: { code: 'paired-tasting', name: 'Paired Tasting' },
  requirements: [{ kind: 'ADD_ON', code: 'truffle-pairing', label: 'Paired truffle tasting', quantity: 6 }],
  guest: {
    externalId: 'guest-88',
    firstName: 'Sensitive',
    lastName: 'Guest',
    email: 'Guest@Example.com',
    phone: '+61400000000'
  },
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-18T00:00:00.000Z',
  deletedAt: null,
  ...overrides
});

describe('VinAgent Booking Feed v1 connector', () => {
  test('requires an operator-allowlisted exact origin and shadow-only configuration', () => {
    expect(normalizeBookingFeedConfiguration(connectionConfiguration, { env: connectorEnvironment }))
      .toEqual(connectionConfiguration);
    for (const baseUrl of [
      'https://user:password@feed.example.test:8443',
      'http://feed.example.test:8443/path',
      'http://127.0.0.1:8443'
    ]) {
      expect(() => normalizeBookingFeedConfiguration({ ...connectionConfiguration, baseUrl }, {
        env: connectorEnvironment
      })).toThrow();
    }
    expect(() => normalizeBookingFeedConfiguration({ ...connectionConfiguration, shadowMode: false }, {
      env: connectorEnvironment
    })).toThrow('shadowMode');
  });

  test('validates a strict page and removes guest data in NONE mode', () => {
    const normalized = validateAndNormalizeBookingPage({
      schemaVersion: BOOKING_FEED_SCHEMA_VERSION,
      bookings: [bookingPayload()],
      nextCursor: null,
      hasMore: false,
      watermarkAt: '2026-08-18T00:01:00.000Z'
    }, { guestDataMode: 'NONE' });
    expect(normalized.bookings[0]).toMatchObject({
      externalId: 'booking-100',
      revision: '7',
      status: 'CONFIRMED',
      guest: null,
      requirements: [{ kind: 'ADD_ON', code: 'truffle-pairing', quantity: 6 }]
    });
    expect(normalized.bookings[0].sourceHash).toMatch(/^[a-f0-9]{64}$/);

    const identity = validateAndNormalizeBookingPage({
      schemaVersion: BOOKING_FEED_SCHEMA_VERSION,
      bookings: [bookingPayload()],
      nextCursor: null,
      hasMore: false,
      watermarkAt: null
    }, { guestDataMode: 'IDENTITY_MINIMUM' });
    expect(identity.bookings[0].guest.email).toBe('guest@example.com');
  });

  test('rejects unknown response fields, invalid timelines, and cursor contradictions', () => {
    expect(() => validateAndNormalizeBookingPage({
      schemaVersion: BOOKING_FEED_SCHEMA_VERSION,
      bookings: [{ ...bookingPayload(), rawCardNumber: '4111111111111111' }],
      nextCursor: null,
      hasMore: false,
      watermarkAt: null
    })).toThrow('does not satisfy');
    expect(() => validateAndNormalizeBookingPage({
      schemaVersion: BOOKING_FEED_SCHEMA_VERSION,
      bookings: [bookingPayload({ endAt: '2026-08-20T00:00:00.000Z' })],
      nextCursor: null,
      hasMore: false,
      watermarkAt: null
    })).toThrow('does not satisfy');
    expect(() => validateAndNormalizeBookingPage({
      schemaVersion: BOOKING_FEED_SCHEMA_VERSION,
      bookings: [],
      nextCursor: null,
      hasMore: true,
      watermarkAt: null
    })).toThrow('does not satisfy');

    expect(() => validateAndNormalizeBookingPage({
      schemaVersion: BOOKING_FEED_SCHEMA_VERSION,
      bookings: [{
        ...bookingPayload(),
        requirements: [
          { kind: 'ADD_ON', code: 'truffle', label: 'Truffle one', quantity: 1 },
          { kind: 'ADD_ON', code: 'truffle', label: 'Truffle two', quantity: 2 }
        ]
      }],
      nextCursor: null,
      hasMore: false,
      watermarkAt: null
    })).toThrow('does not satisfy');
  });

  test('verifies the configured location and sends credentials only as headers', async () => {
    const httpClient = {
      get: jest.fn().mockResolvedValue({
        data: {
          schemaVersion: BOOKING_FEED_SCHEMA_VERSION,
          status: 'ok',
          accountId: 'account-1',
          locations: [{ id: 'cellar-door-provider-id', name: 'Cellar Door' }]
        }
      })
    };
    const provider = new VinAgentBookingFeedProvider({
      configuration: connectionConfiguration,
      credential: { credentialType: 'BEARER_TOKEN', secret: { token: 'sensitive-token' } },
      externalLocationId: 'cellar-door-provider-id',
      env: connectorEnvironment,
      httpClient
    });
    await expect(provider.verifyReadAccess()).resolves.toMatchObject({ locationMatched: true });
    expect(httpClient.get).toHaveBeenCalledWith(
      'http://feed.example.test:8443/v1/health',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer sensitive-token' }),
        maxRedirects: 0
      })
    );
    expect(JSON.stringify(httpClient.get.mock.calls[0][0])).not.toContain('sensitive-token');
  });

  test('uses explicit polling checkpoints and requires a complete reconciliation snapshot', async () => {
    const response = {
      schemaVersion: BOOKING_FEED_SCHEMA_VERSION,
      bookings: [bookingPayload()],
      nextCursor: null,
      hasMore: false,
      watermarkAt: '2026-08-18T00:05:00.000Z'
    };
    const httpClient = { get: jest.fn().mockResolvedValue({ data: response }) };
    const provider = new VinAgentBookingFeedProvider({
      configuration: connectionConfiguration,
      credential: { credentialType: 'API_KEY', secret: { apiKey: 'sensitive-key' } },
      externalLocationId: 'cellar-door-provider-id',
      env: connectorEnvironment,
      httpClient
    });
    await provider.fetchBookingsPage({
      from: '2026-08-18T00:00:00.000Z',
      to: '2026-08-25T00:00:00.000Z',
      updatedSince: '2026-08-18T00:01:00.000Z',
      syncMode: 'incremental'
    });
    expect(httpClient.get).toHaveBeenCalledWith(
      'http://feed.example.test:8443/v1/bookings',
      expect.objectContaining({
        params: expect.objectContaining({
          updated_since: '2026-08-18T00:01:00.000Z',
          sync_mode: 'incremental'
        })
      })
    );
    await expect(provider.fetchBookingsPage({
      from: '2026-08-18T00:00:00.000Z',
      to: '2026-08-25T00:00:00.000Z',
      syncMode: 'reconciliation'
    })).rejects.toMatchObject({ code: 'BOOKING_FEED_RECONCILIATION_INCOMPLETE', permanent: true });
    httpClient.get.mockResolvedValueOnce({ data: { ...response, snapshotComplete: true } });
    await expect(provider.fetchBookingsPage({
      from: '2026-08-18T00:00:00.000Z',
      to: '2026-08-25T00:00:00.000Z',
      syncMode: 'reconciliation'
    })).resolves.toMatchObject({ snapshotComplete: true });
  });

  test('returns bounded provider errors without response bodies or credential material', () => {
    const translated = translateRequestError({
      response: {
        status: 401,
        data: { error: 'token sensitive-token was rejected', diagnostic: 'private-provider-detail' }
      }
    });
    expect(translated).toBeInstanceOf(BookingFeedRequestError);
    expect(translated).toMatchObject({
      code: 'BOOKING_FEED_AUTHENTICATION_REJECTED',
      permanent: true,
      authenticationRejected: true
    });
    expect(JSON.stringify(translated)).not.toContain('sensitive-token');
    expect(JSON.stringify(translated)).not.toContain('private-provider-detail');
  });
});
