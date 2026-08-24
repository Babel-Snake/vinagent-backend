const { createIntegrationSchedulerRegistry } = require('../../services/integrationSchedulerRegistry.service');
const {
  createConfiguredIntegrationSchedulerRegistry
} = require('../../services/integrationSchedulers.service');

describe('integration scheduler registry', () => {
  test('builds domain configs and aggregates schedulers in deterministic order', async () => {
    const registry = createIntegrationSchedulerRegistry();
    const calls = [];
    registry.register({
      domain: 'CLUB',
      configKey: 'clubScheduler',
      getConfig: env => ({ enabled: env.CLUB_ENABLED === 'true' }),
      schedule: async options => {
        calls.push(['CLUB', options]);
        return { enabled: true, examined: 2, scheduled: 1, duplicates: 1, failed: 0, results: [] };
      },
      getStatus: async ({ config }) => ({ enabled: config.enabled, eligibleStreams: 2 })
    });
    registry.register({
      domain: 'BOOKING',
      configKey: 'bookingScheduler',
      getConfig: env => ({ enabled: env.BOOKING_ENABLED === 'true' }),
      schedule: async options => {
        calls.push(['BOOKING', options]);
        return { enabled: false, examined: 0, scheduled: 0, failed: 0, results: [] };
      },
      getStatus: async ({ config }) => ({ enabled: config.enabled, eligibleStreams: 0 })
    });

    expect(registry.list()).toEqual([
      { domain: 'BOOKING', configKey: 'bookingScheduler' },
      { domain: 'CLUB', configKey: 'clubScheduler' }
    ]);
    const configs = registry.getConfigs({ BOOKING_ENABLED: 'false', CLUB_ENABLED: 'true' });
    expect(configs).toEqual({
      bookingScheduler: { enabled: false },
      clubScheduler: { enabled: true }
    });
    const jobService = { enqueueIntegrationJob: jest.fn() };
    const result = await registry.scheduleDue({ workerId: 'worker-a', configs, jobService });
    expect(calls.map(call => call[0])).toEqual(['BOOKING', 'CLUB']);
    expect(calls[1][1]).toEqual({
      workerId: 'worker-a',
      config: { enabled: true },
      jobService
    });
    expect(result).toMatchObject({
      examined: 2,
      scheduled: 1,
      duplicates: 1,
      failed: 0,
      schedulerFailures: 0
    });
    expect(result.domains).toEqual([
      expect.objectContaining({ domain: 'BOOKING', schedulerStatus: 'DISABLED' }),
      expect.objectContaining({ domain: 'CLUB', schedulerStatus: 'SUCCEEDED' })
    ]);
  });

  test('isolates a domain scheduler failure and does not expose its error message', async () => {
    const registry = createIntegrationSchedulerRegistry();
    registry.register({
      domain: 'BOOKING',
      configKey: 'bookingScheduler',
      getConfig: () => ({ enabled: true }),
      schedule: async () => {
        const error = new Error('private provider diagnostic must not escape');
        error.code = 'BOOKING_SCHEDULER_UNAVAILABLE';
        throw error;
      }
    });
    registry.register({
      domain: 'CLUB',
      configKey: 'clubScheduler',
      getConfig: () => ({ enabled: true }),
      schedule: async () => ({ enabled: true, examined: 1, scheduled: 1, failed: 0, results: [] })
    });

    const result = await registry.scheduleDue({
      workerId: 'worker-a',
      configs: registry.getConfigs({}),
      jobService: {}
    });
    expect(result).toMatchObject({ scheduled: 1, failed: 1, schedulerFailures: 1 });
    expect(result.domains).toEqual([
      expect.objectContaining({
        domain: 'BOOKING',
        schedulerStatus: 'FAILED',
        errorCode: 'BOOKING_SCHEDULER_UNAVAILABLE'
      }),
      expect.objectContaining({ domain: 'CLUB', schedulerStatus: 'SUCCEEDED', scheduled: 1 })
    ]);
    expect(JSON.stringify(result)).not.toContain('private provider diagnostic');
  });

  test('reports each domain status independently', async () => {
    const registry = createIntegrationSchedulerRegistry();
    registry.register({
      domain: 'BOOKING',
      configKey: 'bookingScheduler',
      getConfig: () => ({ enabled: false }),
      schedule: async () => ({}),
      getStatus: async () => ({ enabled: false, eligibleStreams: 3 })
    });
    registry.register({
      domain: 'CLUB',
      configKey: 'clubScheduler',
      getConfig: () => ({ enabled: true }),
      schedule: async () => ({}),
      getStatus: async () => { throw new Error('database details'); }
    });

    const statuses = await registry.getStatuses({
      wineryId: 9,
      configs: registry.getConfigs({})
    });
    expect(statuses).toMatchObject({ registeredDomains: 2, enabledDomains: 1, unavailableDomains: 1 });
    expect(statuses.domains).toEqual([
      expect.objectContaining({
        domain: 'BOOKING',
        schedulerStatus: 'AVAILABLE',
        eligibleStreams: 3
      }),
      expect.objectContaining({
        domain: 'CLUB',
        schedulerStatus: 'UNAVAILABLE',
        errorCode: 'SCHEDULER_STATUS_FAILED'
      })
    ]);
    expect(JSON.stringify(statuses)).not.toContain('database details');
  });

  test('validates registrations and exposes Booking as the first configured domain', () => {
    const registry = createIntegrationSchedulerRegistry();
    const registration = {
      domain: 'BOOKING',
      configKey: 'bookingScheduler',
      getConfig: () => ({}),
      schedule: async () => ({})
    };
    expect(registry.register(registration)).toBe('BOOKING');
    expect(() => registry.register(registration)).toThrow('already registered');
    expect(() => registry.register({ ...registration, domain: 'NOT_A_DOMAIN' }))
      .toThrow('domain is not supported');
    expect(() => registry.register({ ...registration, domain: 'CLUB', configKey: 'invalid-key' }))
      .toThrow('configKey');

    expect(createConfiguredIntegrationSchedulerRegistry().list()).toEqual([
      { domain: 'BOOKING', configKey: 'bookingScheduler' }
    ]);
  });
});
