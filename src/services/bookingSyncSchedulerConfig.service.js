const { ValidationError } = require('../utils/errors');

const POLICY_VERSION = '1';
const PROVIDER_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/;

function boundedInteger(value, fallback, min, max, fieldName) {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new ValidationError(`${fieldName} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

function normalizePolicy(value = {}, defaults, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
  const allowed = new Set([
    'incrementalIntervalSeconds',
    'reconciliationIntervalSeconds',
    'minimumSpacingSeconds',
    'rateWindowSeconds',
    'maxJobsPerRateWindow'
  ]);
  if (Object.keys(value).some(key => !allowed.has(key))) {
    throw new ValidationError(`${label} contains unsupported fields`);
  }
  return Object.freeze({
    incrementalIntervalSeconds: boundedInteger(
      value.incrementalIntervalSeconds,
      defaults.incrementalIntervalSeconds,
      60,
      86400,
      `${label}.incrementalIntervalSeconds`
    ),
    reconciliationIntervalSeconds: boundedInteger(
      value.reconciliationIntervalSeconds,
      defaults.reconciliationIntervalSeconds,
      3600,
      2592000,
      `${label}.reconciliationIntervalSeconds`
    ),
    minimumSpacingSeconds: boundedInteger(
      value.minimumSpacingSeconds,
      defaults.minimumSpacingSeconds,
      1,
      3600,
      `${label}.minimumSpacingSeconds`
    ),
    rateWindowSeconds: boundedInteger(
      value.rateWindowSeconds,
      defaults.rateWindowSeconds,
      1,
      3600,
      `${label}.rateWindowSeconds`
    ),
    maxJobsPerRateWindow: boundedInteger(
      value.maxJobsPerRateWindow,
      defaults.maxJobsPerRateWindow,
      1,
      1000,
      `${label}.maxJobsPerRateWindow`
    )
  });
}

function parseProviderPolicies(raw, defaults) {
  if (!raw) return Object.freeze({});
  if (Buffer.byteLength(String(raw), 'utf8') > 16384) {
    throw new ValidationError('INTEGRATION_BOOKING_SCHEDULER_PROVIDER_POLICIES_JSON is too large');
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ValidationError('INTEGRATION_BOOKING_SCHEDULER_PROVIDER_POLICIES_JSON must be valid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).length > 50) {
    throw new ValidationError('Booking scheduler provider policies must be a bounded object');
  }
  const policies = {};
  for (const [rawProviderKey, policy] of Object.entries(parsed)) {
    const providerKey = String(rawProviderKey).trim().toLowerCase();
    if (!PROVIDER_KEY_PATTERN.test(providerKey) || providerKey !== rawProviderKey) {
      throw new ValidationError('Booking scheduler provider policy keys must be normalized provider keys');
    }
    policies[providerKey] = normalizePolicy(policy, defaults, `providerPolicies.${providerKey}`);
  }
  return Object.freeze(policies);
}

function getBookingSyncSchedulerConfig(env = process.env) {
  const defaults = normalizePolicy({
    incrementalIntervalSeconds: env.INTEGRATION_BOOKING_INCREMENTAL_INTERVAL_SECONDS,
    reconciliationIntervalSeconds: env.INTEGRATION_BOOKING_RECONCILIATION_INTERVAL_SECONDS,
    minimumSpacingSeconds: env.INTEGRATION_BOOKING_PROVIDER_MINIMUM_SPACING_SECONDS,
    rateWindowSeconds: env.INTEGRATION_BOOKING_PROVIDER_RATE_WINDOW_SECONDS,
    maxJobsPerRateWindow: env.INTEGRATION_BOOKING_PROVIDER_MAX_JOBS_PER_RATE_WINDOW
  }, {
    incrementalIntervalSeconds: 300,
    reconciliationIntervalSeconds: 86400,
    minimumSpacingSeconds: 5,
    rateWindowSeconds: 60,
    maxJobsPerRateWindow: 12
  }, 'bookingScheduler');
  const lookbackHours = boundedInteger(
    env.INTEGRATION_BOOKING_WINDOW_LOOKBACK_HOURS,
    24,
    0,
    168,
    'INTEGRATION_BOOKING_WINDOW_LOOKBACK_HOURS'
  );
  const horizonHours = boundedInteger(
    env.INTEGRATION_BOOKING_WINDOW_HORIZON_HOURS,
    720,
    1,
    744,
    'INTEGRATION_BOOKING_WINDOW_HORIZON_HOURS'
  );
  if (lookbackHours + horizonHours > 744) {
    throw new ValidationError('Booking scheduler window cannot exceed 31 days');
  }
  return Object.freeze({
    enabled: env.INTEGRATION_BOOKING_SCHEDULER_ENABLED === 'true',
    policyVersion: POLICY_VERSION,
    batchSize: boundedInteger(
      env.INTEGRATION_BOOKING_SCHEDULER_BATCH_SIZE,
      20,
      1,
      100,
      'INTEGRATION_BOOKING_SCHEDULER_BATCH_SIZE'
    ),
    lookbackHours,
    horizonHours,
    overlapMinutes: boundedInteger(
      env.INTEGRATION_BOOKING_INCREMENTAL_OVERLAP_MINUTES,
      5,
      0,
      1440,
      'INTEGRATION_BOOKING_INCREMENTAL_OVERLAP_MINUTES'
    ),
    maxPages: boundedInteger(
      env.INTEGRATION_BOOKING_SCHEDULER_MAX_PAGES,
      10,
      1,
      50,
      'INTEGRATION_BOOKING_SCHEDULER_MAX_PAGES'
    ),
    retryBackoffSeconds: boundedInteger(
      env.INTEGRATION_BOOKING_SCHEDULER_RETRY_BACKOFF_SECONDS,
      30,
      1,
      86400,
      'INTEGRATION_BOOKING_SCHEDULER_RETRY_BACKOFF_SECONDS'
    ),
    maxAttempts: boundedInteger(
      env.INTEGRATION_BOOKING_SCHEDULER_MAX_ATTEMPTS,
      10,
      1,
      100,
      'INTEGRATION_BOOKING_SCHEDULER_MAX_ATTEMPTS'
    ),
    defaults,
    providerPolicies: parseProviderPolicies(
      env.INTEGRATION_BOOKING_SCHEDULER_PROVIDER_POLICIES_JSON,
      defaults
    )
  });
}

function resolveBookingProviderSchedulePolicy(config, providerKey) {
  return config.providerPolicies[String(providerKey || '').trim().toLowerCase()] || config.defaults;
}

module.exports = {
  POLICY_VERSION,
  getBookingSyncSchedulerConfig,
  resolveBookingProviderSchedulePolicy
};
