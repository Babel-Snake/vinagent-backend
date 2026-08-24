const crypto = require('crypto');
const Joi = require('joi');
const models = require('../models');
const { NotFoundError, ValidationError } = require('../utils/errors');
const {
  MESSAGE_DELIVERY_FAILURE_CATEGORIES,
  MESSAGE_DELIVERY_STATUSES
} = require('./integrationDataRegistry.service');
const {
  buildProjectionIssueFingerprint,
  stableSerialize
} = require('./integrationDataFoundation.service');

const CONTRACT_VERSION = 'message-delivery-shadow.v1';
const FAILURE_STATUSES = new Set(['DEFERRED', 'BOUNCED', 'FAILED', 'UNDELIVERABLE']);
const FORBIDDEN_KEY = /(?:password|passphrase|secret|token|credential|api[_-]?key|private[_-]?key|authorization|email|phone|address|contact|recipient|sender|subject|body|content|transcript|recording|dateOfBirth|card|cvv|bank[_-]?account|account[_-]?number|routing[_-]?number|\bpan\b|iban|\bbsb\b)/i;
const stableKey = max => Joi.string().trim()
  .pattern(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/)
  .max(max);
const nullableStableKey = max => stableKey(max).allow(null);

const deliveryEventSchema = Joi.object({
  eventKey: stableKey(180).required(),
  canonicalStatus: Joi.string().trim().uppercase().valid(...MESSAGE_DELIVERY_STATUSES).required(),
  providerStatus: nullableStableKey(120),
  occurredAt: Joi.date().iso().required(),
  failureCategory: Joi.string().trim().uppercase()
    .valid(...MESSAGE_DELIVERY_FAILURE_CATEGORIES)
    .default('NONE'),
  metadata: Joi.object().unknown(true).allow(null)
}).unknown(false);

const messageDeliverySnapshotSchema = Joi.object({
  contractVersion: Joi.string().valid(CONTRACT_VERSION).required(),
  externalMessageId: Joi.string().trim().min(1).max(255).required(),
  messageId: Joi.number().integer().positive().required(),
  channel: Joi.string().trim().uppercase().valid('SMS', 'EMAIL', 'VOICE').required(),
  direction: Joi.string().trim().uppercase().valid('INBOUND', 'OUTBOUND').required(),
  sourceRevision: Joi.string().trim().min(1).max(255).required(),
  sourceUpdatedAt: Joi.date().iso().required(),
  observedAt: Joi.date().iso().required(),
  deletedAtSource: Joi.date().iso().allow(null),
  providerExtensions: Joi.object().unknown(true).allow(null),
  events: Joi.array().items(deliveryEventSchema).min(1).max(500).required()
}).unknown(false);

function assertPublicObject(value, path) {
  if (value == null) return;
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > 16384) {
    throw new ValidationError(path + ' is too large');
  }
  const inspect = (current, currentPath) => {
    if (Array.isArray(current)) {
      current.forEach((item, index) => inspect(item, currentPath + '[' + index + ']'));
      return;
    }
    if (!current || typeof current !== 'object' || current instanceof Date) return;
    for (const [key, child] of Object.entries(current)) {
      if (FORBIDDEN_KEY.test(key)) {
        throw new ValidationError(
          'Communication snapshot contains a forbidden field at ' + currentPath + '.' + key
        );
      }
      inspect(child, currentPath + '.' + key);
    }
  };
  inspect(value, path);
}

function validateSnapshot(input) {
  const { value, error } = messageDeliverySnapshotSchema.validate(input, {
    abortEarly: false,
    stripUnknown: false,
    convert: true
  });
  if (error) {
    throw new ValidationError('Message delivery snapshot contract validation failed', error.details);
  }
  assertPublicObject(value.providerExtensions, 'providerExtensions');
  const eventKeys = new Set();
  for (const event of value.events) {
    if (eventKeys.has(event.eventKey)) {
      throw new ValidationError('Message delivery event keys must be unique in one snapshot');
    }
    eventKeys.add(event.eventKey);
    assertPublicObject(event.metadata, 'events.' + event.eventKey + '.metadata');
    const isFailure = FAILURE_STATUSES.has(event.canonicalStatus);
    if (isFailure !== (event.failureCategory !== 'NONE')) {
      throw new ValidationError(
        'Message delivery event ' + event.eventKey
        + ' must use a failure category exactly when its status is a failure state'
      );
    }
  }
  return value;
}

const hash = value => crypto.createHash('sha256').update(stableSerialize(value)).digest('hex');

async function requireCommunicationConnection({ wineryId, connectionId, transaction }) {
  const connection = await models.IntegrationConnection.findOne({
    where: { id: connectionId, wineryId },
    attributes: ['id', 'connectionKey', 'providerKey', 'status'],
    transaction
  });
  if (!connection) throw new NotFoundError('Integration connection not found');
  const scope = await models.IntegrationConnectionScope.findOne({
    where: { wineryId, connectionId, domain: 'COMMUNICATION', isActive: true },
    attributes: ['id'],
    transaction
  });
  if (!scope) throw new ValidationError('Connection does not have an active COMMUNICATION scope');
  return connection;
}

async function requireSourceEvent({ wineryId, connectionId, sourceEventId, transaction }) {
  if (!sourceEventId) return;
  const event = await models.IntegrationEvent.findOne({
    where: { id: sourceEventId, wineryId, connectionId },
    attributes: ['id'],
    transaction
  });
  if (!event) throw new ValidationError('Communication source event does not belong to the connection');
}

async function requireMessage({ wineryId, snapshot, transaction }) {
  const message = await models.Message.findOne({
    where: { id: snapshot.messageId, wineryId },
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (!message) throw new NotFoundError('Message not found');
  if (String(message.source).toUpperCase() !== snapshot.channel) {
    throw new ValidationError('Communication channel conflicts with the mapped Message');
  }
  if (String(message.direction).toUpperCase() !== snapshot.direction) {
    throw new ValidationError('Communication direction conflicts with the mapped Message');
  }
  return message;
}

async function recordIssue({
  wineryId,
  connectionId,
  referenceId,
  externalId,
  issueType,
  title,
  summary,
  evidence,
  sourceVersion,
  transaction
}) {
  const fingerprint = buildProjectionIssueFingerprint({
    connectionId,
    resourceType: 'MESSAGE',
    externalId,
    issueType,
    evidence,
    sourceVersion
  });
  const existing = await models.ProjectionIssue.findOne({
    where: { wineryId, fingerprint },
    transaction
  });
  if (existing) {
    await existing.update({
      status: 'OPEN',
      severity: 'BLOCKING',
      lastObservedAt: new Date(),
      observationCount: Number(existing.observationCount || 0) + 1
    }, { transaction });
    return existing;
  }
  return models.ProjectionIssue.create({
    wineryId,
    connectionId,
    externalResourceReferenceId: referenceId,
    issueType,
    fingerprint,
    status: 'OPEN',
    severity: 'BLOCKING',
    title,
    summary,
    evidence,
    sourceVersion,
    observationCount: 1,
    detectedAt: new Date(),
    lastObservedAt: new Date()
  }, { transaction });
}

async function resolveReference({ wineryId, connectionId, snapshot, message, transaction }) {
  let reference = await models.ExternalResourceReference.findOne({
    where: {
      connectionId,
      resourceType: 'MESSAGE',
      externalId: snapshot.externalMessageId
    },
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (reference && reference.canonicalId && (
    reference.canonicalType !== 'MESSAGE' || reference.canonicalId !== message.id
  )) {
    await reference.update({ resolutionStatus: 'AMBIGUOUS' }, { transaction });
    await recordIssue({
      wineryId,
      connectionId,
      referenceId: reference.id,
      externalId: snapshot.externalMessageId,
      issueType: 'CONNECTION_MAPPING_AMBIGUOUS',
      title: 'External message maps to more than one local Message',
      summary: 'A connection-scoped message identifier cannot be reassigned automatically.',
      evidence: {
        existingMessageId: reference.canonicalId,
        incomingMessageId: message.id
      },
      sourceVersion: snapshot.sourceRevision,
      transaction
    });
    return { conflict: true, reference };
  }
  const mappingHash = hash({
    messageId: message.id,
    channel: snapshot.channel,
    direction: snapshot.direction,
    deletedAtSource: snapshot.deletedAtSource || null
  });
  const values = {
    wineryId,
    connectionId,
    resourceType: 'MESSAGE',
    externalId: snapshot.externalMessageId,
    canonicalType: 'MESSAGE',
    canonicalId: message.id,
    providerVersion: snapshot.sourceRevision,
    sourceHash: mappingHash,
    observedAt: snapshot.observedAt,
    lastSyncedAt: snapshot.observedAt,
    deletedAtSource: snapshot.deletedAtSource || null,
    providerExtensions: snapshot.providerExtensions || null,
    resolutionStatus: 'RESOLVED',
    resolutionMethod: 'EXPLICIT_MESSAGE_MAPPING',
    resolutionConfidence: 1,
    resolvedAt: new Date()
  };
  if (!reference) {
    reference = await models.ExternalResourceReference.create({
      ...values,
      providerUpdatedAt: snapshot.sourceUpdatedAt
    }, { transaction });
  } else {
    const currentTime = reference.providerUpdatedAt
      ? new Date(reference.providerUpdatedAt).getTime()
      : Number.NEGATIVE_INFINITY;
    const incomingTime = new Date(snapshot.sourceUpdatedAt).getTime();
    const updateValues = incomingTime >= currentTime
      ? { ...values, providerUpdatedAt: snapshot.sourceUpdatedAt }
      : {
        canonicalType: 'MESSAGE',
        canonicalId: message.id,
        resolutionStatus: 'RESOLVED',
        resolutionMethod: 'EXPLICIT_MESSAGE_MAPPING',
        resolutionConfidence: 1,
        resolvedAt: new Date(),
        lastSyncedAt: snapshot.observedAt
      };
    await reference.update(updateValues, { transaction });
  }
  if (!message.primarySourceReferenceId) {
    await message.update({ primarySourceReferenceId: reference.id }, { transaction });
  }
  return { conflict: false, reference };
}

const eventHash = event => hash({
  eventKey: event.eventKey,
  canonicalStatus: event.canonicalStatus,
  providerStatus: event.providerStatus || null,
  occurredAt: new Date(event.occurredAt).toISOString(),
  failureCategory: event.failureCategory,
  metadata: event.metadata || null
});

async function projectEvents({
  wineryId,
  connectionId,
  message,
  reference,
  snapshot,
  sourceEventId,
  transaction
}) {
  const existingEvents = await models.MessageDeliveryEvent.findAll({
    where: {
      sourceReferenceId: reference.id,
      eventKey: snapshot.events.map(event => event.eventKey)
    },
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  const existingByKey = new Map(existingEvents.map(event => [event.eventKey, event]));
  for (const event of snapshot.events) {
    const existing = existingByKey.get(event.eventKey);
    const incomingHash = eventHash(event);
    if (existing && existing.sourceHash !== incomingHash) {
      await reference.update({ resolutionStatus: 'AMBIGUOUS' }, { transaction });
      await recordIssue({
        wineryId,
        connectionId,
        referenceId: reference.id,
        externalId: snapshot.externalMessageId,
        issueType: 'SOURCE_CONFLICT',
        title: 'Message delivery event contains conflicting state',
        summary: 'The same provider event key was observed with different delivery content.',
        evidence: { eventKey: event.eventKey },
        sourceVersion: snapshot.sourceRevision,
        transaction
      });
      return { conflict: true, created: 0, duplicates: 0 };
    }
  }
  let created = 0;
  let duplicates = 0;
  for (const event of snapshot.events) {
    const incomingHash = eventHash(event);
    if (existingByKey.has(event.eventKey)) {
      duplicates += 1;
      continue;
    }
    await models.MessageDeliveryEvent.create({
      wineryId,
      messageId: message.id,
      sourceReferenceId: reference.id,
      sourceEventId,
      eventKey: event.eventKey,
      canonicalStatus: event.canonicalStatus,
      providerStatus: event.providerStatus || null,
      occurredAt: event.occurredAt,
      failureCategory: event.failureCategory,
      sourceHash: incomingHash,
      metadata: event.metadata || null
    }, { transaction });
    created += 1;
  }
  return { conflict: false, created, duplicates };
}

const STATUS_PRECEDENCE = Object.freeze({
  UNKNOWN: 0,
  QUEUED: 10,
  ACCEPTED: 20,
  SENT: 30,
  RECEIVED: 40,
  DELIVERED: 50,
  COMPLETED: 55,
  READ: 60,
  DEFERRED: 70,
  BOUNCED: 80,
  FAILED: 90,
  UNDELIVERABLE: 100
});

function chooseCurrentEvent(events) {
  return [...events].sort((left, right) => {
    const timeDifference = new Date(right.occurredAt) - new Date(left.occurredAt);
    if (timeDifference !== 0) return timeDifference;
    return (STATUS_PRECEDENCE[right.canonicalStatus] || 0)
      - (STATUS_PRECEDENCE[left.canonicalStatus] || 0);
  })[0] || null;
}

async function refreshMessageSummary({ wineryId, message, transaction }) {
  const events = await models.MessageDeliveryEvent.findAll({
    where: { wineryId, messageId: message.id },
    attributes: ['canonicalStatus', 'occurredAt', 'failureCategory'],
    transaction
  });
  const current = chooseCurrentEvent(events);
  if (current) {
    await message.update({
      canonicalDeliveryStatus: current.canonicalStatus,
      deliveryStatusOccurredAt: current.occurredAt,
      deliveryFailureCategory: current.failureCategory
    }, { transaction });
  }
  return current;
}

async function projectMessageDeliveryInternal({
  wineryId,
  connectionId,
  input,
  sourceEventId = null,
  transaction
}) {
  const snapshot = validateSnapshot(input);
  await Promise.all([
    requireCommunicationConnection({ wineryId, connectionId, transaction }),
    requireSourceEvent({ wineryId, connectionId, sourceEventId, transaction })
  ]);
  const message = await requireMessage({ wineryId, snapshot, transaction });
  const resolved = await resolveReference({
    wineryId,
    connectionId,
    snapshot,
    message,
    transaction
  });
  if (resolved.conflict) {
    return {
      status: 'SOURCE_CONFLICT',
      messageId: message.id,
      messageDeliveryEventsCreated: 0,
      automationEligible: false
    };
  }
  const result = await projectEvents({
    wineryId,
    connectionId,
    message,
    reference: resolved.reference,
    snapshot,
    sourceEventId,
    transaction
  });
  if (result.conflict) {
    return {
      status: 'SOURCE_CONFLICT',
      messageId: message.id,
      messageDeliveryEventsCreated: 0,
      automationEligible: false
    };
  }
  const current = await refreshMessageSummary({ wineryId, message, transaction });
  return {
    status: 'PROJECTED_SHADOW',
    messageId: message.id,
    externalResourceReferenceId: resolved.reference.id,
    messageDeliveryEventsCreated: result.created,
    duplicateEvents: result.duplicates,
    currentDeliveryStatus: current ? current.canonicalStatus : 'UNKNOWN',
    automationEligible: false
  };
}

async function projectMessageDelivery(options) {
  if (options.transaction) return projectMessageDeliveryInternal(options);
  return models.sequelize.transaction(transaction => projectMessageDeliveryInternal({
    ...options,
    transaction
  }));
}

module.exports = {
  CONTRACT_VERSION,
  messageDeliverySnapshotSchema,
  validateSnapshot,
  chooseCurrentEvent,
  projectMessageDelivery
};
