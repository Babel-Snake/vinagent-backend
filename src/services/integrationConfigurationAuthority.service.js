const crypto = require('crypto');
const { Op } = require('sequelize');
const {
  IntegrationConfigurationAuthority,
  IntegrationDomainActivation,
  IntegrationOperationAuditEvent,
  OperationalAreaIntegrationConfig,
  ProjectionIssue,
  User,
  WineryIntegrationConfig,
  WinerySettings,
  sequelize
} = require('../models');
const AppError = require('../utils/AppError');
const { ValidationError } = require('../utils/errors');
const {
  CONFIGURATION_AUTHORITY_STATUSES,
  INTEGRATION_DOMAINS,
  includesRegistryValue
} = require('./integrationDataRegistry.service');
const { stableSerialize } = require('./integrationDataFoundation.service');

const CANONICAL_PRIMARY = 'CANONICAL_PRIMARY';
const CUTOVER_ACTIONS = Object.freeze({
  PREPARE: 'CONFIGURATION_AUTHORITY_PREPARED',
  ACTIVATE: 'CONFIGURATION_AUTHORITY_ACTIVATED',
  ROLLBACK: 'CONFIGURATION_AUTHORITY_ROLLED_BACK'
});
const LEGACY_DOMAIN_CONFIGURATION = Object.freeze({
  BOOKING: Object.freeze({ key: 'booking', providerField: 'bookingProvider' })
});

function normalizeDomain(domain) {
  const normalized = String(domain || '').trim().toUpperCase();
  if (!includesRegistryValue(INTEGRATION_DOMAINS, normalized)) {
    throw new ValidationError('Integration configuration authority domain is not supported');
  }
  return normalized;
}

function parseJsonObject(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function sanitizeSnapshotValue(item) {
  if (Array.isArray(item)) return item.map(sanitizeSnapshotValue);
  if (!item || typeof item !== 'object') return item;
  return Object.fromEntries(Object.entries(item)
    .filter(([key]) => !/(?:password|passphrase|secret|token|credential|api[_-]?key|private[_-]?key|authorization)/i.test(key))
    .map(([key, child]) => [key, sanitizeSnapshotValue(child)]));
}

function sanitizeLegacyConnectionSnapshot(value) {
  const connection = sanitizeSnapshotValue(parseJsonObject(value));
  connection.webhookSigningConfigured = false;
  return connection;
}

function authoritySnapshot(authority) {
  if (!authority) return null;
  const plain = authority.toJSON ? authority.toJSON() : authority;
  return {
    id: plain.id,
    wineryId: plain.wineryId,
    domain: plain.domain,
    status: plain.status,
    preparedAt: plain.preparedAt,
    preparedBy: plain.preparedBy,
    activatedAt: plain.activatedAt,
    activatedBy: plain.activatedBy,
    rolledBackAt: plain.rolledBackAt,
    rolledBackBy: plain.rolledBackBy,
    lastTransitionReason: plain.lastTransitionReason,
    readinessSnapshot: plain.readinessSnapshot,
    canonicalSnapshot: plain.canonicalSnapshot,
    lastProjectedAt: plain.lastProjectedAt,
    lockVersion: plain.lockVersion,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt
  };
}

function previewHash(snapshot) {
  return crypto.createHash('sha256').update(stableSerialize(snapshot)).digest('hex');
}

function legacyProviderKey(providerKey) {
  const normalized = String(providerKey || '').trim().toLowerCase();
  if (normalized.startsWith('opentable')) return 'opentable';
  if (normalized.startsWith('sevenrooms')) return 'sevenrooms';
  if (normalized.startsWith('nowbookit')) return 'nowbookit';
  if (normalized.startsWith('resy')) return 'resy';
  return normalized;
}

function buildLegacyBookingConnection(activation) {
  const connection = activation.Connection;
  const provider = legacyProviderKey(connection.providerKey);
  const capabilities = (connection.Capabilities || [])
    .filter(capability => capability.enabled && capability.availabilityStatus === 'AVAILABLE')
    .map(capability => capability.capabilityKey)
    .sort();
  return {
    provider,
    executionProvider: provider === 'sevenrooms' ? 'sevenrooms' : 'mock',
    liveAdapterAvailable: false,
    status: 'connected',
    authMethod: 'protected_reference',
    externalAccountId: connection.externalAccountId || '',
    externalLocationId: connection.externalLocationId || '',
    baseUrl: parseJsonObject(connection.configuration).baseUrl || '',
    webhookUrl: '',
    webhookSigningConfigured: false,
    capabilities,
    lastTestedAt: connection.lastHealthyAt || connection.lastHealthCheckedAt || null,
    lastError: null,
    summary: 'Projected from VinAgent canonical connection authority.',
    notes: ''
  };
}

async function bookingCutoverFacts({ wineryId, env = process.env, transaction = null }) {
  const activations = await IntegrationDomainActivation.findAll({
    where: { wineryId, domain: 'BOOKING', status: 'ACTIVE' },
    include: [{
      association: 'Connection',
      attributes: [
        'id',
        'connectionKey',
        'providerKey',
        'displayName',
        'status',
        'externalAccountId',
        'externalLocationId',
        'configuration',
        'lastHealthCheckedAt',
        'lastHealthyAt',
        'updatedAt'
      ],
      include: [{
        association: 'Capabilities',
        attributes: ['capabilityKey', 'enabled', 'availabilityStatus']
      }]
    }],
    order: [['scopeKey', 'ASC'], ['id', 'ASC']],
    transaction
  });
  const settings = await WinerySettings.findOne({
    where: { wineryId },
    attributes: ['enableBookingModule', 'updatedAt'],
    transaction
  });
  const connectionIds = [...new Set(activations.map(item => item.connectionId))];
  const blockingIssueCount = connectionIds.length === 0 ? 0 : await ProjectionIssue.count({
    where: {
      wineryId,
      connectionId: { [Op.in]: connectionIds },
      status: { [Op.in]: ['OPEN', 'ACKNOWLEDGED'] },
      severity: { [Op.in]: ['ERROR', 'BLOCKING'] }
    },
    transaction
  });
  const reasons = [];
  if (env.INTEGRATION_BOOKING_CONFIG_CUTOVER_ENABLED !== 'true') {
    reasons.push('DEPLOYMENT_CUTOVER_GATE_DISABLED');
  }
  if (activations.length === 0) reasons.push('NO_ACTIVE_BOOKING_DOMAIN_ACTIVATION');
  const scopeCounts = activations.reduce((counts, item) => {
    counts[item.scopeKey] = (counts[item.scopeKey] || 0) + 1;
    return counts;
  }, {});
  if (Object.values(scopeCounts).some(count => count > 1)) reasons.push('DUPLICATE_ACTIVE_SCOPE_AUTHORITY');
  if (!activations.some(item => item.scopeKey === 'winery')) reasons.push('WINERY_DEFAULT_AUTHORITY_REQUIRED');
  if (activations.some(item => String(item.scopeKey).startsWith('location:'))) {
    reasons.push('LOCATION_SCOPE_NOT_REPRESENTABLE_IN_LEGACY_CONFIG');
  }
  if (activations.some(item => !item.Connection || item.Connection.status !== 'CONNECTED')) {
    reasons.push('AUTHORITY_CONNECTION_NOT_CONNECTED');
  }
  if (blockingIssueCount > 0) reasons.push('BLOCKING_PROJECTION_ISSUES_EXIST');
  if (!settings || settings.enableBookingModule !== false) {
    reasons.push('LEGACY_BOOKING_WRITE_PATH_ENABLED');
  }

  const projection = {
    winery: null,
    areas: []
  };
  for (const activation of activations) {
    if (!activation.Connection) continue;
    const projected = {
      scopeKey: activation.scopeKey,
      connectionId: activation.connectionId,
      connectionKey: activation.Connection.connectionKey,
      providerConnection: buildLegacyBookingConnection(activation)
    };
    if (activation.scopeKey === 'winery') projection.winery = projected;
    else if (String(activation.scopeKey).startsWith('area:')) {
      projection.areas.push({ ...projected, areaId: Number(String(activation.scopeKey).slice(5)) });
    }
  }
  projection.areas.sort((left, right) => left.areaId - right.areaId);

  return {
    supported: true,
    ready: reasons.length === 0,
    reasons,
    activeActivationCount: activations.length,
    activeConnectionIds: connectionIds.sort((a, b) => a - b),
    blockingIssueCount,
    legacyBookingWritePathEnabled: !settings || settings.enableBookingModule !== false,
    settingsUpdatedAt: settings?.updatedAt ? new Date(settings.updatedAt).toISOString() : null,
    activations: activations.map(item => ({
      id: item.id,
      scopeKey: item.scopeKey,
      connectionId: item.connectionId,
      connectionStatus: item.Connection?.status || null,
      connectionUpdatedAt: item.Connection?.updatedAt
        ? new Date(item.Connection.updatedAt).toISOString()
        : null,
      sourceWatermarkAt: item.sourceWatermarkAt
        ? new Date(item.sourceWatermarkAt).toISOString()
        : null,
      authorityPolicyId: item.authorityPolicyId
    })),
    projection
  };
}

async function buildConfigurationAuthorityPreview({ wineryId, domain, env = process.env, transaction = null }) {
  const normalizedDomain = normalizeDomain(domain);
  const authority = await IntegrationConfigurationAuthority.findOne({
    where: { wineryId, domain: normalizedDomain },
    transaction
  });
  const facts = normalizedDomain === 'BOOKING'
    ? await bookingCutoverFacts({ wineryId, env, transaction })
    : {
        supported: false,
        ready: false,
        reasons: ['DOMAIN_CUTOVER_HANDLER_NOT_REGISTERED'],
        projection: null
      };
  const snapshot = {
    domain: normalizedDomain,
    authorityStatus: authority?.status || 'LEGACY_PRIMARY',
    ...facts
  };
  return {
    ...snapshot,
    previewToken: previewHash(snapshot),
    authority: authoritySnapshot(authority)
  };
}

async function captureLegacySnapshot({ wineryId, domain, transaction }) {
  const config = LEGACY_DOMAIN_CONFIGURATION[domain];
  if (!config) throw new ValidationError(`Legacy snapshot is not implemented for ${domain}`);
  const [wineryConfig, winerySettings, areaConfigs] = await Promise.all([
    WineryIntegrationConfig.findOne({ where: { wineryId }, transaction }),
    WinerySettings.findOne({ where: { wineryId }, transaction }),
    OperationalAreaIntegrationConfig.findAll({ where: { wineryId }, order: [['areaId', 'ASC']], transaction })
  ]);
  const wineryConnections = parseJsonObject(wineryConfig?.providerConnections);
  return {
    schemaVersion: '1',
    domain,
    wineryConfig: {
      existed: Boolean(wineryConfig),
      provider: wineryConfig?.[config.providerField] ?? null,
      connectionPresent: Object.prototype.hasOwnProperty.call(wineryConnections, config.key),
      connection: wineryConnections[config.key]
        ? sanitizeLegacyConnectionSnapshot(wineryConnections[config.key])
        : null
    },
    winerySettings: {
      existed: Boolean(winerySettings),
      provider: winerySettings?.[`${config.key}Provider`] ?? null,
      connection: winerySettings?.[`${config.key}Config`]
        ? sanitizeSnapshotValue(winerySettings[`${config.key}Config`])
        : null
    },
    areas: areaConfigs.map(areaConfig => {
      const connections = parseJsonObject(areaConfig.providerConnections);
      return {
        areaId: areaConfig.areaId,
        configExisted: true,
        connectionPresent: Object.prototype.hasOwnProperty.call(connections, config.key),
        connection: connections[config.key]
          ? sanitizeLegacyConnectionSnapshot(connections[config.key])
          : null
      };
    })
  };
}

async function projectBookingCompatibility({ wineryId, projection, transaction }) {
  if (!projection?.winery) throw new ValidationError('Canonical Booking projection has no winery default');
  const legacy = LEGACY_DOMAIN_CONFIGURATION.BOOKING;
  const [wineryConfig] = await WineryIntegrationConfig.findOrCreate({
    where: { wineryId },
    defaults: { providerConnections: {} },
    transaction
  });
  const wineryConnections = parseJsonObject(wineryConfig.providerConnections);
  const rootConnection = projection.winery.providerConnection;
  await wineryConfig.update({
    [legacy.providerField]: rootConnection.provider,
    providerConnections: { ...wineryConnections, [legacy.key]: rootConnection }
  }, { transaction });

  const areaConfigs = await OperationalAreaIntegrationConfig.findAll({ where: { wineryId }, transaction });
  const byAreaId = new Map(areaConfigs.map(record => [Number(record.areaId), record]));
  const projectedAreaIds = new Set(projection.areas.map(item => Number(item.areaId)));
  for (const record of areaConfigs) {
    if (projectedAreaIds.has(Number(record.areaId))) continue;
    const connections = { ...parseJsonObject(record.providerConnections) };
    delete connections[legacy.key];
    if (Object.keys(connections).length === 0) await record.destroy({ transaction });
    else await record.update({ providerConnections: connections }, { transaction });
  }
  for (const area of projection.areas) {
    const existing = byAreaId.get(Number(area.areaId));
    if (existing) {
      await existing.update({
        providerConnections: {
          ...parseJsonObject(existing.providerConnections),
          [legacy.key]: area.providerConnection
        }
      }, { transaction });
    } else {
      await OperationalAreaIntegrationConfig.create({
        wineryId,
        areaId: area.areaId,
        providerConnections: { [legacy.key]: area.providerConnection }
      }, { transaction });
    }
  }

  const [settings] = await WinerySettings.findOrCreate({ where: { wineryId }, transaction });
  await settings.update({
    bookingProvider: rootConnection.executionProvider,
    bookingConfig: {
      selectedProvider: rootConnection.provider,
      authMethod: rootConnection.authMethod,
      externalAccountId: rootConnection.externalAccountId || null,
      externalLocationId: rootConnection.externalLocationId || null,
      baseUrl: rootConnection.baseUrl || null,
      webhookUrl: null,
      capabilities: rootConnection.capabilities
    }
  }, { transaction });
}

async function restoreLegacySnapshot({ wineryId, domain, snapshot, transaction }) {
  const config = LEGACY_DOMAIN_CONFIGURATION[domain];
  if (!config || !snapshot) throw new ValidationError('A valid legacy snapshot is required for rollback');
  const [wineryConfig] = await WineryIntegrationConfig.findOrCreate({
    where: { wineryId },
    defaults: { providerConnections: {} },
    transaction
  });
  const wineryConnections = { ...parseJsonObject(wineryConfig.providerConnections) };
  if (snapshot.wineryConfig.connectionPresent) wineryConnections[config.key] = snapshot.wineryConfig.connection;
  else delete wineryConnections[config.key];
  await wineryConfig.update({
    [config.providerField]: snapshot.wineryConfig.provider,
    providerConnections: wineryConnections
  }, { transaction });

  const areaSnapshots = new Map((snapshot.areas || []).map(item => [Number(item.areaId), item]));
  const currentAreas = await OperationalAreaIntegrationConfig.findAll({ where: { wineryId }, transaction });
  const currentByArea = new Map(currentAreas.map(item => [Number(item.areaId), item]));
  for (const record of currentAreas) {
    const areaSnapshot = areaSnapshots.get(Number(record.areaId));
    const connections = { ...parseJsonObject(record.providerConnections) };
    if (areaSnapshot?.connectionPresent) connections[config.key] = areaSnapshot.connection;
    else delete connections[config.key];
    if (Object.keys(connections).length === 0) await record.destroy({ transaction });
    else await record.update({ providerConnections: connections }, { transaction });
  }
  for (const areaSnapshot of areaSnapshots.values()) {
    if (currentByArea.has(Number(areaSnapshot.areaId)) || !areaSnapshot.connectionPresent) continue;
    await OperationalAreaIntegrationConfig.create({
      wineryId,
      areaId: areaSnapshot.areaId,
      providerConnections: { [config.key]: areaSnapshot.connection }
    }, { transaction });
  }

  const [settings] = await WinerySettings.findOrCreate({ where: { wineryId }, transaction });
  await settings.update({
    [`${config.key}Provider`]: snapshot.winerySettings.provider,
    [`${config.key}Config`]: snapshot.winerySettings.connection
  }, { transaction });
}

async function findDuplicateAudit({ wineryId, action, requestId, domain, transaction }) {
  const audit = await IntegrationOperationAuditEvent.findOne({
    where: { wineryId, action, requestId },
    transaction
  });
  if (audit && String(audit.targetId) !== domain) {
    throw new ValidationError('This requestId was already used for another configuration authority');
  }
  return audit;
}

async function validateActor({ wineryId, actorUserId, transaction }) {
  const actor = await User.findOne({ where: { id: actorUserId, wineryId }, attributes: ['id'], transaction });
  if (!actor) throw new ValidationError('Configuration authority actor does not belong to the winery');
}

async function transitionConfigurationAuthority({
  wineryId,
  domain,
  actorUserId,
  action,
  requestId,
  reason,
  previewToken: suppliedPreviewToken = null,
  env = process.env
}) {
  const normalizedDomain = normalizeDomain(domain);
  const normalizedAction = String(action || '').trim().toUpperCase();
  const auditAction = CUTOVER_ACTIONS[normalizedAction];
  if (!auditAction) throw new ValidationError('Configuration authority transition is invalid');
  return sequelize.transaction(async transaction => {
    await validateActor({ wineryId, actorUserId, transaction });
    const duplicate = await findDuplicateAudit({
      wineryId,
      action: auditAction,
      requestId,
      domain: normalizedDomain,
      transaction
    });
    if (duplicate) return { authority: duplicate.afterSnapshot, duplicate: true };

    let authority = await IntegrationConfigurationAuthority.findOne({
      where: { wineryId, domain: normalizedDomain },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    const before = authoritySnapshot(authority);
    const now = new Date();

    if (normalizedAction === 'PREPARE') {
      if (authority?.status === CANONICAL_PRIMARY) {
        throw new ValidationError('Canonical configuration authority must be rolled back before preparing again');
      }
      const preview = await buildConfigurationAuthorityPreview({ wineryId, domain: normalizedDomain, env, transaction });
      if (preview.previewToken !== suppliedPreviewToken) {
        throw new ValidationError('Configuration authority preview is stale; generate a new preview');
      }
      const legacySnapshot = await captureLegacySnapshot({ wineryId, domain: normalizedDomain, transaction });
      const values = {
        wineryId,
        domain: normalizedDomain,
        status: 'PREPARED',
        preparedAt: now,
        preparedBy: actorUserId,
        rolledBackAt: null,
        rolledBackBy: null,
        lastTransitionReason: reason,
        previewHash: suppliedPreviewToken,
        readinessSnapshot: {
          supported: preview.supported,
          ready: preview.ready,
          reasons: preview.reasons,
          activeActivationCount: preview.activeActivationCount || 0,
          activeConnectionIds: preview.activeConnectionIds || [],
          blockingIssueCount: preview.blockingIssueCount || 0
        },
        legacySnapshot,
        canonicalSnapshot: null,
        lastProjectedAt: null,
        lockVersion: Number(authority?.lockVersion || 0) + 1
      };
      authority = authority
        ? await authority.update(values, { transaction })
        : await IntegrationConfigurationAuthority.create(values, { transaction });
    } else if (normalizedAction === 'ACTIVATE') {
      if (!authority || authority.status !== 'PREPARED') {
        throw new ValidationError('Configuration authority must be prepared before activation');
      }
      const preview = await buildConfigurationAuthorityPreview({ wineryId, domain: normalizedDomain, env, transaction });
      if (preview.previewToken !== suppliedPreviewToken) {
        throw new ValidationError('Configuration authority preview is stale; generate a new preview');
      }
      if (!preview.ready) {
        throw new ValidationError(`Configuration authority activation is blocked: ${preview.reasons.join(', ')}`);
      }
      if (normalizedDomain === 'BOOKING') {
        await projectBookingCompatibility({ wineryId, projection: preview.projection, transaction });
      } else {
        throw new ValidationError(`Configuration authority activation is not implemented for ${normalizedDomain}`);
      }
      authority = await authority.update({
        status: CANONICAL_PRIMARY,
        activatedAt: now,
        activatedBy: actorUserId,
        rolledBackAt: null,
        rolledBackBy: null,
        lastTransitionReason: reason,
        previewHash: suppliedPreviewToken,
        readinessSnapshot: {
          supported: preview.supported,
          ready: preview.ready,
          reasons: preview.reasons,
          activeActivationCount: preview.activeActivationCount,
          activeConnectionIds: preview.activeConnectionIds,
          blockingIssueCount: preview.blockingIssueCount
        },
        canonicalSnapshot: preview.projection,
        lastProjectedAt: now,
        lockVersion: Number(authority.lockVersion || 0) + 1
      }, { transaction });
    } else {
      if (!authority || authority.status !== CANONICAL_PRIMARY) {
        throw new ValidationError('Only canonical configuration authority can be rolled back');
      }
      await restoreLegacySnapshot({
        wineryId,
        domain: normalizedDomain,
        snapshot: authority.legacySnapshot,
        transaction
      });
      authority = await authority.update({
        status: 'ROLLED_BACK',
        rolledBackAt: now,
        rolledBackBy: actorUserId,
        lastTransitionReason: reason,
        lastProjectedAt: null,
        lockVersion: Number(authority.lockVersion || 0) + 1
      }, { transaction });
    }

    const after = authoritySnapshot(authority);
    await IntegrationOperationAuditEvent.create({
      wineryId,
      actorUserId,
      action: auditAction,
      targetType: 'INTEGRATION_CONFIGURATION_AUTHORITY',
      targetId: normalizedDomain,
      resourceType: normalizedDomain,
      requestId,
      reason,
      beforeSnapshot: before,
      afterSnapshot: after,
      metadata: { status: after.status }
    }, { transaction });
    return { authority: after, duplicate: false };
  });
}

async function listConfigurationAuthorities({ wineryId, domain = 'ALL' }) {
  const where = { wineryId };
  if (domain !== 'ALL') where.domain = normalizeDomain(domain);
  const authorities = await IntegrationConfigurationAuthority.findAll({
    where,
    order: [['domain', 'ASC']]
  });
  return { authorities: authorities.map(authoritySnapshot) };
}

async function assertLegacyConfigurationWritable({ wineryId, domains, transaction = null }) {
  const normalizedDomains = [...new Set((domains || []).map(normalizeDomain))];
  if (normalizedDomains.length === 0) return;
  const active = await IntegrationConfigurationAuthority.findAll({
    where: { wineryId, domain: { [Op.in]: normalizedDomains }, status: CANONICAL_PRIMARY },
    attributes: ['domain'],
    transaction
  });
  if (active.length > 0) {
    throw new AppError(
      `Legacy integration configuration is read-only for: ${active.map(item => item.domain).sort().join(', ')}`,
      409,
      'CANONICAL_CONFIGURATION_AUTHORITY_ACTIVE'
    );
  }
}

async function getCanonicalConfigurationDomains({ wineryId, transaction = null }) {
  const rows = await IntegrationConfigurationAuthority.findAll({
    where: { wineryId, status: CANONICAL_PRIMARY },
    attributes: ['domain'],
    transaction
  });
  return rows.map(row => row.domain);
}

async function resolveCanonicalRuntimeConfiguration({ wineryId, domain, areaId = null, transaction = null }) {
  const normalizedDomain = normalizeDomain(domain);
  const authority = await IntegrationConfigurationAuthority.findOne({
    where: { wineryId, domain: normalizedDomain, status: CANONICAL_PRIMARY },
    attributes: ['canonicalSnapshot'],
    transaction
  });
  if (!authority) return null;
  const projection = authority.canonicalSnapshot;
  const selected = areaId == null
    ? projection?.winery
    : projection?.areas?.find(item => Number(item.areaId) === Number(areaId)) || projection?.winery;
  if (!selected?.providerConnection) {
    throw new AppError(
      `Canonical ${normalizedDomain} configuration has no usable scope`,
      503,
      'CANONICAL_CONFIGURATION_SCOPE_UNAVAILABLE'
    );
  }
  const connection = selected.providerConnection;
  return {
    provider: connection.provider,
    config: {
      selectedProvider: connection.provider,
      authMethod: connection.authMethod,
      externalAccountId: connection.externalAccountId || null,
      externalLocationId: connection.externalLocationId || null,
      baseUrl: connection.baseUrl || null,
      webhookUrl: null,
      capabilities: connection.capabilities || []
    },
    source: areaId != null && selected.areaId ? 'canonical-area' : 'canonical-winery'
  };
}

async function assertCanonicalDomainCanBeInvalidated({ wineryId, domains, transaction = null }) {
  const normalizedDomains = [...new Set((domains || []).map(normalizeDomain))];
  if (normalizedDomains.length === 0) return;
  const active = await IntegrationConfigurationAuthority.findOne({
    where: { wineryId, domain: { [Op.in]: normalizedDomains }, status: CANONICAL_PRIMARY },
    attributes: ['domain'],
    transaction
  });
  if (active) {
    throw new AppError(
      `Roll back ${active.domain} configuration authority before invalidating its active connection or policy`,
      409,
      'CONFIGURATION_AUTHORITY_ROLLBACK_REQUIRED'
    );
  }
}

module.exports = {
  CANONICAL_PRIMARY,
  CONFIGURATION_AUTHORITY_STATUSES,
  CUTOVER_ACTIONS,
  LEGACY_DOMAIN_CONFIGURATION,
  normalizeDomain,
  authoritySnapshot,
  bookingCutoverFacts,
  buildConfigurationAuthorityPreview,
  captureLegacySnapshot,
  projectBookingCompatibility,
  restoreLegacySnapshot,
  transitionConfigurationAuthority,
  listConfigurationAuthorities,
  assertLegacyConfigurationWritable,
  getCanonicalConfigurationDomains,
  resolveCanonicalRuntimeConfiguration,
  assertCanonicalDomainCanBeInvalidated
};
