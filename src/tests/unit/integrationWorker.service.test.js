const {
  createIntegrationJobHandlerRegistry,
  IntegrationJobHandlerUnavailableError
} = require('../../services/integrationJobHandlerRegistry.service');
const {
  getIntegrationWorkerConfig,
  startJobLeaseHeartbeat,
  runIntegrationWorkerCycle,
  startIntegrationWorkerLoop
} = require('../../services/integrationWorker.service');

describe('integration worker runtime', () => {
  test('is disabled by default and bounds operator-controlled settings', () => {
    expect(getIntegrationWorkerConfig({})).toMatchObject({
      enabled: false,
      intervalMs: 5000,
      jobBatchSize: 10,
      outboxBatchSize: 20,
      leaseSeconds: 60,
      runImmediately: true,
      schedulerConfigs: {
        bookingScheduler: expect.objectContaining({ enabled: false, policyVersion: '1' })
      }
    });

    expect(getIntegrationWorkerConfig({
      INTEGRATION_WORKER_ENABLED: 'true',
      INTEGRATION_WORKER_ID: 'worker-a',
      INTEGRATION_WORKER_INTERVAL_MS: '10',
      INTEGRATION_WORKER_JOB_BATCH_SIZE: '1000',
      INTEGRATION_WORKER_OUTBOX_BATCH_SIZE: '0',
      INTEGRATION_WORKER_LEASE_SECONDS: '99999',
      INTEGRATION_WORKER_RUN_IMMEDIATELY: 'false'
    })).toMatchObject({
      enabled: true,
      workerId: 'worker-a',
      intervalMs: 1000,
      jobBatchSize: 100,
      outboxBatchSize: 1,
      leaseSeconds: 3600,
      runImmediately: false
    });
  });

  test('uses explicit stable job handlers and treats missing handlers as permanent', async () => {
    const registry = createIntegrationJobHandlerRegistry();
    const handler = jest.fn().mockResolvedValue({ fetched: 2 });
    expect(registry.register('sync.bookings', handler)).toBe('SYNC.BOOKINGS');
    expect(registry.list()).toEqual(['SYNC.BOOKINGS']);
    await expect(registry.execute({ jobKind: 'SYNC.BOOKINGS', id: 1 }, { workerId: 'worker-a' }))
      .resolves.toEqual({ fetched: 2 });
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 }),
      expect.objectContaining({ workerId: 'worker-a' })
    );
    expect(() => registry.register('SYNC.BOOKINGS', handler)).toThrow('already registered');
    await expect(registry.execute({ jobKind: 'UNKNOWN' })).rejects.toMatchObject({
      code: 'JOB_HANDLER_UNAVAILABLE',
      permanent: true
    });
    await expect(registry.execute({ jobKind: 'UNKNOWN' })).rejects.toBeInstanceOf(IntegrationJobHandlerUnavailableError);
  });

  test('renews an active job lease and stops the heartbeat cleanly', async () => {
    jest.useFakeTimers();
    try {
      const jobService = { renewIntegrationJobLease: jest.fn().mockResolvedValue(new Date()) };
      const heartbeat = startJobLeaseHeartbeat({
        job: { id: 7, wineryId: 3 },
        workerId: 'worker-a',
        leaseSeconds: 30,
        jobService
      });
      await jest.advanceTimersByTimeAsync(10000);
      expect(jobService.renewIntegrationJobLease).toHaveBeenCalledWith({
        jobId: 7,
        wineryId: 3,
        workerId: 'worker-a',
        leaseSeconds: 30
      });
      await heartbeat.stop();
      await jest.advanceTimersByTimeAsync(30000);
      expect(jobService.renewIntegrationJobLease).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  test('completes successful jobs, permanently fails unsupported jobs, and dispatches outbox work', async () => {
    const registry = createIntegrationJobHandlerRegistry();
    registry.register('SYNC.BOOKINGS', async () => ({ fetched: 3 }));
    const jobs = [
      { id: 11, wineryId: 1, jobKind: 'SYNC.BOOKINGS' },
      { id: 12, wineryId: 1, jobKind: 'UNSUPPORTED' }
    ];
    const jobService = {
      claimDueIntegrationJobs: jest.fn().mockResolvedValue(jobs),
      completeIntegrationJob: jest.fn().mockResolvedValue({ status: 'SUCCEEDED' }),
      failIntegrationJob: jest.fn().mockResolvedValue({ status: 'FAILED' })
    };
    const outboxService = {
      dispatchCanonicalOutboxBatch: jest.fn().mockResolvedValue([{ outboxId: 91, status: 'DELIVERED' }])
    };

    const result = await runIntegrationWorkerCycle({
      workerId: 'worker-a',
      jobBatchSize: 7,
      outboxBatchSize: 8,
      leaseSeconds: 30,
      jobService,
      outboxService,
      handlerRegistry: registry
    });

    expect(jobService.claimDueIntegrationJobs).toHaveBeenCalledWith({ workerId: 'worker-a', limit: 7, leaseSeconds: 30 });
    expect(jobService.completeIntegrationJob).toHaveBeenCalledWith(expect.objectContaining({
      jobId: 11,
      wineryId: 1,
      workerId: 'worker-a',
      result: { fetched: 3 }
    }));
    expect(jobService.failIntegrationJob).toHaveBeenCalledWith(expect.objectContaining({
      jobId: 12,
      permanent: true,
      errorCode: 'JOB_HANDLER_UNAVAILABLE'
    }));
    expect(outboxService.dispatchCanonicalOutboxBatch).toHaveBeenCalledWith({
      workerId: 'worker-a',
      limit: 8,
      leaseSeconds: 30
    });
    expect(result.jobResults).toEqual([
      expect.objectContaining({ jobId: 11, status: 'SUCCEEDED' }),
      expect.objectContaining({ jobId: 12, status: 'FAILED' })
    ]);
  });

  test('schedules due domain work before claiming the same durable queue', async () => {
    const calls = [];
    const scheduledJob = { id: 31, wineryId: 2, jobKind: 'BOOKING_INCREMENTAL' };
    const jobService = {
      claimDueIntegrationJobs: jest.fn().mockImplementation(async () => {
        calls.push('claim');
        return [scheduledJob];
      }),
      completeIntegrationJob: jest.fn().mockResolvedValue({ status: 'SUCCEEDED' }),
      failIntegrationJob: jest.fn()
    };
    const schedulerRegistry = {
      scheduleDue: jest.fn().mockImplementation(async () => {
        calls.push('schedule');
        return {
          examined: 1,
          scheduled: 1,
          failed: 0,
          schedulerFailures: 0,
          domains: [{ domain: 'BOOKING', schedulerStatus: 'SUCCEEDED', scheduled: 1 }]
        };
      })
    };
    const registry = createIntegrationJobHandlerRegistry();
    registry.register('BOOKING_INCREMENTAL', async () => ({ fetched: 1 }));
    const result = await runIntegrationWorkerCycle({
      workerId: 'worker-a',
      jobService,
      outboxService: { dispatchCanonicalOutboxBatch: jest.fn().mockResolvedValue([]) },
      handlerRegistry: registry,
      schedulerRegistry,
      schedulerConfigs: { bookingScheduler: { enabled: true, policyVersion: '1' } }
    });
    expect(calls).toEqual(['schedule', 'claim']);
    expect(schedulerRegistry.scheduleDue).toHaveBeenCalledWith({
      workerId: 'worker-a',
      configs: { bookingScheduler: { enabled: true, policyVersion: '1' } },
      jobService
    });
    expect(result).toMatchObject({
      schedulingResult: { scheduled: 1 },
      jobResults: [{ jobId: 31, status: 'SUCCEEDED' }]
    });
  });

  test('does not overlap cycles and waits for an active cycle when stopped', async () => {
    let releaseClaim;
    const claim = new Promise(resolve => { releaseClaim = resolve; });
    const jobService = {
      claimDueIntegrationJobs: jest.fn().mockReturnValue(claim),
      completeIntegrationJob: jest.fn(),
      failIntegrationJob: jest.fn()
    };
    const outboxService = { dispatchCanonicalOutboxBatch: jest.fn().mockResolvedValue([]) };
    const registry = createIntegrationJobHandlerRegistry();
    const worker = startIntegrationWorkerLoop({
      config: {
        enabled: true,
        workerId: 'worker-a',
        intervalMs: 300000,
        jobBatchSize: 1,
        outboxBatchSize: 1,
        leaseSeconds: 30,
        runImmediately: false
      },
      jobService,
      outboxService,
      handlerRegistry: registry
    });

    const active = worker.run();
    await expect(worker.run()).resolves.toBeNull();
    const stopping = worker.stop();
    expect(jobService.claimDueIntegrationJobs).toHaveBeenCalledTimes(1);
    releaseClaim([]);
    await expect(active).resolves.toMatchObject({ jobResults: [], outboxResults: [] });
    await expect(stopping).resolves.toBeUndefined();
  });
});
