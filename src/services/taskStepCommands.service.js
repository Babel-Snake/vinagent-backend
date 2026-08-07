const { Op } = require('sequelize');
const { Task, TaskStep } = require('../models');
const auditService = require('./audit.service');
const recordVisibility = require('./recordVisibility.service');
const { getTaskAreaInclude } = require('./taskArea.service');
const { queueSuggestionRefresh } = require('./taskSuggestionRefresh.service');
const {
  assertCanMutateTaskStep,
  normalizeTaskStepInput
} = require('./taskWorkflowPolicy.service');
const {
  getOrderedTaskSteps,
  syncTaskWorkflow
} = require('./taskWorkflow.service');

async function createTaskStep({ taskId, wineryId, userId, userRole, data }) {
  const transaction = await Task.sequelize.transaction();

  try {
    const task = await Task.findOne({ where: { id: taskId, wineryId }, transaction });
    if (!task) throw new Error('Task not found');
    const managerOverride = await recordVisibility.canManageTask(task, {
      wineryId,
      userId,
      userRole,
      transaction
    });
    assertCanMutateTaskStep({
      task,
      userId,
      userRole,
      managerOverride,
      action: 'add workflow steps to this task'
    });
    await recordVisibility.assertCanMutateTask(task, { wineryId, userId, userRole, transaction });

    const existingSteps = await getOrderedTaskSteps(taskId, transaction);
    const requestedSortOrder = Number.isInteger(data?.sortOrder) ? data.sortOrder : existingSteps.length;
    const insertSortOrder = Math.max(0, Math.min(requestedSortOrder, existingSteps.length));

    if (insertSortOrder < existingSteps.length) {
      await TaskStep.increment(
        { sortOrder: 1 },
        {
          where: {
            taskId,
            sortOrder: { [Op.gte]: insertSortOrder }
          },
          transaction
        }
      );
    }

    const normalized = normalizeTaskStepInput(
      { ...data, sortOrder: insertSortOrder },
      insertSortOrder,
      task.assigneeId || null
    );

    const step = await TaskStep.create({
      taskId,
      ...normalized,
      createdBy: userId,
      updatedBy: userId,
      completedAt: normalized.status === 'COMPLETED' ? new Date() : null
    }, { transaction });

    await auditService.logTaskAction({
      transaction,
      taskId,
      userId,
      actionType: normalized.status === 'COMPLETED' ? 'STEP_COMPLETED' : 'STEP_CREATED',
      details: {
        stepId: step.id,
        title: step.title,
        status: step.status,
        waitingOn: step.waitingOn,
        ownerUserId: step.ownerUserId,
        sortOrder: step.sortOrder
      }
    });

    task.updatedBy = userId;
    await syncTaskWorkflow(task, transaction);
    await transaction.commit();

    queueSuggestionRefresh(taskId, wineryId);
    return step;
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    throw err;
  }
}

async function updateTaskStep({ taskId, stepId, wineryId, userId, userRole, updates }) {
  const transaction = await Task.sequelize.transaction();

  try {
    const task = await Task.findOne({
      where: { id: taskId, wineryId },
      include: [getTaskAreaInclude()],
      transaction
    });
    if (!task) throw new Error('Task not found');

    const step = await TaskStep.findOne({ where: { id: stepId, taskId }, transaction });
    if (!step) throw new Error('Task step not found');
    const managerOverride = await recordVisibility.canManageTask(task, {
      wineryId,
      userId,
      userRole,
      transaction
    });
    assertCanMutateTaskStep({
      task,
      step,
      userId,
      userRole,
      managerOverride,
      action: 'update this workflow step'
    });
    await recordVisibility.assertCanMutateTask(task, { wineryId, userId, userRole, transaction });

    if (updates.ownerUserId !== undefined && updates.ownerUserId !== step.ownerUserId && !managerOverride) {
      const err = new Error('Staff cannot reassign task steps.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    const changes = {};
    const oldValues = {};
    const setStepField = (field, value) => {
      if (value !== undefined && value !== step[field]) {
        changes[field] = value;
        oldValues[field] = step[field];
        step[field] = value;
      }
    };

    setStepField('title', updates.title);
    setStepField('description', updates.description);
    setStepField('stepType', updates.stepType);
    setStepField('status', updates.status);
    setStepField('waitingOn', updates.waitingOn);
    setStepField('ownerUserId', updates.ownerUserId);
    setStepField('sortOrder', updates.sortOrder);
    setStepField('blockedReason', updates.blockedReason);
    setStepField('completionNotes', updates.completionNotes);
    setStepField('suggestedReplyBody', updates.suggestedReplyBody);
    setStepField('suggestedReplySubject', updates.suggestedReplySubject);
    setStepField('suggestedChannel', updates.suggestedChannel);
    setStepField('suggestedAction', updates.suggestedAction);
    setStepField('suggestedRecipientEmail', updates.suggestedRecipientEmail);
    setStepField('suggestedCc', updates.suggestedCc);
    setStepField('suggestionStatus', updates.suggestionStatus);
    setStepField('suggestionError', updates.suggestionError);
    if (updates.dueAt !== undefined) {
      setStepField('dueAt', updates.dueAt ? new Date(updates.dueAt) : null);
    }
    if (updates.suggestionGeneratedAt !== undefined) {
      setStepField(
        'suggestionGeneratedAt',
        updates.suggestionGeneratedAt ? new Date(updates.suggestionGeneratedAt) : null
      );
    }
    if (updates.metadata !== undefined) {
      changes.metadata = updates.metadata;
      oldValues.metadata = step.metadata;
      step.metadata = updates.metadata;
    }

    const previousStatus = oldValues.status !== undefined ? oldValues.status : step.status;

    if (updates.status === 'COMPLETED' && previousStatus !== 'COMPLETED') {
      step.completedAt = new Date();
      changes.completedAt = step.completedAt;
    } else if (updates.status === 'COMPLETED') {
      step.completedAt = step.completedAt || new Date();
    } else if (updates.status && updates.status !== 'COMPLETED') {
      step.completedAt = null;
      changes.completedAt = null;
    }

    step.updatedBy = userId;
    await step.save({ transaction });

    if (Object.keys(changes).length > 0) {
      await auditService.logTaskAction({
        transaction,
        taskId,
        userId,
        actionType: changes.status === 'COMPLETED' ? 'STEP_COMPLETED' : 'STEP_UPDATED',
        details: {
          stepId: step.id,
          title: step.title,
          changes,
          oldValues
        }
      });
    }

    task.updatedBy = userId;
    await syncTaskWorkflow(task, transaction);
    await transaction.commit();

    queueSuggestionRefresh(taskId, wineryId);
    return step;
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    throw err;
  }
}

async function reorderTaskSteps({ taskId, wineryId, userId, userRole, stepIds = [] }) {
  const transaction = await Task.sequelize.transaction();

  try {
    const task = await Task.findOne({ where: { id: taskId, wineryId }, transaction });
    if (!task) throw new Error('Task not found');
    await recordVisibility.assertCanMutateTask(task, { wineryId, userId, userRole, transaction });
    if (!(await recordVisibility.canManageTask(task, { wineryId, userId, userRole, transaction }))) {
      const err = new Error('Only managers can reorder workflow steps.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    const existingSteps = await getOrderedTaskSteps(taskId, transaction);
    const existingIds = existingSteps.map(step => Number(step.id));
    const requestedIds = stepIds.map(id => Number(id));
    const uniqueRequestedIds = [...new Set(requestedIds)];

    if (uniqueRequestedIds.length !== requestedIds.length || uniqueRequestedIds.length !== existingIds.length) {
      const err = new Error('Task step not found');
      err.statusCode = 400;
      err.code = 'INVALID_STEP_ORDER';
      throw err;
    }

    const existingIdSet = new Set(existingIds);
    if (!uniqueRequestedIds.every(id => existingIdSet.has(id))) {
      const err = new Error('Task step not found');
      err.statusCode = 400;
      err.code = 'INVALID_STEP_ORDER';
      throw err;
    }

    const previousOrder = existingIds;
    const changed = previousOrder.some((id, index) => id !== uniqueRequestedIds[index]);

    if (changed) {
      for (let index = 0; index < uniqueRequestedIds.length; index += 1) {
        await TaskStep.update(
          { sortOrder: index, updatedBy: userId },
          { where: { id: uniqueRequestedIds[index], taskId }, transaction }
        );
      }

      await auditService.logTaskAction({
        transaction,
        taskId,
        userId,
        actionType: 'STEP_UPDATED',
        details: {
          changes: { stepOrder: uniqueRequestedIds },
          oldValues: { stepOrder: previousOrder }
        }
      });
    }

    task.updatedBy = userId;
    await syncTaskWorkflow(task, transaction);
    const steps = await getOrderedTaskSteps(taskId, transaction);
    await transaction.commit();

    if (changed) queueSuggestionRefresh(taskId, wineryId);
    return steps;
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    throw err;
  }
}

async function deleteTaskStep({ taskId, stepId, wineryId, userId, userRole }) {
  const transaction = await Task.sequelize.transaction();

  try {
    const task = await Task.findOne({ where: { id: taskId, wineryId } });
    if (!task) throw new Error('Task not found');
    const managerOverride = await recordVisibility.canManageTask(task, {
      wineryId,
      userId,
      userRole,
      transaction
    });
    await recordVisibility.assertCanMutateTask(task, { wineryId, userId, userRole });

    const step = await TaskStep.findOne({ where: { id: stepId, taskId }, transaction });
    if (!step) throw new Error('Task step not found');
    assertCanMutateTaskStep({
      task,
      step,
      userId,
      userRole,
      managerOverride,
      action: 'remove this workflow step'
    });

    await auditService.logTaskAction({
      transaction,
      taskId,
      userId,
      actionType: 'STEP_DELETED',
      details: {
        stepId: step.id,
        title: step.title,
        status: step.status
      }
    });

    await step.destroy({ transaction });

    task.updatedBy = userId;
    await syncTaskWorkflow(task, transaction);
    await transaction.commit();

    queueSuggestionRefresh(taskId, wineryId);
    return { deleted: true };
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    throw err;
  }
}

module.exports = {
  createTaskStep,
  deleteTaskStep,
  reorderTaskSteps,
  updateTaskStep
};
