const crypto = require('crypto');
const { UniqueConstraintError } = require('sequelize');
const {
  IntegrationEvent,
  IntegrationJob,
  IntegrationWebhookEndpoint,
  sequelize
} = require('../models');
const { buildEventScopeKey } = require('./integrationDataFoundation.service');
const integrationJobService = require('./integrationJob.service');
const webhookEndpointService = require('./integrationWebhookEndpoint.service');
const {
  WEBHOOK_CHANGE_HINT_SCHEMA_VERSION,
  IntegrationWebhookAuthenticationError
} = require('./integrationWebhookAdapter.contract');

const PROVIDER_WEBHOOK_DISPATCH_JOB_KIND = 'PROVIDER_WEBHOOK_DISPATCH';

function serializeReceipt(event, dispatchJob, duplicate) {
  return {
    accepted: true,
    duplicate,
    receipt: {
      eventId: event.id,
      externalEventId: event.externalEventId,
      domain: event.metadata?.domain || null,
      receivedAt: event.receivedAt,
      dispatchJobId: dispatchJob?.id || null
    }
  };
}

async function existingReceipt({ wineryId, eventScopeKey, idempotencyKey, transaction }) {
  const event = await IntegrationEvent.findOne({
    where: { wineryId, eventScopeKey, idempotencyKey },
    transaction
  });
  if (!event) return null;
  const dispatchJob = await IntegrationJob.findOne({
    where: { wineryId, sourceEventId: event.id, jobKind: PROVIDER_WEBHOOK_DISPATCH_JOB_KIND },
    transaction
  });
  return serializeReceipt(event, dispatchJob, true);
}

async function acceptProviderWebhook({
  endpointKey,
  rawBody,
  headers,
  now = new Date(),
  env = process.env,
  endpointService = webhookEndpointService,
  jobService = integrationJobService
}) {
  const resolved = await endpointService.resolveActiveWebhookEndpoint({ endpointKey, env });
  let hint;
  try {
    hint = await resolved.adapter.verifyAndNormalize({
      rawBody,
      headers,
      verificationMaterial: resolved.verificationMaterial,
      domain: resolved.endpoint.domain,
      configuration: resolved.endpoint.configuration || {},
      now
    });
  } catch (error) {
    if (!(error instanceof IntegrationWebhookAuthenticationError)) {
      await resolved.endpoint.update({ lastErrorCode: String(error.code || 'PROVIDER_WEBHOOK_INVALID').slice(0, 120) })
        .catch(() => {});
    }
    throw error;
  }
  const eventScopeKey = buildEventScopeKey({
    connectionId: resolved.connection.id,
    sourceStream: `provider-webhook:${resolved.endpoint.endpointKey}`
  });
  const bodySha256 = crypto.createHash('sha256').update(rawBody).digest('hex');
  return sequelize.transaction(async transaction => {
    const duplicate = await existingReceipt({
      wineryId: resolved.connection.wineryId,
      eventScopeKey,
      idempotencyKey: hint.eventId,
      transaction
    });
    if (duplicate) {
      await IntegrationWebhookEndpoint.update({ lastReceivedAt: now, lastVerifiedAt: now, lastErrorCode: null }, {
        where: { id: resolved.endpoint.id, status: 'ACTIVE' },
        transaction
      });
      return duplicate;
    }
    let event;
    try {
      event = await IntegrationEvent.create({
        wineryId: resolved.connection.wineryId,
        connectionId: resolved.connection.id,
        provider: resolved.connection.providerKey,
        intakeMethod: 'provider_webhook',
        eventType: hint.eventType,
        externalEventId: hint.eventId,
        eventScopeKey,
        idempotencyKey: hint.eventId,
        eventClass: 'INTAKE',
        schemaVersion: WEBHOOK_CHANGE_HINT_SCHEMA_VERSION,
        occurredAtSource: hint.occurredAt,
        providerEventVersion: hint.providerEventVersion || null,
        correlationId: hint.correlationId || `provider-webhook:${resolved.endpoint.id}:${hint.eventId}`.slice(0, 120),
        rawPayload: null,
        normalizedPayload: {
          schemaVersion: hint.schemaVersion,
          changes: hint.changes
        },
        status: 'PROCESSED',
        receivedAt: now,
        processedAt: now,
        redactionProfile: 'PROVIDER_WEBHOOK_CHANGE_HINT_V1',
        ingestionPurpose: 'LIVE',
        automationEligible: false,
        automationEligibilityReason: 'Webhook change hints must be recovered into canonical facts before automation.',
        metadata: {
          domain: resolved.endpoint.domain,
          endpointId: resolved.endpoint.id,
          adapterKey: resolved.endpoint.adapterKey,
          adapterVersion: resolved.endpoint.adapterVersion,
          bodySha256
        }
      }, { transaction });
    } catch (error) {
      if (error instanceof UniqueConstraintError || error.name === 'SequelizeUniqueConstraintError') {
        const raced = await existingReceipt({
          wineryId: resolved.connection.wineryId,
          eventScopeKey,
          idempotencyKey: hint.eventId,
          transaction
        });
        if (raced) return raced;
      }
      throw error;
    }
    const enqueued = await jobService.enqueueIntegrationJob({
      wineryId: resolved.connection.wineryId,
      connectionId: resolved.connection.id,
      jobKind: PROVIDER_WEBHOOK_DISPATCH_JOB_KIND,
      resourceType: resolved.endpoint.domain,
      streamKey: `provider-webhook:${resolved.endpoint.id}`,
      payload: {
        domain: resolved.endpoint.domain,
        endpointId: resolved.endpoint.id,
        eventId: event.id
      },
      idempotencyKey: `provider-webhook-dispatch:${event.id}`,
      priority: 75,
      scheduledAt: now,
      maxAttempts: 10,
      retryBackoffSeconds: 15,
      sourceEventId: event.id,
      correlationId: event.correlationId,
      transaction
    });
    await IntegrationWebhookEndpoint.update({ lastReceivedAt: now, lastVerifiedAt: now, lastErrorCode: null }, {
      where: { id: resolved.endpoint.id, status: 'ACTIVE' },
      transaction
    });
    return serializeReceipt(event, enqueued.job, false);
  });
}

module.exports = {
  PROVIDER_WEBHOOK_DISPATCH_JOB_KIND,
  acceptProviderWebhook
};
