const { Op } = require('sequelize');
const {
  DataAuthorityPolicy,
  DataAuthorityPolicySet,
  DataAuthorityPolicySource,
  IntegrationConnection,
  IntegrationConnectionCapability,
  IntegrationDomainActivation,
  OperationalArea,
  User,
  WineryLocation,
  sequelize
} = require('../models');
const { ValidationError, NotFoundError } = require('../utils/errors');
const { buildScopeKey } = require('./integrationDataFoundation.service');
const integrationConfigurationAuthorityService = require('./integrationConfigurationAuthority.service');
const {
  INTEGRATION_DOMAINS,
  AUTHORITY_RESOLUTION_STRATEGIES,
  AUTHORITY_SOURCE_ROLES,
  includesRegistryValue
} = require('./integrationDataRegistry.service');

const normalizeRegistryValue = (registry, value, fieldName) => {
  const normalized = String(value || '').trim().toUpperCase();
  if (!includesRegistryValue(registry, normalized)) {
    throw new ValidationError(`${fieldName} is not supported`);
  }
  return normalized;
};

const normalizeFieldGroup = value => {
  const fieldGroup = String(value || '').trim().toUpperCase();
  if (!fieldGroup || fieldGroup.length > 120 || !/^[A-Z0-9_.-]+$/.test(fieldGroup)) {
    throw new ValidationError('fieldGroup must be a stable registry key');
  }
  return fieldGroup;
};

const normalizeSources = (strategy, sources = []) => {
  if (!Array.isArray(sources)) throw new ValidationError('sources must be an array');
  if (strategy === 'VINAGENT_OWNED') {
    if (sources.length > 0) throw new ValidationError('VINAGENT_OWNED policies cannot declare external sources');
    return [];
  }
  if (sources.length === 0) throw new ValidationError('SOURCE_PRIORITY policies require at least one source');

  const normalized = sources.map((source, index) => ({
    connectionId: Number(source.connectionId),
    sourceRole: normalizeRegistryValue(AUTHORITY_SOURCE_ROLES, source.sourceRole, 'sourceRole'),
    sourceOrder: source.sourceOrder == null ? index : Number(source.sourceOrder),
    configuration: source.configuration || null
  }));
  if (normalized.some(source => !Number.isSafeInteger(source.connectionId) || source.connectionId <= 0)) {
    throw new ValidationError('Every authority source requires a valid connectionId');
  }
  if (normalized.some(source => !Number.isSafeInteger(source.sourceOrder) || source.sourceOrder < 0)) {
    throw new ValidationError('Every authority source requires a non-negative sourceOrder');
  }
  if (new Set(normalized.map(source => source.connectionId)).size !== normalized.length) {
    throw new ValidationError('An authority policy cannot repeat a connection');
  }
  if (new Set(normalized.map(source => source.sourceOrder)).size !== normalized.length) {
    throw new ValidationError('Authority source ordering must be unique');
  }
  if (normalized.filter(source => source.sourceRole === 'PRIMARY').length !== 1) {
    throw new ValidationError('SOURCE_PRIORITY policies require exactly one primary source');
  }
  if (normalized.find(source => source.sourceRole === 'PRIMARY').sourceOrder !== 0) {
    throw new ValidationError('The primary authority source must have sourceOrder 0');
  }
  return normalized.sort((a, b) => a.sourceOrder - b.sourceOrder);
};

const assertScopeBelongsToWinery = async ({ wineryId, areaId, locationId, transaction }) => {
  if (areaId != null) {
    const area = await OperationalArea.findOne({ where: { id: areaId, wineryId }, attributes: ['id'], transaction });
    if (!area) throw new ValidationError('Authority policy area does not belong to the winery');
  }
  if (locationId != null) {
    const location = await WineryLocation.findOne({ where: { id: locationId, wineryId }, attributes: ['id'], transaction });
    if (!location) throw new ValidationError('Authority policy location does not belong to the winery');
  }
};

async function createAuthorityPolicyVersion({
  wineryId,
  areaId = null,
  locationId = null,
  domain,
  fieldGroup,
  resolutionStrategy,
  baselineFreshnessSeconds = null,
  definition = null,
  sources = [],
  actorUserId = null
}) {
  const normalizedDomain = normalizeRegistryValue(INTEGRATION_DOMAINS, domain, 'domain');
  const normalizedFieldGroup = normalizeFieldGroup(fieldGroup);
  const strategy = normalizeRegistryValue(AUTHORITY_RESOLUTION_STRATEGIES, resolutionStrategy, 'resolutionStrategy');
  const normalizedSources = normalizeSources(strategy, sources);
  const scopeKey = buildScopeKey({ areaId, locationId });
  const freshness = baselineFreshnessSeconds == null ? null : Number(baselineFreshnessSeconds);
  if (freshness != null && (!Number.isSafeInteger(freshness) || freshness < 0)) {
    throw new ValidationError('baselineFreshnessSeconds must be a non-negative integer');
  }

  return sequelize.transaction(async transaction => {
    await assertScopeBelongsToWinery({ wineryId, areaId, locationId, transaction });
    if (actorUserId != null) {
      const actor = await User.findOne({ where: { id: actorUserId, wineryId }, attributes: ['id'], transaction });
      if (!actor) throw new ValidationError('Authority policy actor does not belong to the winery');
    }
    if (normalizedSources.length > 0) {
      const count = await IntegrationConnection.count({
        where: { id: { [Op.in]: normalizedSources.map(source => source.connectionId) }, wineryId },
        transaction
      });
      if (count !== normalizedSources.length) {
        throw new ValidationError('One or more authority sources do not belong to the winery');
      }
    }

    let policySet = await DataAuthorityPolicySet.findOne({
      where: { wineryId, scopeKey, domain: normalizedDomain, fieldGroup: normalizedFieldGroup },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!policySet) {
      policySet = await DataAuthorityPolicySet.create({
        wineryId,
        scopeKey,
        areaId,
        locationId,
        domain: normalizedDomain,
        fieldGroup: normalizedFieldGroup
      }, { transaction });
    }

    const latest = await DataAuthorityPolicy.findOne({
      where: { policySetId: policySet.id },
      attributes: ['version'],
      order: [['version', 'DESC']],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    const policy = await DataAuthorityPolicy.create({
      policySetId: policySet.id,
      wineryId,
      version: (latest?.version || 0) + 1,
      status: 'DRAFT',
      resolutionStrategy: strategy,
      baselineFreshnessSeconds: freshness,
      definition,
      createdBy: actorUserId
    }, { transaction });

    if (normalizedSources.length > 0) {
      await DataAuthorityPolicySource.bulkCreate(normalizedSources.map(source => ({
        ...source,
        policyId: policy.id,
        wineryId
      })), { transaction });
    }
    return policy;
  });
}

async function activateAuthorityPolicy({ policyId, wineryId, actorUserId = null, effectiveAt = new Date() }) {
  const activationTime = new Date(effectiveAt);
  if (Number.isNaN(activationTime.getTime())) throw new ValidationError('effectiveAt must be a valid date');
  return sequelize.transaction(async transaction => {
    if (actorUserId != null) {
      const actor = await User.findOne({ where: { id: actorUserId, wineryId }, attributes: ['id'], transaction });
      if (!actor) throw new ValidationError('Authority policy approver does not belong to the winery');
    }
    const policy = await DataAuthorityPolicy.findOne({
      where: { id: policyId, wineryId },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!policy) throw new NotFoundError('Authority policy not found');
    const policySet = await DataAuthorityPolicySet.findOne({
      where: { id: policy.policySetId, wineryId },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!policySet) throw new NotFoundError('Authority policy set not found');
    await integrationConfigurationAuthorityService.assertCanonicalDomainCanBeInvalidated({
      wineryId,
      domains: [policySet.domain],
      transaction
    });
    if (policy.status === 'ACTIVE' && policySet.activePolicyId === policy.id) return policy;
    if (policy.status !== 'DRAFT') throw new ValidationError('Only draft authority policies can be activated');

    if (policySet.activePolicyId) {
      await DataAuthorityPolicy.update({ status: 'RETIRED', effectiveTo: activationTime }, {
        where: { id: policySet.activePolicyId, wineryId, status: 'ACTIVE' },
        transaction
      });
    }
    await policy.update({
      status: 'ACTIVE',
      effectiveFrom: activationTime,
      effectiveTo: null,
      approvedBy: actorUserId,
      approvedAt: activationTime
    }, { transaction });
    await policySet.update({
      activePolicyId: policy.id,
      lockVersion: Number(policySet.lockVersion || 0) + 1
    }, { transaction });
    const staleActivations = await IntegrationDomainActivation.findAll({
        where: {
          wineryId,
          domain: policySet.domain,
          scopeKey: policySet.scopeKey,
          status: 'ACTIVE',
          authorityPolicyId: { [Op.ne]: policy.id }
        },
        attributes: ['id', 'connectionId'],
        transaction,
        lock: transaction.LOCK.UPDATE
      });
    if (staleActivations.length > 0) {
      const connectionIds = [...new Set(staleActivations.map(activation => activation.connectionId))];
      await IntegrationDomainActivation.update({
        status: 'DISABLED',
        disabledAt: activationTime,
        disabledBy: actorUserId,
        disabledReason: policySet.domain === 'BOOKING'
          ? 'Booking authority policy changed after activation.'
          : `${policySet.domain} authority policy changed after activation.`
      }, {
        where: { id: { [Op.in]: staleActivations.map(activation => activation.id) } },
        transaction
      });
      await IntegrationConnectionCapability.update({
        enabled: false,
        availabilityStatus: 'UNAVAILABLE',
        unavailableReason: policySet.domain === 'BOOKING'
          ? 'BOOKING_ACTIVATION_INVALIDATED_BY_AUTHORITY_CHANGE'
          : 'DOMAIN_ACTIVATION_INVALIDATED_BY_AUTHORITY_CHANGE'
      }, {
        where: {
          wineryId,
          connectionId: { [Op.in]: connectionIds },
          capabilityKey: { [Op.like]: '%.canonical.events.live' }
        },
        transaction
      });
    }
    return policy;
  });
}

async function resolveAuthorityPolicy({
  wineryId,
  domain,
  fieldGroup,
  areaId = null,
  locationId = null,
  transaction = null
}) {
  const normalizedDomain = normalizeRegistryValue(INTEGRATION_DOMAINS, domain, 'domain');
  const normalizedFieldGroup = normalizeFieldGroup(fieldGroup);
  const scopeKeys = [];
  if (locationId != null) scopeKeys.push(buildScopeKey({ locationId }));
  if (areaId != null) scopeKeys.push(buildScopeKey({ areaId }));
  scopeKeys.push('winery');

  const policySets = await DataAuthorityPolicySet.findAll({
    where: {
      wineryId,
      domain: normalizedDomain,
      fieldGroup: normalizedFieldGroup,
      scopeKey: { [Op.in]: scopeKeys },
      activePolicyId: { [Op.ne]: null }
    },
    include: [{
      model: DataAuthorityPolicy,
      as: 'ActivePolicy',
      required: true,
      where: { status: 'ACTIVE' },
      include: [{
        model: DataAuthorityPolicySource,
        as: 'Sources',
        include: [{
          model: IntegrationConnection,
          as: 'Connection',
          attributes: ['id', 'connectionKey', 'providerKey', 'displayName', 'status']
        }]
      }]
    }],
    transaction
  });
  return policySets.sort((a, b) => scopeKeys.indexOf(a.scopeKey) - scopeKeys.indexOf(b.scopeKey))[0] || null;
}

module.exports = {
  createAuthorityPolicyVersion,
  activateAuthorityPolicy,
  resolveAuthorityPolicy,
  normalizeSources
};
