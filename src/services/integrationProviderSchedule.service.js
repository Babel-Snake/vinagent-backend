const { UniqueConstraintError } = require('sequelize');
const { IntegrationProviderScheduleState } = require('../models');
const { ValidationError } = require('../utils/errors');
const {
  INTEGRATION_DOMAINS,
  includesRegistryValue
} = require('./integrationDataRegistry.service');

const positiveInteger = (value, fieldName, max) => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) {
    throw new ValidationError(`${fieldName} must be an integer between 1 and ${max}`);
  }
  return parsed;
};

const normalizeDomain = value => {
  const domain = String(value || '').trim().toUpperCase();
  if (!includesRegistryValue(INTEGRATION_DOMAINS, domain)) {
    throw new ValidationError('Provider schedule domain is not supported');
  }
  return domain;
};

const normalizeProviderKey = value => {
  const providerKey = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{0,119}$/.test(providerKey)) {
    throw new ValidationError('providerKey must be a stable registry key');
  }
  return providerKey;
};

async function lockProviderScheduleState({ domain, providerKey, policyVersion, transaction }) {
  const normalizedDomain = normalizeDomain(domain);
  const normalizedProviderKey = normalizeProviderKey(providerKey);
  let state = await IntegrationProviderScheduleState.findOne({
    where: { domain: normalizedDomain, providerKey: normalizedProviderKey },
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (state) return state;
  try {
    state = await IntegrationProviderScheduleState.create({
      domain: normalizedDomain,
      providerKey: normalizedProviderKey,
      scheduledCount: 0,
      metadata: { policyVersion: String(policyVersion || '1').slice(0, 40) }
    }, { transaction });
  } catch (error) {
    if (!(error instanceof UniqueConstraintError || error.name === 'SequelizeUniqueConstraintError')) throw error;
    state = await IntegrationProviderScheduleState.findOne({
      where: { domain: normalizedDomain, providerKey: normalizedProviderKey },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
  }
  return state;
}

async function prepareProviderSchedulePermit({
  domain,
  providerKey,
  policyVersion = '1',
  minimumSpacingSeconds,
  rateWindowSeconds,
  maxJobsPerRateWindow,
  now = new Date(),
  transaction
}) {
  if (!transaction) throw new ValidationError('A transaction is required for a provider schedule permit');
  const policy = {
    minimumSpacingSeconds: positiveInteger(minimumSpacingSeconds, 'minimumSpacingSeconds', 3600),
    rateWindowSeconds: positiveInteger(rateWindowSeconds, 'rateWindowSeconds', 86400),
    maxJobsPerRateWindow: positiveInteger(maxJobsPerRateWindow, 'maxJobsPerRateWindow', 100000)
  };
  const state = await lockProviderScheduleState({ domain, providerKey, policyVersion, transaction });
  const existingWindowStartedAt = state.rateWindowStartedAt ? new Date(state.rateWindowStartedAt) : null;
  const windowExpired = !existingWindowStartedAt
    || now.getTime() >= existingWindowStartedAt.getTime() + policy.rateWindowSeconds * 1000;
  const rateWindowStartedAt = windowExpired ? now : existingWindowStartedAt;
  const rateWindowScheduledCount = windowExpired ? 0 : Number(state.rateWindowScheduledCount || 0);
  if (rateWindowScheduledCount >= policy.maxJobsPerRateWindow) {
    return {
      granted: false,
      reason: 'PROVIDER_RATE_WINDOW',
      nextAvailableAt: new Date(rateWindowStartedAt.getTime() + policy.rateWindowSeconds * 1000),
      state,
      policy,
      rateWindowStartedAt,
      rateWindowScheduledCount,
      now,
      policyVersion
    };
  }
  if (state.nextPermitAt && new Date(state.nextPermitAt) > now) {
    return {
      granted: false,
      reason: 'PROVIDER_SPACING',
      nextAvailableAt: new Date(state.nextPermitAt),
      state,
      policy,
      rateWindowStartedAt,
      rateWindowScheduledCount,
      now,
      policyVersion
    };
  }
  return {
    granted: true,
    reason: null,
    nextAvailableAt: now,
    state,
    policy,
    rateWindowStartedAt,
    rateWindowScheduledCount,
    now,
    policyVersion
  };
}

async function finalizeProviderSchedulePermit({
  permit,
  consumed,
  connectionId,
  jobKind,
  workerId,
  metadata = null,
  transaction
}) {
  if (!permit?.granted || !permit.state || !transaction) {
    throw new ValidationError('A granted transactional provider permit is required');
  }
  const increment = consumed ? 1 : 0;
  await permit.state.update({
    nextPermitAt: new Date(permit.now.getTime() + permit.policy.minimumSpacingSeconds * 1000),
    rateWindowStartedAt: permit.rateWindowStartedAt,
    rateWindowScheduledCount: permit.rateWindowScheduledCount + increment,
    lastScheduledAt: permit.now,
    lastConnectionId: connectionId || null,
    lastJobKind: String(jobKind || '').slice(0, 120) || null,
    scheduledCount: Number(permit.state.scheduledCount || 0) + increment,
    metadata: {
      ...(permit.state.metadata || {}),
      ...(metadata || {}),
      policyVersion: String(permit.policyVersion || '1').slice(0, 40),
      minimumSpacingSeconds: permit.policy.minimumSpacingSeconds,
      rateWindowSeconds: permit.policy.rateWindowSeconds,
      maxJobsPerRateWindow: permit.policy.maxJobsPerRateWindow,
      schedulerWorkerId: String(workerId || '').slice(0, 160)
    }
  }, { transaction });
  return permit.state;
}

module.exports = {
  prepareProviderSchedulePermit,
  finalizeProviderSchedulePermit
};
