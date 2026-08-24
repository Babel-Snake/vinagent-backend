const crypto = require('crypto');
const {
  Op,
  col,
  where: sequelizeWhere,
  UniqueConstraintError
} = require('sequelize');
const {
  ExternalResourceReference,
  IntegrationConnection,
  IntegrationConnectionCapability,
  IntegrationConnectionScope,
  IntegrationCredential,
  IntegrationDomainActivation,
  IntegrationSyncState,
  ProjectionIssue,
  User,
  sequelize
} = require('../models');
const { ValidationError, NotFoundError } = require('../utils/errors');
const { stableSerialize } = require('./integrationDataFoundation.service');
const {
  INTEGRATION_DOMAINS,
  includesRegistryValue
} = require('./integrationDataRegistry.service');
const dataAuthorityPolicyService = require('./dataAuthorityPolicy.service');
const integrationConfigurationAuthorityService = require('./integrationConfigurationAuthority.service');

const DOMAIN_ACTIVATION_SCHEMA_VERSION = 'domain.activation.v1';
const POLICY_FIELD_GROUP = 'CORE';
const FIXTURE_PROVIDER = /^(?:fixture|mock|test)(?:[._-]|$)/i;
const DOMAIN_CONTRACTS = Object.freeze({
  CUSTOMER: Object.freeze({
    resourceTypes: ['CUSTOMER'],
    readCapabilityKey: 'customers.read.shadow',
    liveCapabilityKey: 'customers.canonical.events.live'
  }),
  CLUB: Object.freeze({
    resourceTypes: ['WINE_CLUB_MEMBERSHIP', 'WINE_CLUB_ALLOCATION'],
    readCapabilityKey: 'wine-club.read.shadow',
    liveCapabilityKey: 'wine-club.canonical.events.live'
  }),
  COMMERCE: Object.freeze({
    resourceTypes: ['SALES_ORDER'],
    readCapabilityKey: 'commerce.read.shadow',
    liveCapabilityKey: 'commerce.canonical.events.live'
  }),
  CATALOG: Object.freeze({
    resourceTypes: ['WINERY_PRODUCT', 'PRODUCT_VARIANT'],
    readCapabilityKey: 'catalog.read.shadow',
    liveCapabilityKey: 'catalog.canonical.events.live'
  }),
  INVENTORY: Object.freeze({
    resourceTypes: ['INVENTORY_POSITION'],
    readCapabilityKey: 'inventory.read.shadow',
    liveCapabilityKey: 'inventory.canonical.events.live'
  }),
  FULFILMENT: Object.freeze({
    resourceTypes: ['SHIPMENT'],
    readCapabilityKey: 'fulfilment.read.shadow',
    liveCapabilityKey: 'fulfilment.canonical.events.live'
  }),
  WORKFORCE: Object.freeze({
    resourceTypes: ['STAFF_IDENTITY', 'ROSTER_SHIFT', 'STAFF_AVAILABILITY'],
    readCapabilityKey: 'workforce.read.shadow',
    liveCapabilityKey: 'workforce.canonical.events.live'
  }),
  COMMUNICATION: Object.freeze({
    resourceTypes: ['MESSAGE'],
    readCapabilityKey: 'communication.read.shadow',
    liveCapabilityKey: 'communication.canonical.events.live'
  })
});

const toIso = value => value ? new Date(value).toISOString() : null;
const activationHash = snapshot => crypto
  .createHash('sha256')
  .update(stableSerialize(snapshot))
  .digest('hex');

function normalizeDomain(domain) {
  const normalized = String(domain || '').trim().toUpperCase();
  if (!includesRegistryValue(INTEGRATION_DOMAINS, normalized)) {
    throw new ValidationError('Integration domain is not supported');
  }
  return normalized;
}

function contractForDomain(domain) {
  const normalized = normalizeDomain(domain);
  const contract = DOMAIN_CONTRACTS[normalized];
  if (!contract) {
    throw new ValidationError(
      normalized === 'BOOKING'
        ? 'Use the Booking activation workflow for BOOKING'
        : `Domain activation contract is not registered for ${normalized}`
    );
  }
  return { domain: normalized, ...contract };
}

function serializeActivation(record) {
  if (!record) return null;
  return {
    id: record.id,
    connectionId: record.connectionId,
    domain: record.domain,
    scopeKey: record.scopeKey,
    locationId: record.locationId || null,
    status: record.status,
    sourceWatermarkAt: toIso(record.sourceWatermarkAt),
    activatedAt: toIso(record.activatedAt),
    activatedBy: record.activatedBy || null,
    activationReason: record.activationReason,
    authorityPolicyId: record.authorityPolicyId,
    disabledAt: toIso(record.disabledAt)
  };
}

function latestDate(...values) {
  const dates = values
    .flat()
    .filter(Boolean)
    .map(value => new Date(value))
    .filter(value => !Number.isNaN(value.getTime()));
  return dates.length ? new Date(Math.max(...dates.map(value => value.getTime()))) : null;
}

async function domainActivationPreview({
  wineryId,
  connectionId,
  domain,
  scopeKey = 'winery',
  env = process.env,
  transaction = null
}) {
  const contract = contractForDomain(domain);
  const connection = await IntegrationConnection.findOne({
    where: { id: connectionId, wineryId },
    attributes: [
      'id', 'providerKey', 'status', 'authReference', 'updatedAt',
      'lastHealthCheckedAt', 'lastHealthyAt'
    ],
    transaction
  });
  if (!connection) throw new NotFoundError('Integration connection not found');
  const scope = await IntegrationConnectionScope.findOne({
    where: { wineryId, connectionId, domain: contract.domain, scopeKey, isActive: true },
    attributes: ['id', 'scopeKey', 'areaId', 'locationId', 'updatedAt'],
    transaction
  });
  const [readCapability, credential, syncStates, sourceReferenceCount, projectedReferenceCount,
    mismatchedReferenceCount, latestReference, issues, policySet, activation] = await Promise.all([
    IntegrationConnectionCapability.findOne({
      where: {
        wineryId,
        connectionId,
        capabilityKey: contract.readCapabilityKey,
        enabled: true
      },
      order: [['contractVersion', 'DESC']],
      transaction
    }),
    connection.authReference ? IntegrationCredential.findOne({
      where: {
        wineryId,
        connectionId,
        credentialId: connection.authReference,
        status: 'ACTIVE'
      },
      attributes: ['id', 'lastVerifiedAt', 'lastVerificationStatus'],
      transaction
    }) : null,
    IntegrationSyncState.findAll({
      where: {
        wineryId,
        connectionId,
        resourceType: { [Op.in]: contract.resourceTypes }
      },
      attributes: [
        'id', 'resourceType', 'watermarkAt', 'initialBackfillStatus',
        'operationalStatus', 'updatedAt'
      ],
      transaction
    }),
    ExternalResourceReference.count({
      where: {
        wineryId,
        connectionId,
        resourceType: { [Op.in]: contract.resourceTypes }
      },
      transaction
    }),
    ExternalResourceReference.count({
      where: {
        wineryId,
        connectionId,
        resourceType: { [Op.in]: contract.resourceTypes },
        canonicalId: { [Op.ne]: null },
        resolutionStatus: 'RESOLVED',
        [Op.and]: sequelizeWhere(col('canonicalType'), Op.eq, col('resourceType'))
      },
      transaction
    }),
    ExternalResourceReference.count({
      where: {
        wineryId,
        connectionId,
        resourceType: { [Op.in]: contract.resourceTypes },
        canonicalId: { [Op.ne]: null },
        resolutionStatus: 'RESOLVED',
        [Op.and]: sequelizeWhere(col('canonicalType'), Op.ne, col('resourceType'))
      },
      transaction
    }),
    ExternalResourceReference.findOne({
      where: {
        wineryId,
        connectionId,
        resourceType: { [Op.in]: contract.resourceTypes }
      },
      attributes: ['observedAt'],
      order: [['observedAt', 'DESC']],
      transaction
    }),
    ProjectionIssue.findAll({
      where: {
        wineryId,
        connectionId,
        status: { [Op.in]: ['OPEN', 'ACKNOWLEDGED'] },
        severity: { [Op.in]: ['ERROR', 'BLOCKING'] }
      },
      attributes: ['externalResourceReferenceId'],
      include: [{
        model: ExternalResourceReference,
        as: 'ExternalResource',
        attributes: ['resourceType'],
        required: false
      }],
      transaction
    }),
    scope ? dataAuthorityPolicyService.resolveAuthorityPolicy({
      wineryId,
      domain: contract.domain,
      fieldGroup: POLICY_FIELD_GROUP,
      areaId: scope.areaId,
      locationId: scope.locationId,
      transaction
    }) : null,
    IntegrationDomainActivation.findOne({
      where: { wineryId, connectionId, domain: contract.domain, scopeKey },
      transaction
    })
  ]);

  const policy = policySet?.ActivePolicy || null;
  const primarySource = policy?.Sources?.find(source => (
    source.sourceRole === 'PRIMARY' && Number(source.sourceOrder) === 0
  ));
  const blockingIssueCount = issues.filter(issue => (
    !issue.ExternalResource
    || contract.resourceTypes.includes(issue.ExternalResource.resourceType)
  )).length;
  const fixtureExempt = FIXTURE_PROVIDER.test(connection.providerKey);
  const polling = Boolean(readCapability?.supportsPolling);
  const webhook = Boolean(readCapability?.supportsWebhook);
  const completedSyncStates = syncStates.filter(state => (
    state.initialBackfillStatus === 'COMPLETE' && state.watermarkAt
  ));
  const sourceWatermark = latestDate(
    completedSyncStates.map(state => state.watermarkAt),
    latestReference?.observedAt,
    readCapability?.lastVerifiedAt
  );
  const reasons = [];
  if (env.INTEGRATION_DOMAIN_ACTIVATION_ENABLED !== 'true') {
    reasons.push('DEPLOYMENT_ACTIVATION_GATE_DISABLED');
  }
  if (connection.status !== 'CONNECTED') reasons.push('CONNECTION_NOT_VERIFIED');
  if (!scope) reasons.push('ACTIVE_DOMAIN_SCOPE_REQUIRED');
  if (!readCapability) reasons.push('READ_CAPABILITY_REQUIRED');
  else {
    if (readCapability.availabilityStatus !== 'AVAILABLE') reasons.push('READ_CAPABILITY_UNAVAILABLE');
    if (!readCapability.lastVerifiedAt) reasons.push('READ_CAPABILITY_NOT_VERIFIED');
    if (!polling && !webhook) reasons.push('CAPABILITY_TRANSPORT_UNDECLARED');
  }
  if (!fixtureExempt) {
    if (!credential) reasons.push('ACTIVE_CREDENTIAL_REQUIRED');
    else if (credential.lastVerificationStatus !== 'SUCCEEDED') reasons.push('CREDENTIAL_NOT_VERIFIED');
  }
  if (polling && completedSyncStates.length === 0) reasons.push('INITIAL_HYDRATION_INCOMPLETE');
  if (!sourceWatermark) reasons.push('SOURCE_WATERMARK_UNAVAILABLE');
  if (sourceReferenceCount !== projectedReferenceCount) reasons.push('SHADOW_RESOURCES_NOT_FULLY_PROJECTED');
  if (mismatchedReferenceCount > 0) reasons.push('CANONICAL_RESOURCE_TYPE_MISMATCH');
  if (!policy) reasons.push('CORE_AUTHORITY_POLICY_REQUIRED');
  else if (policy.resolutionStrategy !== 'SOURCE_PRIORITY') reasons.push('CORE_MUST_USE_SOURCE_PRIORITY');
  else if (!primarySource || primarySource.connectionId !== connectionId) {
    reasons.push('CONNECTION_MUST_BE_PRIMARY_DOMAIN_AUTHORITY');
  }
  if (blockingIssueCount > 0) reasons.push('BLOCKING_PROJECTION_ISSUES_EXIST');

  const snapshot = {
    schemaVersion: DOMAIN_ACTIVATION_SCHEMA_VERSION,
    domain: contract.domain,
    connectionId,
    connectionStatus: connection.status,
    connectionUpdatedAt: toIso(connection.updatedAt),
    scopeKey,
    scopeId: scope?.id || null,
    scopeUpdatedAt: toIso(scope?.updatedAt),
    locationId: scope?.locationId || null,
    areaId: scope?.areaId || null,
    readCapabilityKey: contract.readCapabilityKey,
    readCapabilityVersion: readCapability?.contractVersion || null,
    readCapabilityUpdatedAt: toIso(readCapability?.updatedAt),
    credentialReadiness: fixtureExempt
      ? 'FIXTURE_EXEMPT'
      : credential?.lastVerificationStatus === 'SUCCEEDED'
        ? 'VERIFIED'
        : credential
          ? 'UNVERIFIED'
          : 'MISSING',
    sourceWatermarkAt: toIso(sourceWatermark),
    syncStateIds: syncStates.map(state => state.id).sort((a, b) => a - b),
    sourceReferenceCount,
    projectedReferenceCount,
    mismatchedReferenceCount,
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
    activation: serializeActivation(activation),
    automationEligible: false
  };
}

async function activateDomain({
  wineryId,
  connectionId,
  domain,
  actorUserId,
  data,
  env = process.env
}) {
  const contract = contractForDomain(domain);
  return sequelize.transaction(async transaction => {
    const actor = await User.findOne({
      where: { id: actorUserId, wineryId },
      attributes: ['id'],
      transaction
    });
    if (!actor) throw new ValidationError('Domain activation actor does not belong to the winery');
    const duplicateRequest = await IntegrationDomainActivation.findOne({
      where: { wineryId, requestId: data.requestId },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (duplicateRequest) {
      if (
        duplicateRequest.connectionId !== connectionId
        || duplicateRequest.domain !== contract.domain
        || duplicateRequest.scopeKey !== data.scopeKey
      ) throw new ValidationError('Activation requestId is already used for another scope');
      return { activation: serializeActivation(duplicateRequest), duplicate: true };
    }
    await integrationConfigurationAuthorityService.assertCanonicalDomainCanBeInvalidated({
      wineryId,
      domains: [contract.domain],
      transaction
    });
    const preview = await domainActivationPreview({
      wineryId,
      connectionId,
      domain: contract.domain,
      scopeKey: data.scopeKey,
      env,
      transaction
    });
    if (preview.previewToken !== data.previewToken) {
      throw new ValidationError('Domain activation preview is stale; generate a new preview');
    }
    if (!preview.ready) {
      throw new ValidationError(`Domain activation is blocked: ${preview.reasons.join(', ')}`);
    }
    const existing = await IntegrationDomainActivation.findOne({
      where: {
        wineryId,
        connectionId,
        domain: contract.domain,
        scopeKey: data.scopeKey
      },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (
      existing?.status === 'ACTIVE'
      && existing.previewHash === data.previewToken
      && existing.authorityPolicyId === preview.authorityPolicyId
      && toIso(existing.sourceWatermarkAt) === preview.sourceWatermarkAt
    ) return { activation: serializeActivation(existing), duplicate: true };

    const values = {
      wineryId,
      connectionId,
      domain: contract.domain,
      scopeKey: data.scopeKey,
      locationId: preview.locationId,
      status: 'ACTIVE',
      sourceWatermarkAt: new Date(preview.sourceWatermarkAt),
      activatedAt: new Date(),
      activatedBy: actorUserId,
      activationReason: data.reason,
      requestId: data.requestId,
      previewHash: data.previewToken,
      previewSnapshot: {
        schemaVersion: preview.schemaVersion,
        sourceWatermarkAt: preview.sourceWatermarkAt,
        sourceReferenceCount: preview.sourceReferenceCount,
        projectedReferenceCount: preview.projectedReferenceCount,
        mismatchedReferenceCount: preview.mismatchedReferenceCount,
        blockingIssueCount: preview.blockingIssueCount,
        authorityPolicyId: preview.authorityPolicyId,
        authorityPolicyVersion: preview.authorityPolicyVersion,
        readCapabilityKey: preview.readCapabilityKey,
        readCapabilityVersion: preview.readCapabilityVersion
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
      if (!(error instanceof UniqueConstraintError || error.name === 'SequelizeUniqueConstraintError')) {
        throw error;
      }
      activation = await IntegrationDomainActivation.findOne({
        where: {
          wineryId,
          connectionId,
          domain: contract.domain,
          scopeKey: data.scopeKey
        },
        transaction
      });
      if (!activation) throw error;
    }

    const [liveCapability] = await IntegrationConnectionCapability.findOrCreate({
      where: {
        connectionId,
        capabilityKey: contract.liveCapabilityKey,
        contractVersion: '1'
      },
      defaults: {
        wineryId,
        kind: 'READ',
        enabled: true,
        availabilityStatus: 'AVAILABLE',
        supportsWebhook: false,
        supportsPolling: false,
        lastVerifiedAt: activation.activatedAt,
        metadata: {
          nonRetroactive: true,
          activationId: activation.id,
          sourceWatermarkAt: preview.sourceWatermarkAt
        }
      },
      transaction
    });
    await liveCapability.update({
      enabled: true,
      availabilityStatus: 'AVAILABLE',
      lastVerifiedAt: activation.activatedAt,
      unavailableReason: null,
      metadata: {
        nonRetroactive: true,
        activationId: activation.id,
        sourceWatermarkAt: preview.sourceWatermarkAt
      }
    }, { transaction });
    return { activation: serializeActivation(activation), duplicate: false };
  });
}

async function disableDomain({
  wineryId,
  connectionId,
  domain,
  actorUserId,
  scopeKey,
  reason
}) {
  const contract = contractForDomain(domain);
  return sequelize.transaction(async transaction => {
    const actor = await User.findOne({
      where: { id: actorUserId, wineryId },
      attributes: ['id'],
      transaction
    });
    if (!actor) throw new ValidationError('Domain activation actor does not belong to the winery');
    await integrationConfigurationAuthorityService.assertCanonicalDomainCanBeInvalidated({
      wineryId,
      domains: [contract.domain],
      transaction
    });
    const activation = await IntegrationDomainActivation.findOne({
      where: { wineryId, connectionId, domain: contract.domain, scopeKey },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!activation) throw new NotFoundError('Domain activation not found');
    if (activation.status === 'DISABLED') {
      return { activation: serializeActivation(activation), duplicate: true };
    }
    const disabledAt = new Date();
    await activation.update({
      status: 'DISABLED',
      disabledAt,
      disabledBy: actorUserId,
      disabledReason: reason
    }, { transaction });
    await IntegrationConnectionCapability.update({
      enabled: false,
      availabilityStatus: 'UNAVAILABLE',
      unavailableReason: 'DOMAIN_ACTIVATION_DISABLED'
    }, {
      where: {
        wineryId,
        connectionId,
        capabilityKey: contract.liveCapabilityKey
      },
      transaction
    });
    return { activation: serializeActivation(activation), duplicate: false };
  });
}

module.exports = {
  DOMAIN_ACTIVATION_SCHEMA_VERSION,
  DOMAIN_CONTRACTS,
  contractForDomain,
  domainActivationPreview,
  activateDomain,
  disableDomain,
  serializeActivation
};
