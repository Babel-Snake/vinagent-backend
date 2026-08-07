const crypto = require('crypto');
const { Op } = require('sequelize');
const {
  OperationalArea,
  OperationalIntelligenceSignal,
  Task,
  User
} = require('../models');
const taskService = require('./taskService');
const operationalIntelligenceService = require('./operationalIntelligence.service');
const operationalIntelligenceConfig = require('./operationalIntelligenceConfig.service');

const SIGNAL_STATUSES = new Set(['OPEN', 'ACKNOWLEDGED', 'DISMISSED', 'ACTION_CREATED']);
const SIGNAL_TYPES = new Set([
  'REQUEST_AGING',
  'RECURRENCE',
  'CLASSIFICATION_CORRECTION',
  'CONVERSION_OUTCOME',
  'NOTICE_ACKNOWLEDGEMENT',
  'TREND'
]);
const SEVERITIES = new Set(['info', 'warning', 'critical']);

function createError(message, statusCode = 400, code = 'BAD_REQUEST') {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

function buildFingerprint(data) {
  if (data.fingerprint) return String(data.fingerprint).trim().slice(0, 128);
  const identity = {
    signalType: data.signalType,
    title: data.title,
    areaId: data.areaId || null,
    periodStart: data.periodStart || null,
    periodEnd: data.periodEnd || null,
    evidenceKey: data.evidence?.key || data.evidence?.fingerprint || data.evidence?.id || data.evidence?.keywords || data.evidence?.examples || data.evidence
  };
  return crypto.createHash('sha256').update(stableJson(identity)).digest('hex');
}

function includeAssociations() {
  return [
    { model: OperationalArea, as: 'Area', attributes: ['id', 'name'] },
    { model: User, as: 'Creator', attributes: ['id', 'displayName', 'email', 'role'] },
    { model: User, as: 'Reviewer', attributes: ['id', 'displayName', 'email', 'role'] },
    { model: User, as: 'ReviewOwner', attributes: ['id', 'displayName', 'email', 'role'] },
    { model: Task, as: 'ActionTask', attributes: ['id', 'status', 'category', 'subType', 'priority'] }
  ];
}

async function assertAreaInWinery({ wineryId, areaId, transaction }) {
  if (!areaId) return null;
  const area = await OperationalArea.findOne({ where: { id: areaId, wineryId }, transaction });
  if (!area) throw createError('Operational area not found for this winery.', 404, 'AREA_NOT_FOUND');
  return area;
}

async function assertUserInWinery({ wineryId, userId, transaction }) {
  if (!userId) return null;
  const user = await User.findOne({ where: { id: userId, wineryId }, transaction });
  if (!user) throw createError('Review owner not found for this winery.', 404, 'REVIEW_OWNER_NOT_FOUND');
  return user;
}

function buildDedupeKey(data) {
  if (data.dedupeKey) return String(data.dedupeKey).trim().slice(0, 255);
  const identity = {
    signalType: data.signalType,
    title: data.title,
    areaId: data.areaId || null,
    evidenceKey: data.evidence?.key || data.evidence?.type || data.evidence?.areaKey || data.evidence?.typeKey || data.evidence?.signalKey || data.evidence?.keywords || data.evidence?.examples || null
  };
  return crypto.createHash('sha256').update(stableJson(identity)).digest('hex');
}

function suppressionCutoff(data, days = 45) {
  const anchor = data.periodStart ? new Date(data.periodStart) : new Date();
  if (Number.isNaN(anchor.getTime())) return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return new Date(anchor.getTime() - days * 24 * 60 * 60 * 1000);
}

async function updateExistingSignalFromInput(signal, defaults, transaction) {
  if (signal.status === 'ACTION_CREATED') return signal;
  signal.title = defaults.title;
  signal.summary = defaults.summary;
  signal.severity = defaults.severity;
  signal.evidence = defaults.evidence;
  signal.suggestedAction = defaults.suggestedAction;
  signal.periodStart = signal.periodStart && defaults.periodStart && new Date(signal.periodStart) < new Date(defaults.periodStart)
    ? signal.periodStart
    : defaults.periodStart;
  signal.periodEnd = signal.periodEnd && defaults.periodEnd && new Date(signal.periodEnd) > new Date(defaults.periodEnd)
    ? signal.periodEnd
    : defaults.periodEnd;
  signal.areaId = defaults.areaId;
  signal.reviewOwnerUserId = defaults.reviewOwnerUserId || signal.reviewOwnerUserId || null;
  signal.reviewDueAt = defaults.reviewDueAt || signal.reviewDueAt || null;
  signal.lastMaterializedAt = new Date();
  signal.materializationCount = (signal.materializationCount || 1) + 1;
  await signal.save({ transaction });
  return signal;
}

async function listSignals({ wineryId, query = {} }) {
  const where = { wineryId };
  if (query.status && query.status !== 'ALL') where.status = query.status;
  if (query.signalType && query.signalType !== 'ALL') where.signalType = query.signalType;
  if (query.areaId && query.areaId !== 'all') where.areaId = Number(query.areaId);

  const page = Number(query.page || 1);
  const pageSize = Number(query.pageSize || 25);
  const { rows, count } = await OperationalIntelligenceSignal.findAndCountAll({
    where,
    include: includeAssociations(),
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    limit: pageSize,
    offset: (page - 1) * pageSize
  });

  return {
    signals: rows,
    pagination: {
      page,
      pageSize,
      total: count,
      totalPages: Math.ceil(count / pageSize) || 1
    }
  };
}

async function createSignal({ wineryId, userId, data, transaction = null }) {
  if (!SIGNAL_TYPES.has(data.signalType)) throw createError('Unsupported signal type.', 400, 'INVALID_SIGNAL_TYPE');
  if (!SEVERITIES.has(data.severity || 'info')) throw createError('Unsupported signal severity.', 400, 'INVALID_SIGNAL_SEVERITY');

  const ownTransaction = !transaction;
  const t = transaction || await OperationalIntelligenceSignal.sequelize.transaction();
  try {
    await assertAreaInWinery({ wineryId, areaId: data.areaId, transaction: t });
    await assertUserInWinery({ wineryId, userId: data.reviewOwnerUserId, transaction: t });
    const fingerprint = buildFingerprint(data);
    const dedupeKey = buildDedupeKey(data);
    const defaults = {
      wineryId,
      signalType: data.signalType,
      status: 'OPEN',
      severity: data.severity || 'info',
      title: String(data.title || '').trim(),
      summary: data.summary || null,
      fingerprint,
      dedupeKey,
      evidence: data.evidence || null,
      suggestedAction: data.suggestedAction || null,
      periodStart: data.periodStart || null,
      periodEnd: data.periodEnd || null,
      areaId: data.areaId || null,
      createdBy: userId || null,
      reviewOwnerUserId: data.reviewOwnerUserId || null,
      reviewDueAt: data.reviewDueAt || null,
      lastMaterializedAt: new Date(),
      materializationCount: 1
    };

    const duplicateByDedupe = dedupeKey ? await OperationalIntelligenceSignal.findOne({
      where: {
        wineryId,
        dedupeKey,
        status: { [Op.in]: ['OPEN', 'ACKNOWLEDGED'] },
        createdAt: { [Op.gte]: suppressionCutoff(data) }
      },
      order: [['updatedAt', 'DESC'], ['id', 'DESC']],
      transaction: t
    }) : null;

    if (duplicateByDedupe) {
      await updateExistingSignalFromInput(duplicateByDedupe, defaults, t);
      if (ownTransaction) await t.commit();
      const fresh = await OperationalIntelligenceSignal.findOne({ where: { id: duplicateByDedupe.id, wineryId }, include: includeAssociations() });
      return { signal: fresh, created: false, suppressedDuplicate: true };
    }

    const [signal, created] = await OperationalIntelligenceSignal.findOrCreate({
      where: { wineryId, fingerprint },
      defaults,
      transaction: t
    });

    if (!created && signal.status !== 'ACTION_CREATED') {
      await updateExistingSignalFromInput(signal, defaults, t);
    }

    if (ownTransaction) await t.commit();
    const fresh = await OperationalIntelligenceSignal.findOne({ where: { id: signal.id, wineryId }, include: includeAssociations() });
    return { signal: fresh, created };
  } catch (err) {
    if (ownTransaction && !t.finished) await t.rollback();
    throw err;
  }
}

async function materializeSuggestedSignals({ wineryId, userId, start, end, acknowledgements = null }) {
  const config = await operationalIntelligenceConfig.getConfigForWinery(wineryId);
  const intelligence = await operationalIntelligenceService.getOperationalIntelligence({
    wineryId,
    start,
    end,
    now: new Date()
  });
  const suggestedSignals = operationalIntelligenceService.buildSuggestedSignalInputs({
    intelligence,
    acknowledgements,
    start,
    end,
    config
  });

  const results = [];
  for (const signalInput of suggestedSignals) {
    results.push(await createSignal({ wineryId, userId, data: signalInput }));
  }

  return {
    suggestedCount: suggestedSignals.length,
    createdCount: results.filter(result => result.created).length,
    updatedCount: results.filter(result => !result.created).length,
    suppressedDuplicateCount: results.filter(result => result.suppressedDuplicate).length,
    signals: results.map(result => result.signal)
  };
}

async function updateSignalReview({ signalId, wineryId, userId, data }) {
  if (!SIGNAL_STATUSES.has(data.status)) throw createError('Unsupported signal status.', 400, 'INVALID_SIGNAL_STATUS');
  if (data.status === 'ACTION_CREATED') throw createError('Use create-task to action a signal.', 400, 'INVALID_SIGNAL_STATUS');

  const signal = await OperationalIntelligenceSignal.findOne({ where: { id: signalId, wineryId } });
  if (!signal) throw createError('Operational intelligence signal not found.', 404, 'SIGNAL_NOT_FOUND');
  signal.status = data.status;
  signal.reviewNote = data.reviewNote || null;
  signal.reviewedBy = userId;
  signal.reviewedAt = new Date();
  await signal.save();
  return OperationalIntelligenceSignal.findOne({ where: { id: signal.id, wineryId }, include: includeAssociations() });
}

async function updateSignalWorkflow({ signalId, wineryId, userId, data }) {
  const signal = await OperationalIntelligenceSignal.findOne({ where: { id: signalId, wineryId } });
  if (!signal) throw createError('Operational intelligence signal not found.', 404, 'SIGNAL_NOT_FOUND');
  if (signal.status === 'ACTION_CREATED') throw createError('Actioned signals cannot be reassigned.', 400, 'SIGNAL_ALREADY_ACTIONED');
  await assertUserInWinery({ wineryId, userId: data.reviewOwnerUserId });

  if (data.reviewOwnerUserId !== undefined) signal.reviewOwnerUserId = data.reviewOwnerUserId || null;
  if (data.reviewDueAt !== undefined) signal.reviewDueAt = data.reviewDueAt || null;
  if (data.suggestedAction !== undefined) signal.suggestedAction = data.suggestedAction || null;
  if (data.reviewNote !== undefined) signal.reviewNote = data.reviewNote || null;
  signal.reviewedBy = userId;
  signal.reviewedAt = new Date();
  await signal.save();
  return OperationalIntelligenceSignal.findOne({ where: { id: signal.id, wineryId }, include: includeAssociations() });
}

function priorityForSeverity(severity) {
  if (severity === 'critical') return 'high';
  if (severity === 'warning') return 'normal';
  return 'low';
}

async function createTaskFromSignal({ signalId, wineryId, userId, userRole, data = {} }) {
  const t = await OperationalIntelligenceSignal.sequelize.transaction();
  try {
    const signal = await OperationalIntelligenceSignal.findOne({ where: { id: signalId, wineryId }, transaction: t });
    if (!signal) throw createError('Operational intelligence signal not found.', 404, 'SIGNAL_NOT_FOUND');
    if (signal.status === 'ACTION_CREATED' && signal.actionTaskId) {
      const existingTask = await Task.findOne({ where: { id: signal.actionTaskId, wineryId }, transaction: t });
      await t.commit();
      return { task: existingTask, signal, duplicate: true };
    }

    const title = data.title || `Review signal: ${signal.title}`;
    const summaryLines = [
      signal.summary || signal.title,
      signal.reviewNote ? `Review note: ${signal.reviewNote}` : null,
      'Created from a manager-approved operational intelligence signal.'
    ].filter(Boolean);

    const task = await taskService.createTask({
      wineryId,
      userId,
      userRole,
      source: 'operational_intelligence_signal',
      transaction: t,
      data: {
        category: 'OPERATIONS',
        subType: data.subType || 'INTELLIGENCE_REVIEW',
        customerType: 'UNKNOWN',
        priority: data.priority || priorityForSeverity(signal.severity),
        suggestedAction: data.suggestedAction || signal.suggestedAction || summaryLines.join('\n'),
        notes: summaryLines.join('\n'),
        assigneeId: data.assigneeId || signal.reviewOwnerUserId || null,
        dueAt: data.dueAt || signal.reviewDueAt || null,
        taskOrigin: 'INTERNAL',
        inboundMethod: 'internal',
        areaScope: signal.areaId ? 'AREAS' : 'ORGANISATION',
        primaryAreaId: signal.areaId || null,
        linkedAreaIds: [],
        payload: {
          ...(data.payload || {}),
          summary: title,
          operationalIntelligenceSignal: {
            signalId: signal.id,
            signalType: signal.signalType,
            severity: signal.severity,
            fingerprint: signal.fingerprint,
            evidence: signal.evidence || null
          }
        },
        steps: data.steps || [{
          title: 'Review advisory signal evidence',
          description: 'Validate the evidence, decide the operational response, and record the action taken.',
          stepType: 'APPROVAL',
          waitingOn: 'MANAGER'
        }]
      }
    });

    signal.status = 'ACTION_CREATED';
    signal.reviewedBy = userId;
    signal.reviewedAt = new Date();
    signal.reviewNote = data.reviewNote || signal.reviewNote || null;
    signal.actionTaskId = task.id;
    await signal.save({ transaction: t });
    await t.commit();

    const fresh = await OperationalIntelligenceSignal.findOne({ where: { id: signal.id, wineryId }, include: includeAssociations() });
    return { task, signal: fresh, duplicate: false };
  } catch (err) {
    if (!t.finished) await t.rollback();
    throw err;
  }
}

module.exports = {
  buildFingerprint,
  listSignals,
  createSignal,
  materializeSuggestedSignals,
  updateSignalReview,
  updateSignalWorkflow,
  createTaskFromSignal
};
