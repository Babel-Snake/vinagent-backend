const { Op, UniqueConstraintError } = require('sequelize');
const {
  CanonicalEventOutbox,
  DataAuthorityPolicy,
  DataAuthorityPolicySet,
  DataAuthorityPolicySource,
  IntegrationConnection,
  IntegrationConfigurationAuthority,
  IntegrationConnectionCapability,
  IntegrationConnectionScope,
  IntegrationEvent,
  IntegrationDomainActivation,
  IntegrationJob,
  IntegrationWebhookEndpoint,
  LocationAreaLink,
  OperationalArea,
  WineryLocation,
  sequelize
} = require('../models');
const { redact } = require('../utils/sanitizer');
const { ValidationError, NotFoundError } = require('../utils/errors');
const { buildScopeKey } = require('./integrationDataFoundation.service');
const dataAuthorityPolicyService = require('./dataAuthorityPolicy.service');
const integrationCredentialService = require('./integrationCredential.service');
const integrationJobService = require('./integrationJob.service');
const integrationOperationsService = require('./integrationOperations.service');
const integrationSchedulerRegistry = require('./integrationSchedulers.service');
const integrationWebhookEndpointService = require('./integrationWebhookEndpoint.service');
const integrationWebhookAdapters = require('./integrationWebhookAdapters.service');
const integrationWebhookRecoveries = require('./integrationWebhookRecoveries.service');
const legacyIntegrationBackfillService = require('./legacyIntegrationBackfill.service');
const projectionIssueManagementService = require('./projectionIssueManagement.service');
const projectionIssueResolutions = require('./projectionIssueResolutions.service');
const integrationConfigurationAuthorityService = require('./integrationConfigurationAuthority.service');
const customerProfileService = require('./customerProfile.service');
const wineClubProjectionService = require('./wineClubProjection.service');
const commerceProjectionService = require('./commerceProjection.service');
const businessEntityLinkService = require('./businessEntityLink.service');
const customerRollupService = require('./customerRollup.service');
const inventoryManagementService = require('./inventoryManagement.service');
const inventoryDemandMappingService = require('./inventoryDemandMapping.service');
const fulfilmentManagementService = require('./fulfilmentManagement.service');
const workforceManagementService = require('./workforceManagement.service');
const bookingCoverageContextService = require('./bookingCoverageContext.service');
const communicationManagementService = require('./communicationManagement.service');
const intelligenceFactService = require('./intelligenceFact.service');
const intelligenceFactRegistry = require('./intelligenceFactRegistry.service');
const customerRelationshipContextService = require('./customerRelationshipContext.service');
const clubFulfilmentContextService = require('./clubFulfilmentContext.service');
const areaCapacityContextService = require('./areaCapacityContext.service');
const integrationHealthService = require('./integrationHealth.service');
const domainActivationService = require('./domainActivation.service');
const canonicalBookingManagementService = require('./canonicalBookingManagement.service');
const {
  BOOKING_VERIFY_JOB_KIND,
  BOOKING_HYDRATE_JOB_KIND,
  BOOKING_INCREMENTAL_JOB_KIND,
  BOOKING_RECONCILE_JOB_KIND,
  normalizeHydrationWindow,
  hydrationStreamKey,
  requireBookingConnection,
  prepareBookingPollRun
} = require('./bookingShadowSync.service');
const {
  getShadowBookingConnectorManifest,
  hasShadowBookingConnector,
  listShadowBookingConnectorManifests
} = require('./integrations/booking/shadowConnectorRegistry');

const SECRET_KEY_PATTERN = /(?:password|passphrase|secret|token|credential|api[_-]?key|private[_-]?key|authorization)/i;

function assertPublicConfiguration(value, fieldName = 'configuration') {
  if (value == null) return;
  if (typeof value !== 'object' || Array.isArray(value)) throw new ValidationError(`${fieldName} must be an object`);
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > 32768) {
    throw new ValidationError(`${fieldName} is too large`);
  }
  const inspect = (current, path) => {
    if (Array.isArray(current)) return current.forEach((item, index) => inspect(item, `${path}[${index}]`));
    if (!current || typeof current !== 'object') return;
    for (const [key, nested] of Object.entries(current)) {
      if (SECRET_KEY_PATTERN.test(key)) {
        throw new ValidationError(`${path}.${key} is sensitive and must use protected credential onboarding`);
      }
      inspect(nested, `${path}.${key}`);
    }
  };
  inspect(value, fieldName);
}

function normalizeConnectionConfiguration({ providerKey, configuration, externalLocationId, env = process.env }) {
  if (!hasShadowBookingConnector(providerKey)) return configuration || null;
  if (!externalLocationId) throw new ValidationError('Read-only booking feed connections require externalLocationId');
  const manifest = getShadowBookingConnectorManifest(providerKey);
  return manifest.validateConfiguration(configuration, { env });
}

function serializeConnection(record) {
  const plain = record?.toJSON ? record.toJSON() : { ...record };
  const credentialConfigured = Boolean(plain.authReference);
  delete plain.authReference;
  return { ...plain, configuration: redact(plain.configuration), providerExtensions: redact(plain.providerExtensions), credentialConfigured };
}

const pageResult = (result, page, pageSize, key) => ({
  [key]: result.rows,
  pagination: {
    page,
    pageSize,
    total: result.count,
    totalPages: Math.max(1, Math.ceil(result.count / pageSize))
  }
});

const connectionIncludes = domain => [
  {
    model: IntegrationConnectionScope,
    as: 'Scopes',
    required: Boolean(domain && domain !== 'ALL'),
    where: domain && domain !== 'ALL' ? { domain } : undefined,
    include: [
      { model: OperationalArea, as: 'Area', attributes: ['id', 'name', 'isActive'] },
      { model: WineryLocation, as: 'Location', attributes: ['id', 'code', 'name', 'isActive'] }
    ]
  },
  { model: IntegrationConnectionCapability, as: 'Capabilities' }
];

async function listConnections({ wineryId, page = 1, pageSize = 25, providerKey, status = 'ALL', domain = 'ALL' }) {
  const where = { wineryId };
  if (providerKey) where.providerKey = providerKey;
  if (status !== 'ALL') where.status = status;
  const result = await IntegrationConnection.findAndCountAll({
    where,
    include: connectionIncludes(domain),
    distinct: true,
    order: [['displayName', 'ASC'], ['id', 'ASC']],
    limit: pageSize,
    offset: (page - 1) * pageSize
  });
  result.rows = result.rows.map(serializeConnection);
  return pageResult(result, page, pageSize, 'connections');
}

async function getConnection({ connectionId, wineryId, transaction = null }) {
  const connection = await IntegrationConnection.findOne({
    where: { id: connectionId, wineryId },
    include: connectionIncludes('ALL'),
    transaction
  });
  if (!connection) throw new NotFoundError('Integration connection not found');
  return serializeConnection(connection);
}

async function validateScopeTargets({ wineryId, areaId, locationId, transaction }) {
  if (areaId != null) {
    const area = await OperationalArea.findOne({ where: { id: areaId, wineryId }, attributes: ['id'], transaction });
    if (!area) throw new ValidationError('Connection scope area does not belong to the winery');
  }
  if (locationId != null) {
    const location = await WineryLocation.findOne({ where: { id: locationId, wineryId }, attributes: ['id'], transaction });
    if (!location) throw new ValidationError('Connection scope location does not belong to the winery');
  }
}

async function createScopeRecord({ connection, wineryId, data, transaction }) {
  await validateScopeTargets({ wineryId, areaId: data.areaId, locationId: data.locationId, transaction });
  const scopeKey = buildScopeKey({ areaId: data.areaId, locationId: data.locationId });
  return IntegrationConnectionScope.create({
    wineryId,
    connectionId: connection.id,
    domain: data.domain,
    scopeKey,
    areaId: data.areaId || null,
    locationId: data.locationId || null,
    priority: data.priority,
    isDefault: data.isDefault,
    isActive: data.isActive
  }, { transaction });
}

async function createConnection({ wineryId, userId, data }) {
  assertPublicConfiguration(data.configuration);
  if (hasShadowBookingConnector(data.providerKey)
    && !data.scopes.some(scope => scope.domain === 'BOOKING' && scope.isActive)) {
    throw new ValidationError('Read-only booking feed connections require an active BOOKING scope');
  }
  const configuration = normalizeConnectionConfiguration({
    providerKey: data.providerKey,
    configuration: data.configuration,
    externalLocationId: data.externalLocationId
  });
  try {
    return await sequelize.transaction(async transaction => {
      const connection = await IntegrationConnection.create({
        wineryId,
        connectionKey: data.connectionKey,
        providerKey: data.providerKey,
        displayName: data.displayName,
        status: 'PENDING',
        externalAccountId: data.externalAccountId || null,
        externalLocationId: data.externalLocationId || null,
        configuration,
        authReference: null,
        createdBy: userId,
        updatedBy: userId
      }, { transaction });
      for (const scope of data.scopes) {
        await createScopeRecord({ connection, wineryId, data: scope, transaction });
      }
      return getConnection({ connectionId: connection.id, wineryId, transaction });
    });
  } catch (error) {
    if (error instanceof UniqueConstraintError || error.name === 'SequelizeUniqueConstraintError') {
      throw new ValidationError('The connection key or one of its scopes already exists');
    }
    throw error;
  }
}

async function updateConnection({ connectionId, wineryId, userId, data }) {
  assertPublicConfiguration(data.configuration);
  return sequelize.transaction(async transaction => {
    const connection = await IntegrationConnection.findOne({
      where: { id: connectionId, wineryId },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!connection) throw new NotFoundError('Integration connection not found');
    const invalidatesAuthority = data.configuration !== undefined
      || data.externalAccountId !== undefined
      || data.externalLocationId !== undefined
      || data.lifecycleAction != null;
    if (invalidatesAuthority) {
      const scopes = await IntegrationConnectionScope.findAll({
        where: { wineryId, connectionId, isActive: true },
        attributes: ['domain'],
        transaction
      });
      await integrationConfigurationAuthorityService.assertCanonicalDomainCanBeInvalidated({
        wineryId,
        domains: scopes.map(scope => scope.domain),
        transaction
      });
    }
    const updates = { updatedBy: userId };
    for (const key of ['displayName', 'externalAccountId', 'externalLocationId', 'configuration']) {
      if (data[key] !== undefined) updates[key] = data[key] === '' ? null : data[key];
    }
    if (data.configuration !== undefined || data.externalLocationId !== undefined) {
      updates.configuration = normalizeConnectionConfiguration({
        providerKey: connection.providerKey,
        configuration: data.configuration === undefined ? connection.configuration : data.configuration,
        externalLocationId: data.externalLocationId === undefined ? connection.externalLocationId : data.externalLocationId
      });
      if (connection.status !== 'DISABLED') {
        updates.status = 'PENDING';
        updates.connectedAt = null;
      }
    }
    if (data.lifecycleAction === 'DISABLE') {
      updates.status = 'DISABLED';
      updates.disabledAt = new Date();
    } else if (data.lifecycleAction === 'ENABLE_PENDING') {
      if (connection.status !== 'DISABLED') throw new ValidationError('Only disabled connections can be re-enabled');
      updates.status = 'PENDING';
      updates.disabledAt = null;
    }
    await connection.update(updates, { transaction });
    if (data.configuration !== undefined || data.externalLocationId !== undefined) {
      await IntegrationDomainActivation.update({
        status: 'DISABLED',
        disabledAt: new Date(),
        disabledBy: userId,
        disabledReason: 'Connection configuration or external location changed after activation.'
      }, {
        where: { wineryId, connectionId, status: 'ACTIVE' },
        transaction
      });
      await IntegrationConnectionCapability.update({
        enabled: false,
        availabilityStatus: 'UNAVAILABLE',
        unavailableReason: 'DOMAIN_ACTIVATION_INVALIDATED_BY_CONNECTION_CHANGE'
      }, {
        where: {
          wineryId,
          connectionId,
          capabilityKey: { [Op.like]: '%.canonical.events.live' }
        },
        transaction
      });
    }
    return getConnection({ connectionId, wineryId, transaction });
  });
}

async function addConnectionScope({ connectionId, wineryId, data }) {
  return sequelize.transaction(async transaction => {
    const connection = await IntegrationConnection.findOne({ where: { id: connectionId, wineryId }, transaction });
    if (!connection) throw new NotFoundError('Integration connection not found');
    try {
      return await createScopeRecord({ connection, wineryId, data, transaction });
    } catch (error) {
      if (error instanceof UniqueConstraintError || error.name === 'SequelizeUniqueConstraintError') {
        throw new ValidationError('This connection scope already exists');
      }
      throw error;
    }
  });
}

async function deleteConnectionScope({ connectionId, scopeId, wineryId }) {
  return sequelize.transaction(async transaction => {
    const connection = await IntegrationConnection.findOne({
      where: { id: connectionId, wineryId },
      attributes: ['id', 'providerKey'],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!connection) throw new NotFoundError('Integration connection not found');
    const scope = await IntegrationConnectionScope.findOne({
      where: { id: scopeId, connectionId, wineryId },
      attributes: ['id', 'domain', 'isActive'],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!scope) throw new NotFoundError('Integration connection scope not found');
    await integrationConfigurationAuthorityService.assertCanonicalDomainCanBeInvalidated({
      wineryId,
      domains: [scope.domain],
      transaction
    });
    const scopeCount = await IntegrationConnectionScope.count({ where: { connectionId, wineryId }, transaction });
    if (scopeCount <= 1) throw new ValidationError('A connection must retain at least one scope');
    if (hasShadowBookingConnector(connection.providerKey) && scope.domain === 'BOOKING' && scope.isActive) {
      const activeBookingScopeCount = await IntegrationConnectionScope.count({
        where: { connectionId, wineryId, domain: 'BOOKING', isActive: true },
        transaction
      });
      if (activeBookingScopeCount <= 1) {
        throw new ValidationError('Read-only booking feed connections must retain an active BOOKING scope');
      }
    }
    await scope.destroy({ transaction });
  });
}

async function assertParentLocation({ wineryId, locationId, parentLocationId, transaction = null }) {
  if (parentLocationId == null) return;
  const visited = new Set(locationId == null ? [] : [Number(locationId)]);
  let ancestorId = Number(parentLocationId);
  for (let depth = 0; depth < 100; depth += 1) {
    if (visited.has(ancestorId)) throw new ValidationError('Location parent relationships cannot contain a cycle');
    visited.add(ancestorId);
    const parent = await WineryLocation.findOne({
      where: { id: ancestorId, wineryId },
      attributes: ['id', 'parentLocationId'],
      transaction,
      lock: transaction ? transaction.LOCK.UPDATE : undefined
    });
    if (!parent) throw new ValidationError('Parent location does not belong to the winery');
    if (parent.parentLocationId == null) return;
    ancestorId = Number(parent.parentLocationId);
  }
  throw new ValidationError('Location parent hierarchy exceeds the supported depth');
}

async function listLocations({ wineryId }) {
  return WineryLocation.findAll({
    where: { wineryId },
    include: [{
      model: LocationAreaLink,
      as: 'AreaLinks',
      include: [{ model: OperationalArea, as: 'Area', attributes: ['id', 'name', 'isActive'] }]
    }],
    order: [['isActive', 'DESC'], ['name', 'ASC'], ['id', 'ASC']]
  });
}

async function createLocation({ wineryId, data }) {
  assertPublicConfiguration(data.metadata, 'metadata');
  await assertParentLocation({ wineryId, parentLocationId: data.parentLocationId });
  try {
    return await WineryLocation.create({ ...data, wineryId });
  } catch (error) {
    if (error instanceof UniqueConstraintError || error.name === 'SequelizeUniqueConstraintError') {
      throw new ValidationError('Location code already exists in this winery');
    }
    throw error;
  }
}

async function updateLocation({ wineryId, locationId, data }) {
  assertPublicConfiguration(data.metadata, 'metadata');
  return sequelize.transaction(async transaction => {
    const location = await WineryLocation.findOne({
      where: { id: locationId, wineryId },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!location) throw new NotFoundError('Winery location not found');
    await assertParentLocation({
      wineryId,
      locationId,
      parentLocationId: data.parentLocationId,
      transaction
    });
    await location.update(data, { transaction });
    return location;
  });
}

async function addLocationAreaLink({ wineryId, locationId, userId, data }) {
  const [location, area] = await Promise.all([
    WineryLocation.findOne({ where: { id: locationId, wineryId }, attributes: ['id'] }),
    OperationalArea.findOne({ where: { id: data.areaId, wineryId }, attributes: ['id'] })
  ]);
  if (!location) throw new NotFoundError('Winery location not found');
  if (!area) throw new ValidationError('Operational area does not belong to the winery');
  try {
    return await LocationAreaLink.create({
      wineryId,
      locationId,
      areaId: data.areaId,
      relationshipType: data.relationshipType,
      createdBy: userId
    });
  } catch (error) {
    if (error instanceof UniqueConstraintError || error.name === 'SequelizeUniqueConstraintError') {
      throw new ValidationError('This location and operational area are already linked in that role');
    }
    throw error;
  }
}

async function deleteLocationAreaLink({ wineryId, locationId, linkId }) {
  const deleted = await LocationAreaLink.destroy({ where: { id: linkId, locationId, wineryId } });
  if (!deleted) throw new NotFoundError('Location and operational area link not found');
}

async function listAuthorityPolicySets({ wineryId, page = 1, pageSize = 25, domain = 'ALL', fieldGroup, scopeKey }) {
  const where = { wineryId };
  if (domain !== 'ALL') where.domain = domain;
  if (fieldGroup) where.fieldGroup = fieldGroup;
  if (scopeKey) where.scopeKey = scopeKey;
  const result = await DataAuthorityPolicySet.findAndCountAll({
    where,
    include: [{
      model: DataAuthorityPolicy,
      as: 'ActivePolicy',
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
    order: [['domain', 'ASC'], ['fieldGroup', 'ASC'], ['scopeKey', 'ASC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
    distinct: true
  });
  return pageResult(result, page, pageSize, 'policySets');
}

async function createAuthorityPolicyVersion({ wineryId, userId, data }) {
  assertPublicConfiguration(data.definition, 'definition');
  for (const source of data.sources || []) assertPublicConfiguration(source.configuration, 'source.configuration');
  return dataAuthorityPolicyService.createAuthorityPolicyVersion({ ...data, wineryId, actorUserId: userId });
}

async function activateAuthorityPolicy({ wineryId, userId, policyId, effectiveAt }) {
  return dataAuthorityPolicyService.activateAuthorityPolicy({
    wineryId,
    actorUserId: userId,
    policyId,
    effectiveAt
  });
}

async function listJobs({ wineryId, page = 1, pageSize = 25, status = 'ALL', jobKind, connectionId }) {
  const where = { wineryId };
  if (status !== 'ALL') where.status = status;
  if (jobKind) where.jobKind = jobKind;
  if (connectionId) where.connectionId = connectionId;
  const result = await IntegrationJob.findAndCountAll({
    where,
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    limit: pageSize,
    offset: (page - 1) * pageSize
  });
  result.rows = result.rows.map(record => {
    const plain = record.toJSON();
    return { ...plain, payload: redact(plain.payload), result: redact(plain.result) };
  });
  return pageResult(result, page, pageSize, 'jobs');
}

async function listOutbox({ wineryId, page = 1, pageSize = 25, status = 'ALL', aggregateType }) {
  const where = { wineryId };
  if (status !== 'ALL') where.status = status;
  if (aggregateType) where.aggregateType = aggregateType;
  const result = await CanonicalEventOutbox.findAndCountAll({
    where,
    include: [{
      model: IntegrationEvent,
      as: 'Event',
      attributes: [
        'id', 'eventType', 'eventClass', 'schemaVersion', 'ingestionPurpose',
        'automationEligible', 'automationEligibilityReason', 'correlationId', 'receivedAt'
      ]
    }],
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    limit: pageSize,
    offset: (page - 1) * pageSize
  });
  return pageResult(result, page, pageSize, 'outbox');
}

async function getRuntimeSummary({
  wineryId,
  handlerRegistry,
  workerConfig,
  schedulerRegistry = integrationSchedulerRegistry
}) {
  const statuses = async (model, values) => Promise.all(values.map(async status => ({
    status,
    count: await model.count({ where: { wineryId, status } })
  })));
  const [jobs, outbox, schedulers, pausedSyncStreams, webhookEndpoints, configurationAuthorities] = await Promise.all([
    statuses(IntegrationJob, ['PENDING', 'RUNNING', 'RETRY', 'FAILED']),
    statuses(CanonicalEventOutbox, ['PENDING', 'DELIVERING', 'RETRY', 'FAILED']),
    schedulerRegistry.getStatuses({
      wineryId,
      configs: workerConfig.schedulerConfigs
    }),
    integrationOperationsService.listSyncStreams({
      wineryId,
      page: 1,
      pageSize: 1,
      operationalStatus: 'PAUSED'
    }).then(result => result.pagination.total),
    statuses(IntegrationWebhookEndpoint, ['ACTIVE', 'DISABLED', 'REVOKED']),
    statuses(IntegrationConfigurationAuthority, [
      'LEGACY_PRIMARY',
      'PREPARED',
      'CANONICAL_PRIMARY',
      'ROLLED_BACK'
    ])
  ]);
  const bookingScheduler = schedulers.domains.find(item => item.domain === 'BOOKING') || null;
  return {
    workerConfigured: Boolean(workerConfig.enabled),
    registeredJobKinds: handlerRegistry.list(),
    schedulers,
    bookingScheduler,
    operationalControls: {
      pausedSyncStreams,
      deadLetteredJobs: jobs.find(item => item.status === 'FAILED')?.count || 0,
      deadLetteredOutboxEntries: outbox.find(item => item.status === 'FAILED')?.count || 0
    },
    providerWebhooks: {
      adapters: integrationWebhookAdapters.list(),
      recoveryDomains: integrationWebhookRecoveries.list(),
      endpoints: webhookEndpoints
    },
    configurationAuthorities,
    jobs,
    outbox
  };
}

async function listSyncStreams(options) {
  return integrationOperationsService.listSyncStreams(options);
}

async function pauseSyncStream({ wineryId, syncStateId, userId, data }) {
  const result = await integrationOperationsService.pauseSyncStream({
    wineryId,
    syncStateId,
    actorUserId: userId,
    requestId: data.requestId,
    reason: data.reason
  });
  return {
    syncStream: integrationOperationsService.snapshotSyncState(result.syncStream),
    cancelledJobIds: result.cancelledJobIds,
    duplicate: result.duplicate
  };
}

async function resumeSyncStream({ wineryId, syncStateId, userId, data }) {
  const result = await integrationOperationsService.resumeSyncStream({
    wineryId,
    syncStateId,
    actorUserId: userId,
    requestId: data.requestId,
    reason: data.reason
  });
  return {
    syncStream: integrationOperationsService.snapshotSyncState(result.syncStream),
    duplicate: result.duplicate
  };
}

async function cancelIntegrationJob({ wineryId, jobId, userId, data }) {
  const result = await integrationOperationsService.cancelIntegrationJob({
    wineryId,
    jobId,
    actorUserId: userId,
    requestId: data.requestId,
    reason: data.reason
  });
  return { job: integrationOperationsService.snapshotJob(result.job), duplicate: result.duplicate };
}

async function replayIntegrationJob({ wineryId, jobId, userId, data, registeredJobKinds }) {
  const result = await integrationOperationsService.replayIntegrationJob({
    wineryId,
    jobId,
    actorUserId: userId,
    requestId: data.requestId,
    reason: data.reason,
    registeredJobKinds
  });
  return {
    job: integrationOperationsService.snapshotJob(result.job),
    sourceJobId: result.sourceJobId,
    duplicate: result.duplicate
  };
}

async function replayOutboxEntry({ wineryId, outboxId, userId, data }) {
  const result = await integrationOperationsService.replayOutboxEntry({
    wineryId,
    outboxId,
    actorUserId: userId,
    requestId: data.requestId,
    reason: data.reason
  });
  return {
    outboxEntry: integrationOperationsService.snapshotOutbox(result.outboxEntry),
    duplicate: result.duplicate
  };
}

async function listOperationAuditEvents(options) {
  return integrationOperationsService.listOperationAuditEvents(options);
}

function serializeJobReceipt(enqueued) {
  return {
    duplicate: enqueued.duplicate,
    job: {
      id: enqueued.job.id,
      jobKind: enqueued.job.jobKind,
      status: enqueued.job.status,
      scheduledAt: enqueued.job.scheduledAt
    }
  };
}

async function getConnectionCredential({ wineryId, connectionId }) {
  return integrationCredentialService.getConnectionCredentialMetadata({ wineryId, connectionId });
}

async function upsertConnectionCredential({ wineryId, connectionId, userId, data, env = process.env }) {
  return integrationCredentialService.upsertConnectionCredential({
    wineryId,
    connectionId,
    actorUserId: userId,
    credentialType: data.credentialType,
    secret: data.secret,
    env
  });
}

async function revokeConnectionCredential({ wineryId, connectionId, userId }) {
  return integrationCredentialService.revokeConnectionCredential({
    wineryId,
    connectionId,
    actorUserId: userId
  });
}

async function listWebhookEndpoints({ wineryId, connectionId }) {
  return integrationWebhookEndpointService.listWebhookEndpoints({ wineryId, connectionId });
}

async function createWebhookEndpoint({ wineryId, connectionId, userId, data, env = process.env }) {
  return integrationWebhookEndpointService.createWebhookEndpoint({
    wineryId,
    connectionId,
    actorUserId: userId,
    data,
    env
  });
}

async function rotateWebhookEndpoint({ wineryId, connectionId, endpointId, userId, env = process.env }) {
  return integrationWebhookEndpointService.rotateWebhookEndpoint({
    wineryId,
    connectionId,
    endpointId,
    actorUserId: userId,
    env
  });
}

async function updateWebhookEndpointLifecycle({ wineryId, connectionId, endpointId, userId, data }) {
  return integrationWebhookEndpointService.updateWebhookEndpointLifecycle({
    wineryId,
    connectionId,
    endpointId,
    actorUserId: userId,
    action: data.action
  });
}

function listWebhookAdapterManifests() {
  return integrationWebhookAdapters.list();
}

async function previewLegacyIntegrationBackfill({ wineryId }) {
  return legacyIntegrationBackfillService.buildCompatibilityBackfillPlan({ wineryId });
}

async function applyLegacyIntegrationBackfill({ wineryId, userId, data }) {
  return legacyIntegrationBackfillService.applyCompatibilityBackfill({
    wineryId,
    actorUserId: userId,
    requestId: data.requestId,
    reason: data.reason
  });
}

async function listLegacyIntegrationBackfillIssues(options) {
  return legacyIntegrationBackfillService.listCompatibilityBackfillIssues(options);
}

async function listProjectionIssues(options) {
  return projectionIssueManagementService.listProjectionIssues(options);
}

async function getProjectionIssue({ wineryId, issueId }) {
  return projectionIssueManagementService.serializeIssue(
    await projectionIssueManagementService.getProjectionIssue({ wineryId, issueId })
  );
}

async function transitionProjectionIssue({ wineryId, issueId, userId, action, data }) {
  return projectionIssueManagementService.transitionProjectionIssue({
    wineryId,
    issueId,
    actorUserId: userId,
    action,
    requestId: data.requestId,
    reason: data.reason,
    resolution: action === 'RESOLVE' ? data : null
  });
}

function listProjectionIssueResolvers() {
  return projectionIssueResolutions.list();
}

async function listConfigurationAuthorities(options) {
  return integrationConfigurationAuthorityService.listConfigurationAuthorities(options);
}

async function getConfigurationAuthorityPreview({ wineryId, domain, env = process.env }) {
  return integrationConfigurationAuthorityService.buildConfigurationAuthorityPreview({ wineryId, domain, env });
}

async function transitionConfigurationAuthority({ wineryId, domain, userId, action, data, env = process.env }) {
  return integrationConfigurationAuthorityService.transitionConfigurationAuthority({
    wineryId,
    domain,
    actorUserId: userId,
    action,
    requestId: data.requestId,
    reason: data.reason,
    previewToken: data.previewToken || null,
    env
  });
}

async function previewCustomerProfileBackfill({ wineryId }) {
  return customerProfileService.buildCustomerProfileBackfillPreview({ wineryId });
}

async function applyCustomerProfileBackfill({ wineryId, userId, data }) {
  return customerProfileService.applyCustomerProfileBackfill({
    wineryId,
    actorUserId: userId,
    requestId: data.requestId,
    previewToken: data.previewToken,
    reason: data.reason
  });
}

async function createWineClubProgram({ wineryId, userId, data }) {
  return wineClubProjectionService.createProgram({ wineryId, actorUserId: userId, data });
}

async function listWineClubPrograms(options) {
  return { programs: await wineClubProjectionService.listPrograms(options) };
}

async function listWineClubMemberships(options) {
  return wineClubProjectionService.listMemberships(options);
}

async function getWineClubMembership(options) {
  return { membership: await wineClubProjectionService.getMembership(options) };
}

async function listSalesOrders(options) {
  return commerceProjectionService.listSalesOrders(options);
}

async function getSalesOrder(options) {
  return { salesOrder: await commerceProjectionService.getSalesOrder(options) };
}

function listBusinessEntityLinkDefinitions() {
  return { definitions: businessEntityLinkService.listRelationshipDefinitions() };
}

async function listBusinessEntityLinks(options) {
  return businessEntityLinkService.listBusinessEntityLinks(options);
}

async function getBusinessEntityLink(options) {
  return { businessEntityLink: await businessEntityLinkService.getBusinessEntityLink(options) };
}

async function createBusinessEntityLink({ wineryId, userId, data }) {
  return businessEntityLinkService.createManagerConfirmedLink({ wineryId, actorUserId: userId, data });
}

async function transitionBusinessEntityLink({ wineryId, linkId, userId, action, data }) {
  return businessEntityLinkService.transitionBusinessEntityLink({
    wineryId,
    linkId,
    actorUserId: userId,
    action,
    requestId: data.requestId,
    reason: data.reason
  });
}

async function previewCustomerRollups({ wineryId }) {
  return customerRollupService.buildCustomerRollupPreview({ wineryId });
}

async function rebuildCustomerRollups({ wineryId, userId, data }) {
  return customerRollupService.rebuildCustomerRollups({
    wineryId,
    actorUserId: userId,
    requestId: data.requestId,
    previewToken: data.previewToken,
    reason: data.reason
  });
}

async function listCustomerRollupRuns(options) {
  return customerRollupService.listCustomerRollupRuns(options);
}

async function getCustomerRollupRun(options) {
  return customerRollupService.getCustomerRollupRun(options);
}

async function createProductVariant({ wineryId, userId, data }) {
  return inventoryManagementService.createProductVariant({ wineryId, actorUserId: userId, data });
}

async function listProductVariants(options) {
  return inventoryManagementService.listProductVariants(options);
}

async function createStockLocation({ wineryId, userId, data }) {
  return inventoryManagementService.createStockLocation({ wineryId, actorUserId: userId, data });
}

async function listStockLocations(options) {
  return inventoryManagementService.listStockLocations(options);
}

async function listInventoryPositions(options) {
  return inventoryManagementService.listInventoryPositions(options);
}

async function getInventoryPosition(options) {
  return inventoryManagementService.getInventoryPosition(options);
}

async function listInventoryCommitments(options) {
  return inventoryManagementService.listInventoryCommitments(options);
}

async function calculateInventoryAvailability(options) {
  return inventoryManagementService.calculateAvailableToPromise(options);
}

async function upsertInventoryDemandMapping({ wineryId, userId, data }) {
  return inventoryDemandMappingService.upsertInventoryDemandMapping({
    wineryId,
    actorUserId: userId,
    data
  });
}

async function listInventoryDemandMappings(options) {
  return inventoryDemandMappingService.listInventoryDemandMappings(options);
}

async function listShipments(options) {
  return fulfilmentManagementService.listShipments(options);
}

async function getShipment(options) {
  return { shipment: await fulfilmentManagementService.getShipment(options) };
}

async function upsertStaffIdentity({ wineryId, userId, data }) {
  return workforceManagementService.upsertStaffIdentity({
    wineryId,
    actorUserId: userId,
    data
  });
}

async function upsertRoleSkillDefinition({ wineryId, userId, data }) {
  return workforceManagementService.upsertRoleSkillDefinition({
    wineryId,
    actorUserId: userId,
    data
  });
}

async function upsertStaffRoleSkill({ wineryId, userId, data }) {
  return workforceManagementService.upsertStaffRoleSkill({
    wineryId,
    actorUserId: userId,
    data
  });
}

async function upsertWorkforceDemandMapping({ wineryId, userId, data }) {
  return workforceManagementService.upsertWorkforceDemandMapping({
    wineryId,
    actorUserId: userId,
    data
  });
}

async function getBookingCoverage({ wineryId, bookingId, maxAgeSeconds }) {
  return {
    coverage: await bookingCoverageContextService.resolveBookingCoverage({
      wineryId,
      input: { bookingId, maxAgeSeconds }
    })
  };
}

async function listMessageDeliveryEvents(options) {
  return communicationManagementService.listMessageDeliveryEvents(options);
}

async function getMessageDeliveryHistory(options) {
  return communicationManagementService.getMessageDeliveryHistory(options);
}

function listIntelligenceFactDefinitions() {
  return {
    factDefinitions: intelligenceFactRegistry.listFactDefinitions(),
    materializers: intelligenceFactService.listMaterializers()
  };
}

async function listIntelligenceFacts(options) {
  return intelligenceFactService.listFacts(options);
}

async function materializeIntelligenceFacts({ wineryId, userId, data }) {
  return intelligenceFactService.materializeFacts({
    wineryId,
    actorUserId: userId,
    data
  });
}

async function listIntelligenceFactRuns(options) {
  return intelligenceFactService.listMaterializationRuns(options);
}

async function getCustomerRelationshipContext({ wineryId, memberId, maxAgeSeconds }) {
  return {
    context: await customerRelationshipContextService.resolveCustomerRelationship({
      wineryId,
      input: { memberId, maxAgeSeconds }
    })
  };
}

async function getClubFulfilmentContext({ wineryId, allocationId, maxAgeSeconds }) {
  return {
    context: await clubFulfilmentContextService.resolveClubFulfilment({
      wineryId,
      input: { allocationId, maxAgeSeconds }
    })
  };
}

async function getAreaCapacityContext({ wineryId, areaId, data }) {
  return {
    context: await areaCapacityContextService.resolveAreaCapacity({
      wineryId,
      input: { areaId, ...data }
    })
  };
}

async function getIntegrationHealth(options) {
  return integrationHealthService.getIntegrationHealth(options);
}

async function getDomainActivationPreview(options) {
  return domainActivationService.domainActivationPreview(options);
}

async function activateDomain(options) {
  return domainActivationService.activateDomain(options);
}

async function disableDomain(options) {
  return domainActivationService.disableDomain(options);
}

async function enqueueConnectionVerification({ wineryId, connectionId, data, env = process.env }) {
  integrationCredentialService.loadCredentialKeyring(env);
  const { manifest } = await requireBookingConnection({ wineryId, connectionId, env });
  const credential = await integrationCredentialService.getConnectionCredentialMetadata({ wineryId, connectionId });
  if (!credential.configured) throw new ValidationError('Connection credentials must be configured before verification');
  if (!manifest.supportedCredentialTypes.includes(credential.credentialType)) {
    throw new ValidationError('Credential type is not supported by this connector');
  }
  const enqueued = await integrationJobService.enqueueIntegrationJob({
    wineryId,
    connectionId,
    jobKind: BOOKING_VERIFY_JOB_KIND,
    resourceType: 'BOOKING',
    streamKey: 'connection-verification',
    payload: {},
    idempotencyKey: data.requestId,
    maxAttempts: 3,
    retryBackoffSeconds: 30
  });
  return serializeJobReceipt(enqueued);
}

async function enqueueBookingHydration({ wineryId, connectionId, data, env = process.env }) {
  integrationCredentialService.loadCredentialKeyring(env);
  const window = normalizeHydrationWindow(data);
  const { connection } = await requireBookingConnection({
    wineryId,
    connectionId,
    requireConnected: true,
    env
  });
  const streamKey = hydrationStreamKey({
    connectionId: connection.id,
    externalLocationId: connection.externalLocationId
  });
  const enqueued = await integrationJobService.enqueueIntegrationJob({
    wineryId,
    connectionId,
    jobKind: BOOKING_HYDRATE_JOB_KIND,
    resourceType: 'BOOKING',
    streamKey,
    payload: window,
    idempotencyKey: data.requestId,
    maxAttempts: 10,
    retryBackoffSeconds: 30
  });
  return serializeJobReceipt(enqueued);
}

async function enqueueBookingPoll({ wineryId, connectionId, data, mode, env = process.env }) {
  integrationCredentialService.loadCredentialKeyring(env);
  const prepared = await prepareBookingPollRun({ wineryId, connectionId, data, mode, env });
  const jobKind = mode === 'INCREMENTAL' ? BOOKING_INCREMENTAL_JOB_KIND : BOOKING_RECONCILE_JOB_KIND;
  const enqueued = await integrationJobService.enqueueIntegrationJob({
    wineryId,
    connectionId,
    jobKind,
    resourceType: 'BOOKING',
    streamKey: prepared.streamKey,
    payload: prepared.payload,
    idempotencyKey: data.requestId,
    maxAttempts: 10,
    retryBackoffSeconds: 30
  });
  return serializeJobReceipt(enqueued);
}

const enqueueBookingIncremental = options => enqueueBookingPoll({ ...options, mode: 'INCREMENTAL' });
const enqueueBookingReconciliation = options => enqueueBookingPoll({ ...options, mode: 'RECONCILIATION' });

function listConnectorManifests() {
  return listShadowBookingConnectorManifests();
}

async function getBookingActivationPreview({ wineryId, connectionId, env = process.env }) {
  return canonicalBookingManagementService.bookingActivationPreview({ wineryId, connectionId, env });
}

async function activateBookingDomain({ wineryId, connectionId, userId, data, env = process.env }) {
  return canonicalBookingManagementService.activateBookingDomain({
    wineryId,
    connectionId,
    actorUserId: userId,
    data,
    env
  });
}

async function listCanonicalBookings(options) {
  return canonicalBookingManagementService.listCanonicalBookings(options);
}

async function getCanonicalBooking(options) {
  return canonicalBookingManagementService.getCanonicalBooking(options);
}

module.exports = {
  assertPublicConfiguration,
  serializeConnection,
  listConnections,
  getConnection,
  createConnection,
  updateConnection,
  addConnectionScope,
  deleteConnectionScope,
  listLocations,
  createLocation,
  updateLocation,
  addLocationAreaLink,
  deleteLocationAreaLink,
  listAuthorityPolicySets,
  createAuthorityPolicyVersion,
  activateAuthorityPolicy,
  listJobs,
  listOutbox,
  listSyncStreams,
  pauseSyncStream,
  resumeSyncStream,
  cancelIntegrationJob,
  replayIntegrationJob,
  replayOutboxEntry,
  listOperationAuditEvents,
  getRuntimeSummary,
  normalizeConnectionConfiguration,
  getConnectionCredential,
  upsertConnectionCredential,
  revokeConnectionCredential,
  listWebhookEndpoints,
  createWebhookEndpoint,
  rotateWebhookEndpoint,
  updateWebhookEndpointLifecycle,
  listWebhookAdapterManifests,
  previewLegacyIntegrationBackfill,
  applyLegacyIntegrationBackfill,
  listLegacyIntegrationBackfillIssues,
  listProjectionIssues,
  getProjectionIssue,
  transitionProjectionIssue,
  listProjectionIssueResolvers,
  listConfigurationAuthorities,
  getConfigurationAuthorityPreview,
  transitionConfigurationAuthority,
  previewCustomerProfileBackfill,
  applyCustomerProfileBackfill,
  createWineClubProgram,
  listWineClubPrograms,
  listWineClubMemberships,
  getWineClubMembership,
  listSalesOrders,
  getSalesOrder,
  listBusinessEntityLinkDefinitions,
  listBusinessEntityLinks,
  getBusinessEntityLink,
  createBusinessEntityLink,
  transitionBusinessEntityLink,
  previewCustomerRollups,
  rebuildCustomerRollups,
  listCustomerRollupRuns,
  getCustomerRollupRun,
  createProductVariant,
  listProductVariants,
  createStockLocation,
  listStockLocations,
  listInventoryPositions,
  getInventoryPosition,
  listInventoryCommitments,
  calculateInventoryAvailability,
  upsertInventoryDemandMapping,
  listInventoryDemandMappings,
  listShipments,
  getShipment,
  upsertStaffIdentity,
  listStaffIdentities: workforceManagementService.listStaffIdentities,
  upsertRoleSkillDefinition,
  listRoleSkillDefinitions: workforceManagementService.listRoleSkillDefinitions,
  upsertStaffRoleSkill,
  listRosterShifts: workforceManagementService.listRosterShifts,
  listStaffAvailability: workforceManagementService.listStaffAvailability,
  upsertWorkforceDemandMapping,
  listWorkforceDemandMappings: workforceManagementService.listWorkforceDemandMappings,
  getBookingCoverage,
  listMessageDeliveryEvents,
  getMessageDeliveryHistory,
  listIntelligenceFactDefinitions,
  listIntelligenceFacts,
  materializeIntelligenceFacts,
  listIntelligenceFactRuns,
  getCustomerRelationshipContext,
  getClubFulfilmentContext,
  getAreaCapacityContext,
  getIntegrationHealth,
  getDomainActivationPreview,
  activateDomain,
  disableDomain,
  enqueueConnectionVerification,
  enqueueBookingHydration,
  enqueueBookingIncremental,
  enqueueBookingReconciliation,
  listConnectorManifests,
  getBookingActivationPreview,
  activateBookingDomain,
  listCanonicalBookings,
  getCanonicalBooking
};
