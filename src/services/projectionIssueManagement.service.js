const {
  IntegrationConnection,
  IntegrationOperationAuditEvent,
  ProjectionIssue,
  User,
  sequelize
} = require('../models');
const { redact } = require('../utils/sanitizer');
const { NotFoundError, ValidationError } = require('../utils/errors');
const projectionIssueResolutions = require('./projectionIssueResolutions.service');

const TERMINAL_ISSUE_STATUSES = new Set(['RESOLVED', 'IGNORED']);
const ISSUE_TRANSITION_ACTIONS = Object.freeze({
  ACKNOWLEDGE: 'PROJECTION_ISSUE_ACKNOWLEDGED',
  RESOLVE: 'PROJECTION_ISSUE_RESOLVED',
  IGNORE: 'PROJECTION_ISSUE_IGNORED'
});

function serializeIssue(issue) {
  const plain = issue.toJSON ? issue.toJSON() : issue;
  return {
    ...plain,
    evidence: redact(plain.evidence),
    candidates: redact(plain.candidates),
    Connection: plain.Connection ? {
      id: plain.Connection.id,
      connectionKey: plain.Connection.connectionKey,
      providerKey: plain.Connection.providerKey,
      displayName: plain.Connection.displayName,
      status: plain.Connection.status
    } : undefined
  };
}

function auditSnapshot(issue) {
  return {
    id: issue.id,
    issueType: issue.issueType,
    status: issue.status,
    severity: issue.severity,
    connectionId: issue.connectionId,
    externalResourceReferenceId: issue.externalResourceReferenceId,
    observationCount: issue.observationCount,
    acknowledgedAt: issue.acknowledgedAt,
    acknowledgedBy: issue.acknowledgedBy,
    resolutionMethod: issue.resolutionMethod,
    resolutionData: issue.resolutionData,
    resolvedAt: issue.resolvedAt,
    resolvedBy: issue.resolvedBy
  };
}

async function listProjectionIssues({
  wineryId,
  page = 1,
  pageSize = 25,
  status = 'ALL',
  severity = 'ALL',
  issueType,
  connectionId
}) {
  const where = { wineryId };
  if (status !== 'ALL') where.status = status;
  if (severity !== 'ALL') where.severity = severity;
  if (issueType) where.issueType = issueType;
  if (connectionId) where.connectionId = connectionId;
  const result = await ProjectionIssue.findAndCountAll({
    where,
    include: [{
      model: IntegrationConnection,
      as: 'Connection',
      attributes: ['id', 'connectionKey', 'providerKey', 'displayName', 'status'],
      required: false
    }],
    order: [['lastObservedAt', 'DESC'], ['id', 'DESC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
    distinct: true
  });
  return {
    issues: result.rows.map(serializeIssue),
    pagination: {
      page,
      pageSize,
      total: result.count,
      totalPages: Math.ceil(result.count / pageSize)
    }
  };
}

async function getProjectionIssue({ wineryId, issueId, transaction = null, lock = false }) {
  const issue = await ProjectionIssue.findOne({
    where: { id: issueId, wineryId },
    include: [{
      model: IntegrationConnection,
      as: 'Connection',
      attributes: ['id', 'connectionKey', 'providerKey', 'displayName', 'status'],
      required: false
    }],
    transaction,
    ...(lock ? { lock: transaction.LOCK.UPDATE } : {})
  });
  if (!issue) throw new NotFoundError('Projection issue not found');
  return issue;
}

async function transitionProjectionIssue({
  wineryId,
  issueId,
  actorUserId,
  action,
  requestId,
  reason,
  resolution = null,
  resolutionRegistry = projectionIssueResolutions
}) {
  const normalizedAction = String(action || '').trim().toUpperCase();
  const auditAction = ISSUE_TRANSITION_ACTIONS[normalizedAction];
  if (!auditAction) throw new ValidationError('Projection issue transition is invalid');
  return sequelize.transaction(async transaction => {
    const [actor, previous] = await Promise.all([
      User.findOne({ where: { id: actorUserId, wineryId }, attributes: ['id'], transaction }),
      IntegrationOperationAuditEvent.findOne({
        where: { wineryId, action: auditAction, requestId },
        transaction
      })
    ]);
    if (!actor) throw new ValidationError('Projection issue actor does not belong to the winery');
    if (previous) {
      if (String(previous.targetId) !== String(issueId)) {
        throw new ValidationError('This requestId was already used for another projection issue');
      }
      return { issue: previous.afterSnapshot, duplicate: true };
    }
    const issue = await getProjectionIssue({ wineryId, issueId, transaction, lock: true });
    if (TERMINAL_ISSUE_STATUSES.has(issue.status)) {
      throw new ValidationError('Projection issue is already terminal');
    }
    const before = auditSnapshot(issue);
    const update = {};
    if (normalizedAction === 'ACKNOWLEDGE') {
      if (issue.status !== 'OPEN') throw new ValidationError('Only open projection issues can be acknowledged');
      update.status = 'ACKNOWLEDGED';
      update.acknowledgedAt = new Date();
      update.acknowledgedBy = actorUserId;
    } else if (normalizedAction === 'IGNORE') {
      update.status = 'IGNORED';
      update.resolutionMethod = 'MANAGER_IGNORED';
      update.resolutionData = { decision: 'IGNORE' };
      update.resolvedAt = new Date();
      update.resolvedBy = actorUserId;
      update.resolutionNote = reason;
    } else {
      const typed = await resolutionRegistry.resolve(issue, resolution || {}, { transaction, actorUserId });
      update.status = 'RESOLVED';
      update.resolutionMethod = typed.resolutionMethod;
      update.resolutionData = typed.resolutionData;
      update.resolvedAt = new Date();
      update.resolvedBy = actorUserId;
      update.resolutionNote = reason;
    }
    await issue.update(update, { transaction });
    const after = auditSnapshot(issue);
    await IntegrationOperationAuditEvent.create({
      wineryId,
      actorUserId,
      action: auditAction,
      targetType: 'PROJECTION_ISSUE',
      targetId: issue.id,
      connectionId: issue.connectionId,
      resourceType: issue.issueType,
      requestId,
      reason,
      beforeSnapshot: before,
      afterSnapshot: after,
      metadata: normalizedAction === 'RESOLVE' ? { decision: after.resolutionData?.decision || null } : null
    }, { transaction });
    return { issue: after, duplicate: false };
  });
}

module.exports = {
  TERMINAL_ISSUE_STATUSES,
  ISSUE_TRANSITION_ACTIONS,
  serializeIssue,
  auditSnapshot,
  listProjectionIssues,
  getProjectionIssue,
  transitionProjectionIssue
};
