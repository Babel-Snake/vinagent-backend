const { Op } = require('sequelize');
const {
  IntegrationConnection,
  IntegrationConnectionCapability,
  IntegrationDomainActivation,
  IntegrationJob,
  IntegrationSyncRun,
  IntegrationSyncState,
  sequelize
} = require('../models');
const integrationJobService = require('./integrationJob.service');
const integrationProviderScheduleService = require('./integrationProviderSchedule.service');
const {
  BOOKING_INCREMENTAL_JOB_KIND,
  BOOKING_RECONCILE_JOB_KIND,
  BOOKING_READ_CAPABILITY,
  prepareBookingPollRun
} = require('./bookingShadowSync.service');
const {
  POLICY_VERSION,
  getBookingSyncSchedulerConfig,
  resolveBookingProviderSchedulePolicy
} = require('./bookingSyncSchedulerConfig.service');

const BOOKING_LIVE_EVENT_CAPABILITY = 'bookings.canonical.events.live';
const ACTIVE_JOB_STATUSES = Object.freeze(['PENDING', 'RETRY', 'RUNNING']);
const SCHEDULED_JOB_KINDS = Object.freeze([BOOKING_INCREMENTAL_JOB_KIND, BOOKING_RECONCILE_JOB_KIND]);

function dueStateWhere(now) {
  return {
    resourceType: 'BOOKING',
    operationalStatus: 'ACTIVE',
    initialBackfillStatus: 'COMPLETE',
    watermarkAt: { [Op.not]: null },
    [Op.or]: [
      { nextScheduledAt: null },
      { nextScheduledAt: { [Op.lte]: now } }
    ]
  };
}

function eligibleConnectionInclude() {
  return [{
    model: IntegrationConnection,
    as: 'Connection',
    attributes: ['id', 'providerKey', 'status'],
    where: { status: 'CONNECTED' },
    required: true,
    include: [{
      model: IntegrationDomainActivation,
      as: 'DomainActivations',
      attributes: ['id'],
      where: { domain: 'BOOKING', status: 'ACTIVE' },
      required: true
    }]
  }];
}

function bookingWindow(now, config) {
  return {
    from: new Date(now.getTime() - config.lookbackHours * 3600000).toISOString(),
    to: new Date(now.getTime() + config.horizonHours * 3600000).toISOString(),
    maxPages: config.maxPages,
    overlapMinutes: config.overlapMinutes
  };
}

function scheduleSlot(now, intervalSeconds) {
  return Math.floor(now.getTime() / (intervalSeconds * 1000));
}

function nextIncrementalAt(now, policy) {
  return new Date(now.getTime() + policy.incrementalIntervalSeconds * 1000);
}

async function hasPollingCapabilities({ syncState, transaction }) {
  const count = await IntegrationConnectionCapability.count({
    where: {
      wineryId: syncState.wineryId,
      connectionId: syncState.connectionId,
      capabilityKey: { [Op.in]: [BOOKING_READ_CAPABILITY, BOOKING_LIVE_EVENT_CAPABILITY] },
      enabled: true,
      availabilityStatus: 'AVAILABLE',
      supportsPolling: true
    },
    transaction
  });
  return count === 2;
}

async function latestSuccessfulReconciliation({ syncState, transaction }) {
  return IntegrationSyncRun.findOne({
    where: {
      wineryId: syncState.wineryId,
      connectionId: syncState.connectionId,
      syncStateId: syncState.id,
      resourceType: 'BOOKING',
      streamKey: syncState.streamKey,
      mode: 'RECONCILIATION',
      status: 'SUCCEEDED'
    },
    order: [['completedAt', 'DESC'], ['id', 'DESC']],
    transaction
  });
}

function isReconciliationDue({ activation, lastReconciliation, policy, now }) {
  const activationTime = new Date(activation.activatedAt).getTime();
  const lastCompletionTime = lastReconciliation?.completedAt
    ? new Date(lastReconciliation.completedAt).getTime()
    : 0;
  const anchor = Math.max(activationTime, lastCompletionTime);
  return now.getTime() >= anchor + policy.reconciliationIntervalSeconds * 1000;
}

async function scheduleState({
  syncStateId,
  now,
  workerId,
  config,
  jobService
}) {
  return sequelize.transaction(async transaction => {
    const syncState = await IntegrationSyncState.findByPk(syncStateId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!syncState || syncState.resourceType !== 'BOOKING'
      || syncState.operationalStatus !== 'ACTIVE'
      || syncState.initialBackfillStatus !== 'COMPLETE' || !syncState.watermarkAt
      || (syncState.nextScheduledAt && new Date(syncState.nextScheduledAt) > now)) {
      return { syncStateId, status: 'SKIPPED_NOT_DUE' };
    }
    const connection = await IntegrationConnection.findOne({
      where: { id: syncState.connectionId, wineryId: syncState.wineryId, status: 'CONNECTED' },
      attributes: ['id', 'providerKey'],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!connection) return { syncStateId, status: 'SKIPPED_CONNECTION' };
    const providerKey = String(connection.providerKey).toLowerCase();
    const policy = resolveBookingProviderSchedulePolicy(config, providerKey);
    const activation = await IntegrationDomainActivation.findOne({
      where: {
        wineryId: syncState.wineryId,
        connectionId: syncState.connectionId,
        domain: 'BOOKING',
        status: 'ACTIVE'
      },
      order: [['activatedAt', 'DESC']],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!activation || !(await hasPollingCapabilities({ syncState, transaction }))) {
      return { syncStateId, providerKey, status: 'SKIPPED_NOT_ACTIVATED' };
    }
    const outstanding = await IntegrationJob.findOne({
      where: {
        wineryId: syncState.wineryId,
        connectionId: syncState.connectionId,
        resourceType: 'BOOKING',
        streamKey: syncState.streamKey,
        jobKind: { [Op.in]: SCHEDULED_JOB_KINDS },
        status: { [Op.in]: ACTIVE_JOB_STATUSES }
      },
      attributes: ['id', 'jobKind', 'status'],
      transaction
    });
    if (outstanding) {
      await syncState.update({ nextScheduledAt: nextIncrementalAt(now, policy) }, { transaction });
      return {
        syncStateId,
        providerKey,
        status: 'SKIPPED_OUTSTANDING_JOB',
        outstandingJobId: outstanding.id
      };
    }
    const providerPermit = await integrationProviderScheduleService.prepareProviderSchedulePermit({
      domain: 'BOOKING',
      providerKey,
      policyVersion: POLICY_VERSION,
      minimumSpacingSeconds: policy.minimumSpacingSeconds,
      rateWindowSeconds: policy.rateWindowSeconds,
      maxJobsPerRateWindow: policy.maxJobsPerRateWindow,
      now,
      transaction
    });
    if (!providerPermit.granted && providerPermit.reason === 'PROVIDER_RATE_WINDOW') {
      await syncState.update({ nextScheduledAt: providerPermit.nextAvailableAt }, { transaction });
      return {
        syncStateId,
        providerKey,
        status: 'SKIPPED_PROVIDER_RATE_WINDOW',
        nextRateWindowAt: providerPermit.nextAvailableAt
      };
    }
    if (!providerPermit.granted && providerPermit.reason === 'PROVIDER_SPACING') {
      await syncState.update({ nextScheduledAt: providerPermit.nextAvailableAt }, { transaction });
      return {
        syncStateId,
        providerKey,
        status: 'SKIPPED_PROVIDER_SPACING',
        nextPermitAt: providerPermit.nextAvailableAt
      };
    }
    const lastReconciliation = await latestSuccessfulReconciliation({ syncState, transaction });
    const mode = isReconciliationDue({ activation, lastReconciliation, policy, now })
      ? 'RECONCILIATION'
      : 'INCREMENTAL';
    const prepared = await prepareBookingPollRun({
      wineryId: syncState.wineryId,
      connectionId: syncState.connectionId,
      data: bookingWindow(now, config),
      mode,
      transaction
    });
    const intervalSeconds = mode === 'RECONCILIATION'
      ? policy.reconciliationIntervalSeconds
      : policy.incrementalIntervalSeconds;
    const jobKind = mode === 'RECONCILIATION' ? BOOKING_RECONCILE_JOB_KIND : BOOKING_INCREMENTAL_JOB_KIND;
    const idempotencyKey = [
      'booking-scheduler',
      POLICY_VERSION,
      mode.toLowerCase(),
      syncState.id,
      activation.id,
      scheduleSlot(now, intervalSeconds)
    ].join(':');
    const enqueued = await jobService.enqueueIntegrationJob({
      wineryId: syncState.wineryId,
      connectionId: syncState.connectionId,
      jobKind,
      resourceType: 'BOOKING',
      streamKey: prepared.streamKey,
      payload: {
        ...prepared.payload,
        scheduler: {
          policyVersion: POLICY_VERSION,
          scheduledAt: now.toISOString(),
          providerKey
        }
      },
      idempotencyKey,
      priority: mode === 'RECONCILIATION' ? 10 : 20,
      scheduledAt: now,
      maxAttempts: config.maxAttempts,
      retryBackoffSeconds: config.retryBackoffSeconds,
      correlationId: `booking-scheduler:${syncState.id}:${now.toISOString()}`,
      transaction
    });
    const scheduledNextAt = nextIncrementalAt(now, policy);
    await syncState.update({
      nextScheduledAt: scheduledNextAt,
      statistics: {
        ...(syncState.statistics || {}),
        scheduling: {
          policyVersion: POLICY_VERSION,
          lastScheduledAt: now.toISOString(),
          lastScheduledMode: mode,
          nextScheduledAt: scheduledNextAt.toISOString()
        }
      }
    }, { transaction });
    await integrationProviderScheduleService.finalizeProviderSchedulePermit({
      permit: providerPermit,
      consumed: !enqueued.duplicate,
      connectionId: syncState.connectionId,
      jobKind,
      workerId,
      metadata: { scheduler: 'booking' },
      transaction
    });
    return {
      syncStateId,
      connectionId: syncState.connectionId,
      providerKey,
      mode,
      status: enqueued.duplicate ? 'DUPLICATE' : 'SCHEDULED',
      jobId: enqueued.job.id,
      nextScheduledAt: scheduledNextAt
    };
  });
}

async function recordSchedulingFailure({ syncStateId, now, config, error }) {
  const syncState = await IntegrationSyncState.findByPk(syncStateId);
  if (!syncState) return;
  const retryAt = new Date(now.getTime() + config.defaults.incrementalIntervalSeconds * 1000);
  await syncState.update({
    nextScheduledAt: retryAt,
    consecutiveFailures: Number(syncState.consecutiveFailures || 0) + 1,
    lastErrorCode: String(error.code || 'BOOKING_SCHEDULING_FAILED').slice(0, 120),
    lastErrorSummary: 'Automatic booking sync scheduling failed.',
    lastErrorAt: now
  });
}

async function scheduleDueBookingSyncs({
  workerId,
  now = new Date(),
  config = getBookingSyncSchedulerConfig(),
  jobService = integrationJobService
} = {}) {
  if (!config.enabled) return { enabled: false, examined: 0, scheduled: 0, results: [] };
  const candidates = await IntegrationSyncState.findAll({
    where: dueStateWhere(now),
    include: eligibleConnectionInclude(),
    attributes: ['id'],
    order: [['nextScheduledAt', 'ASC'], ['id', 'ASC']],
    limit: Math.min(500, config.batchSize * 5),
    subQuery: false
  });
  const results = [];
  for (const candidate of candidates) {
    if (results.filter(result => result.status === 'SCHEDULED').length >= config.batchSize) break;
    try {
      results.push(await scheduleState({
        syncStateId: candidate.id,
        now,
        workerId,
        config,
        jobService
      }));
    } catch (error) {
      await recordSchedulingFailure({
        syncStateId: candidate.id,
        now,
        config,
        error
      }).catch(() => {});
      results.push({
        syncStateId: candidate.id,
        status: 'FAILED',
        errorCode: String(error.code || 'BOOKING_SCHEDULING_FAILED').slice(0, 120)
      });
    }
  }
  return {
    enabled: true,
    examined: results.length,
    scheduled: results.filter(result => result.status === 'SCHEDULED').length,
    duplicates: results.filter(result => result.status === 'DUPLICATE').length,
    failed: results.filter(result => result.status === 'FAILED').length,
    results
  };
}

async function getBookingSyncSchedulerStatus({ wineryId, now = new Date(), config }) {
  const [eligibleStreams, dueStreams, degradedStreams, outstandingJobs] = await Promise.all([
    IntegrationSyncState.count({
      where: {
        wineryId,
        resourceType: 'BOOKING',
        operationalStatus: 'ACTIVE',
        initialBackfillStatus: 'COMPLETE',
        watermarkAt: { [Op.not]: null }
      },
      include: eligibleConnectionInclude(),
      distinct: true,
      col: 'id'
    }),
    IntegrationSyncState.count({
      where: { wineryId, ...dueStateWhere(now) },
      include: eligibleConnectionInclude(),
      distinct: true,
      col: 'id'
    }),
    IntegrationSyncState.count({
      where: {
        wineryId,
        resourceType: 'BOOKING',
        operationalStatus: 'ACTIVE',
        consecutiveFailures: { [Op.gt]: 0 }
      }
    }),
    IntegrationJob.count({
      where: {
        wineryId,
        resourceType: 'BOOKING',
        jobKind: { [Op.in]: SCHEDULED_JOB_KINDS },
        status: { [Op.in]: ACTIVE_JOB_STATUSES }
      }
    })
  ]);
  const pausedStreams = await IntegrationSyncState.count({
    where: { wineryId, resourceType: 'BOOKING', operationalStatus: 'PAUSED' }
  });
  return {
    enabled: Boolean(config?.enabled),
    policyVersion: POLICY_VERSION,
    eligibleStreams,
    dueStreams,
    degradedStreams,
    pausedStreams,
    outstandingJobs,
    defaultPolicy: config?.defaults || null,
    providerPolicyKeys: Object.keys(config?.providerPolicies || {}).sort()
  };
}

module.exports = {
  ACTIVE_JOB_STATUSES,
  SCHEDULED_JOB_KINDS,
  bookingWindow,
  scheduleDueBookingSyncs,
  getBookingSyncSchedulerStatus
};
