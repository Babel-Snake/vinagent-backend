const { Op, fn, col } = require('sequelize');
const {
  ExternalResourceReference,
  IntegrationConnection,
  IntegrationConnectionScope,
  IntegrationDomainActivation,
  IntegrationSyncRun,
  IntegrationSyncState,
  IntelligenceFact,
  ProjectionIssue
} = require('../models');
const { INTEGRATION_DOMAINS } = require('./integrationDataRegistry.service');

const HEALTH_SCHEMA_VERSION = 'integration.health.v1';
const ACTIVE_ISSUE_STATUSES = ['OPEN', 'ACKNOWLEDGED'];
const BAD_CONNECTION_STATUSES = new Set(['ERROR', 'REAUTH_REQUIRED']);
const DEGRADED_CONNECTION_STATUSES = new Set(['DEGRADED', 'PENDING']);

const RESOURCE_DOMAIN = Object.freeze({
  CUSTOMER: 'CUSTOMER',
  BOOKING: 'BOOKING',
  WINE_CLUB_MEMBERSHIP: 'CLUB',
  WINE_CLUB_ALLOCATION: 'CLUB',
  SALES_ORDER: 'COMMERCE',
  REFUND_SUMMARY: 'COMMERCE',
  PAYMENT_SUMMARY: 'COMMERCE',
  WINERY_PRODUCT: 'CATALOG',
  PRODUCT_VARIANT: 'CATALOG',
  STOCK_LOCATION: 'INVENTORY',
  INVENTORY_POSITION: 'INVENTORY',
  INVENTORY_COMMITMENT: 'INVENTORY',
  SHIPMENT: 'FULFILMENT',
  STAFF_IDENTITY: 'WORKFORCE',
  ROSTER_SHIFT: 'WORKFORCE',
  STAFF_AVAILABILITY: 'WORKFORCE',
  MESSAGE: 'COMMUNICATION'
});

const toIso = value => value ? new Date(value).toISOString() : null;
const asNumber = value => Number(value || 0);
const increment = (target, key, amount = 1) => {
  target[key] = asNumber(target[key]) + asNumber(amount);
};

function domainForResourceType(resourceType) {
  return RESOURCE_DOMAIN[String(resourceType || '').trim().toUpperCase()] || null;
}

function emptyDomain(domain) {
  return {
    domain,
    status: 'UNCONFIGURED',
    configuredConnectionCount: 0,
    activeScopeCount: 0,
    activeActivationCount: 0,
    connectionStatusCounts: {},
    mappings: {
      total: 0,
      resolved: 0,
      unresolved: 0,
      ambiguous: 0,
      ignored: 0,
      resolutionPercent: null
    },
    freshness: {
      current: 0,
      stale: 0,
      unknown: 0,
      oldestObservedAt: null,
      newestObservedAt: null
    },
    projectionIssues: {
      total: 0,
      info: 0,
      warning: 0,
      error: 0,
      blocking: 0
    },
    sync: {
      streamCount: 0,
      activeStreamCount: 0,
      pausedStreamCount: 0,
      failingStreamCount: 0,
      staleStreamCount: 0,
      recentRunCount: 0,
      recentFailedRunCount: 0,
      lastSuccessfulSyncAt: null
    },
    intelligenceFacts: {
      currentCount: 0,
      staleCount: 0,
      conflictingCount: 0
    }
  };
}

function resolveIssueDomain(issue, connectionDomains) {
  const fromReference = domainForResourceType(issue.ExternalResource?.resourceType);
  if (fromReference) return fromReference;
  const domains = issue.connectionId ? connectionDomains.get(Number(issue.connectionId)) : null;
  return domains?.size === 1 ? [...domains][0] : null;
}

function statusForDomain(domain) {
  const configured = domain.activeScopeCount > 0
    || domain.activeActivationCount > 0
    || domain.mappings.total > 0
    || domain.sync.streamCount > 0
    || domain.intelligenceFacts.currentCount > 0;
  if (!configured) return 'UNCONFIGURED';
  const connectionBlocked = [...BAD_CONNECTION_STATUSES]
    .some(status => asNumber(domain.connectionStatusCounts[status]) > 0);
  if (
    connectionBlocked
    || domain.projectionIssues.blocking > 0
    || domain.mappings.ambiguous > 0
    || domain.sync.failingStreamCount > 0
  ) return 'BLOCKED';
  const connectionDegraded = [...DEGRADED_CONNECTION_STATUSES]
    .some(status => asNumber(domain.connectionStatusCounts[status]) > 0);
  if (
    connectionDegraded
    || domain.projectionIssues.error > 0
    || domain.projectionIssues.warning > 0
    || domain.mappings.unresolved > 0
    || domain.freshness.stale > 0
    || domain.sync.staleStreamCount > 0
    || domain.sync.recentFailedRunCount > 0
    || domain.intelligenceFacts.staleCount > 0
    || domain.intelligenceFacts.conflictingCount > 0
  ) return 'DEGRADED';
  return 'HEALTHY';
}

function serializeConnection(connection, scopes) {
  const activeDomains = [...new Set(scopes
    .filter(scope => scope.connectionId === connection.id && scope.isActive)
    .map(scope => scope.domain))]
    .sort();
  return {
    id: connection.id,
    connectionKey: connection.connectionKey,
    providerKey: connection.providerKey,
    displayName: connection.displayName,
    status: connection.status,
    activeDomains,
    lastHealthCheckedAt: toIso(connection.lastHealthCheckedAt),
    lastHealthyAt: toIso(connection.lastHealthyAt)
  };
}

async function getIntegrationHealth({
  wineryId,
  domain: requestedDomain = 'ALL',
  connectionId = null,
  maxAgeSeconds = 86400,
  recentRunHours = 24,
  now = new Date(),
  transaction = null
}) {
  const connectionWhere = { wineryId };
  if (connectionId) connectionWhere.id = connectionId;
  const connections = await IntegrationConnection.findAll({
    where: connectionWhere,
    attributes: [
      'id', 'connectionKey', 'providerKey', 'displayName', 'status',
      'lastHealthCheckedAt', 'lastHealthyAt'
    ],
    order: [['id', 'ASC']],
    transaction
  });
  const connectionIds = connections.map(connection => connection.id);
  const scopedWhere = connectionIds.length ? { wineryId, connectionId: { [Op.in]: connectionIds } } : null;
  const factWhere = { wineryId, supersededAt: null };
  if (connectionId) factWhere.sourceConnectionId = connectionId;
  const recentRunCutoff = new Date(now.getTime() - recentRunHours * 3600000);
  const freshnessCutoff = new Date(now.getTime() - maxAgeSeconds * 1000);
  const referenceGroupAttributes = [
    'connectionId',
    'resourceType',
    [fn('COUNT', col('id')), 'recordCount']
  ];
  const referenceGroupBy = ['connectionId', 'resourceType'];

  const [
    scopes,
    activations,
    referenceResolutionGroups,
    currentReferenceGroups,
    staleReferenceGroups,
    issues,
    syncStates,
    syncRuns,
    factQualityGroups,
    staleFactGroups
  ] = await Promise.all([
    scopedWhere ? IntegrationConnectionScope.findAll({
      where: scopedWhere,
      attributes: ['connectionId', 'domain', 'isActive'],
      transaction
    }) : [],
    scopedWhere ? IntegrationDomainActivation.findAll({
      where: { ...scopedWhere, status: 'ACTIVE' },
      attributes: ['connectionId', 'domain'],
      transaction
    }) : [],
    scopedWhere ? ExternalResourceReference.findAll({
      where: scopedWhere,
      attributes: [
        'connectionId',
        'resourceType',
        'resolutionStatus',
        [fn('COUNT', col('id')), 'recordCount'],
        [fn('MIN', col('observedAt')), 'oldestObservedAt'],
        [fn('MAX', col('observedAt')), 'newestObservedAt']
      ],
      group: ['connectionId', 'resourceType', 'resolutionStatus'],
      raw: true,
      transaction
    }) : [],
    scopedWhere ? ExternalResourceReference.findAll({
      where: { ...scopedWhere, observedAt: { [Op.gte]: freshnessCutoff } },
      attributes: referenceGroupAttributes,
      group: referenceGroupBy,
      raw: true,
      transaction
    }) : [],
    scopedWhere ? ExternalResourceReference.findAll({
      where: { ...scopedWhere, observedAt: { [Op.lt]: freshnessCutoff } },
      attributes: referenceGroupAttributes,
      group: referenceGroupBy,
      raw: true,
      transaction
    }) : [],
    connectionIds.length ? ProjectionIssue.findAll({
      where: {
        wineryId,
        status: { [Op.in]: ACTIVE_ISSUE_STATUSES },
        [Op.or]: [
          { connectionId: { [Op.in]: connectionIds } },
          { connectionId: null }
        ]
      },
      attributes: [
        'connectionId', 'externalResourceReferenceId', 'status', 'severity'
      ],
      include: [{
        model: ExternalResourceReference,
        as: 'ExternalResource',
        attributes: ['resourceType'],
        required: false
      }],
      transaction
    }) : [],
    scopedWhere ? IntegrationSyncState.findAll({
      where: scopedWhere,
      attributes: [
        'connectionId', 'resourceType', 'operationalStatus', 'lastSuccessfulSyncAt',
        'consecutiveFailures'
      ],
      transaction
    }) : [],
    scopedWhere ? IntegrationSyncRun.findAll({
      where: { ...scopedWhere, startedAt: { [Op.gte]: recentRunCutoff } },
      attributes: ['connectionId', 'resourceType', 'status', 'completedAt'],
      transaction
    }) : [],
    IntelligenceFact.findAll({
      where: factWhere,
      attributes: [
        'subjectType',
        'qualityClass',
        [fn('COUNT', col('id')), 'recordCount']
      ],
      group: ['subjectType', 'qualityClass'],
      raw: true,
      transaction
    }),
    IntelligenceFact.findAll({
      where: { ...factWhere, staleAt: { [Op.lte]: now } },
      attributes: ['subjectType', [fn('COUNT', col('id')), 'recordCount']],
      group: ['subjectType'],
      raw: true,
      transaction
    })
  ]);

  const selectedDomains = requestedDomain === 'ALL'
    ? [...INTEGRATION_DOMAINS]
    : [requestedDomain];
  const domainRows = new Map(selectedDomains.map(domain => [domain, emptyDomain(domain)]));
  const connectionDomains = new Map(connectionIds.map(id => [id, new Set()]));
  const connectionById = new Map(connections.map(connection => [connection.id, connection]));

  for (const scope of scopes) {
    if (!scope.isActive) continue;
    connectionDomains.get(scope.connectionId)?.add(scope.domain);
    const row = domainRows.get(scope.domain);
    if (!row) continue;
    row.activeScopeCount += 1;
  }
  for (const activation of activations) {
    connectionDomains.get(activation.connectionId)?.add(activation.domain);
    const row = domainRows.get(activation.domain);
    if (row) row.activeActivationCount += 1;
  }
  for (const group of referenceResolutionGroups) {
    const domain = domainForResourceType(group.resourceType);
    if (!domain) continue;
    connectionDomains.get(group.connectionId)?.add(domain);
    const row = domainRows.get(domain);
    if (!row) continue;
    const count = asNumber(group.recordCount);
    row.mappings.total += count;
    increment(row.mappings, String(group.resolutionStatus || 'UNRESOLVED').toLowerCase(), count);
    const oldest = group.oldestObservedAt ? new Date(group.oldestObservedAt) : null;
    const newest = group.newestObservedAt ? new Date(group.newestObservedAt) : null;
    if (
      oldest
      && (!row.freshness.oldestObservedAt || oldest < new Date(row.freshness.oldestObservedAt))
    ) row.freshness.oldestObservedAt = oldest.toISOString();
    if (
      newest
      && (!row.freshness.newestObservedAt || newest > new Date(row.freshness.newestObservedAt))
    ) row.freshness.newestObservedAt = newest.toISOString();
  }
  for (const group of currentReferenceGroups) {
    const row = domainRows.get(domainForResourceType(group.resourceType));
    if (row) row.freshness.current += asNumber(group.recordCount);
  }
  for (const group of staleReferenceGroups) {
    const row = domainRows.get(domainForResourceType(group.resourceType));
    if (row) row.freshness.stale += asNumber(group.recordCount);
  }
  for (const [id, domains] of connectionDomains.entries()) {
    const connection = connectionById.get(id);
    for (const domain of domains) {
      const row = domainRows.get(domain);
      if (!row) continue;
      row.configuredConnectionCount += 1;
      increment(row.connectionStatusCounts, connection.status);
    }
  }

  let unassignedProjectionIssueCount = 0;
  for (const issue of issues) {
    const domain = resolveIssueDomain(issue, connectionDomains);
    const row = domain ? domainRows.get(domain) : null;
    if (!row) {
      unassignedProjectionIssueCount += 1;
      continue;
    }
    row.projectionIssues.total += 1;
    increment(row.projectionIssues, String(issue.severity || 'WARNING').toLowerCase());
  }

  for (const state of syncStates) {
    const domain = domainForResourceType(state.resourceType);
    const row = domain ? domainRows.get(domain) : null;
    if (!row) continue;
    row.sync.streamCount += 1;
    if (state.operationalStatus === 'PAUSED') row.sync.pausedStreamCount += 1;
    else row.sync.activeStreamCount += 1;
    if (Number(state.consecutiveFailures) > 0) row.sync.failingStreamCount += 1;
    if (!state.lastSuccessfulSyncAt || new Date(state.lastSuccessfulSyncAt) < freshnessCutoff) {
      row.sync.staleStreamCount += 1;
    }
    if (
      state.lastSuccessfulSyncAt
      && (!row.sync.lastSuccessfulSyncAt
        || new Date(state.lastSuccessfulSyncAt) > new Date(row.sync.lastSuccessfulSyncAt))
    ) row.sync.lastSuccessfulSyncAt = toIso(state.lastSuccessfulSyncAt);
  }
  for (const run of syncRuns) {
    const domain = domainForResourceType(run.resourceType);
    const row = domain ? domainRows.get(domain) : null;
    if (!row) continue;
    row.sync.recentRunCount += 1;
    if (['FAILED', 'PARTIAL'].includes(run.status)) row.sync.recentFailedRunCount += 1;
  }

  for (const fact of factQualityGroups) {
    const domain = domainForResourceType(fact.subjectType);
    const row = domain ? domainRows.get(domain) : null;
    if (!row) continue;
    const count = asNumber(fact.recordCount);
    row.intelligenceFacts.currentCount += count;
    if (fact.qualityClass === 'CONFLICTING') row.intelligenceFacts.conflictingCount += count;
  }
  for (const fact of staleFactGroups) {
    const row = domainRows.get(domainForResourceType(fact.subjectType));
    if (row) row.intelligenceFacts.staleCount += asNumber(fact.recordCount);
  }

  for (const row of domainRows.values()) {
    row.mappings.resolutionPercent = row.mappings.total > 0
      ? Math.round((row.mappings.resolved / row.mappings.total) * 10000) / 100
      : null;
    row.status = statusForDomain(row);
  }
  const domains = [...domainRows.values()];
  const statuses = domains.map(domain => domain.status);
  const overallStatus = statuses.includes('BLOCKED')
    ? 'BLOCKED'
    : statuses.includes('DEGRADED')
      ? 'DEGRADED'
      : statuses.includes('HEALTHY')
        ? 'HEALTHY'
        : 'UNCONFIGURED';

  return {
    schemaVersion: HEALTH_SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    thresholds: { maxAgeSeconds, recentRunHours },
    filters: {
      domain: requestedDomain,
      connectionId: connectionId || null
    },
    summary: {
      status: overallStatus,
      connectionCount: connections.length,
      healthyDomainCount: statuses.filter(status => status === 'HEALTHY').length,
      degradedDomainCount: statuses.filter(status => status === 'DEGRADED').length,
      blockedDomainCount: statuses.filter(status => status === 'BLOCKED').length,
      unconfiguredDomainCount: statuses.filter(status => status === 'UNCONFIGURED').length,
      unassignedProjectionIssueCount
    },
    connections: connections.map(connection => serializeConnection(connection, scopes)),
    domains,
    automationEligible: false
  };
}

module.exports = {
  HEALTH_SCHEMA_VERSION,
  RESOURCE_DOMAIN,
  domainForResourceType,
  getIntegrationHealth
};
