const automationRuleService = require('../services/automationRule.service');
const capabilityRegistry = require('../services/automationCapabilityRegistry.service');
const automationTemplateService = require('../services/automationTemplate.service');
const automationResourceBindingService = require('../services/automationResourceBinding.service');
const {
  validate,
  automationRuleCreateSchema,
  automationRuleUpdateSchema,
  automationRuleStatusSchema,
  automationRuleEvaluateSchema,
  automationRuleListSchema,
  automationRunListSchema,
  automationBindingListSchema,
  automationCapabilityListSchema,
  automationTemplateInstallSchema
} = require('../utils/validation');
const { ForbiddenError } = require('../utils/errors');

function requireManager(req) {
  if (!['manager', 'admin'].includes(req.user.role)) throw new ForbiddenError('Manager access required.');
}

async function listCapabilities(req, res, next) {
  try {
    requireManager(req);
    const query = validate(automationCapabilityListSchema, req.query);
    const capabilities = await capabilityRegistry.list({
      wineryId: req.user.wineryId,
      areaId: query.areaId || null
    });
    res.json({ capabilities });
  } catch (err) { next(err); }
}

async function listTemplates(req, res, next) {
  try {
    requireManager(req);
    res.json({ templates: automationTemplateService.listAutomationTemplates() });
  } catch (err) { next(err); }
}

async function installTemplate(req, res, next) {
  try {
    requireManager(req);
    const rule = await automationTemplateService.installAutomationTemplate({
      key: req.params.key,
      wineryId: req.user.wineryId,
      userId: req.user.id,
      userRole: req.user.role,
      data: validate(automationTemplateInstallSchema, req.body)
    });
    res.status(201).json({ rule });
  } catch (err) { next(err); }
}

async function listRules(req, res, next) {
  try {
    requireManager(req);
    const query = validate(automationRuleListSchema, req.query);
    res.json(await automationRuleService.listRules({ wineryId: req.user.wineryId, ...query }));
  } catch (err) { next(err); }
}

async function getRule(req, res, next) {
  try {
    requireManager(req);
    const rule = await automationRuleService.getRule({ ruleId: Number(req.params.id), wineryId: req.user.wineryId });
    res.json({ rule });
  } catch (err) { next(err); }
}

async function createRule(req, res, next) {
  try {
    requireManager(req);
    const rule = await automationRuleService.createRule({
      wineryId: req.user.wineryId,
      userId: req.user.id,
      userRole: req.user.role,
      data: validate(automationRuleCreateSchema, req.body)
    });
    res.status(201).json({ rule });
  } catch (err) { next(err); }
}

async function updateRule(req, res, next) {
  try {
    requireManager(req);
    const rule = await automationRuleService.updateRule({
      ruleId: Number(req.params.id),
      wineryId: req.user.wineryId,
      userId: req.user.id,
      userRole: req.user.role,
      data: validate(automationRuleUpdateSchema, req.body)
    });
    res.json({ rule });
  } catch (err) { next(err); }
}

async function updateRuleStatus(req, res, next) {
  try {
    requireManager(req);
    const data = validate(automationRuleStatusSchema, req.body);
    const rule = await automationRuleService.setRuleStatus({
      ruleId: Number(req.params.id),
      wineryId: req.user.wineryId,
      userId: req.user.id,
      userRole: req.user.role,
      status: data.status
    });
    res.json({ rule });
  } catch (err) { next(err); }
}

async function previewRule(req, res, next) {
  try {
    requireManager(req);
    const data = validate(automationRuleEvaluateSchema, req.body);
    const event = await automationRuleService.getEventForExecution({
      wineryId: req.user.wineryId,
      sourceEventId: data.sourceEventId,
      sampleEvent: data.sampleEvent
    });
    const preview = await automationRuleService.previewRule({
      ruleId: Number(req.params.id),
      wineryId: req.user.wineryId,
      userRole: req.user.role,
      event
    });
    res.json({ preview });
  } catch (err) { next(err); }
}

async function executeRule(req, res, next) {
  try {
    requireManager(req);
    const data = validate(automationRuleEvaluateSchema, req.body);
    const event = await automationRuleService.getEventForExecution({
      wineryId: req.user.wineryId,
      sourceEventId: data.sourceEventId,
      sampleEvent: data.sampleEvent
    });
    const result = await automationRuleService.executeRule({
      ruleId: Number(req.params.id),
      wineryId: req.user.wineryId,
      event,
      sourceKey: data.sourceEventId ? `integration-event:${data.sourceEventId}` : data.sourceKey,
      requireActive: true
    });
    res.status(result.duplicate ? 200 : 201).json(result);
  } catch (err) { next(err); }
}

async function listRuns(req, res, next) {
  try {
    requireManager(req);
    const query = validate(automationRunListSchema, req.query);
    res.json(await automationRuleService.listRuns({ wineryId: req.user.wineryId, ...query }));
  } catch (err) { next(err); }
}

async function getRun(req, res, next) {
  try {
    requireManager(req);
    const run = await automationRuleService.getRun({ runId: Number(req.params.id), wineryId: req.user.wineryId });
    res.json({ run });
  } catch (err) { next(err); }
}

async function listBindings(req, res, next) {
  try {
    requireManager(req);
    const query = validate(automationBindingListSchema, req.query);
    res.json(await automationResourceBindingService.listBindings({ wineryId: req.user.wineryId, ...query }));
  } catch (err) { next(err); }
}

async function getBinding(req, res, next) {
  try {
    requireManager(req);
    const binding = await automationResourceBindingService.getBinding({
      bindingId: Number(req.params.id),
      wineryId: req.user.wineryId
    });
    res.json({ binding });
  } catch (err) { next(err); }
}

module.exports = {
  createRule,
  executeRule,
  getRule,
  getRun,
  getBinding,
  listCapabilities,
  listTemplates,
  listBindings,
  installTemplate,
  listRules,
  listRuns,
  previewRule,
  updateRule,
  updateRuleStatus
};
