const { Op, UniqueConstraintError } = require('sequelize');
const {
  CanonicalEventOutbox,
  ExternalResourceReference,
  IntegrationConnection,
  IntegrationEvent,
  IntegrationSyncRun,
  sequelize
} = require('../models');
const { ValidationError, NotFoundError } = require('../utils/errors');
const { buildEventScopeKey, buildCanonicalOutboxKey } = require('./integrationDataFoundation.service');
const {
  CANONICAL_RESOURCE_TYPES,
  INGESTION_PURPOSES,
  includesRegistryValue
} = require('./integrationDataRegistry.service');

const requireText = (value, fieldName, maxLength) => {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.length > maxLength) throw new ValidationError(`${fieldName} is required`);
  return normalized;
};

const normalizeRegistry = (registry, value, fieldName) => {
  const normalized = String(value || '').trim().toUpperCase();
  if (!includesRegistryValue(registry, normalized)) throw new ValidationError(`${fieldName} is not supported`);
  return normalized;
};

const validateLineage = async ({ wineryId, connectionId, externalResourceReferenceId, syncRunId, transaction }) => {
  let connection = null;
  if (connectionId != null) {
    connection = await IntegrationConnection.findOne({ where: { id: connectionId, wineryId }, transaction });
    if (!connection) throw new ValidationError('Canonical event connection does not belong to the winery');
  }
  if (externalResourceReferenceId != null) {
    const reference = await ExternalResourceReference.findOne({
      where: { id: externalResourceReferenceId, wineryId },
      transaction
    });
    if (!reference || (connectionId != null && reference.connectionId !== connectionId)) {
      throw new ValidationError('Canonical event external reference is outside its connection scope');
    }
  }
  if (syncRunId != null) {
    const run = await IntegrationSyncRun.findOne({ where: { id: syncRunId, wineryId }, transaction });
    if (!run || (connectionId != null && run.connectionId !== connectionId)) {
      throw new ValidationError('Canonical event sync run is outside its connection scope');
    }
  }
  return connection;
};

async function createCanonicalEvent({
  wineryId,
  connectionId = null,
  provider = null,
  eventType,
  resourceType,
  resourceId,
  revision,
  idempotencyKey = null,
  schemaVersion = '1',
  normalizedPayload,
  occurredAtSource = null,
  providerEventVersion = null,
  externalResourceReferenceId = null,
  syncRunId = null,
  correlationId = null,
  causationId = null,
  ingestionPurpose = 'LIVE',
  automationEligible = null,
  automationEligibilityReason = null,
  transaction: externalTransaction = null
}) {
  const normalizedResourceType = normalizeRegistry(CANONICAL_RESOURCE_TYPES, resourceType, 'resourceType');
  const normalizedPurpose = normalizeRegistry(INGESTION_PURPOSES, ingestionPurpose, 'ingestionPurpose');
  const normalizedResourceId = requireText(resourceId, 'resourceId', 120);
  const normalizedRevision = requireText(revision, 'revision', 120);
  const normalizedEventType = requireText(eventType, 'eventType', 120);
  if (!normalizedPayload || typeof normalizedPayload !== 'object' || Array.isArray(normalizedPayload)) {
    throw new ValidationError('normalizedPayload must be an object');
  }
  const eventScopeKey = buildEventScopeKey({ resourceType: normalizedResourceType, resourceId: normalizedResourceId });
  const resolvedIdempotencyKey = requireText(idempotencyKey || normalizedRevision, 'idempotencyKey', 255);
  const outboxKey = buildCanonicalOutboxKey({
    resourceType: normalizedResourceType,
    resourceId: normalizedResourceId,
    revision: normalizedRevision
  });
  const permitsOperationalAutomation = ['LIVE', 'RECONCILIATION'].includes(normalizedPurpose);
  const requestedAutomation = automationEligible === true
    || (automationEligible == null && normalizedPurpose === 'LIVE');
  const resolvedAutomationEligible = permitsOperationalAutomation && requestedAutomation;
  const eligibilityReason = resolvedAutomationEligible
    ? null
    : automationEligibilityReason
      || (permitsOperationalAutomation ? 'AUTOMATION_DISABLED_BY_CALLER' : `${normalizedPurpose}_IS_NON_ACTIONING`);

  const operation = async transaction => {
    const connection = await validateLineage({
      wineryId,
      connectionId,
      externalResourceReferenceId,
      syncRunId,
      transaction
    });
    const duplicateWhere = { wineryId, eventScopeKey, idempotencyKey: resolvedIdempotencyKey };
    const existing = await IntegrationEvent.findOne({ where: duplicateWhere, transaction });
    if (existing) {
      return {
        event: existing,
        outbox: await CanonicalEventOutbox.findOne({ where: { eventId: existing.id }, transaction }),
        duplicate: true
      };
    }

    try {
      const now = new Date();
      const numericResourceId = Number(normalizedResourceId);
      const event = await IntegrationEvent.create({
        wineryId,
        connectionId,
        provider: provider || connection?.providerKey || 'vinagent',
        intakeMethod: 'canonical_projection',
        eventType: normalizedEventType,
        externalEventId: null,
        rawPayload: null,
        normalizedPayload,
        status: 'PROCESSED',
        receivedAt: now,
        processedAt: now,
        relatedRecordType: normalizedResourceType,
        relatedRecordId: Number.isSafeInteger(numericResourceId) && numericResourceId > 0 ? numericResourceId : null,
        eventScopeKey,
        idempotencyKey: resolvedIdempotencyKey,
        eventClass: 'CANONICAL',
        schemaVersion: requireText(schemaVersion, 'schemaVersion', 40),
        occurredAtSource: occurredAtSource || null,
        providerEventVersion,
        correlationId,
        causationId,
        externalResourceReferenceId,
        syncRunId,
        ingestionPurpose: normalizedPurpose,
        automationEligible: resolvedAutomationEligible,
        automationEligibilityReason: eligibilityReason
      }, { transaction });
      const outbox = await CanonicalEventOutbox.create({
        wineryId,
        eventId: event.id,
        outboxKey,
        aggregateType: normalizedResourceType,
        aggregateId: normalizedResourceId,
        aggregateRevision: normalizedRevision,
        status: 'PENDING',
        availableAt: now,
        correlationId
      }, { transaction });
      return { event, outbox, duplicate: false };
    } catch (error) {
      if (error instanceof UniqueConstraintError || error.name === 'SequelizeUniqueConstraintError') {
        const duplicate = await IntegrationEvent.findOne({ where: duplicateWhere, transaction });
        if (duplicate) {
          return {
            event: duplicate,
            outbox: await CanonicalEventOutbox.findOne({ where: { eventId: duplicate.id }, transaction }),
            duplicate: true
          };
        }
      }
      throw error;
    }
  };

  if (externalTransaction) return operation(externalTransaction);
  return sequelize.transaction(operation);
}

async function claimCanonicalOutbox({ workerId, limit = 20, leaseSeconds = 60, now = new Date() }) {
  const owner = requireText(workerId, 'workerId', 160);
  const batchSize = Math.max(1, Math.min(100, Number(limit) || 20));
  const duration = Math.max(5, Math.min(3600, Number(leaseSeconds) || 60));
  const leaseExpiresAt = new Date(now.getTime() + duration * 1000);
  return sequelize.transaction(async transaction => {
    const entries = await CanonicalEventOutbox.findAll({
      where: {
        [Op.or]: [
          { status: { [Op.in]: ['PENDING', 'RETRY'] }, availableAt: { [Op.lte]: now } },
          { status: 'DELIVERING', leaseExpiresAt: { [Op.lte]: now } }
        ]
      },
      order: [['availableAt', 'ASC'], ['id', 'ASC']],
      limit: batchSize,
      transaction,
      lock: transaction.LOCK.UPDATE,
      skipLocked: sequelize.getDialect() !== 'sqlite'
    });
    const claimed = [];
    for (const entry of entries) {
      if (Number(entry.attemptCount || 0) >= Number(entry.maxAttempts)) {
        await entry.update({
          status: 'FAILED',
          deadLetteredAt: now,
          leaseOwner: null,
          leaseExpiresAt: null,
          lastErrorCode: entry.lastErrorCode || 'MAX_ATTEMPTS_EXHAUSTED',
          lastErrorSummary: entry.lastErrorSummary || 'Canonical event delivery exhausted its retry budget.'
        }, { transaction });
        continue;
      }
      await entry.update({
        status: 'DELIVERING',
        leaseOwner: owner,
        leaseExpiresAt,
        attemptCount: Number(entry.attemptCount || 0) + 1,
        lastErrorCode: null,
        lastErrorSummary: null
      }, { transaction });
      claimed.push(entry);
    }
    return claimed;
  });
}

async function markOutboxDelivered({ outboxId, wineryId, workerId, deliveredAt = new Date() }) {
  const [updated] = await CanonicalEventOutbox.update({
    status: 'DELIVERED',
    deliveredAt,
    leaseOwner: null,
    leaseExpiresAt: null,
    lastErrorCode: null,
    lastErrorSummary: null
  }, { where: { id: outboxId, wineryId, status: 'DELIVERING', leaseOwner: workerId } });
  if (updated !== 1) throw new NotFoundError('Claimed outbox entry was not found');
}

async function markOutboxFailed({ outboxId, wineryId, workerId, errorCode = 'DELIVERY_FAILED', errorSummary, now = new Date() }) {
  return sequelize.transaction(async transaction => {
    const entry = await CanonicalEventOutbox.findOne({
      where: { id: outboxId, wineryId, status: 'DELIVERING', leaseOwner: workerId },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!entry) throw new NotFoundError('Claimed outbox entry was not found');
    const exhausted = Number(entry.attemptCount) >= Number(entry.maxAttempts);
    const backoffSeconds = Math.min(3600, 30 * (2 ** Math.max(0, Number(entry.attemptCount) - 1)));
    await entry.update({
      status: exhausted ? 'FAILED' : 'RETRY',
      availableAt: exhausted ? entry.availableAt : new Date(now.getTime() + backoffSeconds * 1000),
      deadLetteredAt: exhausted ? now : null,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastErrorCode: requireText(errorCode, 'errorCode', 120),
      lastErrorSummary: String(errorSummary || 'Canonical event delivery failed').slice(0, 4000)
    }, { transaction });
    return entry;
  });
}

async function defaultCanonicalEventDelivery(entry) {
  const event = await IntegrationEvent.findOne({ where: { id: entry.eventId, wineryId: entry.wineryId } });
  if (!event) throw new NotFoundError('Canonical event not found');
  if (!event.automationEligible) return { automationSkipped: true, reason: event.automationEligibilityReason };
  const automationResourceBindingService = require('./automationResourceBinding.service');
  const automationRuleService = require('./automationRule.service');
  const lifecycleResults = await automationResourceBindingService.reconcileBindingsForCanonicalEvent({
    wineryId: event.wineryId,
    eventId: event.id
  });
  const automationResults = await automationRuleService.executeMatchingRulesForEvent({
    wineryId: event.wineryId,
    eventId: event.id,
    dispatchSource: 'canonical_outbox'
  });
  return { automationSkipped: false, lifecycleResults, automationResults };
}

async function dispatchCanonicalOutboxBatch({ workerId, limit = 20, leaseSeconds = 60, deliver = defaultCanonicalEventDelivery }) {
  const entries = await claimCanonicalOutbox({ workerId, limit, leaseSeconds });
  const results = [];
  for (const entry of entries) {
    try {
      const result = await deliver(entry);
      await markOutboxDelivered({ outboxId: entry.id, wineryId: entry.wineryId, workerId });
      results.push({ outboxId: entry.id, status: 'DELIVERED', result });
    } catch (error) {
      const failed = await markOutboxFailed({
        outboxId: entry.id,
        wineryId: entry.wineryId,
        workerId,
        errorCode: error.code || 'DELIVERY_FAILED',
        errorSummary: error.message
      });
      results.push({ outboxId: entry.id, status: failed.status, error: error.message });
    }
  }
  return results;
}

module.exports = {
  createCanonicalEvent,
  claimCanonicalOutbox,
  markOutboxDelivered,
  markOutboxFailed,
  dispatchCanonicalOutboxBatch,
  defaultCanonicalEventDelivery
};
