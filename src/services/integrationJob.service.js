const { Op, UniqueConstraintError } = require('sequelize');
const {
  IntegrationConnection,
  IntegrationEvent,
  IntegrationJob,
  IntegrationSyncRun,
  IntegrationSyncState,
  sequelize
} = require('../models');
const { AppError, ValidationError, NotFoundError } = require('../utils/errors');
const { buildJobScopeKey } = require('./integrationDataFoundation.service');

const boundedInteger = (value, fallback, min, max) => {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new ValidationError(`Expected an integer between ${min} and ${max}`);
  }
  return parsed;
};

const requireKey = (value, fieldName, maxLength) => {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.length > maxLength) throw new ValidationError(`${fieldName} is required`);
  return normalized;
};

async function enqueueIntegrationJob({
  wineryId,
  connectionId = null,
  jobKind,
  jobScopeKey = null,
  resourceType = null,
  streamKey = null,
  payload,
  payloadSchemaVersion = '1',
  idempotencyKey,
  priority = 0,
  scheduledAt = new Date(),
  maxAttempts = 5,
  retryBackoffSeconds = 60,
  syncRunId = null,
  sourceEventId = null,
  replayedFromJobId = null,
  correlationId = null,
  transaction = null
}) {
  const values = {
    wineryId,
    connectionId,
    jobKind: requireKey(jobKind, 'jobKind', 120),
    jobScopeKey: requireKey(
      jobScopeKey || buildJobScopeKey({ connectionId, resourceType, streamKey }),
      'jobScopeKey',
      180
    ),
    resourceType,
    streamKey,
    payloadSchemaVersion: requireKey(payloadSchemaVersion, 'payloadSchemaVersion', 40),
    payload: payload || {},
    idempotencyKey: requireKey(idempotencyKey, 'idempotencyKey', 255),
    priority: boundedInteger(priority, 0, -1000, 1000),
    status: 'PENDING',
    scheduledAt: new Date(scheduledAt),
    maxAttempts: boundedInteger(maxAttempts, 5, 1, 100),
    retryBackoffSeconds: boundedInteger(retryBackoffSeconds, 60, 1, 86400),
    syncRunId,
    sourceEventId,
    replayedFromJobId,
    correlationId
  };
  if (typeof values.payload !== 'object' || Array.isArray(values.payload)) {
    throw new ValidationError('payload must be an object');
  }
  if (Number.isNaN(values.scheduledAt.getTime())) throw new ValidationError('scheduledAt must be a valid date');
  const operation = async activeTransaction => {
    if (connectionId != null) {
      const connection = await IntegrationConnection.findOne({
        where: { id: connectionId, wineryId },
        transaction: activeTransaction
      });
      if (!connection) throw new ValidationError('Integration job connection does not belong to the winery');
    }
    if (connectionId != null && resourceType && streamKey) {
      const syncState = await IntegrationSyncState.findOne({
        where: { wineryId, connectionId, resourceType, streamKey },
        transaction: activeTransaction,
        lock: activeTransaction.LOCK.UPDATE
      });
      if (syncState?.operationalStatus === 'PAUSED') {
        throw new AppError('Integration sync stream is paused.', 409, 'SYNC_STREAM_PAUSED');
      }
    }
    if (syncRunId != null) {
      const run = await IntegrationSyncRun.findOne({
        where: { id: syncRunId, wineryId },
        transaction: activeTransaction
      });
      if (!run || (connectionId != null && run.connectionId !== connectionId)) {
        throw new ValidationError('Integration job sync run is outside its connection scope');
      }
    }
    if (sourceEventId != null) {
      const event = await IntegrationEvent.findOne({
        where: { id: sourceEventId, wineryId },
        transaction: activeTransaction
      });
      if (!event) throw new ValidationError('Integration job source event does not belong to the winery');
    }
    if (replayedFromJobId != null) {
      const sourceJob = await IntegrationJob.findOne({
        where: { id: replayedFromJobId, wineryId },
        transaction: activeTransaction
      });
      if (!sourceJob || (connectionId != null && sourceJob.connectionId !== connectionId)) {
        throw new ValidationError('Integration job replay source is outside its connection scope');
      }
    }
    const duplicateWhere = {
      wineryId,
      jobScopeKey: values.jobScopeKey,
      jobKind: values.jobKind,
      idempotencyKey: values.idempotencyKey
    };
    const existing = await IntegrationJob.findOne({ where: duplicateWhere, transaction: activeTransaction });
    if (existing) return { job: existing, duplicate: true };
    try {
      return { job: await IntegrationJob.create(values, { transaction: activeTransaction }), duplicate: false };
    } catch (error) {
      if (error instanceof UniqueConstraintError || error.name === 'SequelizeUniqueConstraintError') {
        const duplicate = await IntegrationJob.findOne({ where: duplicateWhere, transaction: activeTransaction });
        if (duplicate) return { job: duplicate, duplicate: true };
      }
      throw error;
    }
  };

  if (transaction) return operation(transaction);
  return sequelize.transaction(operation);
}

async function claimDueIntegrationJobs({ workerId, limit = 10, leaseSeconds = 60, now = new Date() }) {
  const owner = requireKey(workerId, 'workerId', 160);
  const batchSize = boundedInteger(limit, 10, 1, 100);
  const leaseDuration = boundedInteger(leaseSeconds, 60, 5, 3600);
  const leaseExpiresAt = new Date(now.getTime() + leaseDuration * 1000);

  return sequelize.transaction(async transaction => {
    const jobs = await IntegrationJob.findAll({
      where: {
        [Op.or]: [
          {
            status: { [Op.in]: ['PENDING', 'RETRY'] },
            scheduledAt: { [Op.lte]: now },
            [Op.or]: [{ nextAttemptAt: null }, { nextAttemptAt: { [Op.lte]: now } }]
          },
          { status: 'RUNNING', leaseExpiresAt: { [Op.lte]: now } }
        ]
      },
      order: [['priority', 'DESC'], ['scheduledAt', 'ASC'], ['id', 'ASC']],
      limit: batchSize,
      transaction,
      lock: transaction.LOCK.UPDATE,
      skipLocked: sequelize.getDialect() !== 'sqlite'
    });
    const claimed = [];
    for (const job of jobs) {
      if (Number(job.attemptCount || 0) >= Number(job.maxAttempts)) {
        await job.update({
          status: 'FAILED',
          completedAt: now,
          deadLetteredAt: now,
          leaseOwner: null,
          leaseExpiresAt: null,
          lastErrorCode: job.lastErrorCode || 'MAX_ATTEMPTS_EXHAUSTED',
          lastErrorSummary: job.lastErrorSummary || 'Integration job exhausted its retry budget.'
        }, { transaction });
        continue;
      }
      await job.update({
        status: 'RUNNING',
        leaseOwner: owner,
        leaseExpiresAt,
        attemptCount: Number(job.attemptCount || 0) + 1,
        startedAt: job.startedAt || now,
        lastErrorCode: null,
        lastErrorSummary: null
      }, { transaction });
      claimed.push(job);
    }
    return claimed;
  });
}

async function renewIntegrationJobLease({
  jobId,
  wineryId,
  workerId,
  leaseSeconds = 60,
  now = new Date()
}) {
  const owner = requireKey(workerId, 'workerId', 160);
  const leaseDuration = boundedInteger(leaseSeconds, 60, 5, 3600);
  const leaseExpiresAt = new Date(now.getTime() + leaseDuration * 1000);
  const [updated] = await IntegrationJob.update({ leaseExpiresAt }, {
    where: { id: jobId, wineryId, status: 'RUNNING', leaseOwner: owner }
  });
  if (updated !== 1) throw new NotFoundError('Claimed integration job was not found');
  return leaseExpiresAt;
}

async function completeIntegrationJob({ jobId, wineryId, workerId, result = null, completedAt = new Date() }) {
  const [updated] = await IntegrationJob.update({
    status: 'SUCCEEDED',
    result,
    completedAt,
    leaseOwner: null,
    leaseExpiresAt: null,
    nextAttemptAt: null
  }, { where: { id: jobId, wineryId, status: 'RUNNING', leaseOwner: workerId } });
  if (updated !== 1) throw new NotFoundError('Claimed integration job was not found');
  return IntegrationJob.findByPk(jobId);
}

async function failIntegrationJob({
  jobId,
  wineryId,
  workerId,
  errorCode = 'JOB_FAILED',
  errorSummary,
  permanent = false,
  now = new Date()
}) {
  return sequelize.transaction(async transaction => {
    const job = await IntegrationJob.findOne({
      where: { id: jobId, wineryId, status: 'RUNNING', leaseOwner: workerId },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!job) throw new NotFoundError('Claimed integration job was not found');
    const exhausted = permanent || Number(job.attemptCount) >= Number(job.maxAttempts);
    const backoffSeconds = Math.min(86400, Number(job.retryBackoffSeconds) * (2 ** Math.max(0, Number(job.attemptCount) - 1)));
    const nextAttemptAt = exhausted ? null : new Date(now.getTime() + backoffSeconds * 1000);
    await job.update({
      status: exhausted ? 'FAILED' : 'RETRY',
      scheduledAt: nextAttemptAt || job.scheduledAt,
      nextAttemptAt,
      completedAt: exhausted ? now : null,
      deadLetteredAt: exhausted ? now : null,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastErrorCode: requireKey(errorCode, 'errorCode', 120),
      lastErrorSummary: String(errorSummary || 'Integration job failed').slice(0, 4000)
    }, { transaction });
    return job;
  });
}

module.exports = {
  enqueueIntegrationJob,
  claimDueIntegrationJobs,
  renewIntegrationJobLease,
  completeIntegrationJob,
  failIntegrationJob
};
