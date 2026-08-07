const { TaskStep } = require('../models');
const auditService = require('./audit.service');
const { normalizeTaskStepInput } = require('./taskWorkflowPolicy.service');

const ACTIVE_WORKFLOW_WAITING_ON = new Set(['CUSTOMER', 'MANAGER', 'EXTERNAL']);
const STEP_TERMINAL_STATUSES = new Set(['COMPLETED', 'SKIPPED', 'CANCELLED']);

async function getOrderedTaskSteps(taskId, transaction) {
  return TaskStep.findAll({
    where: { taskId },
    order: [['sortOrder', 'ASC'], ['id', 'ASC']],
    transaction
  });
}

async function createTaskSteps({ taskId, steps = [], fallbackOwnerUserId, userId, transaction }) {
  const createdSteps = [];

  for (let index = 0; index < steps.length; index += 1) {
    const stepData = normalizeTaskStepInput(steps[index], index, fallbackOwnerUserId);
    const createdStep = await TaskStep.create({
      taskId,
      ...stepData,
      createdBy: userId || null,
      updatedBy: userId || null,
      completedAt: stepData.status === 'COMPLETED' ? new Date() : null
    }, { transaction });

    createdSteps.push(createdStep);

    await auditService.logTaskAction({
      transaction,
      taskId,
      userId,
      actionType: 'STEP_CREATED',
      details: {
        stepId: createdStep.id,
        title: createdStep.title,
        status: createdStep.status,
        waitingOn: createdStep.waitingOn,
        ownerUserId: createdStep.ownerUserId,
        sortOrder: createdStep.sortOrder
      }
    });
  }

  return createdSteps;
}

function buildWorkflowSummary(task, steps) {
  if (task.status === 'REJECTED') {
    return {
      workflowState: 'CANCELLED',
      waitingOn: 'NONE',
      nextStepSummary: null,
      blockedReason: null,
      dueAt: null,
      resolvedAt: task.resolvedAt || new Date()
    };
  }

  if (!steps || steps.length === 0) {
    if (task.status === 'ACTIONED') {
      return {
        workflowState: 'COMPLETED',
        waitingOn: 'NONE',
        nextStepSummary: null,
        blockedReason: null,
        dueAt: null,
        resolvedAt: task.resolvedAt || new Date()
      };
    }

    return {
      workflowState: task.workflowState || 'NOT_STARTED',
      waitingOn: task.waitingOn || 'NONE',
      nextStepSummary: task.nextStepSummary || null,
      blockedReason: null,
      dueAt: task.dueAt || null,
      resolvedAt: null
    };
  }

  const activeSteps = steps.filter(step => !STEP_TERMINAL_STATUSES.has(step.status));

  if (activeSteps.length === 0) {
    return {
      workflowState: 'COMPLETED',
      waitingOn: 'NONE',
      nextStepSummary: null,
      blockedReason: null,
      dueAt: null,
      resolvedAt: task.resolvedAt || new Date()
    };
  }

  const blockedStep = activeSteps.find(step => step.status === 'BLOCKED');
  const inProgressStep = activeSteps.find(step => step.status === 'IN_PROGRESS');
  const nextPendingStep = activeSteps.find(step => step.status === 'PENDING');
  const focusStep = blockedStep || inProgressStep || nextPendingStep || activeSteps[0];

  let workflowState = 'NOT_STARTED';
  if (focusStep.status === 'BLOCKED') {
    workflowState = 'BLOCKED';
  } else if (focusStep.status === 'IN_PROGRESS') {
    workflowState = ACTIVE_WORKFLOW_WAITING_ON.has(focusStep.waitingOn) ? 'WAITING' : 'IN_PROGRESS';
  } else if (ACTIVE_WORKFLOW_WAITING_ON.has(focusStep.waitingOn)) {
    workflowState = 'WAITING';
  }

  const nearestDueStep = activeSteps
    .filter(step => step.dueAt)
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())[0];

  return {
    workflowState,
    waitingOn: workflowState === 'BLOCKED' ? (focusStep.waitingOn || 'STAFF') : (focusStep.waitingOn || 'NONE'),
    nextStepSummary: focusStep.title,
    blockedReason: workflowState === 'BLOCKED' ? (focusStep.blockedReason || task.blockedReason || null) : null,
    dueAt: focusStep.dueAt || nearestDueStep?.dueAt || null,
    resolvedAt: null
  };
}

async function syncTaskWorkflow(task, transaction) {
  const steps = await getOrderedTaskSteps(task.id, transaction);
  const summary = buildWorkflowSummary(task, steps);

  task.workflowState = summary.workflowState;
  task.waitingOn = summary.waitingOn;
  task.nextStepSummary = summary.nextStepSummary;
  task.blockedReason = summary.blockedReason;
  task.dueAt = summary.dueAt;
  task.resolvedAt = summary.resolvedAt;

  await task.save({ transaction });
  return { task, steps, summary };
}

module.exports = {
  STEP_TERMINAL_STATUSES,
  buildWorkflowSummary,
  createTaskSteps,
  getOrderedTaskSteps,
  syncTaskWorkflow
};
