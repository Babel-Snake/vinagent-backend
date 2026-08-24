const { UniqueConstraintError } = require('sequelize');
const {
  AutomationRule,
  AutomationRuleVersion,
  AutomationRun,
  AutomationRunStep,
  IntegrationEvent,
  IntegrationEventItem,
  User,
  sequelize
} = require('../models');
const { ForbiddenError, NotFoundError, ValidationError } = require('../utils/errors');
const { redact } = require('../utils/sanitizer');
const { validate, createTaskSchema, createNoticeSchema } = require('../utils/validation');
const taskService = require('./taskService');
const noticeService = require('./notice.service');
const { findManagerUserId } = require('./taskAssignment.service');
const capabilityRegistry = require('./automationCapabilityRegistry.service');
const { registerCoreAutomationCapabilities } = require('./automationCapabilities.service');
const operationalResourceLinkService = require('./operationalResourceLink.service');
const automationResourceBindingService = require('./automationResourceBinding.service');
const {
  hashDefinition,
  normalizeDefinition
} = require('./automationRuleDefinition.service');
const {
  STATES,
  applyActionTiming,
  evaluateCondition,
  resolveTemplate
} = require('./automationRuleEvaluator.service');

const MANAGER_ROLES = new Set(['manager', 'admin']);
const RUN_STATUSES = new Set(['RUNNING', 'NOT_MATCHED', 'ACTIONED', 'SKIPPED', 'FAILED']);

registerCoreAutomationCapabilities();

function assertManager(userRole) {
  if (!MANAGER_ROLES.has(userRole)) throw new ForbiddenError('Manager access required.');
}

function parsePositiveInt(value, fallback, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function plain(value) {
  return value?.toJSON ? value.toJSON() : value;
}

function eventSnapshot(event) {
  const value = plain(event) || {};
  return redact({
    id: value.id || null,
    wineryId: value.wineryId || null,
    provider: value.provider || 'manual',
    intakeMethod: value.intakeMethod || 'automation',
    eventType: value.eventType,
    externalEventId: value.externalEventId || null,
    eventClass: value.eventClass || null,
    idempotencyKey: value.idempotencyKey || null,
    providerEventVersion: value.providerEventVersion || null,
    ingestionPurpose: value.ingestionPurpose || null,
    normalizedPayload: value.normalizedPayload || {},
    metadata: value.metadata || {},
    suggestedAreaId: value.suggestedAreaId || null,
    confirmedAreaId: value.confirmedAreaId || null,
    receivedAt: value.receivedAt || new Date()
  });
}

async function loadRuleAndVersion({ ruleId, wineryId, transaction = null }) {
  const rule = await AutomationRule.findOne({ where: { id: ruleId, wineryId }, transaction });
  if (!rule) throw new NotFoundError('Automation rule not found.');
  const version = await AutomationRuleVersion.findOne({
    where: { ruleId: rule.id, wineryId, version: rule.currentVersion },
    transaction
  });
  if (!version) throw new ValidationError('Automation rule has no current definition.');
  return { rule, version };
}

function serializeRule(rule, version = null) {
  const value = plain(rule);
  return {
    ...value,
    definition: version?.definition || null,
    definitionHash: version?.definitionHash || null,
    ruleVersionId: version?.id || null
  };
}

function serializeRun(run) {
  if (!run) return null;
  const value = plain(run);
  return {
    ...value,
    steps: value.Steps || value.steps || []
  };
}

async function createRule({ wineryId, userId, userRole, data }) {
  assertManager(userRole);
  const definition = normalizeDefinition(data.definition);
  const transaction = await sequelize.transaction();
  try {
    const rule = await AutomationRule.create({
      name: data.name,
      description: data.description || null,
      status: 'DRAFT',
      triggerType: definition.trigger.eventType,
      currentVersion: 1,
      wineryId,
      areaId: data.areaId || null,
      createdBy: userId,
      updatedBy: userId
    }, { transaction });
    const version = await AutomationRuleVersion.create({
      ruleId: rule.id,
      wineryId,
      version: 1,
      definition,
      definitionHash: hashDefinition(definition),
      createdBy: userId
    }, { transaction });
    await transaction.commit();
    return serializeRule(rule, version);
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    throw err;
  }
}

async function updateRule({ ruleId, wineryId, userId, userRole, data }) {
  assertManager(userRole);
  const transaction = await sequelize.transaction();
  try {
    const { rule, version: currentVersion } = await loadRuleAndVersion({ ruleId, wineryId, transaction });
    let version = currentVersion;
    let requiresReactivation = false;
    if (data.definition) {
      const definition = normalizeDefinition(data.definition);
      const definitionHash = hashDefinition(definition);
      if (definitionHash !== currentVersion.definitionHash) {
        version = await AutomationRuleVersion.create({
          ruleId: rule.id,
          wineryId,
          version: rule.currentVersion + 1,
          definition,
          definitionHash,
          createdBy: userId
        }, { transaction });
        rule.currentVersion = version.version;
        rule.triggerType = definition.trigger.eventType;
        requiresReactivation = true;
      }
    }
    if (data.name !== undefined) rule.name = data.name;
    if (data.description !== undefined) rule.description = data.description || null;
    if (data.areaId !== undefined && Number(data.areaId || 0) !== Number(rule.areaId || 0)) {
      rule.areaId = data.areaId || null;
      requiresReactivation = true;
    }
    if (requiresReactivation) {
      rule.status = 'DRAFT';
      rule.activatedBy = null;
      rule.activatedAt = null;
    }
    rule.updatedBy = userId;
    await rule.save({ transaction });
    await transaction.commit();
    return serializeRule(rule, version);
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    throw err;
  }
}

async function setRuleStatus({ ruleId, wineryId, userId, userRole, status }) {
  assertManager(userRole);
  const normalizedStatus = String(status).toUpperCase();
  if (!['DRAFT', 'ACTIVE', 'PAUSED'].includes(normalizedStatus)) throw new ValidationError('Invalid automation rule status.');
  const { rule, version } = await loadRuleAndVersion({ ruleId, wineryId });
  if (normalizedStatus === 'ACTIVE') {
    const definition = normalizeDefinition(version.definition);
    for (const step of definition.enrichments) {
      if (!capabilityRegistry.has(step.capability)) {
        throw new ValidationError(`Capability '${step.capability}' is not registered, so this rule cannot be activated.`);
      }
    }
    rule.activatedBy = userId;
    rule.activatedAt = new Date();
  } else {
    rule.activatedBy = null;
    rule.activatedAt = null;
  }
  rule.status = normalizedStatus;
  rule.updatedBy = userId;
  await rule.save();
  return serializeRule(rule, version);
}

async function listRules({ wineryId, status = 'all', page = 1, pageSize = 50 }) {
  const resolvedPage = parsePositiveInt(page, 1, 1000);
  const resolvedPageSize = parsePositiveInt(pageSize, 50, 100);
  const where = { wineryId };
  if (status && status !== 'all') where.status = String(status).toUpperCase();
  const result = await AutomationRule.findAndCountAll({
    where,
    order: [['updatedAt', 'DESC'], ['id', 'DESC']],
    limit: resolvedPageSize,
    offset: (resolvedPage - 1) * resolvedPageSize
  });
  const rules = await Promise.all(result.rows.map(async rule => {
    const version = await AutomationRuleVersion.findOne({
      where: { ruleId: rule.id, wineryId, version: rule.currentVersion }
    });
    return serializeRule(rule, version);
  }));
  return {
    rules,
    pagination: {
      page: resolvedPage,
      pageSize: resolvedPageSize,
      total: result.count,
      totalPages: Math.max(1, Math.ceil(result.count / resolvedPageSize))
    }
  };
}

async function getRule({ ruleId, wineryId }) {
  const { rule, version } = await loadRuleAndVersion({ ruleId, wineryId });
  const versions = await AutomationRuleVersion.findAll({
    where: { ruleId: rule.id, wineryId },
    attributes: ['id', 'version', 'definitionHash', 'createdBy', 'createdAt'],
    order: [['version', 'DESC']]
  });
  return { ...serializeRule(rule, version), versions };
}

function triggerMatches(rule, definition, event) {
  const snapshot = eventSnapshot(event);
  if (snapshot.eventType !== definition.trigger.eventType) return false;
  if (definition.trigger.providers?.length > 0 && !definition.trigger.providers.includes(String(snapshot.provider).toLowerCase())) return false;
  if (definition.trigger.domain) {
    const domain = snapshot.metadata?.webhook?.domain || snapshot.metadata?.domain || null;
    if (String(domain || '').toLowerCase() !== definition.trigger.domain) return false;
  }
  if (rule.areaId) {
    const eventAreaId = snapshot.confirmedAreaId
      || snapshot.suggestedAreaId
      || snapshot.normalizedPayload?.areaId
      || snapshot.metadata?.webhook?.areaId
      || null;
    if (Number(eventAreaId) !== Number(rule.areaId)) return false;
  }
  return true;
}

async function executeEnrichments({ definition, root, wineryId, areaId, run = null }) {
  const requiredFailures = [];
  for (const enrichment of definition.enrichments) {
    const startedAt = new Date();
    const input = resolveTemplate(enrichment.input, root);
    try {
      const output = await capabilityRegistry.execute(enrichment.capability, {
        wineryId,
        areaId,
        input
      });
      root.context[enrichment.key] = output === undefined ? null : output;
      if (run) {
        await AutomationRunStep.create({
          runId: run.id,
          wineryId,
          stepKey: enrichment.key,
          capability: enrichment.capability,
          status: 'SUCCEEDED',
          input: redact(input),
          output: redact(output === undefined ? null : output),
          startedAt,
          completedAt: new Date()
        });
      }
    } catch (err) {
      root.context[enrichment.key] = {
        _status: 'UNAVAILABLE',
        code: err.code || 'CAPABILITY_FAILED'
      };
      if (run) {
        await AutomationRunStep.create({
          runId: run.id,
          wineryId,
          stepKey: enrichment.key,
          capability: enrichment.capability,
          status: 'FAILED',
          input: redact(input),
          error: err.message,
          startedAt,
          completedAt: new Date()
        });
      }
      if (enrichment.required) requiredFailures.push({ key: enrichment.key, capability: enrichment.capability, error: err.message });
    }
  }
  return { requiredFailures };
}

function buildEvaluationRoot({ rule, version, event }) {
  return {
    event: eventSnapshot(event),
    context: {},
    rule: {
      id: rule.id,
      name: rule.name,
      version: version.version,
      areaId: rule.areaId || null
    }
  };
}

async function previewRule({ ruleId, wineryId, userRole, event }) {
  assertManager(userRole);
  const { rule, version } = await loadRuleAndVersion({ ruleId, wineryId });
  const definition = normalizeDefinition(version.definition);
  const root = buildEvaluationRoot({ rule, version, event });
  const triggerMatched = triggerMatches(rule, definition, event);
  let enrichmentResult = { requiredFailures: [] };
  if (triggerMatched) {
    enrichmentResult = await executeEnrichments({ definition, root, wineryId, areaId: rule.areaId || root.event.confirmedAreaId || root.event.suggestedAreaId || null });
  }
  const decision = triggerMatched
    ? enrichmentResult.requiredFailures.length > 0
      ? { state: STATES.UNKNOWN, operator: 'REQUIRED_ENRICHMENT', failures: enrichmentResult.requiredFailures }
      : evaluateCondition(definition.conditions, root)
    : { state: STATES.NOT_MATCHED, operator: 'TRIGGER' };
  const actionData = decision.state === STATES.MATCHED
    ? applyActionTiming(resolveTemplate(definition.action.data, root), definition.action.timing, root)
    : null;
  return {
    ruleId: rule.id,
    version: version.version,
    triggerMatched,
    state: decision.state,
    context: redact(root.context),
    decision,
    proposedAction: actionData ? { type: definition.action.type, data: actionData } : null
  };
}

async function resolveAutomationActor(rule, transaction) {
  const candidateIds = [rule.activatedBy, rule.updatedBy, rule.createdBy].filter(Boolean);
  for (const id of candidateIds) {
    const user = await User.findOne({ where: { id, wineryId: rule.wineryId, isActive: true }, transaction });
    if (user) return user.id;
  }
  return findManagerUserId(rule.wineryId, transaction);
}

async function createAction({ rule, version, run, definition, root }) {
  const transaction = await sequelize.transaction();
  try {
    const actorUserId = await resolveAutomationActor(rule, transaction);
    if (!actorUserId) throw new ValidationError('Automation rule has no active manager actor.');
    let actionData = resolveTemplate(definition.action.data, root);
    actionData = applyActionTiming(actionData, definition.action.timing, root);
    if (rule.areaId && !actionData.primaryAreaId && actionData.areaScope !== 'ORGANISATION') {
      actionData.areaScope = 'AREAS';
      actionData.primaryAreaId = rule.areaId;
    }

    let item;
    if (definition.action.type === 'TASK') {
      const validData = validate(createTaskSchema, {
        category: 'INTERNAL',
        subType: 'AUTOMATION_ACTION',
        taskOrigin: 'INTERNAL',
        inboundMethod: 'internal',
        suggestedChannel: 'none',
        ...actionData
      });
      validData.payload = {
        ...(validData.payload || {}),
        automation: {
          generated: true,
          ruleId: rule.id,
          ruleVersion: version.version,
          runId: run.id,
          sourceEventId: root.event.id || null,
          sourceKey: run.sourceKey
        }
      };
      item = await taskService.createTask({
        wineryId: rule.wineryId,
        userId: actorUserId,
        userRole: 'manager',
        data: validData,
        source: 'automation_rule',
        transaction,
        allowCrossUserAssignment: true,
        allowCrossAreaPlacement: true,
        recordCreatedByUserId: actorUserId
      });
    } else {
      const validData = validate(createNoticeSchema, actionData);
      item = await noticeService.createNotice({
        wineryId: rule.wineryId,
        userId: actorUserId,
        userRole: 'manager',
        transaction,
        data: {
          ...validData,
          externalSource: 'automation_rule',
          externalId: run.sourceKey,
          sourceEventId: root.event.id || null
        }
      });
    }

    if (root.event.id) {
      await IntegrationEventItem.create({
        eventId: root.event.id,
        wineryId: rule.wineryId,
        itemType: definition.action.type,
        itemId: item.id,
        itemKey: `automation-${rule.id}`,
        linkType: 'CREATED',
        createdBy: actorUserId
      }, { transaction });
    }

    const canonicalResource = root.event.normalizedPayload?.resource;
    if (canonicalResource?.type && canonicalResource?.id) {
      await operationalResourceLinkService.createOperationalResourceLink({
        wineryId: rule.wineryId,
        itemType: definition.action.type,
        itemId: item.id,
        resourceType: String(canonicalResource.type).toUpperCase(),
        resourceId: canonicalResource.id,
        linkType: 'GENERATED_FOR',
        automationRuleId: rule.id,
        automationRunId: run.id,
        sourceEventId: root.event.id || null,
        metadata: {
          purposeKey: actionData.payload?.automationPurpose || `automation.rule.${rule.id}`,
          ruleVersion: version.version
        },
        createdBy: actorUserId,
        transaction
      });
      await automationResourceBindingService.createBindingForGeneratedAction({
        rule,
        version,
        run,
        event: root.event,
        definition,
        actionData,
        itemType: definition.action.type,
        item,
        resourceType: canonicalResource.type,
        resourceId: canonicalResource.id,
        transaction
      });
    }

    await run.update({
      status: 'ACTIONED',
      contextSnapshot: redact(root.context),
      decisionSnapshot: { state: STATES.MATCHED },
      actionItemType: definition.action.type,
      actionItemId: item.id,
      completedAt: new Date(),
      error: null
    }, { transaction });
    await transaction.commit();
    return item;
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    throw err;
  }
}

async function executeRule({ ruleId, wineryId, event, sourceKey, requireActive = true }) {
  const { rule, version } = await loadRuleAndVersion({ ruleId, wineryId });
  if (requireActive && rule.status !== 'ACTIVE') throw new ValidationError('Automation rule is not active.');
  const definition = normalizeDefinition(version.definition);
  const resolvedSourceKey = String(sourceKey || '').trim();
  if (!resolvedSourceKey) throw new ValidationError('A stable sourceKey is required for automation execution.');

  const existing = await AutomationRun.findOne({ where: { ruleId: rule.id, sourceKey: resolvedSourceKey } });
  if (existing) return { run: serializeRun(existing), duplicate: true };

  let run;
  try {
    run = await AutomationRun.create({
      ruleId: rule.id,
      ruleVersionId: version.id,
      wineryId,
      sourceEventId: plain(event)?.id || null,
      sourceKey: resolvedSourceKey,
      status: 'RUNNING',
      triggerSnapshot: eventSnapshot(event),
      startedAt: new Date()
    });
  } catch (err) {
    if (err instanceof UniqueConstraintError || err.name === 'SequelizeUniqueConstraintError') {
      const duplicate = await AutomationRun.findOne({ where: { ruleId: rule.id, sourceKey: resolvedSourceKey } });
      return { run: serializeRun(duplicate), duplicate: true };
    }
    throw err;
  }

  try {
    const root = buildEvaluationRoot({ rule, version, event });
    if (!triggerMatches(rule, definition, event)) {
      await run.update({ status: 'NOT_MATCHED', decisionSnapshot: { state: STATES.NOT_MATCHED, reason: 'TRIGGER_NOT_MATCHED' }, completedAt: new Date() });
      return { run: serializeRun(run), duplicate: false };
    }

    const enrichmentResult = await executeEnrichments({
      definition,
      root,
      wineryId,
      areaId: rule.areaId || root.event.confirmedAreaId || root.event.suggestedAreaId || null,
      run
    });
    const decision = enrichmentResult.requiredFailures.length > 0
      ? { state: STATES.UNKNOWN, operator: 'REQUIRED_ENRICHMENT', failures: enrichmentResult.requiredFailures }
      : evaluateCondition(definition.conditions, root);
    if (decision.state === STATES.NOT_MATCHED) {
      await run.update({ status: 'NOT_MATCHED', contextSnapshot: redact(root.context), decisionSnapshot: decision, completedAt: new Date() });
      return { run: serializeRun(run), duplicate: false };
    }
    if (decision.state === STATES.UNKNOWN) {
      const status = definition.onUnknown === 'FAIL' ? 'FAILED' : 'SKIPPED';
      await run.update({ status, contextSnapshot: redact(root.context), decisionSnapshot: decision, error: status === 'FAILED' ? 'Automation conditions could not be resolved.' : null, completedAt: new Date() });
      return { run: serializeRun(run), duplicate: false };
    }

    const item = await createAction({ rule, version, run, definition, root });
    return { run: serializeRun(run), item: plain(item), duplicate: false };
  } catch (err) {
    await run.update({ status: 'FAILED', error: err.message, completedAt: new Date() }).catch(() => {});
    throw err;
  }
}

async function executeMatchingRulesForEvent({ wineryId, eventId, dispatchSource = 'legacy_intake' }) {
  const event = await IntegrationEvent.findOne({ where: { id: eventId, wineryId } });
  if (!event) throw new NotFoundError('Integration event not found.');
  if (event.eventClass === 'CANONICAL' && dispatchSource !== 'canonical_outbox') {
    throw new ValidationError('Canonical events must be dispatched through the canonical event outbox.');
  }
  const rules = await AutomationRule.findAll({
    where: { wineryId, status: 'ACTIVE', triggerType: event.eventType },
    order: [['id', 'ASC']]
  });
  const results = [];
  for (const rule of rules) {
    try {
      results.push(await executeRule({
        ruleId: rule.id,
        wineryId,
        event,
        sourceKey: `integration-event:${event.id}`,
        requireActive: true
      }));
    } catch (err) {
      results.push({ ruleId: rule.id, error: err.message });
    }
  }
  return results;
}

async function listRuns({ wineryId, ruleId = null, status = 'all', page = 1, pageSize = 50 }) {
  const resolvedPage = parsePositiveInt(page, 1, 1000);
  const resolvedPageSize = parsePositiveInt(pageSize, 50, 100);
  const where = { wineryId };
  if (ruleId) where.ruleId = Number(ruleId);
  if (status && status !== 'all') {
    const normalized = String(status).toUpperCase();
    if (!RUN_STATUSES.has(normalized)) throw new ValidationError('Invalid automation run status.');
    where.status = normalized;
  }
  const result = await AutomationRun.findAndCountAll({
    where,
    include: [{ model: AutomationRunStep, as: 'Steps' }],
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    limit: resolvedPageSize,
    offset: (resolvedPage - 1) * resolvedPageSize,
    distinct: true
  });
  return {
    runs: result.rows.map(serializeRun),
    pagination: {
      page: resolvedPage,
      pageSize: resolvedPageSize,
      total: result.count,
      totalPages: Math.max(1, Math.ceil(result.count / resolvedPageSize))
    }
  };
}

async function getRun({ runId, wineryId }) {
  const run = await AutomationRun.findOne({
    where: { id: runId, wineryId },
    include: [
      { model: AutomationRunStep, as: 'Steps' },
      { model: AutomationRule, as: 'Rule', attributes: ['id', 'name', 'status', 'triggerType'] }
    ]
  });
  if (!run) throw new NotFoundError('Automation run not found.');
  return serializeRun(run);
}

async function getEventForExecution({ wineryId, sourceEventId, sampleEvent }) {
  if (sourceEventId) {
    const event = await IntegrationEvent.findOne({ where: { id: sourceEventId, wineryId } });
    if (!event) throw new NotFoundError('Integration event not found.');
    return event;
  }
  if (!sampleEvent) throw new ValidationError('Provide sourceEventId or sampleEvent.');
  return { ...sampleEvent, id: null, wineryId };
}

module.exports = {
  createRule,
  executeMatchingRulesForEvent,
  executeRule,
  getEventForExecution,
  getRule,
  getRun,
  listRules,
  listRuns,
  previewRule,
  serializeRule,
  setRuleStatus,
  updateRule
};
