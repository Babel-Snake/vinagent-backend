const crypto = require('crypto');
const { Op, UniqueConstraintError } = require('sequelize');
const {
  ExternalResourceObservation,
  ExternalResourceReference,
  IntegrationConnection,
  IntegrationConnectionCapability,
  IntegrationConnectionScope,
  IntegrationDomainActivation,
  IntegrationEvent,
  IntegrationSyncRun,
  IntegrationSyncState,
  ProjectionIssue,
  sequelize
} = require('../models');
const AppError = require('../utils/AppError');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { buildEventScopeKey, buildProjectionIssueFingerprint } = require('./integrationDataFoundation.service');
const credentialService = require('./integrationCredential.service');
const bookingProjectionService = require('./bookingProjection.service');
const { getShadowBookingConnectorManifest } = require('./integrations/booking/shadowConnectorRegistry');
const { BOOKING_FEED_SCHEMA_VERSION } = require('./integrations/booking/bookingFeed.contract');
const {
  validateNormalizedBookingAdapterPage,
  validateBookingAdapterVerification
} = require('./integrations/booking/bookingReadAdapter.contract');

const BOOKING_VERIFY_JOB_KIND = 'BOOKING_VERIFY_CONNECTION';
const BOOKING_HYDRATE_JOB_KIND = 'BOOKING_HYDRATE';
const BOOKING_INCREMENTAL_JOB_KIND = 'BOOKING_INCREMENTAL';
const BOOKING_RECONCILE_JOB_KIND = 'BOOKING_RECONCILE';
const BOOKING_READ_CAPABILITY = 'bookings.read.shadow';
const MAX_HYDRATION_DAYS = 31;
const BOOKING_SYNC_MODES = Object.freeze({
  BACKFILL: Object.freeze({ runMode: 'BACKFILL', ingestionPurpose: 'HYDRATION', intakeMethod: 'connector_hydration', adapterMode: 'hydration' }),
  INCREMENTAL: Object.freeze({ runMode: 'INCREMENTAL', ingestionPurpose: 'LIVE', intakeMethod: 'connector_incremental', adapterMode: 'incremental' }),
  RECONCILIATION: Object.freeze({ runMode: 'RECONCILIATION', ingestionPurpose: 'RECONCILIATION', intakeMethod: 'connector_reconciliation', adapterMode: 'reconciliation' })
});

class SyncStreamBusyError extends AppError {
  constructor() {
    super('Booking hydration stream is already being processed.', 409, 'SYNC_STREAM_BUSY');
    this.permanent = false;
  }
}

class BookingHydrationContinuationError extends Error {
  constructor() {
    super('Booking hydration reached its bounded page limit and will continue on retry.');
    this.code = 'BOOKING_HYDRATION_CONTINUATION_REQUIRED';
    this.permanent = false;
    this.syncRunFinalized = true;
  }
}

class BookingPollContinuationError extends Error {
  constructor(mode) {
    super(`Booking ${String(mode).toLowerCase()} sync reached its bounded page limit and will continue on retry.`);
    this.code = `BOOKING_${mode}_CONTINUATION_REQUIRED`;
    this.permanent = false;
    this.syncRunFinalized = true;
  }
}

function normalizeHydrationWindow({ from, to, maxPages = 10 }) {
  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    throw new ValidationError('Hydration requires a valid from/to window');
  }
  if (end.getTime() - start.getTime() > MAX_HYDRATION_DAYS * 24 * 60 * 60 * 1000) {
    throw new ValidationError(`Hydration window cannot exceed ${MAX_HYDRATION_DAYS} days`);
  }
  const pages = Number(maxPages);
  if (!Number.isSafeInteger(pages) || pages < 1 || pages > 50) {
    throw new ValidationError('maxPages must be between 1 and 50');
  }
  return { from: start.toISOString(), to: end.toISOString(), maxPages: pages };
}

function hydrationStreamKey({ connectionId, externalLocationId }) {
  const digest = crypto.createHash('sha256')
    .update(`${connectionId}|${externalLocationId}`)
    .digest('hex')
    .slice(0, 32);
  return `booking-shadow:${digest}`;
}

async function requireActiveBookingActivation({ wineryId, connectionId, transaction = null }) {
  const activation = await IntegrationDomainActivation.findOne({
    where: { wineryId, connectionId, domain: 'BOOKING', status: 'ACTIVE' },
    order: [['activatedAt', 'DESC']],
    transaction
  });
  if (!activation) {
    throw new AppError('Booking live polling requires manager-approved domain activation.', 409, 'BOOKING_DOMAIN_NOT_ACTIVATED');
  }
  return activation;
}

async function prepareBookingPollRun({
  wineryId,
  connectionId,
  data,
  mode,
  env = process.env,
  transaction = null
}) {
  const normalizedMode = String(mode || '').trim().toUpperCase();
  if (!['INCREMENTAL', 'RECONCILIATION'].includes(normalizedMode)) {
    throw new ValidationError('Booking poll mode is not supported');
  }
  const window = normalizeHydrationWindow(data);
  const { connection } = await requireBookingConnection({
    wineryId,
    connectionId,
    requireConnected: true,
    env,
    transaction
  });
  const activation = await requireActiveBookingActivation({ wineryId, connectionId, transaction });
  const streamKey = hydrationStreamKey({
    connectionId: connection.id,
    externalLocationId: connection.externalLocationId
  });
  const syncState = await IntegrationSyncState.findOne({
    where: { wineryId, connectionId, resourceType: 'BOOKING', streamKey },
    transaction
  });
  if (!syncState || syncState.initialBackfillStatus !== 'COMPLETE' || !syncState.watermarkAt) {
    throw new AppError('Booking hydration must complete before live polling.', 409, 'INITIAL_HYDRATION_REQUIRED');
  }
  const checkpointWatermarkAt = new Date(syncState.watermarkAt).toISOString();
  let updatedSince = null;
  if (normalizedMode === 'INCREMENTAL') {
    const overlapMinutes = Number(data.overlapMinutes ?? 5);
    if (!Number.isSafeInteger(overlapMinutes) || overlapMinutes < 0 || overlapMinutes > 1440) {
      throw new ValidationError('overlapMinutes must be between 0 and 1440');
    }
    const overlapAt = new Date(new Date(syncState.watermarkAt).getTime() - overlapMinutes * 60000);
    const activationAt = new Date(activation.sourceWatermarkAt);
    updatedSince = new Date(Math.max(overlapAt.getTime(), activationAt.getTime())).toISOString();
  }
  return {
    connection,
    streamKey,
    payload: {
      ...window,
      mode: normalizedMode,
      activationId: activation.id,
      activationPreviewHash: activation.previewHash,
      checkpointWatermarkAt,
      updatedSince
    }
  };
}

async function requireBookingConnection({
  wineryId,
  connectionId,
  requireConnected = false,
  env = process.env,
  transaction = null
}) {
  const connection = await IntegrationConnection.findOne({
    where: { id: connectionId, wineryId },
    include: [{
      model: IntegrationConnectionScope,
      as: 'Scopes',
      where: { domain: 'BOOKING', isActive: true },
      required: true
    }],
    transaction
  });
  if (!connection) throw new NotFoundError('Scoped booking connection not found');
  if (connection.status === 'DISABLED') throw new ValidationError('Disabled connections cannot run booking jobs');
  if (requireConnected && connection.status !== 'CONNECTED') {
    throw new AppError('Booking connection must be verified before hydration.', 409, 'CONNECTION_NOT_VERIFIED');
  }
  const manifest = getShadowBookingConnectorManifest(connection.providerKey);
  const configuration = manifest.validateConfiguration(connection.configuration, { env });
  return { connection, manifest, configuration };
}

async function setBookingCapability({ connection, status, reason = null, now = new Date() }) {
  const [capability] = await IntegrationConnectionCapability.findOrCreate({
    where: {
      connectionId: connection.id,
      capabilityKey: BOOKING_READ_CAPABILITY,
      contractVersion: '1'
    },
    defaults: {
      wineryId: connection.wineryId,
      kind: 'READ',
      enabled: true,
      availabilityStatus: status,
      supportsWebhook: false,
      supportsPolling: true,
      lastVerifiedAt: status === 'AVAILABLE' ? now : null,
      unavailableReason: reason
    }
  });
  await capability.update({
    availabilityStatus: status,
    enabled: true,
    supportsPolling: true,
    lastVerifiedAt: status === 'AVAILABLE' ? now : capability.lastVerifiedAt,
    unavailableReason: reason
  });
}

async function executeBookingConnectionVerification(job, {
  env = process.env,
  httpClient,
  credentialStore = credentialService
} = {}) {
  const { connection, manifest, configuration } = await requireBookingConnection({
    wineryId: job.wineryId,
    connectionId: job.connectionId,
    env
  });
  let credential;
  try {
    credential = await credentialStore.resolveConnectionCredential({ connection, env });
    if (!manifest.supportedCredentialTypes.includes(credential.credentialType)) {
      const error = new ValidationError('Credential type is not supported by the booking connector');
      error.permanent = true;
      throw error;
    }
    const adapter = manifest.createAdapter({
      configuration,
      credential,
      externalLocationId: connection.externalLocationId,
      env,
      httpClient
    });
    const result = validateBookingAdapterVerification(await adapter.verifyReadAccess(), {
      providerKey: connection.providerKey
    });
    const now = new Date();
    await credentialStore.markConnectionCredentialVerified({
      wineryId: connection.wineryId,
      connectionId: connection.id,
      credentialId: credential.credentialId,
      now
    });
    await setBookingCapability({ connection, status: 'AVAILABLE', now });
    return result;
  } catch (error) {
    const credentialId = credential?.credentialId || connection.authReference;
    if (credentialId) {
      await credentialStore.markConnectionCredentialVerificationFailed({
        wineryId: connection.wineryId,
        connectionId: connection.id,
        credentialId,
        errorCode: error.code,
        authenticationRejected: error.authenticationRejected === true
      });
    }
    await setBookingCapability({
      connection,
      status: 'UNAVAILABLE',
      reason: String(error.code || 'CONNECTION_VERIFICATION_FAILED').slice(0, 120)
    });
    throw error;
  }
}

async function findOrCreateSyncState({
  wineryId,
  connectionId,
  streamKey,
  windowKey,
  mode = 'BACKFILL',
  expectedWatermarkAt = null,
  workerId,
  leaseSeconds = 300
}) {
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + leaseSeconds * 1000);
  return sequelize.transaction(async transaction => {
    let syncState = await IntegrationSyncState.findOne({
      where: { connectionId, resourceType: 'BOOKING', streamKey },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!syncState) {
      try {
        syncState = await IntegrationSyncState.create({
          wineryId,
          connectionId,
          resourceType: 'BOOKING',
          streamKey,
          initialBackfillStatus: 'NOT_STARTED',
          consecutiveFailures: 0
        }, { transaction });
      } catch (error) {
        if (!(error instanceof UniqueConstraintError || error.name === 'SequelizeUniqueConstraintError')) throw error;
        syncState = await IntegrationSyncState.findOne({
          where: { connectionId, resourceType: 'BOOKING', streamKey },
          transaction,
          lock: transaction.LOCK.UPDATE
        });
      }
    }
    if (syncState.operationalStatus === 'PAUSED') {
      throw new AppError('Booking sync stream is paused.', 409, 'SYNC_STREAM_PAUSED');
    }
    if (syncState.leaseExpiresAt && new Date(syncState.leaseExpiresAt) > now && syncState.leaseOwner !== workerId) {
      throw new SyncStreamBusyError();
    }
    if (mode !== 'BACKFILL' && syncState.initialBackfillStatus !== 'COMPLETE') {
      throw new AppError('Booking hydration must complete before live polling.', 409, 'INITIAL_HYDRATION_REQUIRED');
    }
    const existingWindowKey = syncState.statistics?.windowKey || null;
    const windowChanged = existingWindowKey !== windowKey;
    const isContinuation = !windowChanged && Boolean(syncState.cursor);
    if (mode !== 'BACKFILL' && expectedWatermarkAt && syncState.watermarkAt
      && new Date(syncState.watermarkAt).toISOString() !== new Date(expectedWatermarkAt).toISOString()
      && !isContinuation) {
      throw new AppError('Booking sync checkpoint is stale; enqueue a fresh run.', 409, 'BOOKING_SYNC_CHECKPOINT_STALE');
    }
    const stateUpdate = {
      leaseOwner: workerId,
      leaseExpiresAt,
      cursor: windowChanged ? null : syncState.cursor,
      statistics: windowChanged ? { windowKey, mode } : syncState.statistics
    };
    if (mode === 'BACKFILL') stateUpdate.initialBackfillStatus = 'RUNNING';
    await syncState.update(stateUpdate, { transaction });
    const run = await IntegrationSyncRun.create({
      wineryId,
      connectionId,
      syncStateId: syncState.id,
      resourceType: 'BOOKING',
      streamKey,
      mode,
      status: 'RUNNING',
      cursorBefore: syncState.cursor,
      watermarkBefore: syncState.watermarkAt,
      startedAt: now
    }, { transaction });
    return { syncState, run };
  });
}

async function recordProjectionIssue({
  connection,
  externalResourceReferenceId,
  externalId,
  issueType,
  sourceVersion,
  title,
  evidence,
  transaction
}) {
  const now = new Date();
  const fingerprint = buildProjectionIssueFingerprint({
    connectionId: connection.id,
    resourceType: 'BOOKING',
    externalId,
    issueType,
    sourceVersion,
    evidence
  });
  const existing = await ProjectionIssue.findOne({ where: { wineryId: connection.wineryId, fingerprint }, transaction });
  if (existing) {
    await existing.update({
      observationCount: Number(existing.observationCount || 0) + 1,
      lastObservedAt: now
    }, { transaction });
    return existing;
  }
  return ProjectionIssue.create({
    wineryId: connection.wineryId,
    connectionId: connection.id,
    externalResourceReferenceId,
    issueType,
    fingerprint,
    status: 'OPEN',
    severity: issueType === 'OUT_OF_ORDER' ? 'WARNING' : 'BLOCKING',
    title,
    evidence,
    sourceVersion,
    observationCount: 1,
    detectedAt: now,
    lastObservedAt: now
  }, { transaction });
}

const observationKeyForRevision = revision => (
  `revision:${crypto.createHash('sha256').update(String(revision)).digest('hex')}`
);
const eventStreamForBooking = externalId => (
  `booking:${crypto.createHash('sha256').update(String(externalId)).digest('hex').slice(0, 48)}`
);

function sourceEventType({ ingestionPurpose, deleted }) {
  if (ingestionPurpose === 'LIVE') return deleted ? 'booking.polled.deleted' : 'booking.polled';
  if (ingestionPurpose === 'RECONCILIATION') return deleted ? 'booking.reconciled.deleted' : 'booking.reconciled';
  return deleted ? 'booking.hydrated.deleted' : 'booking.hydrated';
}

async function ingestShadowBooking({
  connection,
  syncRun,
  booking,
  guestDataMode,
  ingestionPurpose = 'HYDRATION',
  intakeMethod = 'connector_hydration',
  transaction
}) {
  const now = new Date();
  let reference = await ExternalResourceReference.findOne({
    where: { connectionId: connection.id, resourceType: 'BOOKING', externalId: booking.externalId },
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  const createdReference = !reference;
  if (!reference) {
    reference = await ExternalResourceReference.create({
      wineryId: connection.wineryId,
      connectionId: connection.id,
      resourceType: 'BOOKING',
      externalId: booking.externalId,
      providerVersion: booking.revision,
      sourceHash: booking.sourceHash,
      providerCreatedAt: booking.providerCreatedAt,
      providerUpdatedAt: booking.providerUpdatedAt,
      observedAt: now,
      lastSyncedAt: now,
      deletedAtSource: booking.deletedAt,
      lastSyncRunId: syncRun.id,
      providerExtensions: { externalLocationId: booking.externalLocationId },
      resolutionStatus: 'UNRESOLVED'
    }, { transaction });
  }

  const incomingUpdatedAt = new Date(booking.providerUpdatedAt);
  if (reference.providerUpdatedAt && new Date(reference.providerUpdatedAt) > incomingUpdatedAt) {
    await recordProjectionIssue({
      connection,
      externalResourceReferenceId: reference.id,
      externalId: booking.externalId,
      issueType: 'OUT_OF_ORDER',
      sourceVersion: booking.revision,
      title: 'Older booking revision ignored during hydration',
      evidence: {
        currentProviderUpdatedAt: new Date(reference.providerUpdatedAt).toISOString(),
        incomingProviderUpdatedAt: incomingUpdatedAt.toISOString()
      },
      transaction
    });
    return { outcome: 'unchanged', outOfOrder: true };
  }

  const observationKey = observationKeyForRevision(booking.revision);
  const existingObservation = await ExternalResourceObservation.findOne({
    where: {
      externalResourceReferenceId: reference.id,
      schemaVersion: BOOKING_FEED_SCHEMA_VERSION,
      observationKey
    },
    transaction
  });
  if (existingObservation) {
    await reference.update({ observedAt: now, lastSyncedAt: now, lastSyncRunId: syncRun.id }, { transaction });
    const existingSourceEvent = await IntegrationEvent.findOne({
      where: {
        id: existingObservation.sourceEventId,
        wineryId: connection.wineryId,
        connectionId: connection.id,
        externalResourceReferenceId: reference.id,
        eventClass: 'SOURCE'
      },
      transaction
    });
    if (existingSourceEvent) {
      await bookingProjectionService.projectBookingObservation({
        connection,
        reference,
        sourceEvent: existingSourceEvent,
        booking: existingObservation.normalizedState,
        transaction
      });
    }
    return { outcome: 'unchanged', outOfOrder: false };
  }

  const eventScopeKey = buildEventScopeKey({
    connectionId: connection.id,
    sourceStream: eventStreamForBooking(booking.externalId)
  });
  let event = await IntegrationEvent.findOne({
    where: { wineryId: connection.wineryId, eventScopeKey, idempotencyKey: booking.revision },
    transaction
  });
  if (!event) {
    event = await IntegrationEvent.create({
      wineryId: connection.wineryId,
      connectionId: connection.id,
      provider: connection.providerKey,
      intakeMethod,
      eventType: sourceEventType({ ingestionPurpose, deleted: Boolean(booking.deletedAt) }),
      externalEventId: null,
      rawPayload: null,
      normalizedPayload: booking,
      status: 'PROCESSED',
      receivedAt: now,
      processedAt: now,
      relatedRecordType: 'BOOKING',
      relatedRecordId: null,
      eventScopeKey,
      idempotencyKey: booking.revision,
      eventClass: 'SOURCE',
      schemaVersion: BOOKING_FEED_SCHEMA_VERSION,
      occurredAtSource: incomingUpdatedAt,
      providerEventVersion: booking.revision,
      externalResourceReferenceId: reference.id,
      syncRunId: syncRun.id,
      ingestionPurpose,
      automationEligible: false,
      automationEligibilityReason: ingestionPurpose === 'HYDRATION'
        ? 'HYDRATION_IS_NON_ACTIONING'
        : 'SOURCE_EVENT_REQUIRES_CANONICAL_PROJECTION',
      redactionProfile: guestDataMode === 'NONE' ? 'BOOKING_OPERATIONAL_V1' : 'BOOKING_IDENTITY_MINIMUM_V1'
    }, { transaction });
  }

  await ExternalResourceObservation.update({ supersededAt: now }, {
    where: {
      externalResourceReferenceId: reference.id,
      supersededAt: { [Op.is]: null }
    },
    transaction
  });
  await ExternalResourceObservation.create({
    wineryId: connection.wineryId,
    externalResourceReferenceId: reference.id,
    sourceEventId: event.id,
    schemaVersion: BOOKING_FEED_SCHEMA_VERSION,
    observationKey,
    sourceRevision: booking.revision,
    sourceHash: booking.sourceHash,
    normalizedState: booking,
    providerEffectiveAt: booking.startAt,
    providerUpdatedAt: booking.providerUpdatedAt,
    observedAt: now,
    validFrom: incomingUpdatedAt,
    sensitivityClass: guestDataMode === 'NONE' ? 'OPERATIONAL' : 'PERSONAL',
    redactionProfile: guestDataMode === 'NONE' ? 'BOOKING_OPERATIONAL_V1' : 'BOOKING_IDENTITY_MINIMUM_V1'
  }, { transaction });
  await reference.update({
    providerVersion: booking.revision,
    sourceHash: booking.sourceHash,
    providerCreatedAt: booking.providerCreatedAt,
    providerUpdatedAt: booking.providerUpdatedAt,
    observedAt: now,
    lastSyncedAt: now,
    deletedAtSource: booking.deletedAt,
    lastSourceEventId: event.id,
    lastSyncRunId: syncRun.id
  }, { transaction });
  await bookingProjectionService.projectBookingObservation({
    connection,
    reference,
    sourceEvent: event,
    booking,
    transaction
  });
  return { outcome: createdReference ? 'created' : 'updated', outOfOrder: false };
}

async function persistBookingPage({
  connection,
  syncRun,
  page,
  guestDataMode,
  ingestionPurpose = 'HYDRATION',
  intakeMethod = 'connector_hydration'
}) {
  const counts = { fetched: page.bookings.length, created: 0, updated: 0, unchanged: 0, tombstoned: 0 };
  for (const booking of page.bookings) {
    const result = await sequelize.transaction(transaction => ingestShadowBooking({
      connection,
      syncRun,
      booking,
      guestDataMode,
      ingestionPurpose,
      intakeMethod,
      transaction
    }));
    counts[result.outcome] += 1;
    if (booking.deletedAt && result.outcome !== 'unchanged') counts.tombstoned += 1;
  }
  return counts;
}

async function updateSyncProgress({ syncState, cursor, watermarkAt, counts, windowKey, mode = 'BACKFILL' }) {
  await syncState.update({
    cursor,
    watermarkAt: watermarkAt || syncState.watermarkAt,
    statistics: { windowKey, mode, ...counts },
    leaseExpiresAt: new Date(Date.now() + 300000)
  });
}

async function finalizeSyncSuccess({
  syncState,
  run,
  counts,
  cursor,
  watermarkAt,
  windowKey,
  mode = 'BACKFILL',
  partial = false
}) {
  const now = new Date();
  const modeCode = mode === 'BACKFILL' ? 'HYDRATION' : mode;
  await sequelize.transaction(async transaction => {
    await run.update({
      status: partial ? 'PARTIAL' : 'SUCCEEDED',
      cursorAfter: cursor,
      watermarkAfter: watermarkAt || syncState.watermarkAt,
      fetchedCount: counts.fetched,
      createdCount: counts.created,
      updatedCount: counts.updated,
      unchangedCount: counts.unchanged,
      tombstonedCount: counts.tombstoned,
      failedCount: 0,
      completedAt: now
    }, { transaction });
    const stateValues = {
      cursor,
      watermarkAt: watermarkAt || syncState.watermarkAt,
      lastSuccessfulSyncAt: partial ? syncState.lastSuccessfulSyncAt : now,
      consecutiveFailures: partial ? syncState.consecutiveFailures : 0,
      lastErrorCode: partial ? `BOOKING_${modeCode}_CONTINUATION_REQUIRED` : null,
      lastErrorSummary: partial ? `Booking ${modeCode.toLowerCase()} sync will continue from its saved cursor.` : null,
      lastErrorAt: partial ? now : null,
      leaseOwner: null,
      leaseExpiresAt: null,
      statistics: { windowKey, mode, ...counts }
    };
    if (partial) stateValues.nextScheduledAt = now;
    if (mode === 'BACKFILL') stateValues.initialBackfillStatus = partial ? 'RUNNING' : 'COMPLETE';
    await syncState.update(stateValues, { transaction });
  });
}

async function finalizeSyncFailure({ syncState, run, error, mode = 'BACKFILL' }) {
  const now = new Date();
  const modeCode = mode === 'BACKFILL' ? 'HYDRATION' : mode;
  const code = String(error.code || `BOOKING_${modeCode}_FAILED`).slice(0, 120);
  await sequelize.transaction(async transaction => {
    await run.update({
      status: 'FAILED',
      errorCode: code,
      errorSummary: 'Booking hydration failed before completion.',
      completedAt: now
    }, { transaction });
    const stateValues = {
      consecutiveFailures: Number(syncState.consecutiveFailures || 0) + 1,
      lastErrorCode: code,
      lastErrorSummary: 'Booking hydration failed before completion.',
      lastErrorAt: now,
      leaseOwner: null,
      leaseExpiresAt: null
    };
    if (mode === 'BACKFILL') stateValues.initialBackfillStatus = error.permanent === true ? 'FAILED' : 'RUNNING';
    await syncState.update(stateValues, { transaction });
  });
}

async function executeBookingHydration(job, {
  workerId,
  env = process.env,
  httpClient,
  credentialStore = credentialService
} = {}) {
  const window = normalizeHydrationWindow(job.payload || {});
  const { connection, manifest, configuration } = await requireBookingConnection({
    wineryId: job.wineryId,
    connectionId: job.connectionId,
    requireConnected: true,
    env
  });
  const credential = await credentialStore.resolveConnectionCredential({ connection, env });
  if (!manifest.supportedCredentialTypes.includes(credential.credentialType)) {
    const error = new ValidationError('Credential type is not supported by the booking connector');
    error.permanent = true;
    throw error;
  }
  const adapter = manifest.createAdapter({
    configuration,
    credential,
    externalLocationId: connection.externalLocationId,
    env,
    httpClient
  });
  const streamKey = job.streamKey || hydrationStreamKey({
    connectionId: connection.id,
    externalLocationId: connection.externalLocationId
  });
  const windowKey = crypto.createHash('sha256')
    .update(`BACKFILL|${job.id}|${window.from}|${window.to}`)
    .digest('hex');
  const { syncState, run } = await findOrCreateSyncState({
    wineryId: connection.wineryId,
    connectionId: connection.id,
    streamKey,
    windowKey,
    mode: 'BACKFILL',
    workerId
  });
  const counts = { fetched: 0, created: 0, updated: 0, unchanged: 0, tombstoned: 0 };
  let cursor = syncState.cursor || null;
  let watermarkAt = syncState.watermarkAt ? new Date(syncState.watermarkAt).toISOString() : null;

  try {
    for (let pageNumber = 0; pageNumber < window.maxPages; pageNumber += 1) {
      const page = validateNormalizedBookingAdapterPage(
        await adapter.fetchBookingsPage({ ...window, cursor, syncMode: 'hydration' }),
        {
          externalLocationId: connection.externalLocationId,
          guestDataMode: configuration.guestDataMode,
          syncMode: 'hydration'
        }
      );
      const pageCounts = await persistBookingPage({
        connection,
        syncRun: run,
        page,
        guestDataMode: configuration.guestDataMode
      });
      for (const key of Object.keys(counts)) counts[key] += pageCounts[key];
      cursor = page.nextCursor;
      watermarkAt = page.watermarkAt || watermarkAt;
      await updateSyncProgress({ syncState, cursor, watermarkAt, counts, windowKey, mode: 'BACKFILL' });
      if (!page.hasMore) {
        await finalizeSyncSuccess({ syncState, run, counts, cursor: null, watermarkAt, windowKey, mode: 'BACKFILL' });
        await setBookingCapability({ connection, status: 'AVAILABLE' });
        return { mode: 'HYDRATION', automationEligible: false, ...counts, watermarkAt };
      }
    }
    await finalizeSyncSuccess({ syncState, run, counts, cursor, watermarkAt, windowKey, mode: 'BACKFILL', partial: true });
    throw new BookingHydrationContinuationError();
  } catch (error) {
    if (!error.syncRunFinalized) await finalizeSyncFailure({ syncState, run, error, mode: 'BACKFILL' });
    if (error.authenticationRejected) {
      await credentialStore.markConnectionCredentialVerificationFailed({
        wineryId: connection.wineryId,
        connectionId: connection.id,
        credentialId: credential.credentialId,
        errorCode: error.code,
        authenticationRejected: true
      });
    }
    throw error;
  }
}

function stalePollJob(message, code = 'BOOKING_POLL_ACTIVATION_STALE') {
  const error = new AppError(message, 409, code);
  error.permanent = true;
  return error;
}

function assertPollWatermark({ page, previousWatermarkAt }) {
  if (!page.watermarkAt) {
    throw stalePollJob('Booking polling requires a provider watermark.', 'BOOKING_FEED_WATERMARK_REQUIRED');
  }
  const incoming = new Date(page.watermarkAt);
  const previous = previousWatermarkAt ? new Date(previousWatermarkAt) : null;
  if (previous && incoming < previous) {
    throw stalePollJob('Booking feed watermark moved backwards.', 'BOOKING_FEED_WATERMARK_REGRESSION');
  }
}

async function executeBookingPoll(job, {
  workerId,
  env = process.env,
  httpClient,
  credentialStore = credentialService
} = {}) {
  const requestedMode = String(job.payload?.mode || '').trim().toUpperCase();
  const mode = BOOKING_SYNC_MODES[requestedMode];
  if (!mode || requestedMode === 'BACKFILL') throw new ValidationError('Booking poll job mode is invalid');
  const window = normalizeHydrationWindow(job.payload || {});
  const { connection, manifest, configuration } = await requireBookingConnection({
    wineryId: job.wineryId,
    connectionId: job.connectionId,
    requireConnected: true,
    env
  });
  const activation = await requireActiveBookingActivation({
    wineryId: connection.wineryId,
    connectionId: connection.id
  });
  if (activation.id !== job.payload.activationId || activation.previewHash !== job.payload.activationPreviewHash) {
    throw stalePollJob('Booking activation changed after this poll was queued.');
  }
  const checkpoint = new Date(job.payload.checkpointWatermarkAt);
  if (Number.isNaN(checkpoint.getTime())) throw new ValidationError('Booking poll checkpoint is invalid');
  let updatedSince = null;
  if (requestedMode === 'INCREMENTAL') {
    updatedSince = new Date(job.payload.updatedSince);
    if (Number.isNaN(updatedSince.getTime()) || updatedSince < new Date(activation.sourceWatermarkAt)) {
      throw new ValidationError('Booking incremental checkpoint precedes its activation watermark');
    }
  }
  const credential = await credentialStore.resolveConnectionCredential({ connection, env });
  if (!manifest.supportedCredentialTypes.includes(credential.credentialType)) {
    const error = new ValidationError('Credential type is not supported by the booking connector');
    error.permanent = true;
    throw error;
  }
  const adapter = manifest.createAdapter({
    configuration,
    credential,
    externalLocationId: connection.externalLocationId,
    env,
    httpClient
  });
  const streamKey = job.streamKey || hydrationStreamKey({
    connectionId: connection.id,
    externalLocationId: connection.externalLocationId
  });
  const windowKey = crypto.createHash('sha256')
    .update(`${requestedMode}|${job.id}|${window.from}|${window.to}|${updatedSince?.toISOString() || ''}`)
    .digest('hex');
  const { syncState, run } = await findOrCreateSyncState({
    wineryId: connection.wineryId,
    connectionId: connection.id,
    streamKey,
    windowKey,
    mode: mode.runMode,
    expectedWatermarkAt: checkpoint,
    workerId
  });
  const counts = { fetched: 0, created: 0, updated: 0, unchanged: 0, tombstoned: 0 };
  let cursor = syncState.cursor || null;
  let watermarkAt = syncState.watermarkAt ? new Date(syncState.watermarkAt).toISOString() : null;

  try {
    for (let pageNumber = 0; pageNumber < window.maxPages; pageNumber += 1) {
      const page = validateNormalizedBookingAdapterPage(
        await adapter.fetchBookingsPage({
          ...window,
          cursor,
          updatedSince: updatedSince?.toISOString() || null,
          syncMode: mode.adapterMode
        }),
        {
          externalLocationId: connection.externalLocationId,
          guestDataMode: configuration.guestDataMode,
          syncMode: mode.adapterMode
        }
      );
      assertPollWatermark({ page, previousWatermarkAt: watermarkAt });
      const pageCounts = await persistBookingPage({
        connection,
        syncRun: run,
        page,
        guestDataMode: configuration.guestDataMode,
        ingestionPurpose: mode.ingestionPurpose,
        intakeMethod: mode.intakeMethod
      });
      for (const key of Object.keys(counts)) counts[key] += pageCounts[key];
      cursor = page.nextCursor;
      watermarkAt = page.watermarkAt;
      await updateSyncProgress({
        syncState,
        cursor,
        watermarkAt,
        counts,
        windowKey,
        mode: mode.runMode
      });
      if (!page.hasMore) {
        await finalizeSyncSuccess({
          syncState,
          run,
          counts,
          cursor: null,
          watermarkAt,
          windowKey,
          mode: mode.runMode
        });
        await setBookingCapability({ connection, status: 'AVAILABLE' });
        return {
          mode: requestedMode,
          automationEligibility: 'GUARDED_BY_ACTIVATION_WATERMARK',
          ...counts,
          watermarkAt
        };
      }
    }
    await finalizeSyncSuccess({
      syncState,
      run,
      counts,
      cursor,
      watermarkAt,
      windowKey,
      mode: mode.runMode,
      partial: true
    });
    throw new BookingPollContinuationError(requestedMode);
  } catch (error) {
    if (!error.syncRunFinalized) await finalizeSyncFailure({ syncState, run, error, mode: mode.runMode });
    if (error.authenticationRejected) {
      await credentialStore.markConnectionCredentialVerificationFailed({
        wineryId: connection.wineryId,
        connectionId: connection.id,
        credentialId: credential.credentialId,
        errorCode: error.code,
        authenticationRejected: true
      });
    }
    throw error;
  }
}

const executeBookingIncremental = (job, options) => executeBookingPoll(job, options);
const executeBookingReconciliation = (job, options) => executeBookingPoll(job, options);

module.exports = {
  BOOKING_VERIFY_JOB_KIND,
  BOOKING_HYDRATE_JOB_KIND,
  BOOKING_INCREMENTAL_JOB_KIND,
  BOOKING_RECONCILE_JOB_KIND,
  BOOKING_READ_CAPABILITY,
  BOOKING_SYNC_MODES,
  MAX_HYDRATION_DAYS,
  SyncStreamBusyError,
  BookingHydrationContinuationError,
  BookingPollContinuationError,
  normalizeHydrationWindow,
  hydrationStreamKey,
  requireActiveBookingActivation,
  prepareBookingPollRun,
  requireBookingConnection,
  executeBookingConnectionVerification,
  executeBookingHydration,
  executeBookingIncremental,
  executeBookingReconciliation,
  executeBookingPoll,
  ingestShadowBooking
};
