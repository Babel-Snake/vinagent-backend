const crypto = require('crypto');
const { Op } = require('sequelize');
const {
  Booking,
  BookingAreaLink,
  BookingItem,
  BookingRequirement,
  BookingStatusEvent,
  IntegrationConnectionScope,
  IntegrationDomainActivation,
  LocationAreaLink,
  ProjectionIssue
} = require('../models');
const { ValidationError } = require('../utils/errors');
const canonicalEventOutboxService = require('./canonicalEventOutbox.service');
const dataAuthorityPolicyService = require('./dataAuthorityPolicy.service');
const inventoryDemandMappingService = require('./inventoryDemandMapping.service');
const {
  buildProjectionIssueFingerprint,
  buildScopeKey,
  stableSerialize
} = require('./integrationDataFoundation.service');

const BOOKING_CANONICAL_SCHEMA_VERSION = 'vinagent.booking.v1';
const BOOKING_AUTHORITY_FIELD_GROUP = 'CORE';
const SENSITIVE_REQUIREMENT_KINDS = new Set(['DIETARY', 'ACCESSIBILITY']);
const STATUS_MAP = Object.freeze({
  ENQUIRY: 'TENTATIVE',
  PENDING: 'TENTATIVE',
  CONFIRMED: 'CONFIRMED',
  SEATED: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  NO_SHOW: 'NO_SHOW'
});

function mapBookingStatus(providerStatus) {
  return STATUS_MAP[String(providerStatus || '').trim().toUpperCase()] || 'UNKNOWN';
}

const hashValue = value => crypto.createHash('sha256').update(stableSerialize(value)).digest('hex');

function projectionContent(booking) {
  return {
    status: mapBookingStatus(booking.status),
    providerStatus: booking.status,
    startAt: booking.startAt,
    endAt: booking.endAt,
    partySize: booking.partySize,
    externalLocationId: booking.externalLocationId,
    experience: booking.experience,
    requirements: booking.requirements,
    deletedAt: booking.deletedAt
  };
}

function projectionRevision(connectionId, booking) {
  return `booking-v1:${hashValue({ connectionId, revision: booking.revision, sourceHash: booking.sourceHash })}`;
}

function statusEventType({ created, fromStatus, toStatus }) {
  if (toStatus === 'CONFIRMED' && (created || fromStatus !== 'CONFIRMED')) return 'booking.confirmed';
  if (toStatus === 'CANCELLED') return 'booking.cancelled';
  if (toStatus === 'COMPLETED') return 'booking.completed';
  if (toStatus === 'NO_SHOW') return 'booking.no_show';
  if (toStatus === 'CHECKED_IN' || toStatus === 'IN_PROGRESS') return 'booking.checked_in';
  return created ? 'booking.created' : 'booking.changed';
}

async function resolveProjectionScope({ connection, transaction }) {
  const scopes = connection.Scopes || await IntegrationConnectionScope.findAll({
    where: { connectionId: connection.id, wineryId: connection.wineryId, domain: 'BOOKING', isActive: true },
    transaction
  });
  const activeScopes = scopes.filter(scope => scope.domain === 'BOOKING' && scope.isActive !== false);
  const locationIds = [...new Set(activeScopes.map(scope => scope.locationId).filter(Boolean))];
  const scopedAreaIds = [...new Set(activeScopes.map(scope => scope.areaId).filter(Boolean))];
  let derivedAreaIds = [];
  if (scopedAreaIds.length === 0 && locationIds.length === 1) {
    const links = await LocationAreaLink.findAll({
      where: {
        wineryId: connection.wineryId,
        locationId: locationIds[0],
        relationshipType: 'PRIMARY_OPERATOR'
      },
      attributes: ['areaId'],
      transaction
    });
    derivedAreaIds = [...new Set(links.map(link => link.areaId).filter(Boolean))];
  }
  const areaIds = scopedAreaIds.length > 0 ? scopedAreaIds : derivedAreaIds;
  return {
    locationId: locationIds.length === 1 ? locationIds[0] : null,
    primaryAreaId: areaIds.length === 1 ? areaIds[0] : null,
    locationAmbiguous: locationIds.length > 1,
    areaAmbiguous: areaIds.length > 1,
    scopeKey: buildScopeKey({ locationId: locationIds.length === 1 ? locationIds[0] : null })
  };
}

async function recordIssue({
  connection,
  reference,
  booking,
  issueType,
  severity = 'BLOCKING',
  title,
  evidence,
  transaction
}) {
  const fingerprint = buildProjectionIssueFingerprint({
    connectionId: connection.id,
    resourceType: 'BOOKING',
    externalId: booking.externalId,
    issueType,
    sourceVersion: booking.revision,
    evidence
  });
  const existing = await ProjectionIssue.findOne({
    where: { wineryId: connection.wineryId, fingerprint },
    transaction
  });
  if (existing) {
    await existing.update({
      observationCount: Number(existing.observationCount || 0) + 1,
      lastObservedAt: new Date()
    }, { transaction });
    return existing;
  }
  const now = new Date();
  return ProjectionIssue.create({
    wineryId: connection.wineryId,
    connectionId: connection.id,
    externalResourceReferenceId: reference.id,
    issueType,
    fingerprint,
    status: 'OPEN',
    severity,
    title,
    evidence,
    sourceVersion: booking.revision,
    observationCount: 1,
    detectedAt: now,
    lastObservedAt: now
  }, { transaction });
}

async function resolveCurrentIssues({ reference, issueTypes, transaction }) {
  await ProjectionIssue.update({
    status: 'RESOLVED',
    resolvedAt: new Date(),
    resolutionNote: 'Automatically resolved after the current booking projection passed this guard.'
  }, {
    where: {
      externalResourceReferenceId: reference.id,
      issueType: { [Op.in]: issueTypes },
      status: { [Op.in]: ['OPEN', 'ACKNOWLEDGED'] }
    },
    transaction
  });
}

async function resolveAuthority({ connection, existingBooking, locationId, transaction }) {
  const policySet = await dataAuthorityPolicyService.resolveAuthorityPolicy({
    wineryId: connection.wineryId,
    domain: 'BOOKING',
    fieldGroup: BOOKING_AUTHORITY_FIELD_GROUP,
    locationId,
    transaction
  });
  const policy = policySet?.ActivePolicy || null;
  if (!policy) {
    const allowed = !existingBooking || existingBooking.authorityConnectionId === connection.id;
    return {
      allowed,
      reason: allowed ? null : 'ANOTHER_IMPLICIT_SOURCE_ALREADY_OWNS_BOOKING',
      policy: null,
      sourceOrder: null,
      authorityState: 'IMPLICIT_SINGLE_SOURCE'
    };
  }
  if (policy.resolutionStrategy === 'VINAGENT_OWNED') {
    return { allowed: false, reason: 'BOOKING_CORE_IS_VINAGENT_OWNED', policy, sourceOrder: null };
  }
  const source = (policy.Sources || []).find(candidate => candidate.connectionId === connection.id);
  if (!source) {
    return { allowed: false, reason: 'CONNECTION_IS_NOT_AN_AUTHORITY_SOURCE', policy, sourceOrder: null };
  }
  if (existingBooking && existingBooking.authorityConnectionId !== connection.id) {
    const existingOrder = existingBooking.authorityPolicyId === policy.id
      ? existingBooking.authoritySourceOrder
      : null;
    if (existingOrder == null || source.sourceOrder >= existingOrder) {
      return { allowed: false, reason: 'HIGHER_PRIORITY_SOURCE_ALREADY_OWNS_BOOKING', policy, sourceOrder: source.sourceOrder };
    }
  }
  return {
    allowed: true,
    reason: null,
    policy,
    sourceOrder: source.sourceOrder,
    authorityState: source.sourceOrder === 0 ? 'EXPLICIT_PRIMARY' : 'EXPLICIT_FALLBACK'
  };
}

function bookingValues({ connection, reference, booking, scope, authority, contentHash, revision, existing }) {
  const now = new Date();
  const status = mapBookingStatus(booking.status);
  const sourceUpdatedAt = new Date(booking.providerUpdatedAt);
  const statusTime = sourceUpdatedAt;
  return {
    wineryId: connection.wineryId,
    locationId: scope.locationId,
    memberId: existing?.memberId || null,
    primaryBookingTypeId: existing?.primaryBookingTypeId || null,
    primarySourceReferenceId: reference.id,
    authorityPolicyId: authority.policy?.id || null,
    authorityConnectionId: connection.id,
    canonicalStatus: status,
    providerStatus: booking.status,
    referenceCode: booking.externalId,
    sourceChannel: connection.providerKey,
    startAt: new Date(booking.startAt),
    endAt: booking.endAt ? new Date(booking.endAt) : null,
    sourceTimeZone: existing?.sourceTimeZone || null,
    partySize: booking.partySize,
    bookedAt: booking.providerCreatedAt ? new Date(booking.providerCreatedAt) : existing?.bookedAt || null,
    confirmedAt: status === 'CONFIRMED' ? existing?.confirmedAt || statusTime : existing?.confirmedAt || null,
    cancelledAt: status === 'CANCELLED' ? existing?.cancelledAt || statusTime : existing?.cancelledAt || null,
    checkedInAt: ['CHECKED_IN', 'IN_PROGRESS'].includes(status) ? existing?.checkedInAt || statusTime : existing?.checkedInAt || null,
    completedAt: status === 'COMPLETED' ? existing?.completedAt || statusTime : existing?.completedAt || null,
    qualityState: 'SOURCE_ASSERTED',
    authorityState: authority.authorityState,
    authoritySourceOrder: authority.sourceOrder,
    projectionRevision: revision,
    sourceUpdatedAt,
    sourceHash: contentHash,
    resolvedAt: now,
    isSourceDeleted: Boolean(booking.deletedAt),
    providerExtensions: {
      externalLocationId: booking.externalLocationId,
      experience: booking.experience || null,
      requirementsHash: hashValue(booking.requirements)
    },
    lockVersion: Number(existing?.lockVersion || 0) + (existing ? 1 : 0)
  };
}

function changedCoreFields(existing, values) {
  if (!existing) return ['status', 'startAt', 'endAt', 'partySize', 'experience', 'requirements'];
  const changed = [];
  const dateValue = value => value ? new Date(value).toISOString() : null;
  if (existing.canonicalStatus !== values.canonicalStatus) changed.push('status');
  if (dateValue(existing.startAt) !== dateValue(values.startAt)) changed.push('startAt');
  if (dateValue(existing.endAt) !== dateValue(values.endAt)) changed.push('endAt');
  if (Number(existing.partySize) !== Number(values.partySize)) changed.push('partySize');
  const oldExperience = existing.providerExtensions?.experience || null;
  if (stableSerialize(oldExperience) !== stableSerialize(values.providerExtensions?.experience || null)) changed.push('experience');
  if (existing.providerExtensions?.requirementsHash !== values.providerExtensions?.requirementsHash) {
    changed.push('requirements');
  }
  return [...new Set(changed)];
}

async function syncAreaLink({ bookingRecord, primaryAreaId, transaction }) {
  if (primaryAreaId == null) {
    await BookingAreaLink.destroy({ where: { bookingId: bookingRecord.id, relationshipType: 'PRIMARY' }, transaction });
    return;
  }
  await BookingAreaLink.destroy({
    where: { bookingId: bookingRecord.id, relationshipType: 'PRIMARY', areaId: { [Op.ne]: primaryAreaId } },
    transaction
  });
  await BookingAreaLink.findOrCreate({
    where: { bookingId: bookingRecord.id, areaId: primaryAreaId, relationshipType: 'PRIMARY' },
    defaults: { wineryId: bookingRecord.wineryId },
    transaction
  });
}

function desiredItems(booking) {
  const items = [];
  if (booking.experience) {
    items.push({
      itemKey: `EXPERIENCE:${booking.experience.code}`,
      itemType: 'EXPERIENCE',
      externalCode: booking.experience.code,
      description: booking.experience.name,
      quantity: 1
    });
  }
  for (const requirement of booking.requirements.filter(item => ['ADD_ON', 'EXPERIENCE'].includes(item.kind))) {
    items.push({
      itemKey: `${requirement.kind}:${requirement.code}`,
      itemType: requirement.kind,
      externalCode: requirement.code,
      description: requirement.label,
      quantity: requirement.quantity
    });
  }
  return items;
}

async function syncItems({ bookingRecord, booking, transaction }) {
  const desired = desiredItems(booking);
  const activeKeys = [];
  for (const item of desired) {
    activeKeys.push(item.itemKey);
    const [record] = await BookingItem.findOrCreate({
      where: { bookingId: bookingRecord.id, itemKey: item.itemKey },
      defaults: {
        wineryId: bookingRecord.wineryId,
        ...item,
        sourceRevision: booking.revision,
        isActive: true
      },
      transaction
    });
    await record.update({ ...item, sourceRevision: booking.revision, isActive: true, removedAt: null }, { transaction });
  }
  await BookingItem.update({ isActive: false, removedAt: new Date() }, {
    where: {
      bookingId: bookingRecord.id,
      isActive: true,
      ...(activeKeys.length > 0 ? { itemKey: { [Op.notIn]: activeKeys } } : {})
    },
    transaction
  });
}

async function syncRequirements({ bookingRecord, reference, booking, responsibleAreaId, transaction }) {
  const activeKeys = [];
  for (const requirement of booking.requirements) {
    const requirementKey = `${requirement.kind}:${requirement.code}`;
    activeKeys.push(requirementKey);
    const sensitivityClass = SENSITIVE_REQUIREMENT_KINDS.has(requirement.kind) ? 'RESTRICTED' : 'OPERATIONAL';
    const values = {
      wineryId: bookingRecord.wineryId,
      responsibleAreaId,
      sourceReferenceId: reference.id,
      kind: requirement.kind,
      sourceKind: requirement.kind,
      code: requirement.code,
      description: requirement.label,
      quantity: requirement.quantity,
      importance: 'NORMAL',
      fulfilmentStatus: 'UNCONFIRMED',
      qualityState: 'SOURCE_ASSERTED',
      sensitivityClass,
      sourceRevision: booking.revision,
      isActive: true,
      removedAt: null
    };
    const [record] = await BookingRequirement.findOrCreate({
      where: { bookingId: bookingRecord.id, requirementKey },
      defaults: values,
      transaction
    });
    await record.update(values, { transaction });
  }
  await BookingRequirement.update({ isActive: false, removedAt: new Date() }, {
    where: {
      bookingId: bookingRecord.id,
      isActive: true,
      ...(activeKeys.length > 0 ? { requirementKey: { [Op.notIn]: activeKeys } } : {})
    },
    transaction
  });
}

async function resolveAutomationEligibility({ connection, scope, booking, sourceEvent, authority, transaction }) {
  if (!['LIVE', 'RECONCILIATION'].includes(sourceEvent.ingestionPurpose)) {
    return { eligible: false, reason: `${sourceEvent.ingestionPurpose}_IS_NON_ACTIONING`, activation: null };
  }
  if (connection.status !== 'CONNECTED') {
    return { eligible: false, reason: 'BOOKING_CONNECTION_NOT_CONNECTED', activation: null };
  }
  const activation = await IntegrationDomainActivation.findOne({
    where: {
      wineryId: connection.wineryId,
      connectionId: connection.id,
      domain: 'BOOKING',
      status: 'ACTIVE',
      [Op.or]: [
        { scopeKey: scope.scopeKey },
        { scopeKey: 'winery' }
      ]
    },
    order: [['activatedAt', 'DESC']],
    transaction
  });
  if (!activation) return { eligible: false, reason: 'BOOKING_DOMAIN_NOT_ACTIVATED', activation: null };
  if (!authority.policy || authority.policy.id !== activation.authorityPolicyId || authority.sourceOrder !== 0) {
    return { eligible: false, reason: 'BOOKING_AUTHORITY_CHANGED_SINCE_ACTIVATION', activation };
  }
  if (new Date(sourceEvent.receivedAt) < new Date(activation.activatedAt)) {
    return { eligible: false, reason: 'SOURCE_RECEIVED_BEFORE_ACTIVATION', activation };
  }
  if (new Date(booking.providerUpdatedAt) <= new Date(activation.sourceWatermarkAt)) {
    return { eligible: false, reason: 'SOURCE_AT_OR_BEFORE_ACTIVATION_WATERMARK', activation };
  }
  return { eligible: true, reason: null, activation };
}

function canonicalPayload({ bookingRecord, booking, scope, changedFields }) {
  const safeRequirements = booking.requirements
    .filter(requirement => !SENSITIVE_REQUIREMENT_KINDS.has(requirement.kind))
    .map(requirement => ({
      kind: requirement.kind,
      code: requirement.code,
      quantity: requirement.quantity
    }));
  return {
    resource: { type: 'booking', id: bookingRecord.id, externalId: booking.externalId },
    areaId: scope.primaryAreaId,
    locationId: scope.locationId,
    changedFields,
    data: {
      status: bookingRecord.canonicalStatus,
      startAt: new Date(bookingRecord.startAt).toISOString(),
      endAt: bookingRecord.endAt ? new Date(bookingRecord.endAt).toISOString() : null,
      partySize: bookingRecord.partySize,
      experienceCode: booking.experience?.code || null,
      requirements: safeRequirements,
      restrictedRequirementCount: booking.requirements.length - safeRequirements.length,
      isSourceDeleted: bookingRecord.isSourceDeleted
    }
  };
}

async function projectBookingObservation({ connection, reference, sourceEvent, booking, transaction }) {
  if (!transaction) throw new ValidationError('Booking projection requires an existing transaction');
  if (!connection || !reference || !sourceEvent || !booking) throw new ValidationError('Booking projection lineage is incomplete');
  if (reference.wineryId !== connection.wineryId || reference.connectionId !== connection.id
    || sourceEvent.wineryId !== connection.wineryId || sourceEvent.connectionId !== connection.id
    || sourceEvent.externalResourceReferenceId !== reference.id || sourceEvent.eventClass !== 'SOURCE') {
    throw new ValidationError('Booking projection lineage is outside its connection scope');
  }

  const scope = await resolveProjectionScope({ connection, transaction });
  if (scope.locationAmbiguous) {
    await recordIssue({
      connection, reference, booking, issueType: 'LOCATION_UNMAPPED',
      title: 'Booking connection has more than one active local location scope',
      evidence: { connectionId: connection.id }, transaction
    });
  } else {
    await resolveCurrentIssues({ reference, issueTypes: ['LOCATION_UNMAPPED'], transaction });
  }
  const existing = await Booking.findOne({
    where: { primarySourceReferenceId: reference.id, wineryId: connection.wineryId },
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (existing && new Date(existing.sourceUpdatedAt) > new Date(booking.providerUpdatedAt)) {
    await recordIssue({
      connection, reference, booking, issueType: 'OUT_OF_ORDER', severity: 'WARNING',
      title: 'Older booking revision was rejected by the canonical projector',
      evidence: {
        currentSourceUpdatedAt: new Date(existing.sourceUpdatedAt).toISOString(),
        incomingSourceUpdatedAt: new Date(booking.providerUpdatedAt).toISOString()
      }, transaction
    });
    return { status: 'OUT_OF_ORDER', booking: existing, canonicalEvent: null };
  }

  const authority = await resolveAuthority({
    connection,
    existingBooking: existing,
    locationId: scope.locationId,
    transaction
  });
  if (!authority.allowed) {
    await recordIssue({
      connection, reference, booking, issueType: 'SOURCE_CONFLICT',
      title: 'Booking source is not authoritative for canonical core fields',
      evidence: { reason: authority.reason, authorityPolicyId: authority.policy?.id || null },
      transaction
    });
    return { status: 'AUTHORITY_REJECTED', booking: existing, canonicalEvent: null };
  }
  await resolveCurrentIssues({ reference, issueTypes: ['SOURCE_CONFLICT'], transaction });

  const revision = projectionRevision(connection.id, booking);
  const contentHash = hashValue(projectionContent(booking));
  if (existing && existing.projectionRevision === revision) {
    await existing.update({
      authorityPolicyId: authority.policy?.id || null,
      authorityState: authority.authorityState,
      authoritySourceOrder: authority.sourceOrder,
      resolvedAt: new Date()
    }, { transaction });
    await reference.update({
      canonicalType: 'BOOKING',
      canonicalId: existing.id,
      resolutionStatus: 'RESOLVED',
      resolutionMethod: 'CANONICAL_BOOKING_PROJECTOR',
      resolvedAt: new Date()
    }, { transaction });
    return { status: 'DUPLICATE', booking: existing, canonicalEvent: null };
  }
  if (existing && existing.sourceHash === contentHash) {
    await existing.update({
      projectionRevision: revision,
      sourceUpdatedAt: new Date(booking.providerUpdatedAt),
      authorityPolicyId: authority.policy?.id || null,
      authorityState: authority.authorityState,
      authoritySourceOrder: authority.sourceOrder,
      resolvedAt: new Date()
    }, { transaction });
    await reference.update({
      canonicalType: 'BOOKING',
      canonicalId: existing.id,
      resolutionStatus: 'RESOLVED',
      resolutionMethod: 'CANONICAL_BOOKING_PROJECTOR',
      resolvedAt: new Date()
    }, { transaction });
    return { status: 'UNCHANGED', booking: existing, canonicalEvent: null };
  }

  const values = bookingValues({ connection, reference, booking, scope, authority, contentHash, revision, existing });
  const fromStatus = existing?.canonicalStatus || null;
  const changedFields = changedCoreFields(existing, values);
  let bookingRecord = existing;
  if (!bookingRecord) bookingRecord = await Booking.create(values, { transaction });
  else await bookingRecord.update(values, { transaction });

  await syncAreaLink({ bookingRecord, primaryAreaId: scope.primaryAreaId, transaction });
  await syncItems({ bookingRecord, booking, transaction });
  await syncRequirements({
    bookingRecord,
    reference,
    booking,
    responsibleAreaId: scope.primaryAreaId,
    transaction
  });
  await inventoryDemandMappingService.syncBookingInventoryCommitments({
    wineryId: connection.wineryId,
    bookingId: bookingRecord.id,
    sourceEventId: sourceEvent.id,
    transaction
  });

  const eligibility = await resolveAutomationEligibility({
    connection,
    scope,
    booking,
    sourceEvent,
    authority,
    transaction
  });
  const eventType = statusEventType({
    created: !existing,
    fromStatus,
    toStatus: bookingRecord.canonicalStatus
  });
  const canonical = await canonicalEventOutboxService.createCanonicalEvent({
    wineryId: connection.wineryId,
    connectionId: connection.id,
    provider: connection.providerKey,
    eventType,
    resourceType: 'BOOKING',
    resourceId: String(bookingRecord.id),
    revision,
    idempotencyKey: revision,
    schemaVersion: BOOKING_CANONICAL_SCHEMA_VERSION,
    normalizedPayload: canonicalPayload({ bookingRecord, booking, scope, changedFields }),
    occurredAtSource: new Date(booking.providerUpdatedAt),
    providerEventVersion: booking.revision,
    externalResourceReferenceId: reference.id,
    syncRunId: sourceEvent.syncRunId,
    correlationId: sourceEvent.correlationId,
    causationId: String(sourceEvent.id),
    ingestionPurpose: sourceEvent.ingestionPurpose,
    automationEligible: eligibility.eligible,
    automationEligibilityReason: eligibility.reason,
    transaction
  });
  await bookingRecord.update({ lastCanonicalEventId: canonical.event.id }, { transaction });
  if (!existing || fromStatus !== bookingRecord.canonicalStatus) {
    await BookingStatusEvent.findOrCreate({
      where: { bookingId: bookingRecord.id, eventKey: revision },
      defaults: {
        wineryId: connection.wineryId,
        sourceEventId: sourceEvent.id,
        fromStatus,
        toStatus: bookingRecord.canonicalStatus,
        providerStatus: booking.status,
        sourceRevision: booking.revision,
        effectiveAt: new Date(booking.providerUpdatedAt),
        reason: booking.deletedAt ? 'SOURCE_DELETION' : null
      },
      transaction
    });
  }
  await reference.update({
    canonicalType: 'BOOKING',
    canonicalId: bookingRecord.id,
    resolutionStatus: 'RESOLVED',
    resolutionMethod: 'CANONICAL_BOOKING_PROJECTOR',
    resolvedAt: new Date()
  }, { transaction });
  return {
    status: existing ? 'UPDATED' : 'CREATED',
    booking: bookingRecord,
    canonicalEvent: canonical.event,
    outbox: canonical.outbox,
    automationEligible: canonical.event.automationEligible
  };
}

module.exports = {
  BOOKING_CANONICAL_SCHEMA_VERSION,
  BOOKING_AUTHORITY_FIELD_GROUP,
  mapBookingStatus,
  projectionContent,
  projectionRevision,
  statusEventType,
  resolveProjectionScope,
  resolveAuthority,
  resolveAutomationEligibility,
  projectBookingObservation
};
