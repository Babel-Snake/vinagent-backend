const { Op, UniqueConstraintError } = require('sequelize');
const {
  AutomationResourceBinding,
  AutomationRule,
  IntegrationEvent,
  Task,
  TaskAction,
  TaskStep,
  User,
  sequelize
} = require('../models');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { stableSerialize } = require('./integrationDataFoundation.service');
const auditService = require('./audit.service');
const { removeTaskNotifications } = require('./taskAssignment.service');
const lifecycleRegistry = require('./automationResourceLifecycleRegistry.service');
const { registerBookingPreparationLifecycle } = require('./bookingPreparationLifecycle.service');
const { registerShipmentExceptionLifecycle } = require('./shipmentExceptionLifecycle.service');
const { registerBookingCoverageGapLifecycle } = require('./bookingCoverageGapLifecycle.service');

const ACTIVE_STATES = new Set(['ACTIVE', 'HUMAN_OWNED']);
const TERMINAL_STATES = new Set(['CANCELLED', 'ORPHANED']);

function ensureCoreHandlers() {
  if (!lifecycleRegistry.get({
    resourceType: 'BOOKING',
    itemType: 'TASK',
    purposeKey: 'booking.truffle_preparation'
  })) registerBookingPreparationLifecycle();
  if (!lifecycleRegistry.get({
    resourceType: 'SHIPMENT',
    itemType: 'TASK',
    purposeKey: 'shipment.exception_resolution'
  })) registerShipmentExceptionLifecycle();
  if (!lifecycleRegistry.get({
    resourceType: 'BOOKING',
    itemType: 'TASK',
    purposeKey: 'booking.workforce_coverage_gap'
  })) registerBookingCoverageGapLifecycle();
}

function plain(value) {
  return value?.toJSON ? value.toJSON() : value;
}

function getPath(value, path) {
  return String(path).split('.').reduce((current, key) => current?.[key], value);
}

function normalizedValue(path, value) {
  if (value == null) return null;
  if (path === 'dueAt') return new Date(value).toISOString();
  return value;
}

function captureManagedSnapshot(item, managedFields) {
  const value = plain(item) || {};
  return Object.fromEntries(managedFields.map(path => [path, normalizedValue(path, getPath(value, path))]));
}

function snapshotsEqual(left, right) {
  return stableSerialize(left || {}) === stableSerialize(right || {});
}

function snapshotDiff(current, expected) {
  const diff = {};
  for (const key of new Set([...Object.keys(current || {}), ...Object.keys(expected || {})])) {
    if (stableSerialize(current?.[key]) !== stableSerialize(expected?.[key])) {
      diff[key] = { from: expected?.[key] ?? null, to: current?.[key] ?? null };
    }
  }
  return diff;
}

function setPath(target, path, value) {
  const parts = String(path).split('.');
  let current = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index];
    const child = current[key];
    current[key] = child && typeof child === 'object' && !Array.isArray(child) ? { ...child } : {};
    current = current[key];
  }
  current[parts[parts.length - 1]] = value;
}

function sourceRevision(event) {
  return String(event.providerEventVersion || event.idempotencyKey || event.id || '').slice(0, 255) || null;
}

async function createBindingForGeneratedAction({
  rule,
  version,
  run,
  event,
  definition,
  actionData,
  itemType,
  item,
  resourceType,
  resourceId,
  transaction
}) {
  ensureCoreHandlers();
  const purposeKey = String(actionData?.payload?.automationPurpose || '').trim();
  if (!purposeKey) return null;
  const normalizedResourceType = String(resourceType || '').toUpperCase();
  const normalizedItemType = String(itemType || '').toUpperCase();
  const handler = lifecycleRegistry.get({
    resourceType: normalizedResourceType,
    itemType: normalizedItemType,
    purposeKey
  });
  if (!handler) return null;

  const values = {
    wineryId: rule.wineryId,
    ruleId: rule.id,
    ruleVersionId: version.id,
    resourceType: normalizedResourceType,
    resourceId: Number(resourceId),
    purposeKey,
    itemType: normalizedItemType,
    itemId: item.id,
    lifecycleState: 'ACTIVE',
    sourceRevision: sourceRevision(event),
    lastReconciledRunId: run.id,
    lastReconciledEventId: event.id || null,
    managedFields: [...handler.managedFields],
    lastAppliedSnapshot: captureManagedSnapshot(item, handler.managedFields),
    configurationSnapshot: handler.buildConfiguration({ definition, actionData, item: plain(item) }),
    reconciliationPolicy: handler.policy,
    lastDecision: 'CREATED',
    lastDecisionReason: 'AUTOMATION_ACTION_CREATED',
    lastReconciledAt: new Date()
  };
  try {
    return await AutomationResourceBinding.create(values, { transaction });
  } catch (error) {
    if (error instanceof UniqueConstraintError || error.name === 'SequelizeUniqueConstraintError') {
      throw new ValidationError('Managed work already exists for this rule, resource, and purpose.');
    }
    throw error;
  }
}

async function detectHumanOverride({ binding, task, transaction }) {
  if (binding.humanOverrideAt) {
    return {
      detected: true,
      at: binding.humanOverrideAt,
      userId: binding.humanOverrideBy || null,
      reason: binding.humanOverrideReason || 'PREVIOUSLY_DETECTED'
    };
  }
  if (task.status !== 'PENDING' || task.workflowState !== 'NOT_STARTED' || task.resolvedAt) {
    return { detected: true, at: new Date(), userId: task.updatedBy || null, reason: 'TASK_WORKFLOW_PROGRESSED' };
  }
  const currentSnapshot = captureManagedSnapshot(task, binding.managedFields);
  if (!snapshotsEqual(currentSnapshot, binding.lastAppliedSnapshot)) {
    return { detected: true, at: new Date(), userId: task.updatedBy || null, reason: 'MANAGED_FIELDS_CHANGED' };
  }
  const humanAction = await TaskAction.findOne({
    where: {
      taskId: task.id,
      userId: { [Op.ne]: null },
      createdAt: { [Op.gt]: binding.createdAt }
    },
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    transaction
  });
  if (humanAction) {
    return {
      detected: true,
      at: humanAction.createdAt,
      userId: humanAction.userId,
      reason: `HUMAN_${humanAction.actionType}`.slice(0, 255)
    };
  }
  return { detected: false, at: null, userId: null, reason: null };
}

async function recordBindingDecision({ binding, event, decision, reason, values = {}, transaction }) {
  await binding.update({
    ...values,
    sourceRevision: sourceRevision(event),
    lastReconciledEventId: event.id,
    lastDecision: decision,
    lastDecisionReason: String(reason || decision).slice(0, 255),
    lastReconciledAt: new Date()
  }, { transaction });
}

async function annotateTask({ binding, task, event, annotation, reason, transaction }) {
  await auditService.logTaskAction({
    transaction,
    taskId: task.id,
    userId: null,
    actionType: 'NOTE_ADDED',
    details: {
      note: annotation,
      source: 'automation_resource_binding',
      systemGenerated: true,
      bindingId: binding.id,
      sourceEventId: event.id,
      reason
    }
  });
}

async function applyManagedUpdate({ binding, task, event, desired, transaction }) {
  const currentSnapshot = captureManagedSnapshot(task, binding.managedFields);
  if (snapshotsEqual(currentSnapshot, desired.snapshot)) {
    await recordBindingDecision({
      binding, event, decision: 'NO_CHANGE', reason: 'MANAGED_FIELDS_ALREADY_CURRENT', transaction
    });
    return { bindingId: binding.id, itemId: task.id, decision: 'NO_CHANGE' };
  }
  const taskValue = plain(task);
  for (const field of binding.managedFields) {
    if (!Object.prototype.hasOwnProperty.call(desired.snapshot, field)) continue;
    setPath(taskValue, field, desired.snapshot[field]);
  }
  for (const field of binding.managedFields.filter(path => !path.includes('.'))) {
    if (!Object.prototype.hasOwnProperty.call(desired.snapshot, field)) continue;
    task[field] = field === 'dueAt' && desired.snapshot[field]
      ? new Date(desired.snapshot[field])
      : desired.snapshot[field];
  }
  if (binding.managedFields.some(path => path.startsWith('payload.'))) {
    task.payload = taskValue.payload;
    task.changed('payload', true);
  }
  task.updatedBy = null;
  await task.save({ transaction });
  const appliedSnapshot = captureManagedSnapshot(task, binding.managedFields);
  await auditService.logTaskAction({
    transaction,
    taskId: task.id,
    userId: null,
    actionType: 'UPDATED_PAYLOAD',
    details: {
      source: 'automation_resource_binding',
      bindingId: binding.id,
      sourceEventId: event.id,
      reason: desired.reason,
      changes: snapshotDiff(appliedSnapshot, currentSnapshot)
    }
  });
  await recordBindingDecision({
    binding,
    event,
    decision: 'UPDATED',
    reason: desired.reason,
    values: { lastAppliedSnapshot: appliedSnapshot },
    transaction
  });
  return { bindingId: binding.id, itemId: task.id, decision: 'UPDATED' };
}

async function cancelUntouchedTask({ binding, task, event, reason, transaction }) {
  task.status = 'REJECTED';
  task.workflowState = 'CANCELLED';
  task.waitingOn = 'NONE';
  task.nextStepSummary = null;
  task.blockedReason = null;
  task.dueAt = null;
  task.updatedBy = null;
  task.resolvedAs = 'NO_ACTION';
  task.resolutionType = 'ALREADY_RESOLVED';
  task.customerOutcome = 'NO_CHANGE';
  task.resolutionSummary = reason === 'BOOKING_CANCELLED'
    ? 'Automatically cancelled because the linked booking was cancelled.'
    : 'Automatically cancelled because the linked preparation requirement was removed.';
  task.followUpRequired = false;
  task.followUpDueAt = null;
  task.followUpSummary = null;
  task.resolvedAt = new Date();
  await task.save({ transaction });
  await TaskStep.update({ status: 'CANCELLED', updatedBy: null }, {
    where: { taskId: task.id, status: { [Op.notIn]: ['COMPLETED', 'SKIPPED', 'CANCELLED'] } },
    transaction
  });
  await removeTaskNotifications({ taskId: task.id, transaction });
  await auditService.logTaskAction({
    transaction,
    taskId: task.id,
    userId: null,
    actionType: 'REJECTED',
    details: {
      source: 'automation_resource_binding',
      bindingId: binding.id,
      sourceEventId: event.id,
      reason,
      changes: { status: 'REJECTED', workflowState: 'CANCELLED' },
      oldValues: { status: 'PENDING', workflowState: 'NOT_STARTED' }
    }
  });
  await recordBindingDecision({
    binding,
    event,
    decision: 'CANCELLED',
    reason,
    values: { lifecycleState: 'CANCELLED' },
    transaction
  });
  return { bindingId: binding.id, itemId: task.id, decision: 'CANCELLED' };
}

async function reconcileOneBinding({ binding, event, transaction }) {
  if (Number(binding.lastReconciledEventId) === Number(event.id)) {
    return { bindingId: binding.id, itemId: binding.itemId, decision: 'DUPLICATE_EVENT' };
  }
  if (TERMINAL_STATES.has(binding.lifecycleState)) {
    await recordBindingDecision({
      binding, event, decision: 'NOOP', reason: 'BINDING_IS_TERMINAL', transaction
    });
    return { bindingId: binding.id, itemId: binding.itemId, decision: 'NOOP', reason: 'BINDING_IS_TERMINAL' };
  }
  const handler = lifecycleRegistry.get(binding);
  if (!handler) {
    await recordBindingDecision({
      binding, event, decision: 'NOOP', reason: 'LIFECYCLE_HANDLER_NOT_REGISTERED', transaction
    });
    return { bindingId: binding.id, itemId: binding.itemId, decision: 'NOOP', reason: 'LIFECYCLE_HANDLER_NOT_REGISTERED' };
  }
  if (binding.itemType !== 'TASK') {
    await recordBindingDecision({ binding, event, decision: 'NOOP', reason: 'ITEM_TYPE_NOT_SUPPORTED', transaction });
    return { bindingId: binding.id, itemId: binding.itemId, decision: 'NOOP', reason: 'ITEM_TYPE_NOT_SUPPORTED' };
  }
  const task = await Task.findOne({
    where: { id: binding.itemId, wineryId: binding.wineryId },
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (!task) {
    await recordBindingDecision({
      binding, event, decision: 'ORPHANED', reason: 'BOUND_ITEM_NOT_FOUND',
      values: { lifecycleState: 'ORPHANED' }, transaction
    });
    return { bindingId: binding.id, itemId: binding.itemId, decision: 'ORPHANED' };
  }

  const desired = await handler.resolveDesired({ binding, event: plain(event), task, transaction });
  if (desired.intent === 'NOOP') {
    await recordBindingDecision({ binding, event, decision: 'NOOP', reason: desired.reason, transaction });
    return { bindingId: binding.id, itemId: task.id, decision: 'NOOP', reason: desired.reason };
  }
  const override = await detectHumanOverride({ binding, task, transaction });
  if (override.detected) {
    if (desired.annotation && binding.reconciliationPolicy?.onUnsafe === 'ANNOTATE') {
      await annotateTask({ binding, task, event, annotation: desired.annotation, reason: desired.reason, transaction });
    }
    await recordBindingDecision({
      binding,
      event,
      decision: desired.annotation ? 'ANNOTATED' : 'NOOP',
      reason: override.reason,
      values: {
        lifecycleState: 'HUMAN_OWNED',
        humanOverrideAt: override.at,
        humanOverrideBy: override.userId,
        humanOverrideReason: override.reason
      },
      transaction
    });
    return {
      bindingId: binding.id,
      itemId: task.id,
      decision: desired.annotation ? 'ANNOTATED' : 'NOOP',
      reason: override.reason
    };
  }
  if (desired.intent === 'UPDATE' && binding.reconciliationPolicy?.onChange === 'UPDATE_MANAGED') {
    return applyManagedUpdate({ binding, task, event, desired, transaction });
  }
  if (desired.intent === 'CANCEL' && binding.reconciliationPolicy?.onCancel === 'CANCEL_IF_UNTOUCHED') {
    return cancelUntouchedTask({ binding, task, event, reason: desired.reason, transaction });
  }
  if (desired.intent === 'ANNOTATE' || binding.reconciliationPolicy?.onUnsafe === 'ANNOTATE') {
    await annotateTask({ binding, task, event, annotation: desired.annotation, reason: desired.reason, transaction });
    await recordBindingDecision({ binding, event, decision: 'ANNOTATED', reason: desired.reason, transaction });
    return { bindingId: binding.id, itemId: task.id, decision: 'ANNOTATED', reason: desired.reason };
  }
  await recordBindingDecision({ binding, event, decision: 'NOOP', reason: 'POLICY_NOOP', transaction });
  return { bindingId: binding.id, itemId: task.id, decision: 'NOOP', reason: 'POLICY_NOOP' };
}

async function reconcileBindingsForCanonicalEvent({ wineryId, eventId }) {
  ensureCoreHandlers();
  return sequelize.transaction(async transaction => {
    const event = await IntegrationEvent.findOne({
      where: { id: eventId, wineryId, eventClass: 'CANONICAL', automationEligible: true },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!event) return [];
    const resource = event.normalizedPayload?.resource;
    if (!resource?.type || !resource?.id) return [];
    const bindings = await AutomationResourceBinding.findAll({
      where: {
        wineryId,
        resourceType: String(resource.type).toUpperCase(),
        resourceId: Number(resource.id),
        lifecycleState: { [Op.in]: [...ACTIVE_STATES, ...TERMINAL_STATES] }
      },
      order: [['id', 'ASC']],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    const results = [];
    for (const binding of bindings) {
      results.push(await reconcileOneBinding({ binding, event, transaction }));
    }
    return results;
  });
}

function parsePositiveInt(value, fallback, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

async function listBindings({ wineryId, ruleId = null, resourceType = null, resourceId = null, lifecycleState = null, page = 1, pageSize = 50 }) {
  const resolvedPage = parsePositiveInt(page, 1, 1000);
  const resolvedPageSize = parsePositiveInt(pageSize, 50, 100);
  const where = { wineryId };
  if (ruleId) where.ruleId = Number(ruleId);
  if (resourceType) where.resourceType = String(resourceType).toUpperCase();
  if (resourceId) where.resourceId = Number(resourceId);
  if (lifecycleState) where.lifecycleState = String(lifecycleState).toUpperCase();
  const result = await AutomationResourceBinding.findAndCountAll({
    where,
    include: [
      { model: AutomationRule, as: 'Rule', attributes: ['id', 'name', 'status'] },
      { model: User, as: 'HumanOverrideActor', attributes: ['id', 'displayName'], required: false }
    ],
    order: [['updatedAt', 'DESC'], ['id', 'DESC']],
    limit: resolvedPageSize,
    offset: (resolvedPage - 1) * resolvedPageSize
  });
  return {
    bindings: result.rows.map(plain),
    pagination: {
      page: resolvedPage,
      pageSize: resolvedPageSize,
      total: result.count,
      totalPages: Math.max(1, Math.ceil(result.count / resolvedPageSize))
    }
  };
}

async function getBinding({ bindingId, wineryId }) {
  const binding = await AutomationResourceBinding.findOne({
    where: { id: bindingId, wineryId },
    include: [
      { model: AutomationRule, as: 'Rule', attributes: ['id', 'name', 'status'] },
      { model: User, as: 'HumanOverrideActor', attributes: ['id', 'displayName'], required: false }
    ]
  });
  if (!binding) throw new NotFoundError('Automation resource binding not found.');
  return plain(binding);
}

module.exports = {
  captureManagedSnapshot,
  createBindingForGeneratedAction,
  detectHumanOverride,
  getBinding,
  listBindings,
  reconcileBindingsForCanonicalEvent,
  reconcileOneBinding
};
