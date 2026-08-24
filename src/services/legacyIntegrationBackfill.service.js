const crypto = require('crypto');
const { Op } = require('sequelize');
const {
  IntegrationConnection,
  IntegrationConnectionScope,
  IntegrationOperationAuditEvent,
  OperationalArea,
  OperationalAreaIntegrationConfig,
  ProjectionIssue,
  User,
  Winery,
  WineryIntegrationConfig,
  sequelize
} = require('../models');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { buildScopeKey, stableSerialize } = require('./integrationDataFoundation.service');
const { parseJsonObject, sanitizeProviderConnection } = require('./integrationConnection.service');

const LEGACY_BACKFILL_VERSION = '1';
const LEGACY_BACKFILL_ACTION = 'LEGACY_CONNECTION_BACKFILL_APPLIED';
const LEGACY_DOMAIN_MAPPINGS = Object.freeze({
  sms: Object.freeze(['COMMUNICATION']),
  email: Object.freeze(['COMMUNICATION']),
  pos: Object.freeze(['COMMERCE', 'CATALOG']),
  crm: Object.freeze(['CUSTOMER']),
  booking: Object.freeze(['BOOKING']),
  delivery: Object.freeze(['FULFILMENT']),
  retell: Object.freeze(['COMMUNICATION'])
});
const LEGACY_PROVIDER_FIELDS = Object.freeze({
  sms: 'smsProvider',
  email: 'emailProvider',
  pos: 'posProvider',
  crm: 'crmProvider',
  booking: 'bookingProvider',
  delivery: 'deliveryProvider'
});
const UNRESOLVED_PROVIDER_KEYS = new Set(['', 'other', 'none', 'mock', 'unknown']);
const PROVIDER_ALIASES = Object.freeze({
  'open-table': 'opentable',
  'now-book-it': 'nowbookit',
  'seven-rooms': 'sevenrooms',
  'commerce-7': 'commerce7',
  'wine-direct': 'winedirect',
  'send-grid': 'sendgrid',
  'microsoft-outlook': 'outlook'
});

function digest(value) {
  return crypto.createHash('sha256').update(stableSerialize(value)).digest('hex');
}

function compact(value, max = 255) {
  const normalized = String(value || '').trim();
  return normalized ? normalized.slice(0, max) : null;
}

function normalizeProviderKey(value) {
  const slug = String(value || '').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return PROVIDER_ALIASES[slug] || slug;
}

function hasWineryEvidence({ config, domain, connection, providerKey }) {
  const explicitConnections = parseJsonObject(config.providerConnections);
  if (Object.prototype.hasOwnProperty.call(explicitConnections, domain)) {
    if (!['sms', 'email'].includes(domain)) return true;
    return Boolean(
      compact(connection.externalAccountId)
      || compact(connection.externalLocationId)
      || compact(connection.baseUrl)
      || connection.webhookSigningConfigured
      || !['not_connected', ''].includes(String(connection.status || '').trim().toLowerCase())
      || (domain === 'sms' ? compact(config.smsFromNumber) : compact(config.emailFromAddress))
      || !['twilio', 'sendgrid'].includes(providerKey)
    );
  }
  const selected = normalizeProviderKey(config[LEGACY_PROVIDER_FIELDS[domain]]);
  if (UNRESOLVED_PROVIDER_KEYS.has(selected)) return false;
  if (domain === 'sms') return Boolean(compact(config.smsFromNumber));
  if (domain === 'email') return Boolean(compact(config.emailFromAddress));
  return true;
}

function legacyEntry({ config, domain, connection, sourceKind, areaId = null }) {
  const providerField = LEGACY_PROVIDER_FIELDS[domain];
  const providerKey = normalizeProviderKey(connection.provider || config?.[providerField]);
  const sourceId = config.id;
  const sourceKey = `${sourceKind.toLowerCase()}:${sourceId}:${domain}`;
  if (!LEGACY_DOMAIN_MAPPINGS[domain]) {
    return { skipped: { sourceKey, domain, reason: 'LEGACY_DOMAIN_UNMAPPED' } };
  }
  if (UNRESOLVED_PROVIDER_KEYS.has(providerKey)) {
    return { skipped: { sourceKey, domain, reason: 'PROVIDER_UNRESOLVED' } };
  }
  if (sourceKind === 'WINERY' && !hasWineryEvidence({ config, domain, connection, providerKey })) {
    return { skipped: { sourceKey, domain, reason: 'DEFAULT_WITHOUT_CONNECTION_EVIDENCE' } };
  }
  const externalAccountId = compact(connection.externalAccountId);
  const externalLocationId = compact(connection.externalLocationId);
  const identityStrength = externalAccountId
    ? (externalLocationId ? 'ACCOUNT_AND_LOCATION' : 'ACCOUNT')
    : (externalLocationId ? 'LOCATION' : 'SOURCE_ISOLATED');
  const identityKey = identityStrength === 'SOURCE_ISOLATED'
    ? `source:${sourceKey}`
    : `provider:${providerKey}|account:${externalAccountId || '-'}|location:${externalLocationId || '-'}`;
  const safe = sanitizeProviderConnection(connection);
  return {
    entry: {
      sourceKey,
      sourceKind,
      sourceId,
      legacyDomain: domain,
      canonicalDomains: LEGACY_DOMAIN_MAPPINGS[domain],
      areaId,
      providerKey,
      externalAccountId,
      externalLocationId,
      identityStrength,
      identityKey,
      claimedStatus: compact(safe.status, 40),
      claimedAuthMethod: compact(safe.authMethod, 40),
      claimedCapabilities: Array.isArray(safe.capabilities)
        ? safe.capabilities.map(value => compact(value, 120)).filter(Boolean).slice(0, 50)
        : [],
      webhookSigningConfigured: Boolean(safe.webhookSigningConfigured),
      routingPreserved: domain === 'retell'
    }
  };
}

async function loadLegacyEntries({ wineryId, transaction = null }) {
  const [wineryConfig, areaConfigs] = await Promise.all([
    WineryIntegrationConfig.findOne({ where: { wineryId }, transaction }),
    OperationalAreaIntegrationConfig.findAll({
      where: { wineryId },
      include: [{ model: OperationalArea, as: 'Area', attributes: ['id', 'name', 'isActive'], required: true }],
      order: [['areaId', 'ASC']],
      transaction
    })
  ]);
  const entries = [];
  const skipped = [];
  if (wineryConfig) {
    const connections = parseJsonObject(wineryConfig.providerConnections);
    for (const domain of Object.keys(LEGACY_DOMAIN_MAPPINGS)) {
      const connection = parseJsonObject(connections[domain]);
      const result = legacyEntry({
        config: wineryConfig,
        domain,
        connection,
        sourceKind: 'WINERY'
      });
      if (result.entry) entries.push(result.entry);
      else skipped.push(result.skipped);
    }
  }
  for (const config of areaConfigs) {
    const connections = parseJsonObject(config.providerConnections);
    for (const [domain, rawConnection] of Object.entries(connections)) {
      const result = legacyEntry({
        config,
        domain: String(domain).trim().toLowerCase(),
        connection: parseJsonObject(rawConnection),
        sourceKind: 'AREA',
        areaId: config.areaId
      });
      if (result.entry) entries.push(result.entry);
      else skipped.push(result.skipped);
    }
  }
  return { entries, skipped };
}

function scopeForEntry(entry, domain) {
  const areaId = entry.sourceKind === 'AREA' ? entry.areaId : null;
  return {
    domain,
    scopeKey: buildScopeKey({ areaId }),
    areaId,
    locationId: null,
    priority: areaId ? 100 : 0,
    isDefault: true,
    isActive: true
  };
}

function buildCandidate(groupEntries) {
  const first = groupEntries[0];
  const scopes = new Map();
  for (const entry of groupEntries) {
    for (const domain of entry.canonicalDomains) {
      const scope = scopeForEntry(entry, domain);
      scopes.set(`${scope.domain}|${scope.scopeKey}`, scope);
    }
  }
  const sourceKeys = groupEntries.map(entry => entry.sourceKey).sort();
  const legacyDomains = [...new Set(groupEntries.map(entry => entry.legacyDomain))].sort();
  const canonicalDomains = [...new Set([...scopes.values()].map(scope => scope.domain))].sort();
  const identityFingerprint = digest({
    providerKey: first.providerKey,
    identityKey: first.identityKey,
    sourceKeys: first.identityStrength === 'SOURCE_ISOLATED' ? sourceKeys : undefined
  });
  return {
    connectionKey: `legacy-${first.providerKey}-${identityFingerprint.slice(0, 20)}`.slice(0, 120),
    providerKey: first.providerKey,
    displayName: `${first.providerKey} legacy ${canonicalDomains.join('/').toLowerCase()}`.slice(0, 160),
    manifestVersion: `legacy-backfill-${LEGACY_BACKFILL_VERSION}`,
    status: 'PENDING',
    externalAccountId: first.externalAccountId,
    externalLocationId: first.externalLocationId,
    configuration: null,
    scopes: [...scopes.values()].sort((left, right) => (
      left.domain.localeCompare(right.domain) || left.scopeKey.localeCompare(right.scopeKey)
    )),
    sourceKeys,
    legacyDomains,
    canonicalDomains,
    identityStrength: first.identityStrength,
    providerExtensions: {
      legacyBackfill: {
        version: LEGACY_BACKFILL_VERSION,
        inventoryFingerprint: digest(groupEntries.map(entry => ({
          sourceKey: entry.sourceKey,
          providerKey: entry.providerKey,
          externalAccountId: entry.externalAccountId,
          externalLocationId: entry.externalLocationId,
          canonicalDomains: entry.canonicalDomains,
          areaId: entry.areaId
        }))),
        sourceKeys,
        legacyDomains,
        canonicalDomains,
        identityStrength: first.identityStrength,
        claimedStatuses: [...new Set(groupEntries.map(entry => entry.claimedStatus).filter(Boolean))].sort(),
        claimedAuthMethods: [...new Set(groupEntries.map(entry => entry.claimedAuthMethod).filter(Boolean))].sort(),
        claimedCapabilities: [...new Set(groupEntries.flatMap(entry => entry.claimedCapabilities))].sort(),
        webhookSigningConfigured: groupEntries.some(entry => entry.webhookSigningConfigured),
        legacyRoutingPreserved: groupEntries.some(entry => entry.routingPreserved)
      }
    }
  };
}

function buildAmbiguityIssues(entries, candidates) {
  const issues = [];
  const clusters = new Map();
  for (const entry of entries) {
    for (const domain of entry.canonicalDomains) {
      const key = `${entry.providerKey}|${domain}`;
      if (!clusters.has(key)) clusters.set(key, []);
      clusters.get(key).push(entry);
    }
  }
  for (const [clusterKey, clustered] of clusters) {
    const isolated = clustered.filter(entry => entry.identityStrength === 'SOURCE_ISOLATED');
    if (clustered.length < 2 || isolated.length === 0) continue;
    const [providerKey, domain] = clusterKey.split('|');
    const sourceKeys = clustered.map(entry => entry.sourceKey).sort();
    const candidateKeys = candidates
      .filter(candidate => candidate.providerKey === providerKey && candidate.canonicalDomains.includes(domain))
      .map(candidate => candidate.connectionKey)
      .sort();
    issues.push({
      issueType: 'CONNECTION_MAPPING_AMBIGUOUS',
      severity: 'WARNING',
      title: `Legacy ${providerKey} ${domain} connection identity needs review`,
      summary: 'One or more overlapping legacy entries have no stable account or location identity, so they were not merged.',
      sourceKeys,
      candidateKeys,
      providerKey,
      domain,
      fingerprint: digest({ wineryBackfill: LEGACY_BACKFILL_VERSION, providerKey, domain, sourceKeys, candidateKeys })
    });
  }
  return issues;
}

async function buildCompatibilityBackfillPlan({ wineryId, transaction = null }) {
  const winery = await Winery.findByPk(wineryId, { attributes: ['id', 'name'], transaction });
  if (!winery) throw new NotFoundError('Winery not found');
  const { entries, skipped } = await loadLegacyEntries({ wineryId, transaction });
  const groups = new Map();
  for (const entry of entries) {
    const groupKey = `${entry.providerKey}|${entry.identityKey}`;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(entry);
  }
  const candidates = [...groups.values()].map(buildCandidate)
    .sort((left, right) => left.connectionKey.localeCompare(right.connectionKey));
  const [existing, previousBackfills] = await Promise.all([
    candidates.length === 0 ? [] : IntegrationConnection.findAll({
      where: { wineryId, connectionKey: { [Op.in]: candidates.map(candidate => candidate.connectionKey) } },
      attributes: ['id', 'connectionKey', 'providerKey', 'providerExtensions'],
      transaction
    }),
    IntegrationConnection.findAll({
      where: { wineryId, manifestVersion: `legacy-backfill-${LEGACY_BACKFILL_VERSION}` },
      attributes: ['id', 'connectionKey', 'providerKey', 'status', 'providerExtensions'],
      transaction
    })
  ]);
  const existingByKey = new Map(existing.map(connection => [connection.connectionKey, connection]));
  for (const candidate of candidates) {
    const connection = existingByKey.get(candidate.connectionKey);
    candidate.action = connection ? 'REUSE' : 'CREATE';
    candidate.existingConnectionId = connection?.id || null;
    candidate.collision = Boolean(connection
      && connection.providerExtensions?.legacyBackfill?.version !== LEGACY_BACKFILL_VERSION);
    if (candidate.collision) candidate.action = 'SKIP_COLLISION';
  }
  const issues = buildAmbiguityIssues(entries, candidates);
  for (const candidate of candidates.filter(item => item.collision)) {
    issues.push({
      issueType: 'SOURCE_CONFLICT',
      severity: 'BLOCKING',
      title: `Canonical connection key collision for ${candidate.providerKey}`,
      summary: 'A non-backfill connection already owns the deterministic legacy key, so the candidate will not be modified.',
      sourceKeys: candidate.sourceKeys,
      candidateKeys: [candidate.connectionKey],
      providerKey: candidate.providerKey,
      domain: candidate.canonicalDomains.join(','),
      fingerprint: digest({
        wineryBackfill: LEGACY_BACKFILL_VERSION,
        collision: candidate.connectionKey,
        sourceKeys: candidate.sourceKeys
      })
    });
  }
  const candidateKeys = new Set(candidates.map(candidate => candidate.connectionKey));
  const staleConnections = previousBackfills
    .filter(connection => !candidateKeys.has(connection.connectionKey))
    .map(connection => ({
      id: connection.id,
      connectionKey: connection.connectionKey,
      providerKey: connection.providerKey,
      status: connection.status,
      sourceKeys: connection.providerExtensions?.legacyBackfill?.sourceKeys || []
    }));
  for (const stale of staleConnections) {
    issues.push({
      issueType: 'CONNECTION_MAPPING_STALE',
      severity: 'WARNING',
      title: `Legacy candidate ${stale.connectionKey} is no longer in the source inventory`,
      summary: 'The canonical candidate is preserved but should be reviewed because its legacy source identity changed or disappeared.',
      sourceKeys: stale.sourceKeys,
      candidateKeys: [stale.connectionKey],
      providerKey: stale.providerKey,
      domain: null,
      fingerprint: digest({
        wineryBackfill: LEGACY_BACKFILL_VERSION,
        staleConnectionKey: stale.connectionKey,
        sourceKeys: stale.sourceKeys
      })
    });
  }
  return {
    version: LEGACY_BACKFILL_VERSION,
    winery: { id: winery.id, name: winery.name },
    summary: {
      sourceEntries: entries.length,
      skippedEntries: skipped.length,
      candidates: candidates.length,
      create: candidates.filter(candidate => candidate.action === 'CREATE').length,
      reuse: candidates.filter(candidate => candidate.action === 'REUSE').length,
      collisions: candidates.filter(candidate => candidate.collision).length,
      staleConnections: staleConnections.length,
      mappingIssues: issues.length
    },
    candidates,
    skipped: skipped.filter(Boolean),
    staleConnections,
    issues
  };
}

async function persistIssue({ wineryId, issue, transaction }) {
  const existing = await ProjectionIssue.findOne({ where: { wineryId, fingerprint: issue.fingerprint }, transaction });
  const now = new Date();
  if (existing) {
    await existing.update({
      observationCount: Number(existing.observationCount || 0) + 1,
      lastObservedAt: now,
      evidence: { sourceKeys: issue.sourceKeys, providerKey: issue.providerKey, domain: issue.domain },
      candidates: issue.candidateKeys
    }, { transaction });
    return existing;
  }
  return ProjectionIssue.create({
    wineryId,
    connectionId: null,
    issueType: issue.issueType,
    fingerprint: issue.fingerprint,
    status: 'OPEN',
    severity: issue.severity,
    title: issue.title,
    summary: issue.summary,
    evidence: { sourceKeys: issue.sourceKeys, providerKey: issue.providerKey, domain: issue.domain },
    candidates: issue.candidateKeys,
    sourceVersion: `legacy-backfill-${LEGACY_BACKFILL_VERSION}`,
    observationCount: 1,
    detectedAt: now,
    lastObservedAt: now
  }, { transaction });
}

async function applyCompatibilityBackfill({ wineryId, actorUserId, requestId, reason }) {
  return sequelize.transaction(async transaction => {
    const [winery, actor] = await Promise.all([
      Winery.findByPk(wineryId, { transaction, lock: transaction.LOCK.UPDATE }),
      User.findOne({ where: { id: actorUserId, wineryId }, attributes: ['id'], transaction })
    ]);
    if (!winery) throw new NotFoundError('Winery not found');
    if (!actor) throw new ValidationError('Backfill actor does not belong to the winery');
    const previous = await IntegrationOperationAuditEvent.findOne({
      where: { wineryId, action: LEGACY_BACKFILL_ACTION, requestId },
      transaction
    });
    if (previous) return { ...previous.afterSnapshot, duplicate: true };
    const plan = await buildCompatibilityBackfillPlan({ wineryId, transaction });
    const report = {
      version: LEGACY_BACKFILL_VERSION,
      createdConnectionIds: [],
      reusedConnectionIds: [],
      skippedCollisionKeys: [],
      createdScopes: 0,
      reusedScopes: 0,
      mappingIssueIds: [],
      staleConnectionIds: plan.staleConnections.map(connection => connection.id)
    };
    for (const candidate of plan.candidates) {
      if (candidate.collision) {
        report.skippedCollisionKeys.push(candidate.connectionKey);
        continue;
      }
      let connection = candidate.existingConnectionId
        ? await IntegrationConnection.findByPk(candidate.existingConnectionId, { transaction })
        : null;
      if (!connection) {
        connection = await IntegrationConnection.create({
          wineryId,
          connectionKey: candidate.connectionKey,
          providerKey: candidate.providerKey,
          displayName: candidate.displayName,
          manifestVersion: candidate.manifestVersion,
          status: 'PENDING',
          externalAccountId: candidate.externalAccountId,
          externalLocationId: candidate.externalLocationId,
          authReference: null,
          configuration: null,
          providerExtensions: candidate.providerExtensions,
          lastErrorCode: 'LEGACY_CREDENTIAL_ONBOARDING_REQUIRED',
          lastErrorSummary: 'Legacy metadata was inventoried; protected credentials and adapter verification are still required.',
          createdBy: actorUserId,
          updatedBy: actorUserId
        }, { transaction });
        report.createdConnectionIds.push(connection.id);
      } else {
        report.reusedConnectionIds.push(connection.id);
      }
      for (const scope of candidate.scopes) {
        const [record, created] = await IntegrationConnectionScope.findOrCreate({
          where: { connectionId: connection.id, domain: scope.domain, scopeKey: scope.scopeKey },
          defaults: { ...scope, wineryId, connectionId: connection.id },
          transaction
        });
        if (!created && record.wineryId !== wineryId) throw new ValidationError('Backfill scope tenant mismatch');
        if (created) report.createdScopes += 1;
        else report.reusedScopes += 1;
      }
    }
    for (const issue of plan.issues) {
      report.mappingIssueIds.push((await persistIssue({ wineryId, issue, transaction })).id);
    }
    const result = {
      planSummary: plan.summary,
      report,
      duplicate: false
    };
    await IntegrationOperationAuditEvent.create({
      wineryId,
      actorUserId,
      action: LEGACY_BACKFILL_ACTION,
      targetType: 'WINERY_INTEGRATION_CONFIGURATION',
      targetId: wineryId,
      requestId,
      reason,
      beforeSnapshot: plan.summary,
      afterSnapshot: result,
      metadata: { backfillVersion: LEGACY_BACKFILL_VERSION }
    }, { transaction });
    return result;
  });
}

async function listCompatibilityBackfillIssues({ wineryId, page = 1, pageSize = 25, status = 'ALL' }) {
  const where = {
    wineryId,
    issueType: { [Op.in]: ['CONNECTION_MAPPING_AMBIGUOUS', 'CONNECTION_MAPPING_STALE', 'SOURCE_CONFLICT'] }
  };
  if (status !== 'ALL') where.status = status;
  const result = await ProjectionIssue.findAndCountAll({
    where,
    order: [['lastObservedAt', 'DESC'], ['id', 'DESC']],
    limit: pageSize,
    offset: (page - 1) * pageSize
  });
  return {
    issues: result.rows,
    pagination: {
      page,
      pageSize,
      total: result.count,
      totalPages: Math.ceil(result.count / pageSize)
    }
  };
}

module.exports = {
  LEGACY_BACKFILL_VERSION,
  LEGACY_BACKFILL_ACTION,
  LEGACY_DOMAIN_MAPPINGS,
  normalizeProviderKey,
  loadLegacyEntries,
  buildCompatibilityBackfillPlan,
  applyCompatibilityBackfill,
  listCompatibilityBackfillIssues
};
