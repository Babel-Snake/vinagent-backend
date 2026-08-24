const { Op } = require('sequelize');
const { IntegrationJob, sequelize } = require('../models');
const integrationJobService = require('./integrationJob.service');
const integrationProviderScheduleService = require('./integrationProviderSchedule.service');
const {
  BOOKING_INCREMENTAL_JOB_KIND,
  BOOKING_RECONCILE_JOB_KIND,
  prepareBookingPollRun
} = require('./bookingShadowSync.service');
const { bookingWindow } = require('./bookingSyncScheduler.service');
const {
  POLICY_VERSION,
  getBookingSyncSchedulerConfig,
  resolveBookingProviderSchedulePolicy
} = require('./bookingSyncSchedulerConfig.service');
const { createIntegrationWebhookRecoveryRegistry } = require('./integrationWebhookRecoveryRegistry.service');

const ACTIVE_RECOVERY_TARGET_STATUSES = Object.freeze(['PENDING', 'RETRY', 'RUNNING']);

class ProviderWebhookRecoveryDeferredError extends Error {
  constructor(reason) {
    super('Provider webhook recovery is waiting for an available provider read slot.');
    this.name = 'ProviderWebhookRecoveryDeferredError';
    this.code = `PROVIDER_WEBHOOK_RECOVERY_${reason}`.slice(0, 120);
    this.permanent = false;
  }
}

async function dispatchBookingWebhookRecovery({
  event,
  connection,
  workerId,
  now = new Date(),
  env = process.env,
  jobService = integrationJobService,
  scheduleService = integrationProviderScheduleService
}) {
  const config = getBookingSyncSchedulerConfig(env);
  const policy = resolveBookingProviderSchedulePolicy(config, connection.providerKey);
  return sequelize.transaction(async transaction => {
    const prepared = await prepareBookingPollRun({
      wineryId: connection.wineryId,
      connectionId: connection.id,
      data: bookingWindow(now, config),
      mode: 'INCREMENTAL',
      env,
      transaction
    });
    const outstanding = await IntegrationJob.findOne({
      where: {
        wineryId: connection.wineryId,
        connectionId: connection.id,
        resourceType: 'BOOKING',
        streamKey: prepared.streamKey,
        jobKind: { [Op.in]: [BOOKING_INCREMENTAL_JOB_KIND, BOOKING_RECONCILE_JOB_KIND] },
        status: { [Op.in]: ACTIVE_RECOVERY_TARGET_STATUSES }
      },
      order: [['priority', 'DESC'], ['id', 'ASC']],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (outstanding) {
      return { domain: 'BOOKING', status: 'COALESCED', jobId: outstanding.id };
    }
    const permit = await scheduleService.prepareProviderSchedulePermit({
      domain: 'BOOKING',
      providerKey: connection.providerKey,
      policyVersion: POLICY_VERSION,
      minimumSpacingSeconds: policy.minimumSpacingSeconds,
      rateWindowSeconds: policy.rateWindowSeconds,
      maxJobsPerRateWindow: policy.maxJobsPerRateWindow,
      now,
      transaction
    });
    if (!permit.granted) throw new ProviderWebhookRecoveryDeferredError(permit.reason);
    const enqueued = await jobService.enqueueIntegrationJob({
      wineryId: connection.wineryId,
      connectionId: connection.id,
      jobKind: BOOKING_INCREMENTAL_JOB_KIND,
      resourceType: 'BOOKING',
      streamKey: prepared.streamKey,
      payload: {
        ...prepared.payload,
        webhookRecovery: {
          sourceEventId: event.id,
          externalEventId: event.externalEventId,
          receivedAt: new Date(event.receivedAt).toISOString()
        }
      },
      idempotencyKey: `provider-webhook-recovery:${event.id}`,
      priority: 50,
      scheduledAt: now,
      maxAttempts: config.maxAttempts,
      retryBackoffSeconds: config.retryBackoffSeconds,
      sourceEventId: event.id,
      correlationId: event.correlationId || `provider-webhook:${event.id}`,
      transaction
    });
    await scheduleService.finalizeProviderSchedulePermit({
      permit,
      consumed: !enqueued.duplicate,
      connectionId: connection.id,
      jobKind: BOOKING_INCREMENTAL_JOB_KIND,
      workerId,
      metadata: { scheduler: 'provider-webhook-recovery' },
      transaction
    });
    return {
      domain: 'BOOKING',
      status: enqueued.duplicate ? 'DUPLICATE' : 'SCHEDULED',
      jobId: enqueued.job.id
    };
  });
}

function createConfiguredIntegrationWebhookRecoveryRegistry(options = {}) {
  const registry = createIntegrationWebhookRecoveryRegistry();
  registry.register('BOOKING', context => dispatchBookingWebhookRecovery({ ...context, ...options }));
  return registry;
}

const configuredRegistry = createConfiguredIntegrationWebhookRecoveryRegistry();

module.exports = {
  ACTIVE_RECOVERY_TARGET_STATUSES,
  ProviderWebhookRecoveryDeferredError,
  dispatchBookingWebhookRecovery,
  createConfiguredIntegrationWebhookRecoveryRegistry,
  has: configuredRegistry.has,
  list: configuredRegistry.list,
  dispatch: configuredRegistry.dispatch
};
