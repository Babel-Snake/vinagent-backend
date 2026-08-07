const triageService = require('../services/triage.service');
const operationsFeedService = require('../services/operationsFeed.service');
const operationalIntelligenceService = require('../services/operationalIntelligence.service');
const signalService = require('../services/operationalIntelligenceSignal.service');
const signalSchedulerService = require('../services/operationalIntelligenceScheduler.service');
const operationalIntelligenceConfig = require('../services/operationalIntelligenceConfig.service');
const {
  validate,
  autoclassifySchema,
  operationsFeedQuerySchema,
  operationalIntelligenceSignalCreateSchema,
  operationalIntelligenceSignalListSchema,
  operationalIntelligenceSignalMaterializeSchema,
  operationalIntelligenceSignalReviewSchema,
  operationalIntelligenceSignalWorkflowSchema,
  operationalIntelligenceConfigSchema,
  operationalIntelligenceConfigPreviewSchema,
  operationalIntelligenceSignalTaskSchema
} = require('../utils/validation');

function getDateRange(period = 'month', offset = 0) {
  const now = new Date();
  let start;
  let end;
  switch (period) {
    case 'day':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
      end = new Date(start);
      end.setDate(end.getDate() + 1);
      break;
    case 'week': {
      const day = now.getDay() || 7;
      const thisMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1);
      start = new Date(thisMonday);
      start.setDate(start.getDate() - offset * 7);
      end = new Date(start);
      end.setDate(end.getDate() + 7);
      break;
    }
    case 'year':
      start = new Date(now.getFullYear() - offset, 0, 1);
      end = new Date(now.getFullYear() - offset + 1, 0, 1);
      break;
    case 'month':
    default:
      start = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      end = new Date(now.getFullYear(), now.getMonth() - offset + 1, 1);
      break;
  }
  return { start, end };
}

function getHistoricalDateRanges({ period = 'month', offset = 0, count = 1, start = null, end = null }) {
  if (start && end) {
    const durationMs = new Date(end).getTime() - new Date(start).getTime();
    return Array.from({ length: count }, (_, index) => ({
      start: new Date(new Date(start).getTime() - durationMs * index),
      end: new Date(new Date(end).getTime() - durationMs * index)
    }));
  }
  return Array.from({ length: count }, (_, index) => getDateRange(period, offset + index));
}

function requireManager(req) {
  if (!['manager', 'admin'].includes(req.user.role)) {
    const err = new Error('Manager access required.');
    err.statusCode = 403;
    err.code = 'FORBIDDEN';
    throw err;
  }
}

async function list(req, res, next) {
  try {
    const result = await operationsFeedService.listOperations({
      wineryId: req.user.wineryId,
      userId: req.user.id,
      userRole: req.user.role,
      query: validate(operationsFeedQuerySchema, req.query)
    });
    res.json(result);
  } catch (err) { next(err); }
}

async function classify(req, res, next) {
  try {
    const data = validate(autoclassifySchema, req.body);
    const suggestion = await triageService.classifyStaffNote({
      ...data,
      wineryId: req.user.wineryId,
      userId: req.user.id
    });
    res.json({
      originalText: data.text,
      suggestedType: suggestion.suggestedType,
      suggestedSubtype: suggestion.subType,
      confidence: suggestion.confidence,
      classificationSource: suggestion.classificationSource,
      suggestedTitle: suggestion.suggestedTitle,
      suggestedBody: suggestion.payload?.summary || data.text,
      suggestedAreaIds: [],
      suggestedFields: suggestion
    });
  } catch (err) { next(err); }
}

async function getIntelligenceConfig(req, res, next) {
  try {
    requireManager(req);
    const [config, auditEvents] = await Promise.all([
      operationalIntelligenceConfig.getConfigForWinery(req.user.wineryId),
      operationalIntelligenceConfig.listConfigAuditEvents(req.user.wineryId)
    ]);
    res.json({
      config,
      presets: operationalIntelligenceConfig.getConfigPresets(),
      fieldMetadata: operationalIntelligenceConfig.getFieldMetadata(),
      auditEvents
    });
  } catch (err) { next(err); }
}

async function updateIntelligenceConfig(req, res, next) {
  try {
    requireManager(req);
    const payload = validate(operationalIntelligenceConfigSchema, req.body);
    const result = await operationalIntelligenceConfig.updateConfigForWineryWithAudit(req.user.wineryId, payload, {
      actorUserId: req.user.id
    });
    const auditEvents = await operationalIntelligenceConfig.listConfigAuditEvents(req.user.wineryId);
    res.json({
      config: result.config,
      changedKeys: result.changedKeys,
      presets: operationalIntelligenceConfig.getConfigPresets(),
      fieldMetadata: operationalIntelligenceConfig.getFieldMetadata(),
      auditEvents
    });
  } catch (err) { next(err); }
}

async function previewIntelligenceConfig(req, res, next) {
  try {
    requireManager(req);
    const payload = validate(operationalIntelligenceConfigPreviewSchema, req.body);
    const { period, offset, start, end, historyPeriods, ...patch } = payload;
    const ranges = getHistoricalDateRanges({
      period,
      offset,
      count: historyPeriods,
      start: start ? new Date(start) : null,
      end: end ? new Date(end) : null
    });
    const range = ranges[0];
    const result = await operationalIntelligenceService.previewConfigImpact({
      wineryId: req.user.wineryId,
      userId: req.user.id,
      start: range.start,
      end: range.end,
      ranges,
      patch
    });
    res.json({
      ...result,
      presets: operationalIntelligenceConfig.getConfigPresets(),
      fieldMetadata: operationalIntelligenceConfig.getFieldMetadata()
    });
  } catch (err) { next(err); }
}

async function listIntelligenceSignals(req, res, next) {
  try {
    requireManager(req);
    const result = await signalService.listSignals({
      wineryId: req.user.wineryId,
      query: validate(operationalIntelligenceSignalListSchema, req.query)
    });
    res.json(result);
  } catch (err) { next(err); }
}

async function createIntelligenceSignal(req, res, next) {
  try {
    requireManager(req);
    const result = await signalService.createSignal({
      wineryId: req.user.wineryId,
      userId: req.user.id,
      data: validate(operationalIntelligenceSignalCreateSchema, req.body)
    });
    res.status(result.created ? 201 : 200).json(result);
  } catch (err) { next(err); }
}

async function materializeIntelligenceSignals(req, res, next) {
  try {
    requireManager(req);
    const data = validate(operationalIntelligenceSignalMaterializeSchema, req.body);
    const range = data.start && data.end
      ? { start: new Date(data.start), end: new Date(data.end) }
      : getDateRange(data.period, data.offset);
    const result = await signalService.materializeSuggestedSignals({
      wineryId: req.user.wineryId,
      userId: req.user.id,
      start: range.start,
      end: range.end
    });
    res.status(result.createdCount > 0 ? 201 : 200).json(result);
  } catch (err) { next(err); }
}

async function runScheduledIntelligenceSignals(req, res, next) {
  try {
    requireManager(req);
    const data = validate(operationalIntelligenceSignalMaterializeSchema, req.body);
    const hasExplicitPeriod = Object.prototype.hasOwnProperty.call(req.body || {}, 'period');
    const hasExplicitOffset = Object.prototype.hasOwnProperty.call(req.body || {}, 'offset');
    const result = await signalSchedulerService.runScheduledMaterialization({
      wineryId: req.user.wineryId,
      userId: req.user.id,
      period: hasExplicitPeriod ? data.period : null,
      offset: hasExplicitOffset ? data.offset : null,
      start: data.start,
      end: data.end
    });
    res.status(result.createdCount > 0 ? 201 : 200).json(result);
  } catch (err) { next(err); }
}

async function reviewIntelligenceSignal(req, res, next) {
  try {
    requireManager(req);
    const signal = await signalService.updateSignalReview({
      signalId: Number(req.params.id),
      wineryId: req.user.wineryId,
      userId: req.user.id,
      data: validate(operationalIntelligenceSignalReviewSchema, req.body)
    });
    res.json({ signal });
  } catch (err) { next(err); }
}

async function updateIntelligenceSignalWorkflow(req, res, next) {
  try {
    requireManager(req);
    const signal = await signalService.updateSignalWorkflow({
      signalId: Number(req.params.id),
      wineryId: req.user.wineryId,
      userId: req.user.id,
      data: validate(operationalIntelligenceSignalWorkflowSchema, req.body)
    });
    res.json({ signal });
  } catch (err) { next(err); }
}

async function createTaskFromIntelligenceSignal(req, res, next) {
  try {
    requireManager(req);
    const result = await signalService.createTaskFromSignal({
      signalId: Number(req.params.id),
      wineryId: req.user.wineryId,
      userId: req.user.id,
      userRole: req.user.role,
      data: validate(operationalIntelligenceSignalTaskSchema, req.body)
    });
    res.status(result.duplicate ? 200 : 201).json(result);
  } catch (err) { next(err); }
}

module.exports = {
  list,
  classify,
  getIntelligenceConfig,
  updateIntelligenceConfig,
  previewIntelligenceConfig,
  listIntelligenceSignals,
  createIntelligenceSignal,
  materializeIntelligenceSignals,
  runScheduledIntelligenceSignals,
  reviewIntelligenceSignal,
  updateIntelligenceSignalWorkflow,
  createTaskFromIntelligenceSignal
};
