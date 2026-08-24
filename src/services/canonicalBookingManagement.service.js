const { Op, UniqueConstraintError } = require('sequelize');
const {
  Booking,
  BookingAreaLink,
  BookingItem,
  BookingRequirement,
  BookingStatusEvent,
  ExternalResourceReference,
  IntegrationConnectionCapability,
  IntegrationDomainActivation,
  IntegrationSyncState,
  ProjectionIssue,
  User,
  WineryLocation,
  IntegrationConnection,
  sequelize
} = require('../models');
const { redact } = require('../utils/sanitizer');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { stableSerialize } = require('./integrationDataFoundation.service');
const dataAuthorityPolicyService = require('./dataAuthorityPolicy.service');
const integrationConfigurationAuthorityService = require('./integrationConfigurationAuthority.service');
const { requireBookingConnection } = require('./bookingShadowSync.service');
const {
  BOOKING_AUTHORITY_FIELD_GROUP,
  resolveProjectionScope
} = require('./bookingProjection.service');
const crypto = require('crypto');

const BOOKING_LIVE_EVENT_CAPABILITY = 'bookings.canonical.events.live';

const activationHash = snapshot => crypto.createHash('sha256').update(stableSerialize(snapshot)).digest('hex');

function serializeActivation(record) {
  if (!record) return null;
  const plain = record.toJSON ? record.toJSON() : { ...record };
  return {
    id: plain.id,
    connectionId: plain.connectionId,
    domain: plain.domain,
    scopeKey: plain.scopeKey,
    locationId: plain.locationId,
    status: plain.status,
    sourceWatermarkAt: plain.sourceWatermarkAt,
    activatedAt: plain.activatedAt,
    activatedBy: plain.activatedBy,
    activationReason: plain.activationReason,
    authorityPolicyId: plain.authorityPolicyId,
    disabledAt: plain.disabledAt
  };
}

async function bookingActivationPreview({ wineryId, connectionId, env = process.env, transaction = null }) {
  const { connection } = await requireBookingConnection({
    wineryId,
    connectionId,
    requireConnected: false,
    env,
    transaction
  });
  const scope = await resolveProjectionScope({ connection, transaction });
  const [syncState, sourceReferenceCount, projectedReferenceCount, canonicalBookingCount, blockingIssueCount, policySet, activation] = await Promise.all([
    IntegrationSyncState.findOne({
      where: { wineryId, connectionId, resourceType: 'BOOKING' },
      order: [['updatedAt', 'DESC'], ['id', 'DESC']],
      transaction
    }),
    ExternalResourceReference.count({ where: { wineryId, connectionId, resourceType: 'BOOKING' }, transaction }),
    ExternalResourceReference.count({
      where: {
        wineryId,
        connectionId,
        resourceType: 'BOOKING',
        canonicalType: 'BOOKING',
        canonicalId: { [Op.ne]: null },
        resolutionStatus: 'RESOLVED'
      },
      transaction
    }),
    Booking.count({ where: { wineryId, authorityConnectionId: connectionId }, transaction }),
    ProjectionIssue.count({
      where: {
        wineryId,
        connectionId,
        status: { [Op.in]: ['OPEN', 'ACKNOWLEDGED'] },
        severity: { [Op.in]: ['ERROR', 'BLOCKING'] }
      },
      transaction
    }),
    dataAuthorityPolicyService.resolveAuthorityPolicy({
      wineryId,
      domain: 'BOOKING',
      fieldGroup: BOOKING_AUTHORITY_FIELD_GROUP,
      locationId: scope.locationId,
      transaction
    }),
    IntegrationDomainActivation.findOne({
      where: { wineryId, connectionId, domain: 'BOOKING', scopeKey: scope.scopeKey },
      transaction
    })
  ]);

  const policy = policySet?.ActivePolicy || null;
  const primarySource = policy?.Sources?.find(source => source.sourceRole === 'PRIMARY' && source.sourceOrder === 0);
  const authorityAlignedBookingCount = policy ? await Booking.count({
    where: { wineryId, authorityConnectionId: connectionId, authorityPolicyId: policy.id },
    transaction
  }) : 0;
  const sourceWatermarkAt = syncState?.watermarkAt ? new Date(syncState.watermarkAt).toISOString() : null;
  const reasons = [];
  if (connection.status !== 'CONNECTED') reasons.push('CONNECTION_NOT_VERIFIED');
  if (!syncState || syncState.initialBackfillStatus !== 'COMPLETE') reasons.push('INITIAL_HYDRATION_INCOMPLETE');
  if (!sourceWatermarkAt) reasons.push('SOURCE_WATERMARK_UNAVAILABLE');
  if (scope.locationAmbiguous) reasons.push('LOCAL_LOCATION_SCOPE_AMBIGUOUS');
  if (scope.areaAmbiguous) reasons.push('OPERATIONAL_AREA_SCOPE_AMBIGUOUS');
  if (!policy) reasons.push('BOOKING_CORE_AUTHORITY_POLICY_REQUIRED');
  else if (policy.resolutionStrategy !== 'SOURCE_PRIORITY') reasons.push('BOOKING_CORE_MUST_USE_SOURCE_PRIORITY');
  else if (!primarySource || primarySource.connectionId !== connectionId) reasons.push('CONNECTION_MUST_BE_PRIMARY_BOOKING_AUTHORITY');
  if (projectedReferenceCount !== sourceReferenceCount) reasons.push('SHADOW_BOOKINGS_NOT_FULLY_PROJECTED');
  if (policy && authorityAlignedBookingCount !== projectedReferenceCount) {
    reasons.push('CANONICAL_BOOKINGS_NOT_ALIGNED_TO_AUTHORITY_POLICY');
  }
  if (blockingIssueCount > 0) reasons.push('BLOCKING_PROJECTION_ISSUES_EXIST');

  const snapshot = {
    connectionId,
    connectionStatus: connection.status,
    connectionUpdatedAt: new Date(connection.updatedAt).toISOString(),
    domain: 'BOOKING',
    scopeKey: scope.scopeKey,
    locationId: scope.locationId,
    sourceWatermarkAt,
    syncStateId: syncState?.id || null,
    syncStateUpdatedAt: syncState ? new Date(syncState.updatedAt).toISOString() : null,
    sourceReferenceCount,
    projectedReferenceCount,
    canonicalBookingCount,
    authorityAlignedBookingCount,
    blockingIssueCount,
    authorityPolicyId: policy?.id || null,
    authorityPolicyVersion: policy?.version || null,
    primaryAuthorityConnectionId: primarySource?.connectionId || null,
    ready: reasons.length === 0,
    reasons
  };
  return {
    ...snapshot,
    previewToken: activationHash(snapshot),
    activation: serializeActivation(activation)
  };
}

async function activateBookingDomain({ wineryId, connectionId, actorUserId, data, env = process.env }) {
  return sequelize.transaction(async transaction => {
    const actor = await User.findOne({ where: { id: actorUserId, wineryId }, attributes: ['id'], transaction });
    if (!actor) throw new ValidationError('Booking activation actor does not belong to the winery');
    const duplicateRequest = await IntegrationDomainActivation.findOne({
      where: { wineryId, requestId: data.requestId },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (duplicateRequest) {
      if (duplicateRequest.connectionId !== connectionId || duplicateRequest.domain !== 'BOOKING') {
        throw new ValidationError('Activation requestId is already used for another scope');
      }
      return { activation: serializeActivation(duplicateRequest), duplicate: true };
    }
    await integrationConfigurationAuthorityService.assertCanonicalDomainCanBeInvalidated({
      wineryId,
      domains: ['BOOKING'],
      transaction
    });

    const preview = await bookingActivationPreview({ wineryId, connectionId, env, transaction });
    if (preview.previewToken !== data.previewToken) {
      throw new ValidationError('Booking activation preview is stale; generate a new preview');
    }
    if (!preview.ready) {
      throw new ValidationError(`Booking activation is blocked: ${preview.reasons.join(', ')}`);
    }
    const existing = await IntegrationDomainActivation.findOne({
      where: { wineryId, connectionId, domain: 'BOOKING', scopeKey: preview.scopeKey },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (existing?.status === 'ACTIVE'
      && existing.previewHash === data.previewToken
      && existing.authorityPolicyId === preview.authorityPolicyId
      && new Date(existing.sourceWatermarkAt).toISOString() === preview.sourceWatermarkAt) {
      return { activation: serializeActivation(existing), duplicate: true };
    }

    const values = {
      wineryId,
      connectionId,
      domain: 'BOOKING',
      scopeKey: preview.scopeKey,
      locationId: preview.locationId,
      status: 'ACTIVE',
      sourceWatermarkAt: new Date(preview.sourceWatermarkAt),
      activatedAt: new Date(),
      activatedBy: actorUserId,
      activationReason: data.reason,
      requestId: data.requestId,
      previewHash: data.previewToken,
      previewSnapshot: {
        connectionStatus: preview.connectionStatus,
        sourceWatermarkAt: preview.sourceWatermarkAt,
        sourceReferenceCount: preview.sourceReferenceCount,
        projectedReferenceCount: preview.projectedReferenceCount,
        canonicalBookingCount: preview.canonicalBookingCount,
        authorityAlignedBookingCount: preview.authorityAlignedBookingCount,
        blockingIssueCount: preview.blockingIssueCount,
        authorityPolicyId: preview.authorityPolicyId,
        authorityPolicyVersion: preview.authorityPolicyVersion
      },
      authorityPolicyId: preview.authorityPolicyId,
      disabledAt: null,
      disabledBy: null,
      disabledReason: null
    };
    let activation;
    try {
      activation = existing
        ? await existing.update(values, { transaction })
        : await IntegrationDomainActivation.create(values, { transaction });
    } catch (error) {
      if (!(error instanceof UniqueConstraintError || error.name === 'SequelizeUniqueConstraintError')) throw error;
      activation = await IntegrationDomainActivation.findOne({
        where: { wineryId, connectionId, domain: 'BOOKING', scopeKey: preview.scopeKey },
        transaction
      });
      if (!activation) throw error;
    }

    const [capability] = await IntegrationConnectionCapability.findOrCreate({
      where: { connectionId, capabilityKey: BOOKING_LIVE_EVENT_CAPABILITY, contractVersion: '1' },
      defaults: {
        wineryId,
        kind: 'READ',
        enabled: true,
        availabilityStatus: 'AVAILABLE',
        supportsWebhook: false,
        supportsPolling: true,
        lastVerifiedAt: activation.activatedAt,
        metadata: { nonRetroactive: true, activationId: activation.id }
      },
      transaction
    });
    await capability.update({
      enabled: true,
      availabilityStatus: 'AVAILABLE',
      lastVerifiedAt: activation.activatedAt,
      unavailableReason: null,
      metadata: { nonRetroactive: true, activationId: activation.id }
    }, { transaction });
    await IntegrationSyncState.update({ nextScheduledAt: activation.activatedAt }, {
      where: {
        id: preview.syncStateId,
        wineryId,
        connectionId,
        resourceType: 'BOOKING'
      },
      transaction
    });
    return { activation: serializeActivation(activation), duplicate: false };
  });
}

const bookingListIncludes = connectionId => [
  { model: WineryLocation, as: 'Location', attributes: ['id', 'code', 'name', 'timeZone'] },
  {
    model: ExternalResourceReference,
    as: 'PrimarySourceReference',
    attributes: ['id', 'connectionId', 'externalId', 'providerVersion', 'providerUpdatedAt'],
    required: Boolean(connectionId),
    where: connectionId ? { connectionId } : undefined
  },
  {
    model: IntegrationConnection,
    as: 'AuthorityConnection',
    attributes: ['id', 'connectionKey', 'providerKey', 'displayName', 'status']
  }
];

function serializeBookingSummary(record) {
  const plain = record.toJSON ? record.toJSON() : { ...record };
  delete plain.providerExtensions;
  return plain;
}

async function listCanonicalBookings({
  wineryId,
  page = 1,
  pageSize = 25,
  status = 'ALL',
  locationId,
  connectionId,
  from,
  to
}) {
  const where = { wineryId };
  if (status !== 'ALL') where.canonicalStatus = status;
  if (locationId) where.locationId = locationId;
  if (from || to) {
    where.startAt = {};
    if (from) where.startAt[Op.gte] = new Date(from);
    if (to) where.startAt[Op.lt] = new Date(to);
  }
  const result = await Booking.findAndCountAll({
    where,
    include: bookingListIncludes(connectionId),
    distinct: true,
    order: [['startAt', 'ASC'], ['id', 'ASC']],
    limit: pageSize,
    offset: (page - 1) * pageSize
  });
  return {
    bookings: result.rows.map(serializeBookingSummary),
    pagination: {
      page,
      pageSize,
      total: result.count,
      totalPages: Math.max(1, Math.ceil(result.count / pageSize))
    }
  };
}

async function getCanonicalBooking({ wineryId, bookingId }) {
  const booking = await Booking.findOne({
    where: { id: bookingId, wineryId },
    include: [
      ...bookingListIncludes(null),
      { model: BookingAreaLink, as: 'AreaLinks', where: {}, required: false },
      { model: BookingItem, as: 'Items', where: { isActive: true }, required: false },
      { model: BookingRequirement, as: 'Requirements', where: { isActive: true }, required: false },
      { model: BookingStatusEvent, as: 'StatusEvents', required: false }
    ],
    order: [
      [{ model: BookingStatusEvent, as: 'StatusEvents' }, 'effectiveAt', 'ASC'],
      [{ model: BookingItem, as: 'Items' }, 'id', 'ASC'],
      [{ model: BookingRequirement, as: 'Requirements' }, 'id', 'ASC']
    ]
  });
  if (!booking) throw new NotFoundError('Canonical booking not found');
  const plain = booking.toJSON();
  plain.providerExtensions = redact(plain.providerExtensions);
  plain.Requirements = (plain.Requirements || []).map(requirement => {
    if (requirement.sensitivityClass !== 'RESTRICTED') return requirement;
    return {
      id: requirement.id,
      kind: requirement.kind,
      quantity: requirement.quantity,
      importance: requirement.importance,
      fulfilmentStatus: requirement.fulfilmentStatus,
      sensitivityClass: requirement.sensitivityClass,
      detailsRestricted: true
    };
  });
  return plain;
}

module.exports = {
  BOOKING_LIVE_EVENT_CAPABILITY,
  bookingActivationPreview,
  activateBookingDomain,
  listCanonicalBookings,
  getCanonicalBooking,
  serializeActivation,
  activationHash
};
