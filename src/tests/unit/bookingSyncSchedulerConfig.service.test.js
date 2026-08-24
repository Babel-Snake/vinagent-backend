const {
  getBookingSyncSchedulerConfig,
  resolveBookingProviderSchedulePolicy
} = require('../../services/bookingSyncSchedulerConfig.service');

describe('booking sync scheduler configuration', () => {
  test('is disabled by default with bounded production-safe cadence defaults', () => {
    const config = getBookingSyncSchedulerConfig({});
    expect(config).toMatchObject({
      enabled: false,
      policyVersion: '1',
      batchSize: 20,
      lookbackHours: 24,
      horizonHours: 720,
      overlapMinutes: 5,
      maxPages: 10,
      defaults: {
        incrementalIntervalSeconds: 300,
        reconciliationIntervalSeconds: 86400,
        minimumSpacingSeconds: 5,
        rateWindowSeconds: 60,
        maxJobsPerRateWindow: 12
      }
    });
  });

  test('applies normalized per-provider policies without leaking them into connector implementations', () => {
    const config = getBookingSyncSchedulerConfig({
      INTEGRATION_BOOKING_SCHEDULER_ENABLED: 'true',
      INTEGRATION_BOOKING_INCREMENTAL_INTERVAL_SECONDS: '600',
      INTEGRATION_BOOKING_SCHEDULER_PROVIDER_POLICIES_JSON: JSON.stringify({
        opentable: {
          incrementalIntervalSeconds: 900,
          reconciliationIntervalSeconds: 43200,
          minimumSpacingSeconds: 15,
          rateWindowSeconds: 120,
          maxJobsPerRateWindow: 2
        }
      })
    });
    expect(config.enabled).toBe(true);
    expect(resolveBookingProviderSchedulePolicy(config, 'OpenTable')).toEqual({
      incrementalIntervalSeconds: 900,
      reconciliationIntervalSeconds: 43200,
      minimumSpacingSeconds: 15,
      rateWindowSeconds: 120,
      maxJobsPerRateWindow: 2
    });
    expect(resolveBookingProviderSchedulePolicy(config, 'vinagent-booking-feed'))
      .toMatchObject({ incrementalIntervalSeconds: 600, minimumSpacingSeconds: 5 });
  });

  test('fails closed for malformed policies and windows exceeding the booking read contract', () => {
    expect(() => getBookingSyncSchedulerConfig({
      INTEGRATION_BOOKING_SCHEDULER_PROVIDER_POLICIES_JSON: '{broken'
    })).toThrow('must be valid JSON');
    expect(() => getBookingSyncSchedulerConfig({
      INTEGRATION_BOOKING_SCHEDULER_PROVIDER_POLICIES_JSON: JSON.stringify({
        OpenTable: { minimumSpacingSeconds: 5 }
      })
    })).toThrow('normalized provider keys');
    expect(() => getBookingSyncSchedulerConfig({
      INTEGRATION_BOOKING_WINDOW_LOOKBACK_HOURS: '168',
      INTEGRATION_BOOKING_WINDOW_HORIZON_HOURS: '744'
    })).toThrow('cannot exceed 31 days');
  });
});
