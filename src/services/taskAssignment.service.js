const { Notification, TaskStep, User } = require('../models');
const auditService = require('./audit.service');
const {
  STAFF_ASSIGNMENT_REVIEW_REASON,
  STAFF_ASSIGNMENT_TARGET_ROLE,
  isStaffAssignmentReviewStep
} = require('./taskWorkflowPolicy.service');
const {
  STEP_TERMINAL_STATUSES,
  getOrderedTaskSteps
} = require('./taskWorkflow.service');

async function getStaffAssignmentReviewSteps(taskId, transaction) {
  const steps = await TaskStep.findAll({
    where: { taskId },
    order: [['sortOrder', 'ASC'], ['id', 'ASC']],
    transaction
  });

  return steps.filter(isStaffAssignmentReviewStep);
}

async function resolveTaskAssignee({ assigneeId, wineryId, transaction }) {
  if (assigneeId === null || assigneeId === undefined || assigneeId === '') {
    return null;
  }

  const assignee = await User.findOne({
    where: {
      id: Number(assigneeId),
      wineryId
    },
    transaction
  });

  if (!assignee) {
    const err = new Error('Assigned user not found for this winery.');
    err.statusCode = 404;
    err.code = 'ASSIGNEE_NOT_FOUND';
    throw err;
  }

  return assignee;
}

async function validateTaskAssignmentTarget({ taskId, wineryId, assigneeId, transaction }) {
  const assignee = await resolveTaskAssignee({ assigneeId, wineryId, transaction });
  const staffReviewSteps = await getStaffAssignmentReviewSteps(taskId, transaction);

  if (
    assignee
    && staffReviewSteps.length > 0
    && assignee.role !== STAFF_ASSIGNMENT_TARGET_ROLE
  ) {
    const err = new Error('Manager assignment review tasks must be assigned to an internal staff user.');
    err.statusCode = 400;
    err.code = 'INVALID_ASSIGNMENT_TARGET';
    throw err;
  }

  return {
    assignee,
    staffReviewSteps
  };
}

async function completeStaffAssignmentReview({ taskId, assignee, reviewSteps, userId, transaction }) {
  if (!assignee || assignee.role !== STAFF_ASSIGNMENT_TARGET_ROLE || reviewSteps.length === 0) {
    return;
  }

  const assigneeLabel = assignee.displayName || `User ${assignee.id}`;
  const now = new Date();
  const activeReviewStep = reviewSteps.find(step => !STEP_TERMINAL_STATUSES.has(step.status));

  if (activeReviewStep) {
    const oldValues = {
      status: activeReviewStep.status,
      waitingOn: activeReviewStep.waitingOn,
      completionNotes: activeReviewStep.completionNotes,
      completedAt: activeReviewStep.completedAt
    };
    activeReviewStep.status = 'COMPLETED';
    activeReviewStep.waitingOn = 'NONE';
    activeReviewStep.completionNotes = `Assigned to ${assigneeLabel}.`;
    activeReviewStep.completedAt = now;
    activeReviewStep.updatedBy = userId;
    await activeReviewStep.save({ transaction });

    await auditService.logTaskAction({
      transaction,
      taskId,
      userId,
      actionType: 'STEP_COMPLETED',
      details: {
        stepId: activeReviewStep.id,
        title: activeReviewStep.title,
        changes: {
          status: 'COMPLETED',
          waitingOn: 'NONE',
          completionNotes: activeReviewStep.completionNotes,
          completedAt: now
        },
        oldValues
      }
    });
  }

  const steps = await getOrderedTaskSteps(taskId, transaction);
  const unownedActiveSteps = steps.filter(step => (
    !isStaffAssignmentReviewStep(step)
    && !STEP_TERMINAL_STATUSES.has(step.status)
    && !step.ownerUserId
  ));

  for (const step of unownedActiveSteps) {
    const oldValues = { ownerUserId: step.ownerUserId };
    step.ownerUserId = assignee.id;
    step.updatedBy = userId;
    await step.save({ transaction });

    await auditService.logTaskAction({
      transaction,
      taskId,
      userId,
      actionType: 'STEP_UPDATED',
      details: {
        stepId: step.id,
        title: step.title,
        changes: { ownerUserId: assignee.id },
        oldValues
      }
    });
  }
}

async function findManagerUserId(wineryId, transaction) {
  const manager = await User.findOne({
    where: { wineryId, role: 'manager' },
    transaction
  });
  return manager?.id || null;
}

async function removeStaleAssignmentNotifications({ userId, taskId, transaction }) {
  if (!userId) return;

  const notifications = await Notification.findAll({
    where: {
      userId,
      type: 'ASSIGNMENT',
      isRead: false
    },
    transaction
  });

  const staleNotifications = notifications.filter(notification => (
    Number(notification.data?.taskId) === Number(taskId)
  ));

  await Promise.all(staleNotifications.map(notification => notification.destroy({ transaction })));
}

async function removeTaskNotifications({ taskId, transaction }) {
  const notifications = await Notification.findAll({ transaction });
  const taskNotifications = notifications.filter(notification => (
    Number(notification.data?.taskId) === Number(taskId)
  ));

  await Promise.all(taskNotifications.map(notification => notification.destroy({ transaction })));
}

async function notifyTaskAssignee({ assigneeId, task, assignedByUserId, transaction }) {
  if (!assigneeId) return;

  await Notification.create({
    userId: assigneeId,
    type: 'ASSIGNMENT',
    message: `Task #${task.id} has been assigned to you.`,
    data: {
      taskId: task.id,
      assignedByUserId: assignedByUserId || null
    }
  }, { transaction });
}

async function notifyManagerAssignmentReview({ managerUserId, task, step, createdByUserId, transaction }) {
  if (!managerUserId) return;

  await Notification.create({
    userId: managerUserId,
    type: 'SYSTEM',
    message: `Task #${task.id} needs manager assignment to staff.`,
    data: {
      taskId: task.id,
      stepId: step?.id || null,
      reason: STAFF_ASSIGNMENT_REVIEW_REASON,
      assignmentTargetRole: STAFF_ASSIGNMENT_TARGET_ROLE,
      createdByUserId: createdByUserId || null
    }
  }, { transaction });
}

module.exports = {
  completeStaffAssignmentReview,
  findManagerUserId,
  notifyManagerAssignmentReview,
  notifyTaskAssignee,
  removeStaleAssignmentNotifications,
  removeTaskNotifications,
  validateTaskAssignmentTarget
};
