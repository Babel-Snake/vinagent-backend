const { IntegrationConnection } = require('../models');
const { ValidationError } = require('../utils/errors');
const { createProjectionIssueResolutionRegistry } = require('./projectionIssueResolutionRegistry.service');

const LEGACY_RESOLUTION_DECISIONS = Object.freeze({
  CONNECTION_MAPPING_AMBIGUOUS: Object.freeze(['KEEP_SEPARATE', 'SELECT_CANDIDATE', 'LEGACY_SOURCE_CORRECTED']),
  CONNECTION_MAPPING_STALE: Object.freeze(['RETAIN_CANDIDATE', 'LEGACY_SOURCE_CORRECTED']),
  SOURCE_CONFLICT: Object.freeze(['RETAIN_EXISTING', 'LEGACY_SOURCE_CORRECTED'])
});

async function resolveLegacyConnectionIssue(issue, data, { transaction }) {
  if (!String(issue.sourceVersion || '').startsWith('legacy-backfill-')) {
    throw new ValidationError('This source conflict is not a legacy connection mapping issue');
  }
  const decision = String(data.decision || '').trim().toUpperCase();
  const allowed = LEGACY_RESOLUTION_DECISIONS[issue.issueType] || [];
  if (!allowed.includes(decision)) {
    throw new ValidationError('Resolution decision is not supported for this mapping issue');
  }
  const selectedConnectionKey = String(data.selectedConnectionKey || '').trim().toLowerCase() || null;
  const needsCandidate = ['SELECT_CANDIDATE', 'RETAIN_CANDIDATE', 'RETAIN_EXISTING'].includes(decision);
  if (needsCandidate !== Boolean(selectedConnectionKey)) {
    throw new ValidationError(needsCandidate
      ? 'This resolution decision requires selectedConnectionKey'
      : 'selectedConnectionKey is not allowed for this resolution decision');
  }
  if (selectedConnectionKey) {
    const candidates = Array.isArray(issue.candidates) ? issue.candidates : [];
    if (!candidates.includes(selectedConnectionKey)) {
      throw new ValidationError('Selected connection is not a candidate for this issue');
    }
    const connection = await IntegrationConnection.findOne({
      where: { wineryId: issue.wineryId, connectionKey: selectedConnectionKey },
      attributes: ['id', 'connectionKey'],
      transaction
    });
    if (!connection) throw new ValidationError('Selected connection candidate no longer exists');
  }
  return {
    resolutionMethod: 'MANAGER_TYPED_DECISION',
    resolutionData: { decision, selectedConnectionKey }
  };
}

function createConfiguredProjectionIssueResolutionRegistry() {
  const registry = createProjectionIssueResolutionRegistry();
  for (const issueType of Object.keys(LEGACY_RESOLUTION_DECISIONS)) {
    registry.register(issueType, resolveLegacyConnectionIssue);
  }
  return registry;
}

const configuredRegistry = createConfiguredProjectionIssueResolutionRegistry();

module.exports = {
  LEGACY_RESOLUTION_DECISIONS,
  resolveLegacyConnectionIssue,
  createConfiguredProjectionIssueResolutionRegistry,
  has: configuredRegistry.has,
  list: configuredRegistry.list,
  resolve: configuredRegistry.resolve
};
