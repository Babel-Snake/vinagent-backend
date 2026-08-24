const { Op } = require('sequelize');
const {
  CanonicalEventOutbox,
  IntegrationConnection,
  IntegrationJob,
  IntegrationOperationAuditEvent,
  IntegrationSyncState,
  User,
  sequelize
} = require('../models');
const { AppError, NotFoundError, ValidationError } = require('../utils/errors');
const integrationJobService = require('./integrationJob.service');

const ACTIVE_JOB_STATUSES = Object.freeze(['PENDING', 'RETRY', 'RUNNING']);
const REPLAYABLE_JOB_STATUSES = Object.freeze(['FAILED', 'CANCELLED', 'SUCCEEDED']);

const pageResult = (result, page, pageSize, key) => ({
  [key]: result.rows,
  pagination: {
    page,
    pageSize,
    total: result.count,
    totalPages: Math.ceil(result.count / pageSize)
  }
});

const snapshotSyncState = state => ({
  id: state.id,
  connectionId: state.connectionId,
  resourceType: state.resourceType,
  streamKey: state.streamKey,
  operationalStatus: state.operationalStatus,
  initialBackfillStatus: state.initialBackfillStatus,
  nextScheduledAt: state.nextScheduledAt,
  pausedAt: state.pausedAt,
  pausedBy: state.pausedBy,
  pauseReason: state.pauseReason
});

const snapshotJob = job => ({
  id: job.id,
  connectionId: job.connectionId,
  jobKind: job.jobKind,
  jobScopeKey: job.jobScopeKey,
  resourceType: job.resourceType,
  streamKey: job.streamKey,
  status: job.status,
  attemptCount: job.attemptCount,
  maxAttempts: job.maxAttempts,
  scheduledAt: job.scheduledAt,
  nextAttemptAt: job.nextAttemptAt,
  deadLetteredAt: job.deadLetteredAt,
  replayedFromJobId: job.replayedFromJobId,
  cancelledAt: job.cancelledAt,
  cancelledBy: job.cancelledBy,
  cancellationReason: job.cancellationReason,
  lastErrorCode: job.lastErrorCode,
  lastErrorSummary: job.lastErrorSummary
});

const snapshotOutbox = entry => ({
  id: entry.id,
  eventId: entry.eventId,
  aggregateType: entry.aggregateType,
  aggregateId: entry.aggregateId,
  aggregateRevision: entry.aggregateRevision,
  status: entry.status,
  availableAt: entry.availableAt,
  attemptCount: entry.attemptCount,
  maxAttempts: entry.maxAttempts,
  deadLetteredAt: entry.deadLetteredAt,
  replayCount: entry.replayCount,
  lastReplayedAt: entry.lastReplayedAt,
  lastErrorCode: entry.lastErrorCode,
  lastErrorSummary: entry.lastErrorSummary
});

const auditWhere = ({ wineryId, action, requestId }) => ({ wineryId, action, requestId });

async function existingOperation({ wineryId, action, requestId, transaction }) {
  return IntegrationOperationAuditEvent.findOne({
    where: auditWhere({ wineryId, action, requestId }),
    transaction
  });
}

async function recordOperation({
  wineryId,
  actorUserId,
  action,
  targetType,
  targetId,
  connectionId = null,
  resourceType = null,
  streamKey = null,
  requestId,
  reason,
  beforeSnapshot,
  afterSnapshot,
  metadata = null,
  transaction
}) {
  return IntegrationOperationAuditEvent.create({
    wineryId,
    actorUserId,
    action,
    targetType,
    targetId: String(targetId),
    connectionId,
    resourceType,
    streamKey,
    requestId,
    reason,
    beforeSnapshot,
    afterSnapshot,
    metadata
  }, { transaction });
}

async function loadSyncState({ wineryId, syncStateId, transaction, lock = false }) {
  const state = await IntegrationSyncState.findOne({
    where: { id: syncStateId, wineryId },
    transaction,
    ...(lock ? { lock: transaction.LOCK.UPDATE } : {})
  });
  if (!state) throw new NotFoundError('Integration sync stream not found');
  return state;
}

async function listSyncStreams({
  wineryId,
  page = 1,
  pageSize = 25,
  connectionId,
  resourceType,
  operationalStatus = 'ALL'
}) {
  const where = { wineryId };
  if (connectionId) where.connectionId = connectionId;
  if (resourceType && resourceType !== 'ALL') where.resourceType = resourceType;
  if (operationalStatus !== 'ALL') where.operationalStatus = operationalStatus;
  const result = await IntegrationSyncState.findAndCountAll({
    where,
    include: [
      {
        model: IntegrationConnection,
        as: 'Connection',
        attributes: ['id', 'connectionKey', 'providerKey', 'displayName', 'status']
      },
      {
        model: User,
        as: 'PausedBy',
        attributes: ['id', 'displayName', 'email', 'role'],
        required: false
      }
    ],
    order: [['updatedAt', 'DESC'], ['id', 'DESC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
    distinct: true
  });
  result.rows = result.rows.map(record => {
    const plain = record.toJSON();
    return {
      ...snapshotSyncState(plain),
      watermarkAt: plain.watermarkAt,
      lastSuccessfulSyncAt: plain.lastSuccessfulSyncAt,
      consecutiveFailures: plain.consecutiveFailures,
      lastErrorCode: plain.lastErrorCode,
      lastErrorSummary: plain.lastErrorSummary,
      lastErrorAt: plain.lastErrorAt,
      createdAt: plain.createdAt,
      updatedAt: plain.updatedAt,
      Connection: plain.Connection,
      PausedBy: plain.PausedBy
    };
  });
  return pageResult(result, page, pageSize, 'syncStreams');
}

async function pauseSyncStream({ wineryId, syncStateId, actorUserId, requestId, reason }) {
  return sequelize.transaction(async transaction => {
    const priorAudit = await existingOperation({
      wineryId,
      action: 'SYNC_STREAM_PAUSED',
      requestId,
      transaction
    });
    if (priorAudit) {
      if (Number(priorAudit.targetId) !== Number(syncStateId)) {
        throw new ValidationError('requestId was already used for another sync stream');
      }
      return {
        syncStream: await loadSyncState({ wineryId, syncStateId, transaction }),
        cancelledJobIds: priorAudit.metadata?.cancelledJobIds || [],
        duplicate: true
      };
    }
    const state = await loadSyncState({ wineryId, syncStateId, transaction, lock: true });
    if (state.operationalStatus === 'PAUSED') {
      throw new AppError('Integration sync stream is already paused.', 409, 'SYNC_STREAM_ALREADY_PAUSED');
    }
    const runningJob = await IntegrationJob.findOne({
      where: {
        wineryId,
        connectionId: state.connectionId,
        resourceType: state.resourceType,
        streamKey: state.streamKey,
        status: 'RUNNING'
      },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (runningJob) {
      throw new AppError(
        'A job is currently running for this stream; pause it after the active job completes.',
        409,
        'SYNC_STREAM_JOB_RUNNING'
      );
    }
    const queuedJobs = await IntegrationJob.findAll({
      where: {
        wineryId,
        connectionId: state.connectionId,
        resourceType: state.resourceType,
        streamKey: state.streamKey,
        status: { [Op.in]: ['PENDING', 'RETRY'] }
      },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    const now = new Date();
    const before = snapshotSyncState(state);
    for (const job of queuedJobs) {
      await job.update({
        status: 'CANCELLED',
        completedAt: now,
        nextAttemptAt: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        cancelledAt: now,
        cancelledBy: actorUserId,
        cancellationReason: `Sync stream paused: ${reason}`
      }, { transaction });
    }
    await state.update({
      operationalStatus: 'PAUSED',
      pausedAt: now,
      pausedBy: actorUserId,
      pauseReason: reason
    }, { transaction });
    const cancelledJobIds = queuedJobs.map(job => job.id);
    await recordOperation({
      wineryId,
      actorUserId,
      action: 'SYNC_STREAM_PAUSED',
      targetType: 'SYNC_STREAM',
      targetId: state.id,
      connectionId: state.connectionId,
      resourceType: state.resourceType,
      streamKey: state.streamKey,
      requestId,
      reason,
      beforeSnapshot: before,
      afterSnapshot: snapshotSyncState(state),
      metadata: { cancelledJobIds, cancelledJobCount: cancelledJobIds.length },
      transaction
    });
    return { syncStream: state, cancelledJobIds, duplicate: false };
  });
}

async function resumeSyncStream({ wineryId, syncStateId, actorUserId, requestId, reason }) {
  return sequelize.transaction(async transaction => {
    const priorAudit = await existingOperation({
      wineryId,
      action: 'SYNC_STREAM_RESUMED',
      requestId,
      transaction
    });
    if (priorAudit) {
      if (Number(priorAudit.targetId) !== Number(syncStateId)) {
        throw new ValidationError('requestId was already used for another sync stream');
      }
      return {
        syncStream: await loadSyncState({ wineryId, syncStateId, transaction }),
        duplicate: true
      };
    }
    const state = await loadSyncState({ wineryId, syncStateId, transaction, lock: true });
    if (state.operationalStatus !== 'PAUSED') {
      throw new AppError('Integration sync stream is not paused.', 409, 'SYNC_STREAM_NOT_PAUSED');
    }
    const now = new Date();
    const before = snapshotSyncState(state);
    await state.update({
      operationalStatus: 'ACTIVE',
      pausedAt: null,
      pausedBy: null,
      pauseReason: null,
      nextScheduledAt: state.initialBackfillStatus === 'COMPLETE' ? now : state.nextScheduledAt
    }, { transaction });
    await recordOperation({
      wineryId,
      actorUserId,
      action: 'SYNC_STREAM_RESUMED',
      targetType: 'SYNC_STREAM',
      targetId: state.id,
      connectionId: state.connectionId,
      resourceType: state.resourceType,
      streamKey: state.streamKey,
      requestId,
      reason,
      beforeSnapshot: before,
      afterSnapshot: snapshotSyncState(state),
      transaction
    });
    return { syncStream: state, duplicate: false };
  });
}

async function cancelIntegrationJob({ wineryId, jobId, actorUserId, requestId, reason }) {
  return sequelize.transaction(async transaction => {
    const priorAudit = await existingOperation({
      wineryId,
      action: 'JOB_CANCELLED',
      requestId,
      transaction
    });
    if (priorAudit) {
      if (Number(priorAudit.targetId) !== Number(jobId)) {
        throw new ValidationError('requestId was already used for another integration job');
      }
      const job = await IntegrationJob.findOne({ where: { id: priorAudit.targetId, wineryId }, transaction });
      if (!job) throw new NotFoundError('Integration job not found');
      return { job, duplicate: true };
    }
    const job = await IntegrationJob.findOne({
      where: { id: jobId, wineryId },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!job) throw new NotFoundError('Integration job not found');
    if (!['PENDING', 'RETRY'].includes(job.status)) {
      throw new AppError(
        'Only pending or retrying integration jobs can be cancelled.',
        409,
        'INTEGRATION_JOB_NOT_CANCELLABLE'
      );
    }
    const before = snapshotJob(job);
    const now = new Date();
    await job.update({
      status: 'CANCELLED',
      completedAt: now,
      nextAttemptAt: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      cancelledAt: now,
      cancelledBy: actorUserId,
      cancellationReason: reason
    }, { transaction });
    await recordOperation({
      wineryId,
      actorUserId,
      action: 'JOB_CANCELLED',
      targetType: 'INTEGRATION_JOB',
      targetId: job.id,
      connectionId: job.connectionId,
      resourceType: job.resourceType,
      streamKey: job.streamKey,
      requestId,
      reason,
      beforeSnapshot: before,
      afterSnapshot: snapshotJob(job),
      transaction
    });
    return { job, duplicate: false };
  });
}

async function replayIntegrationJob({
  wineryId,
  jobId,
  actorUserId,
  requestId,
  reason,
  registeredJobKinds = []
}) {
  return sequelize.transaction(async transaction => {
    const priorAudit = await existingOperation({
      wineryId,
      action: 'JOB_REPLAYED',
      requestId,
      transaction
    });
    if (priorAudit) {
      if (Number(priorAudit.targetId) !== Number(jobId)) {
        throw new ValidationError('requestId was already used for another integration job');
      }
      const replay = await IntegrationJob.findOne({
        where: { id: priorAudit.metadata?.replayJobId, wineryId },
        transaction
      });
      if (!replay) throw new NotFoundError('Replayed integration job not found');
      return { job: replay, sourceJobId: Number(priorAudit.targetId), duplicate: true };
    }
    const source = await IntegrationJob.findOne({
      where: { id: jobId, wineryId },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!source) throw new NotFoundError('Integration job not found');
    if (!REPLAYABLE_JOB_STATUSES.includes(source.status)) {
      throw new AppError(
        'Only failed, cancelled, or completed integration jobs can be replayed.',
        409,
        'INTEGRATION_JOB_NOT_REPLAYABLE'
      );
    }
    if (!registeredJobKinds.includes(source.jobKind)) {
      throw new ValidationError(`No runtime handler is registered for '${source.jobKind}'`);
    }
    const replay = await integrationJobService.enqueueIntegrationJob({
      wineryId,
      connectionId: source.connectionId,
      jobKind: source.jobKind,
      jobScopeKey: source.jobScopeKey,
      resourceType: source.resourceType,
      streamKey: source.streamKey,
      payloadSchemaVersion: source.payloadSchemaVersion,
      payload: source.payload,
      idempotencyKey: `operator-replay:${source.id}:${requestId}`,
      priority: source.priority,
      scheduledAt: new Date(),
      maxAttempts: source.maxAttempts,
      retryBackoffSeconds: source.retryBackoffSeconds,
      sourceEventId: source.sourceEventId,
      replayedFromJobId: source.id,
      correlationId: `operator-replay:${requestId}`,
      transaction
    });
    await recordOperation({
      wineryId,
      actorUserId,
      action: 'JOB_REPLAYED',
      targetType: 'INTEGRATION_JOB',
      targetId: source.id,
      connectionId: source.connectionId,
      resourceType: source.resourceType,
      streamKey: source.streamKey,
      requestId,
      reason,
      beforeSnapshot: snapshotJob(source),
      afterSnapshot: snapshotJob(replay.job),
      metadata: { replayJobId: replay.job.id },
      transaction
    });
    return { job: replay.job, sourceJobId: source.id, duplicate: replay.duplicate };
  });
}

async function replayOutboxEntry({ wineryId, outboxId, actorUserId, requestId, reason }) {
  return sequelize.transaction(async transaction => {
    const priorAudit = await existingOperation({
      wineryId,
      action: 'OUTBOX_REPLAYED',
      requestId,
      transaction
    });
    if (priorAudit) {
      if (Number(priorAudit.targetId) !== Number(outboxId)) {
        throw new ValidationError('requestId was already used for another canonical outbox entry');
      }
      const entry = await CanonicalEventOutbox.findOne({
        where: { id: priorAudit.targetId, wineryId },
        transaction
      });
      if (!entry) throw new NotFoundError('Canonical outbox entry not found');
      return { outboxEntry: entry, duplicate: true };
    }
    const entry = await CanonicalEventOutbox.findOne({
      where: { id: outboxId, wineryId },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!entry) throw new NotFoundError('Canonical outbox entry not found');
    if (entry.status !== 'FAILED') {
      throw new AppError(
        'Only failed canonical outbox entries can be replayed.',
        409,
        'OUTBOX_ENTRY_NOT_REPLAYABLE'
      );
    }
    const before = snapshotOutbox(entry);
    const now = new Date();
    await entry.update({
      status: 'PENDING',
      availableAt: now,
      attemptCount: 0,
      leaseOwner: null,
      leaseExpiresAt: null,
      deliveredAt: null,
      lastErrorCode: null,
      lastErrorSummary: null,
      deadLetteredAt: null,
      replayCount: Number(entry.replayCount || 0) + 1,
      lastReplayedAt: now
    }, { transaction });
    await recordOperation({
      wineryId,
      actorUserId,
      action: 'OUTBOX_REPLAYED',
      targetType: 'CANONICAL_OUTBOX',
      targetId: entry.id,
      requestId,
      reason,
      beforeSnapshot: before,
      afterSnapshot: snapshotOutbox(entry),
      transaction
    });
    return { outboxEntry: entry, duplicate: false };
  });
}

async function listOperationAuditEvents({
  wineryId,
  page = 1,
  pageSize = 25,
  action,
  targetType,
  connectionId
}) {
  const where = { wineryId };
  if (action) where.action = action;
  if (targetType) where.targetType = targetType;
  if (connectionId) where.connectionId = connectionId;
  const result = await IntegrationOperationAuditEvent.findAndCountAll({
    where,
    include: [{
      model: User,
      as: 'Actor',
      attributes: ['id', 'displayName', 'email', 'role'],
      required: false
    }],
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
    distinct: true
  });
  return pageResult(result, page, pageSize, 'operations');
}

module.exports = {
  ACTIVE_JOB_STATUSES,
  REPLAYABLE_JOB_STATUSES,
  snapshotSyncState,
  snapshotJob,
  snapshotOutbox,
  listSyncStreams,
  pauseSyncStream,
  resumeSyncStream,
  cancelIntegrationJob,
  replayIntegrationJob,
  replayOutboxEntry,
  listOperationAuditEvents
};
