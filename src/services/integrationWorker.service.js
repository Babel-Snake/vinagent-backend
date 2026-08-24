const os = require('os');
const logger = require('../config/logger');
const integrationJobService = require('./integrationJob.service');
const canonicalEventOutboxService = require('./canonicalEventOutbox.service');
const defaultHandlerRegistry = require('./integrationJobHandlerRegistry.service');
const defaultSchedulerRegistry = require('./integrationSchedulers.service');

const positiveInteger = (value, fallback, min, max) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
};

function getIntegrationWorkerConfig(env = process.env, schedulerRegistry = defaultSchedulerRegistry) {
  return {
    enabled: env.INTEGRATION_WORKER_ENABLED === 'true',
    workerId: String(env.INTEGRATION_WORKER_ID || `${os.hostname()}:${process.pid}`).slice(0, 160),
    intervalMs: positiveInteger(env.INTEGRATION_WORKER_INTERVAL_MS, 5000, 1000, 300000),
    jobBatchSize: positiveInteger(env.INTEGRATION_WORKER_JOB_BATCH_SIZE, 10, 1, 100),
    outboxBatchSize: positiveInteger(env.INTEGRATION_WORKER_OUTBOX_BATCH_SIZE, 20, 1, 100),
    leaseSeconds: positiveInteger(env.INTEGRATION_WORKER_LEASE_SECONDS, 60, 5, 3600),
    runImmediately: env.INTEGRATION_WORKER_RUN_IMMEDIATELY !== 'false',
    schedulerConfigs: schedulerRegistry.getConfigs(env)
  };
}

function startJobLeaseHeartbeat({ job, workerId, leaseSeconds, jobService }) {
  if (typeof jobService.renewIntegrationJobLease !== 'function') {
    return { renewNow: async () => {}, stop: async () => {} };
  }
  const intervalMs = Math.max(1000, Math.floor(leaseSeconds * 1000 / 3));
  let renewal = Promise.resolve();
  let renewalError = null;
  let stopPromise = null;
  const renewNow = () => {
    renewal = renewal
      .then(() => jobService.renewIntegrationJobLease({
        jobId: job.id,
        wineryId: job.wineryId,
        workerId,
        leaseSeconds
      }))
      .catch(error => { renewalError = renewalError || error; });
    return renewal.then(() => {
      if (renewalError) throw renewalError;
    });
  };
  const timer = setInterval(() => { renewNow().catch(() => {}); }, intervalMs);
  timer.unref?.();
  return {
    renewNow,
    stop() {
      if (!stopPromise) {
        clearInterval(timer);
        stopPromise = renewal.then(() => {
          if (renewalError) throw renewalError;
        });
      }
      return stopPromise;
    }
  };
}

async function runIntegrationWorkerCycle({
  workerId,
  jobBatchSize = 10,
  outboxBatchSize = 20,
  leaseSeconds = 60,
  jobService = integrationJobService,
  outboxService = canonicalEventOutboxService,
  handlerRegistry = defaultHandlerRegistry,
  schedulerRegistry = defaultSchedulerRegistry,
  schedulerConfigs = {}
}) {
  const schedulingResult = await schedulerRegistry.scheduleDue({
    workerId,
    configs: schedulerConfigs,
    jobService
  });
  const jobs = await jobService.claimDueIntegrationJobs({
    workerId,
    limit: jobBatchSize,
    leaseSeconds
  });
  const jobResults = [];
  const heartbeats = new Map(jobs.map(job => [
    job.id,
    startJobLeaseHeartbeat({ job, workerId, leaseSeconds, jobService })
  ]));
  try {
    for (const job of jobs) {
      const heartbeat = heartbeats.get(job.id);
      let result;
      let executionError = null;
      try {
        await heartbeat.renewNow();
        result = await handlerRegistry.execute(job, { workerId, leaseSeconds });
      } catch (error) {
        executionError = error;
      }
      try {
        await heartbeat.stop();
      } catch (error) {
        executionError = executionError || error;
      }
      if (!executionError) {
        await jobService.completeIntegrationJob({
          jobId: job.id,
          wineryId: job.wineryId,
          workerId,
          result: result == null ? null : result
        });
        jobResults.push({ jobId: job.id, jobKind: job.jobKind, status: 'SUCCEEDED' });
      } else {
        const failed = await jobService.failIntegrationJob({
          jobId: job.id,
          wineryId: job.wineryId,
          workerId,
          errorCode: executionError.code || 'JOB_HANDLER_FAILED',
          errorSummary: executionError.message,
          permanent: executionError.permanent === true
        });
        jobResults.push({
          jobId: job.id,
          jobKind: job.jobKind,
          status: failed.status,
          errorCode: executionError.code || 'JOB_HANDLER_FAILED'
        });
      }
    }
  } finally {
    await Promise.allSettled([...heartbeats.values()].map(heartbeat => heartbeat.stop()));
  }

  const outboxResults = await outboxService.dispatchCanonicalOutboxBatch({
    workerId,
    limit: outboxBatchSize,
    leaseSeconds
  });
  return { schedulingResult, jobResults, outboxResults };
}

function startIntegrationWorkerLoop(options = {}) {
  const schedulerRegistry = options.schedulerRegistry || defaultSchedulerRegistry;
  const config = { ...getIntegrationWorkerConfig(options.env, schedulerRegistry), ...options.config };
  if (!config.enabled) {
    logger.info('Integration worker disabled.');
    return null;
  }
  let timer = null;
  let activeCycle = null;
  let stopping = false;

  const run = async () => {
    if (stopping || activeCycle) return null;
    activeCycle = runIntegrationWorkerCycle({
      workerId: config.workerId,
      jobBatchSize: config.jobBatchSize,
      outboxBatchSize: config.outboxBatchSize,
      leaseSeconds: config.leaseSeconds,
      jobService: options.jobService,
      outboxService: options.outboxService,
      handlerRegistry: options.handlerRegistry,
      schedulerRegistry,
      schedulerConfigs: config.schedulerConfigs
    });
    try {
      const result = await activeCycle;
      const jobFailures = result.jobResults.filter(item => !['SUCCEEDED'].includes(item.status)).length;
      const outboxFailures = result.outboxResults.filter(item => item.status !== 'DELIVERED').length;
      if (result.schedulingResult.scheduled > 0 || result.schedulingResult.failed > 0
        || result.jobResults.length > 0 || result.outboxResults.length > 0) {
        logger.info('Integration worker cycle complete.', {
          syncsScheduled: result.schedulingResult.scheduled,
          schedulingFailures: result.schedulingResult.failed || 0,
          schedulerFailures: result.schedulingResult.schedulerFailures || 0,
          schedulerDomains: result.schedulingResult.domains.map(item => item.domain),
          jobs: result.jobResults.length,
          jobFailures,
          outbox: result.outboxResults.length,
          outboxFailures
        });
      }
      return result;
    } catch (error) {
      logger.error('Integration worker cycle failed.', {
        code: error.code || null,
        error: error.message
      });
      return null;
    } finally {
      activeCycle = null;
    }
  };

  timer = setInterval(run, config.intervalMs);
  if (config.runImmediately) setImmediate(run);
  logger.info('Integration worker started.', {
    workerId: config.workerId,
    intervalMs: config.intervalMs,
    jobBatchSize: config.jobBatchSize,
    outboxBatchSize: config.outboxBatchSize,
    registeredSchedulerDomains: schedulerRegistry.list().map(item => item.domain),
    enabledSchedulerDomains: schedulerRegistry.list()
      .filter(item => config.schedulerConfigs[item.configKey]?.enabled)
      .map(item => item.domain),
    registeredJobKinds: (options.handlerRegistry || defaultHandlerRegistry).list()
  });

  return {
    config,
    run,
    async stop() {
      if (stopping) return;
      stopping = true;
      clearInterval(timer);
      if (activeCycle) await activeCycle;
    }
  };
}

module.exports = {
  getIntegrationWorkerConfig,
  startJobLeaseHeartbeat,
  runIntegrationWorkerCycle,
  startIntegrationWorkerLoop
};
