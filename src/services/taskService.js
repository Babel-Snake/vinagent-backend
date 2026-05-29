const { CalendarEvent, CalendarEventTask, Task, TaskStep, WinerySettings, Member, Message, User, TaskAction, Notification } = require('../models');
const { Op } = require('sequelize');
const executionService = require('./execution.service');
const logger = require('../config/logger');
const { validateStatusTransition } = require('../utils/validation');
const {
  getDefaultTaskOutcome,
  clearTaskOutcomeFields,
  pickTaskOutcomeSnapshot
} = require('../utils/taskOutcome');
const auditService = require('./audit.service');
const aiSuggestionService = require('./aiSuggestion.service');
const customerIdentityService = require('./customerIdentity.service');
const taskDeadlineService = require('./taskDeadline.service');
const noticeService = require('./notice.service');

/**
 * Service to handle Task creation and updates.
 * Centralizes business logic, logging, and side effects.
 */

const ACTIVE_WORKFLOW_WAITING_ON = new Set(['CUSTOMER', 'MANAGER', 'EXTERNAL']);
const STEP_TERMINAL_STATUSES = new Set(['COMPLETED', 'SKIPPED', 'CANCELLED']);
const CLOSED_TASK_STATUSES = new Set(['ACTIONED', 'REJECTED']);
const AUTO_FOLLOW_UP_TYPES = {
  EXPLICIT: 'EXPLICIT_FOLLOW_UP',
  CUSTOMER_CALLBACK: 'CUSTOMER_NO_RESPONSE_CALLBACK',
  ESCALATION_REVIEW: 'ESCALATION_REVIEW'
};
const STAFF_ASSIGNMENT_REVIEW_REASON = 'STAFF_CREATED_UNASSIGNED';
const STAFF_ASSIGNMENT_TARGET_ROLE = 'staff';
const STEP_SUGGESTION_CHANNELS = new Set(['sms', 'email', 'voice', 'none']);
const CUSTOMER_STEP_TYPES = new Set(['CUSTOMER_MESSAGE', 'FOLLOW_UP', 'CUSTOMER_WAIT']);
const EMAIL_STEP_TYPES = new Set(['CUSTOMER_MESSAGE', 'FOLLOW_UP', 'EXTERNAL', 'APPROVAL']);

function isPrivilegedTaskRole(userRole) {
  return ['manager', 'admin'].includes(userRole);
}

function createStepPermissionError(message, code = 'STEP_ACTION_FORBIDDEN') {
  const err = new Error(message);
  err.statusCode = 403;
  err.code = code;
  return err;
}

function assertCanMutateTaskStep({ task, step = null, userId, userRole, action = 'update this workflow step' }) {
  if (isPrivilegedTaskRole(userRole)) return;

  if (!userId) {
    throw createStepPermissionError(`You do not have permission to ${action}.`);
  }

  if (step?.ownerUserId && Number(step.ownerUserId) !== Number(userId)) {
    throw createStepPermissionError('This workflow step is assigned to another staff member.');
  }

  if (!step?.ownerUserId && task?.assigneeId && Number(task.assigneeId) !== Number(userId)) {
    throw createStepPermissionError('This task is assigned to another staff member.');
  }
}

function appendMemberNote(existingNotes, newLine) {
  if (!newLine) return existingNotes || null;
  if (existingNotes && existingNotes.includes(newLine)) {
    return existingNotes;
  }
  return existingNotes ? `${existingNotes}\n${newLine}` : newLine;
}

function parseStepMetadata(step) {
  const metadata = step?.metadata;
  if (!metadata) return {};
  if (typeof metadata === 'object' && !Array.isArray(metadata)) return metadata;

  if (typeof metadata === 'string') {
    try {
      const parsed = JSON.parse(metadata);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  return {};
}

function isStaffAssignmentReviewStep(step) {
  const metadata = parseStepMetadata(step);
  return metadata.reason === STAFF_ASSIGNMENT_REVIEW_REASON;
}

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

async function enrichMemberFromTaskOutcome(task, transaction) {
  const manualIntake = task.payload?.manualIntake;
  if (!task.memberId || manualIntake?.taskOrigin !== 'EXTERNAL') {
    return null;
  }

  const member = await Member.findOne({
    where: {
      id: task.memberId,
      wineryId: task.wineryId
    },
    transaction
  });

  if (!member) {
    return null;
  }

  const originalTags = Array.isArray(member.tags) ? member.tags : [];
  const tagSet = new Set(originalTags);
  const now = new Date();
  let noteLine = null;

  if (task.category === 'BOOKING') {
    tagSet.add('booking_contact');
    if (task.subType === 'BOOKING_NEW') {
      tagSet.add('booking_customer');
    }
    if (member.source === 'manual') {
      member.source = 'booking';
    }
    noteLine = `Task ${task.id} actioned from external booking intake.`;
  } else if (task.category === 'ORDER') {
    tagSet.add('order_contact');
    tagSet.add('order_customer');
    noteLine = `Task ${task.id} actioned from external order intake.`;
  } else if (task.category === 'ACCOUNT') {
    tagSet.add('identified_contact');
    noteLine = `Task ${task.id} actioned from external account intake.`;
  } else if (task.category === 'GENERAL') {
    tagSet.add('inbound_contact');
    noteLine = `Task ${task.id} actioned from external enquiry intake.`;
  }

  const nextTags = Array.from(tagSet);
  const tagsChanged = JSON.stringify(originalTags) !== JSON.stringify(nextTags);
  const nextNotes = appendMemberNote(member.notes, noteLine);
  const notesChanged = nextNotes !== member.notes;

  member.tags = nextTags;
  member.notes = nextNotes;
  member.lastContactAt = now;
  await member.save({ transaction });

  return {
    memberId: member.id,
    tagsAdded: nextTags.filter(tag => !originalTags.includes(tag)),
    noteAdded: notesChanged,
    tagsChanged
  };
}

async function getOrderedTaskSteps(taskId, transaction) {
  return TaskStep.findAll({
    where: { taskId },
    order: [['sortOrder', 'ASC'], ['id', 'ASC']],
    transaction
  });
}

function normalizeTaskStepInput(step, index = 0, fallbackOwnerUserId = null) {
  return {
    title: String(step.title || `Step ${index + 1}`).trim().slice(0, 200),
    description: step.description ? String(step.description).trim().slice(0, 4000) : null,
    stepType: step.stepType || 'INTERNAL',
    status: step.status || 'PENDING',
    waitingOn: step.waitingOn || 'NONE',
    ownerUserId: Number.isInteger(step.ownerUserId) ? step.ownerUserId : fallbackOwnerUserId,
    dueAt: step.dueAt ? new Date(step.dueAt) : null,
    sortOrder: Number.isInteger(step.sortOrder) ? step.sortOrder : index,
    blockedReason: step.blockedReason ? String(step.blockedReason).trim() : null,
    completionNotes: step.completionNotes ? String(step.completionNotes).trim() : null,
    suggestedReplyBody: step.suggestedReplyBody ? String(step.suggestedReplyBody).trim().slice(0, 4000) : null,
    suggestedReplySubject: step.suggestedReplySubject ? String(step.suggestedReplySubject).trim().slice(0, 200) : null,
    suggestedChannel: step.suggestedChannel && STEP_SUGGESTION_CHANNELS.has(step.suggestedChannel) ? step.suggestedChannel : null,
    suggestedAction: step.suggestedAction ? String(step.suggestedAction).trim().slice(0, 4000) : null,
    suggestedRecipientEmail: step.suggestedRecipientEmail ? String(step.suggestedRecipientEmail).trim().slice(0, 255) : null,
    suggestedCc: step.suggestedCc ? String(step.suggestedCc).trim().slice(0, 1000) : null,
    suggestionStatus: step.suggestionStatus ? String(step.suggestionStatus).trim().slice(0, 50) : null,
    suggestionGeneratedAt: step.suggestionGeneratedAt ? new Date(step.suggestionGeneratedAt) : null,
    suggestionError: step.suggestionError ? String(step.suggestionError).trim().slice(0, 2000) : null,
    metadata: step.metadata || null
  };
}

function sanitizeTextOrNull(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

function sanitizeDateOrNull(value) {
  if (value === undefined) return undefined;
  if (!value) return null;
  return new Date(value);
}

function previewText(value, maxLength = 180) {
  if (!value) return null;
  const compact = String(value).replace(/\s+/g, ' ').trim();
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 3)}...` : compact;
}

function getManualIntake(task) {
  return task?.payload?.manualIntake || {};
}

function getStepSuggestionChannel(step, task) {
  if (step?.suggestedChannel && STEP_SUGGESTION_CHANNELS.has(step.suggestedChannel)) {
    return step.suggestedChannel;
  }

  if (CUSTOMER_STEP_TYPES.has(step?.stepType) && task?.suggestedChannel && STEP_SUGGESTION_CHANNELS.has(task.suggestedChannel)) {
    return task.suggestedChannel;
  }

  if (EMAIL_STEP_TYPES.has(step?.stepType)) {
    return 'email';
  }

  return 'none';
}

function resolveStepSuggestionTarget({ step, task, channel, overrides = {} }) {
  const manualIntake = getManualIntake(task);

  if (channel === 'email') {
    return {
      to: overrides.suggestedRecipientEmail
        || step?.suggestedRecipientEmail
        || task?.suggestedRecipientEmail
        || task?.Member?.email
        || manualIntake.requesterEmail
        || step?.Owner?.email
        || task?.Assignee?.email
        || null,
      subject: overrides.suggestedReplySubject
        || step?.suggestedReplySubject
        || task?.suggestedReplySubject
        || `Update: ${step?.title || task?.subType || task?.category || 'Task'}`,
      cc: overrides.suggestedCc ?? step?.suggestedCc ?? task?.suggestedCc ?? null
    };
  }

  if (channel === 'sms') {
    return {
      to: task?.Member?.phone || manualIntake.requesterPhone || null,
      subject: null,
      cc: null
    };
  }

  return { to: null, subject: null, cc: null };
}

function buildStepSuggestedAction(step, channel) {
  const stepTitle = step?.title || 'this workflow step';
  const action = channel === 'none'
    ? 'Complete the internal workflow step'
    : `Review and send the suggested ${channel} response, then complete the workflow step`;
  return `${action}: ${stepTitle}.`;
}

function buildStepSuggestionPrompt({ task, step, channel }) {
  const manualIntake = getManualIntake(task);
  const originalText = task.payload?.originalText
    || task.payload?.note
    || task.payload?.summary
    || task.notes
    || manualIntake.originalText
    || `${task.category || 'Task'} - ${task.subType || 'General'}`;

  const messageLines = (task.Messages || [])
    .map((message, index) => {
      const timestamp = message.receivedAt || message.createdAt;
      const subject = message.subject ? ` subject="${message.subject}"` : '';
      const body = (message.body || '').replace(/\s+/g, ' ').trim();
      const preview = body.length > 280 ? `${body.slice(0, 277)}...` : body;
      return `${index + 1}. [${message.direction}] ${message.source}${subject} at ${new Date(timestamp).toISOString()} :: ${preview || '[no body]'}`;
    });

  const stepLines = (task.TaskSteps || [])
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.id - b.id;
    })
    .map((workflowStep, index) => {
      const marker = workflowStep.id === step.id ? 'TARGET STEP' : `Step ${index + 1}`;
      return `${marker}: [${workflowStep.status}] ${workflowStep.title} (${workflowStep.stepType}) waitingOn=${workflowStep.waitingOn}`;
    });

  const outputInstruction = channel === 'none'
    ? 'Generate concise internal guidance for completing the target workflow step. Do not write as a customer message.'
    : `Generate only the ready-to-send ${channel} message for the target workflow step.`;

  return [
    `Task Category: ${task.category || 'GENERAL'}`,
    `Task Type: ${task.subType || 'GENERAL'}`,
    `Task Status: ${task.status}`,
    `Workflow State: ${task.workflowState || 'NOT_STARTED'}`,
    `Current Target Step: ${step.title}`,
    step.description ? `Target Step Detail: ${step.description}` : null,
    `Target Step Type: ${step.stepType}`,
    `Waiting On: ${step.waitingOn}`,
    `Original Request: "${originalText}"`,
    messageLines.length > 0 ? `Task Communication Timeline:\n${messageLines.join('\n')}` : null,
    stepLines.length > 0 ? `Workflow Steps:\n${stepLines.join('\n')}` : null,
    outputInstruction
  ].filter(Boolean).join('\n');
}

function buildFallbackStepSuggestionBody({ task, step, channel }) {
  const memberName = task?.Member?.firstName || getManualIntake(task).requesterName || null;
  const greeting = memberName ? `Hi ${memberName},` : 'Hi,';

  if (channel === 'none') {
    return [
      `Review the task context and complete "${step.title}".`,
      step.description ? `Step detail: ${step.description}` : null,
      task?.nextStepSummary ? `Current next step: ${task.nextStepSummary}` : null
    ].filter(Boolean).join('\n');
  }

  if (channel === 'sms') {
    return `${greeting} thanks for your message. The team is reviewing this and will follow up shortly.`;
  }

  return [
    greeting,
    '',
    'Thanks for your message. The team is reviewing this now and will follow up shortly with the next step.',
    '',
    'Kind regards,',
    'The winery team'
  ].join('\n');
}

function diffOutcomeSnapshots(before, after) {
  const changes = {};
  const oldValues = {};

  for (const key of Object.keys(after)) {
    const beforeValue = before[key];
    const afterValue = after[key];
    const beforeSerialized = beforeValue instanceof Date ? beforeValue.toISOString() : JSON.stringify(beforeValue);
    const afterSerialized = afterValue instanceof Date ? afterValue.toISOString() : JSON.stringify(afterValue);

    if (beforeSerialized !== afterSerialized) {
      changes[key] = afterValue;
      oldValues[key] = beforeValue;
    }
  }

  return { changes, oldValues };
}

function applyTaskOutcomeUpdates(task, updates, finalStatus) {
  const before = pickTaskOutcomeSnapshot(task);

  if (!CLOSED_TASK_STATUSES.has(finalStatus)) {
    clearTaskOutcomeFields(task);
  } else {
    const defaults = getDefaultTaskOutcome(task, finalStatus);
    const requestedFollowUpRequired = updates.followUpRequired !== undefined
      ? Boolean(updates.followUpRequired)
      : Boolean(task.followUpRequired);

    task.resolvedAs = updates.resolvedAs !== undefined
      ? (updates.resolvedAs || defaults.resolvedAs)
      : (task.resolvedAs || defaults.resolvedAs);
    task.resolutionType = updates.resolutionType !== undefined
      ? (updates.resolutionType || defaults.resolutionType)
      : (task.resolutionType || defaults.resolutionType);
    task.customerOutcome = updates.customerOutcome !== undefined
      ? (updates.customerOutcome || defaults.customerOutcome)
      : (task.customerOutcome || defaults.customerOutcome);
    task.resolutionSummary = updates.resolutionSummary !== undefined
      ? sanitizeTextOrNull(updates.resolutionSummary)
      : sanitizeTextOrNull(task.resolutionSummary);
    task.followUpRequired = requestedFollowUpRequired;
    task.followUpDueAt = requestedFollowUpRequired
      ? (updates.followUpDueAt !== undefined ? sanitizeDateOrNull(updates.followUpDueAt) : (task.followUpDueAt || null))
      : null;
    task.followUpSummary = requestedFollowUpRequired
      ? (updates.followUpSummary !== undefined ? sanitizeTextOrNull(updates.followUpSummary) : sanitizeTextOrNull(task.followUpSummary))
      : null;
    task.resolvedAt = task.resolvedAt || new Date();
  }

  const after = pickTaskOutcomeSnapshot(task);
  return diffOutcomeSnapshots(before, after);
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

function queueSuggestionRefresh(taskId, wineryId) {
  if (process.env.NODE_ENV === 'test') {
    return;
  }
  setImmediate(() => {
    aiSuggestionService.generateAiSuggestion(taskId, wineryId, {
      force: true,
      includeHistory: true
    });
  });
}

function isAutoGeneratedFollowUpTask(task) {
  return Boolean(task?.payload?.followUpAutomation?.isAutoGenerated);
}

function addHours(date, hours) {
  return new Date(date.getTime() + (hours * 60 * 60 * 1000));
}

function addDays(date, days) {
  return addHours(date, days * 24);
}

function formatTaskLabel(task) {
  return String(task?.subType || task?.category || 'TASK')
    .replace(/_/g, ' ')
    .toLowerCase();
}

function buildManagedFollowUpPayload(parentTask, plan, userId) {
  return {
    summary: plan.summary,
    followUpAutomation: {
      isAutoGenerated: true,
      sourceTaskId: parentTask.id,
      automationType: plan.automationType,
      generatedAt: new Date().toISOString(),
      generatedByUserId: userId || null
    },
    parentOutcome: {
      resolvedAs: parentTask.resolvedAs || null,
      resolutionType: parentTask.resolutionType || null,
      customerOutcome: parentTask.customerOutcome || null,
      resolutionSummary: parentTask.resolutionSummary || null,
      followUpRequired: Boolean(parentTask.followUpRequired),
      followUpDueAt: parentTask.followUpDueAt || null,
      followUpSummary: parentTask.followUpSummary || null,
      resolvedAt: parentTask.resolvedAt || null
    }
  };
}

function buildFollowUpSteps(parentTask, plan, ownerUserId) {
  const reviewDescription = `Review task #${parentTask.id} and confirm the next follow-up action.`;
  const steps = [
    {
      title: 'Review the original case',
      description: reviewDescription,
      stepType: 'INTERNAL',
      waitingOn: 'STAFF',
      ownerUserId,
      dueAt: plan.dueAt,
      sortOrder: 0,
      metadata: {
        automationType: plan.automationType,
        sourceTaskId: parentTask.id
      }
    }
  ];

  if (plan.automationType === AUTO_FOLLOW_UP_TYPES.CUSTOMER_CALLBACK) {
      steps.push({
        title: 'Attempt customer callback',
        description: 'Reach back out to the customer and record whether they responded or the case can now be closed.',
        stepType: 'CUSTOMER_MESSAGE',
        waitingOn: 'STAFF',
        ownerUserId,
        dueAt: plan.dueAt,
        sortOrder: 1,
        metadata: {
          automationType: plan.automationType,
          sourceTaskId: parentTask.id
      }
    });
  } else if (plan.automationType === AUTO_FOLLOW_UP_TYPES.ESCALATION_REVIEW) {
      steps.push({
        title: 'Confirm escalation owner',
        description: 'Ensure the escalation has a clear owner and next action before the case goes cold.',
        stepType: 'APPROVAL',
        waitingOn: 'MANAGER',
        ownerUserId,
        dueAt: plan.dueAt,
        sortOrder: 1,
        metadata: {
          automationType: plan.automationType,
          sourceTaskId: parentTask.id
      }
    });
  } else {
      steps.push({
        title: 'Complete the follow-up',
        description: plan.summary,
        stepType: 'FOLLOW_UP',
        waitingOn: 'STAFF',
        ownerUserId,
        dueAt: plan.dueAt,
        sortOrder: 1,
        metadata: {
          automationType: plan.automationType,
          sourceTaskId: parentTask.id
      }
    });
  }

  return steps;
}

function buildFollowUpPlan(task) {
  if (!task || task.status === 'PENDING' || isAutoGeneratedFollowUpTask(task)) {
    return null;
  }

  const anchorDate = task.resolvedAt ? new Date(task.resolvedAt) : new Date();
  const taskLabel = formatTaskLabel(task);
  const manualIntake = task.payload?.manualIntake;
  const isExternalTask = manualIntake?.taskOrigin === 'EXTERNAL';

  if (task.followUpRequired) {
    return {
      automationType: AUTO_FOLLOW_UP_TYPES.EXPLICIT,
      title: `Follow up on ${taskLabel}`,
      category: task.category || 'GENERAL',
      subType: `${task.subType || task.category || 'TASK'}_FOLLOW_UP`,
      priority: task.priority === 'high' ? 'high' : 'normal',
      dueAt: task.followUpDueAt ? new Date(task.followUpDueAt) : addDays(anchorDate, 1),
      summary: task.followUpSummary || `Follow up on task #${task.id} after closure and confirm the next outcome.`,
      reminderMessage: `Automated follow-up task created from task #${task.id}.`
    };
  }

  if (isExternalTask && task.resolutionType === 'CUSTOMER_NO_RESPONSE') {
    return {
      automationType: AUTO_FOLLOW_UP_TYPES.CUSTOMER_CALLBACK,
      title: `Retry contact for ${taskLabel}`,
      category: task.category || 'GENERAL',
      subType: `${task.subType || task.category || 'TASK'}_CALLBACK`,
      priority: 'normal',
      dueAt: addDays(anchorDate, 2),
      summary: `Customer did not respond on task #${task.id}. Retry contact and confirm whether the case can now be closed.`,
      reminderMessage: `Customer callback follow-up created from task #${task.id}.`
    };
  }

  if (task.resolvedAs === 'ESCALATED' || ['INTERNAL_ESCALATION', 'EXTERNAL_ESCALATION'].includes(task.resolutionType)) {
    return {
      automationType: AUTO_FOLLOW_UP_TYPES.ESCALATION_REVIEW,
      title: `Review escalated ${taskLabel}`,
      category: task.category || 'GENERAL',
      subType: `${task.subType || task.category || 'TASK'}_ESCALATION_REVIEW`,
      priority: 'high',
      dueAt: addHours(anchorDate, 24),
      summary: `Review the escalated case from task #${task.id} and confirm the next owner or external dependency.`,
      reminderMessage: `Escalation review follow-up created from task #${task.id}.`
    };
  }

  return null;
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

async function resolveFollowUpAssignee(task, plan, transaction) {
  if (plan.automationType === AUTO_FOLLOW_UP_TYPES.ESCALATION_REVIEW) {
    return await findManagerUserId(task.wineryId, transaction) || task.assigneeId || task.createdBy || null;
  }

  return task.assigneeId || task.createdBy || await findManagerUserId(task.wineryId, transaction) || null;
}

async function getManagedFollowUpTasks(parentTaskId, transaction) {
  const childTasks = await Task.findAll({
    where: { parentTaskId },
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    transaction
  });

  return childTasks.filter(child => isAutoGeneratedFollowUpTask(child));
}

async function notifyFollowUpAssignee({ assigneeId, followUpTask, parentTask, plan, transaction }) {
  if (!assigneeId) return;

  await Notification.create({
    userId: assigneeId,
    type: 'SYSTEM',
    message: plan.reminderMessage,
    data: {
      taskId: followUpTask.id,
      parentTaskId: parentTask.id,
      automationType: plan.automationType
    }
  }, { transaction });
}

async function createManagedFollowUpTask({ parentTask, plan, userId, transaction }) {
  const assigneeId = await resolveFollowUpAssignee(parentTask, plan, transaction);
  const payload = buildManagedFollowUpPayload(parentTask, plan, userId);

  const followUpTask = await Task.create({
    wineryId: parentTask.wineryId,
    category: plan.category,
    subType: plan.subType,
    customerType: parentTask.customerType,
    type: plan.subType,
    status: 'PENDING',
    priority: plan.priority,
    sentiment: parentTask.sentiment || 'NEUTRAL',
    workflowState: 'NOT_STARTED',
    waitingOn: 'NONE',
    payload,
    memberId: parentTask.memberId || null,
    suggestedChannel: 'none',
    dueAt: plan.dueAt,
    createdBy: userId || null,
    updatedBy: userId || null,
    assigneeId,
    parentTaskId: parentTask.id
  }, { transaction });

  await auditService.logTaskAction({
    transaction,
    taskId: followUpTask.id,
    userId,
    actionType: 'CREATED',
    details: {
      source: 'follow_up_automation',
      automationType: plan.automationType,
      parentTaskId: parentTask.id
    }
  });

  await createTaskSteps({
    taskId: followUpTask.id,
    steps: buildFollowUpSteps(parentTask, plan, assigneeId),
    fallbackOwnerUserId: assigneeId,
    userId,
    transaction
  });

  await syncTaskWorkflow(followUpTask, transaction);

  await auditService.logTaskAction({
    transaction,
    taskId: parentTask.id,
    userId,
    actionType: 'LINKED_TASK',
    details: {
      parentTaskId: parentTask.id,
      childTaskId: followUpTask.id,
      relationship: 'AUTO_FOLLOW_UP',
      automationType: plan.automationType,
      automationAction: 'created'
    }
  });

  await notifyFollowUpAssignee({
    assigneeId,
    followUpTask,
    parentTask,
    plan,
    transaction
  });

  return followUpTask;
}

async function updateManagedFollowUpTask({ managedTask, parentTask, plan, userId, transaction }) {
  const assigneeId = await resolveFollowUpAssignee(parentTask, plan, transaction);
  const nextPayload = buildManagedFollowUpPayload(parentTask, plan, userId);
  const changes = {};
  const oldValues = {};

  const setFollowUpField = (field, value) => {
    const currentValue = managedTask[field];
    const currentSerialized = currentValue instanceof Date ? currentValue.toISOString() : JSON.stringify(currentValue);
    const nextSerialized = value instanceof Date ? value.toISOString() : JSON.stringify(value);
    if (currentSerialized !== nextSerialized) {
      changes[field] = value;
      oldValues[field] = currentValue;
      managedTask[field] = value;
    }
  };

  setFollowUpField('category', plan.category);
  setFollowUpField('subType', plan.subType);
  setFollowUpField('type', plan.subType);
  setFollowUpField('priority', plan.priority);
  setFollowUpField('dueAt', plan.dueAt);
  setFollowUpField('assigneeId', assigneeId);
  setFollowUpField('memberId', parentTask.memberId || null);

  const currentPayloadSerialized = JSON.stringify(managedTask.payload || null);
  const nextPayloadSerialized = JSON.stringify(nextPayload);
  if (currentPayloadSerialized !== nextPayloadSerialized) {
    changes.payload = nextPayload;
    oldValues.payload = managedTask.payload;
    managedTask.payload = nextPayload;
    managedTask.changed('payload', true);
  }

  if (Object.keys(changes).length > 0) {
    managedTask.updatedBy = userId || null;
    await managedTask.save({ transaction });

    await auditService.logTaskAction({
      transaction,
      taskId: managedTask.id,
      userId,
      actionType: 'MANUAL_UPDATE',
      details: {
        source: 'follow_up_automation',
        automationType: plan.automationType,
        changes,
        oldValues
      }
    });

    await auditService.logTaskAction({
      transaction,
      taskId: parentTask.id,
      userId,
      actionType: 'LINKED_TASK',
      details: {
        parentTaskId: parentTask.id,
        childTaskId: managedTask.id,
        relationship: 'AUTO_FOLLOW_UP',
        automationType: plan.automationType,
        automationAction: 'updated'
      }
    });
  }

  const childSteps = await getOrderedTaskSteps(managedTask.id, transaction);
  if (childSteps.length === 0) {
    await createTaskSteps({
      taskId: managedTask.id,
      steps: buildFollowUpSteps(parentTask, plan, assigneeId),
      fallbackOwnerUserId: assigneeId,
      userId,
      transaction
    });
  }

  await syncTaskWorkflow(managedTask, transaction);
  return managedTask;
}

async function cancelManagedFollowUpTask({ managedTask, parentTask, userId, reason, transaction }) {
  if (!managedTask || managedTask.status !== 'PENDING') {
    return managedTask;
  }

  const previousStatus = managedTask.status;
  const previousOutcome = pickTaskOutcomeSnapshot(managedTask);

  managedTask.status = 'REJECTED';
  managedTask.workflowState = 'CANCELLED';
  managedTask.waitingOn = 'NONE';
  managedTask.nextStepSummary = null;
  managedTask.blockedReason = null;
  managedTask.updatedBy = userId || null;
  managedTask.resolvedAs = 'NO_ACTION';
  managedTask.resolutionType = 'ALREADY_RESOLVED';
  managedTask.customerOutcome = 'NO_CHANGE';
  managedTask.resolutionSummary = reason;
  managedTask.followUpRequired = false;
  managedTask.followUpDueAt = null;
  managedTask.followUpSummary = null;
  managedTask.resolvedAt = new Date();

  await managedTask.save({ transaction });

  await TaskStep.update({
    status: 'CANCELLED',
    updatedBy: userId || null
  }, {
    where: {
      taskId: managedTask.id,
      status: {
        [Op.notIn]: ['COMPLETED', 'SKIPPED', 'CANCELLED']
      }
    },
    transaction
  });

  await auditService.logTaskAction({
    transaction,
    taskId: managedTask.id,
    userId,
    actionType: 'REJECTED',
    details: {
      source: 'follow_up_automation',
      reason,
      changes: {
        status: 'REJECTED'
      },
      oldValues: {
        status: previousStatus
      }
    }
  });

  const outcomeDiff = diffOutcomeSnapshots(previousOutcome, pickTaskOutcomeSnapshot(managedTask));
  if (Object.keys(outcomeDiff.changes).length > 0) {
    await auditService.logTaskAction({
      transaction,
      taskId: managedTask.id,
      userId,
      actionType: 'OUTCOME_RECORDED',
      details: outcomeDiff
    });
  }

  await auditService.logTaskAction({
    transaction,
    taskId: parentTask.id,
    userId,
    actionType: 'LINKED_TASK',
    details: {
      parentTaskId: parentTask.id,
      childTaskId: managedTask.id,
      relationship: 'AUTO_FOLLOW_UP',
      automationType: managedTask.payload?.followUpAutomation?.automationType || null,
      automationAction: 'cancelled',
      reason
    }
  });

  await syncTaskWorkflow(managedTask, transaction);
  return managedTask;
}

async function syncFollowUpAutomation(task, userId, transaction) {
  if (!task || isAutoGeneratedFollowUpTask(task)) {
    return null;
  }

  const managedTasks = await getManagedFollowUpTasks(task.id, transaction);
  const activeManagedTask = managedTasks.find(childTask => childTask.status === 'PENDING') || null;
  const desiredPlan = buildFollowUpPlan(task);

  if (!desiredPlan) {
    if (activeManagedTask) {
      await cancelManagedFollowUpTask({
        managedTask: activeManagedTask,
        parentTask: task,
        userId,
        reason: `Follow-up automation cleared because task #${task.id} no longer requires an active follow-up.`,
        transaction
      });
    }
    return null;
  }

  if (
    activeManagedTask
    && activeManagedTask.payload?.followUpAutomation?.automationType === desiredPlan.automationType
  ) {
    return updateManagedFollowUpTask({
      managedTask: activeManagedTask,
      parentTask: task,
      plan: desiredPlan,
      userId,
      transaction
    });
  }

  if (activeManagedTask) {
    await cancelManagedFollowUpTask({
      managedTask: activeManagedTask,
      parentTask: task,
      userId,
      reason: `Follow-up automation changed for task #${task.id}; replacing the previous automated follow-up.`,
      transaction
    });
  }

  return createManagedFollowUpTask({
    parentTask: task,
    plan: desiredPlan,
    userId,
    transaction
  });
}

// --- CORE METHODS ---

// --- HELPERS ---

async function determineAutoAssignee(wineryId, data) {
  // 1. Negative Sentiment -> escalate to Manager
  if (data.sentiment === 'NEGATIVE') {
    const manager = await User.findOne({ where: { wineryId, role: 'manager' } });
    if (manager) return manager.id;
  }

  // 2. Operations / Internal -> Manager
  if (data.category === 'OPERATIONS' || data.category === 'INTERNAL') {
    const manager = await User.findOne({ where: { wineryId, role: 'manager' } });
    if (manager) return manager.id;
  }

  // 3. Orders -> Staff
  if (data.category === 'ORDER') {
    const staff = await User.findOne({ where: { wineryId, role: 'staff' } });
    if (staff) return staff.id;
  }

  return null;
}

async function linkTaskToCalendarEvents({ taskId, calendarEventIds = [], wineryId, userId, transaction }) {
  const uniqueEventIds = [...new Set((calendarEventIds || [])
    .map(Number)
    .filter(id => Number.isInteger(id) && id > 0))];

  if (uniqueEventIds.length === 0) return;

  const events = await CalendarEvent.findAll({
    where: { id: { [Op.in]: uniqueEventIds }, wineryId },
    attributes: ['id'],
    transaction
  });

  if (events.length !== uniqueEventIds.length) {
    const err = new Error('One or more calendar events were not found.');
    err.statusCode = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  await CalendarEventTask.bulkCreate(
    uniqueEventIds.map(calendarEventId => ({
      calendarEventId,
      taskId,
      wineryId,
      createdBy: userId
    })),
    { transaction, ignoreDuplicates: true }
  );

  await CalendarEvent.update(
    { taskId },
    {
      where: {
        id: { [Op.in]: uniqueEventIds },
        wineryId,
        taskId: null
      },
      transaction
    }
  );
}

/**
 * Creates a new task (manually or via triage).
 */
async function createTask({ wineryId, userId, userRole = null, data, source = 'manual', transaction = null }) {
  const ownTransaction = !transaction;
  const t = transaction || await Task.sequelize.transaction();
  try {
    const {
      category, subType, customerType, type, memberId, messageId,
      payload, priority, notes, sentiment, assigneeId, parentTaskId,
      initialNote, suggestedReplyBody, suggestedChannel, suggestedReplySubject,
      suggestedAction, suggestedRecipientEmail, suggestedCc, dueAt,
      resolutionSummary, steps = [], taskOrigin, inboundMethod,
      requesterName, requesterEmail, requesterPhone, calendarEventIds = []
    } = data;
    const isStaffCreator = userRole === 'staff';
    const requestedAssigneeId = assigneeId || null;
    const requestedSteps = Array.isArray(steps) ? steps : [];

    if (isStaffCreator && requestedAssigneeId && Number(requestedAssigneeId) !== Number(userId)) {
      const err = new Error('Staff can only assign new tasks to themselves or leave them unassigned.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    if (isStaffCreator) {
      const disallowedStep = requestedSteps.find(step => (
        step.ownerUserId && Number(step.ownerUserId) !== Number(userId)
      ));

      if (disallowedStep) {
        const err = new Error('Staff can only assign workflow steps to themselves or leave them unassigned.');
        err.statusCode = 403;
        err.code = 'FORBIDDEN';
        throw err;
      }
    }

    const settings = await WinerySettings.findOne({ where: { wineryId }, transaction: t });
    const identityConfig = customerIdentityService.getIdentityMatchingConfig(settings);
    let linkedMessage = null;
    if (messageId) {
      linkedMessage = await Message.findOne({
        where: { id: messageId, wineryId },
        transaction: t
      });
      if (!linkedMessage) {
        const err = new Error('Message not found');
        err.statusCode = 404;
        err.code = 'NOT_FOUND';
        throw err;
      }
    }
    const resolvedTaskOrigin = taskOrigin || (category === 'INTERNAL' || category === 'SYSTEM' ? 'INTERNAL' : 'EXTERNAL');
    const resolvedInboundMethod = inboundMethod || (resolvedTaskOrigin === 'INTERNAL' ? 'internal' : null);
    const resolvedSuggestedChannel = suggestedChannel
      || (resolvedInboundMethod === 'sms' ? 'sms'
        : resolvedInboundMethod === 'email' ? 'email'
          : resolvedInboundMethod === 'phone' ? 'voice'
            : 'none');
    const resolvedSuggestedReplySubject = resolvedSuggestedChannel === 'email' ? suggestedReplySubject || null : null;
    const resolvedSuggestedRecipientEmail = resolvedSuggestedChannel === 'email' ? suggestedRecipientEmail || null : null;
    const resolvedSuggestedCc = resolvedSuggestedChannel === 'email' ? suggestedCc || null : null;
    const providedIdentityResolution = data.identityResolution || null;
    const resolvedMember = (
      providedIdentityResolution
      && (providedIdentityResolution.memberId || (providedIdentityResolution.suggestedCandidates || []).length > 0)
    )
      ? providedIdentityResolution
      : await customerIdentityService.resolveExternalIdentity({
        wineryId,
        memberId,
        category,
        taskOrigin: resolvedTaskOrigin,
        inboundMethod: resolvedInboundMethod,
        requesterName,
        requesterEmail,
        requesterPhone,
        identityConfig,
        transaction: t,
        allowAutoCreate: true
      });
    const resolvedMemberId = resolvedMember.memberId;
    const identityState = customerIdentityService.buildIntakeIdentityState({
      linkedMemberId: resolvedMemberId,
      originalMemberId: providedIdentityResolution ? null : memberId,
      matchReason: resolvedMember.matchReason,
      suggestedCandidates: resolvedMember.suggestedCandidates
    });
    const manualIntake = {
      taskOrigin: resolvedTaskOrigin,
      inboundMethod: resolvedInboundMethod,
      requesterName: requesterName || null,
      requesterEmail: requesterEmail || null,
      requesterPhone: requesterPhone || null,
      preferredResponseChannel: resolvedSuggestedChannel,
      ...identityState
    };
    const resolvedPayload = {
      ...(payload || {}),
      manualIntake
    };
    const resolvedCustomerType = customerType && customerType !== 'UNKNOWN'
      ? customerType
      : resolvedMemberId
        ? 'MEMBER'
        : resolvedTaskOrigin === 'EXTERNAL'
          ? 'VISITOR'
          : 'UNKNOWN';
    const finalAssigneeId = isStaffCreator
      ? requestedAssigneeId
      : requestedAssigneeId || await determineAutoAssignee(wineryId, data);
    const requiresManagerAssignmentReview = isStaffCreator && !requestedAssigneeId;
    const managerReviewOwnerId = requiresManagerAssignmentReview
      ? await findManagerUserId(wineryId, t)
      : null;
    const workflowSteps = requiresManagerAssignmentReview
      ? [
        {
          title: 'Assign to staff',
          description: 'Review this staff-created internal task and assign it to a staff user in this winery.',
          stepType: 'APPROVAL',
          waitingOn: 'MANAGER',
          ownerUserId: managerReviewOwnerId,
          sortOrder: 0,
          metadata: {
            systemGenerated: true,
            reason: STAFF_ASSIGNMENT_REVIEW_REASON,
            assignmentTargetRole: STAFF_ASSIGNMENT_TARGET_ROLE
          }
        },
        ...requestedSteps.map((step, index) => ({
          ...step,
          sortOrder: index + 1
        }))
      ]
      : requestedSteps;

    // 1. Create Task
    const task = await Task.create({
      wineryId,
      category: category || 'INTERNAL',
      subType: subType || 'INTERNAL_TASK',
      customerType: resolvedCustomerType,
      type: subType || type || 'INTERNAL_TASK', // Legacy fallback
      status: 'PENDING',
      priority: priority || 'normal',
      sentiment: sentiment || 'NEUTRAL',
      workflowState: 'NOT_STARTED',
      waitingOn: 'NONE',
      payload: resolvedPayload,
      memberId: resolvedMemberId || null,
      messageId: messageId || null,
      suggestedReplyBody: suggestedReplyBody || null,
      suggestedChannel: resolvedSuggestedChannel,
      suggestedReplySubject: resolvedSuggestedReplySubject,
      suggestedAction: suggestedAction || null,
      suggestedRecipientEmail: resolvedSuggestedRecipientEmail,
      suggestedCc: resolvedSuggestedCc,
      dueAt: dueAt || null,
      resolutionSummary: resolutionSummary || null,
      createdBy: userId,
      updatedBy: userId,
      assigneeId: finalAssigneeId,
      parentTaskId: parentTaskId || null
    }, { transaction: t });

    if (linkedMessage) {
      const messageUpdates = { taskId: task.id };
      if (resolvedMemberId && linkedMessage.memberId !== resolvedMemberId) {
        messageUpdates.memberId = resolvedMemberId;
      }
      await linkedMessage.update(messageUpdates, { transaction: t });
    }

    // 2. Log Creation Action
    await auditService.logTaskAction({
      transaction: t,
      taskId: task.id,
      userId,
      actionType: source === 'manual' ? 'MANUAL_CREATED' : 'CREATED',
      details: {
        source,
        notes,
        originalText: resolvedPayload?.originalText,
        stepCount: workflowSteps.length,
        manualIntake,
        suggestionReview: resolvedPayload?.aiSuggestionReview || null
      }
    });

    if (finalAssigneeId) {
      await auditService.logTaskAction({
        transaction: t,
        taskId: task.id,
        userId,
        actionType: 'ASSIGNED',
        details: {
          from: null,
          to: finalAssigneeId
        }
      });

      await notifyTaskAssignee({
        assigneeId: finalAssigneeId,
        task,
        assignedByUserId: userId,
        transaction: t
      });
    }

    // 3. Log Linking Action (if needed)
    if (parentTaskId) {
      await auditService.logTaskAction({
        transaction: t,
        taskId: task.id,
        userId,
        actionType: 'LINKED_TASK',
        details: {
          parentTaskId,
          childTaskId: task.id
        }
        });
    }

    // 4. Create structured workflow steps
    let createdWorkflowSteps = [];
    if (workflowSteps.length > 0) {
      createdWorkflowSteps = await createTaskSteps({
        taskId: task.id,
        steps: workflowSteps,
        fallbackOwnerUserId: finalAssigneeId,
        userId,
        transaction: t
      });
    }

    if (requiresManagerAssignmentReview && managerReviewOwnerId) {
      await notifyManagerAssignmentReview({
        managerUserId: managerReviewOwnerId,
        task,
        step: createdWorkflowSteps[0],
        createdByUserId: userId,
        transaction: t
      });
    }

    await linkTaskToCalendarEvents({
      taskId: task.id,
      calendarEventIds,
      wineryId,
      userId,
      transaction: t
    });

    // 5. Log Initial Note + Process @Mentions (if provided)
    if (initialNote && initialNote.trim()) {
      await auditService.logTaskAction({
        transaction: t,
        taskId: task.id,
        userId,
        actionType: 'NOTE_ADDED',
        details: { note: initialNote.trim() }
      });

      await processMentions({
        text: initialNote.trim(),
        wineryId,
        senderId: userId,
        taskId: task.id,
        transaction: t
      });
    }

    await syncTaskWorkflow(task, t);

    if (ownTransaction) {
      await t.commit();
    }
    logger.info('Task created', { taskId: task.id, userId, wineryId, source });

    return taskDeadlineService.attachDeadlineState(task);

  } catch (err) {
    if (ownTransaction && !t.finished) await t.rollback();
    throw err;
  }
}

/**
 * Updates an existing task.
 * Handles status transitions, assignment, linking, and execution triggers.
 */
async function updateTask({ taskId, wineryId, userId, userRole, updates }) {
  const t = await Task.sequelize.transaction();
  let noteAdded = false;
  let regenerateRequested = false;
  try {
    const task = await Task.findOne({ where: { id: taskId, wineryId } });
    if (!task) throw new Error('Task not found');

      const {
        status, payload, priority, notes, suggestedReplyBody,
        category, subType, sentiment, assigneeId, parentTaskId,
        suggestedChannel, suggestedReplySubject, suggestedAction,
        suggestedRecipientEmail, suggestedCc, regenerateSuggestedReply,
        isPrivateNote, dueAt, resolutionSummary, memberId,
        resolvedAs, resolutionType, customerOutcome,
        followUpRequired, followUpDueAt, followUpSummary
      } = updates;

    // --- LAYER 2: STATUS TRANSITION GUARD ---
    if (status && status !== task.status) {
      if (!validateStatusTransition(task.status, status)) {
        const err = new Error(`Invalid status transition: ${task.status} → ${status}`);
        err.statusCode = 400;
        err.code = 'INVALID_STATUS_TRANSITION';
        throw err;
      }
    }

    // --- LAYER 2: ROLE CHECK FOR REJECTION ---
    if (status === 'REJECTED' && status !== task.status) {
      if (userRole === 'staff') {
        const err = new Error('Staff cannot reject tasks.');
        err.statusCode = 403;
        err.code = 'FORBIDDEN';
        throw err;
      }
    }

    // --- LAYER 2: PAYLOAD VALIDATION FOR ACTIONING ---
    // Note: Removed hard-block. Users should be able to action tasks freely.
    // The execution service handles missing payload data gracefully.

    // --- LAYER 2: STAFF CANNOT REASSIGN TASKS ---
    if (updates.assigneeId !== undefined && updates.assigneeId !== task.assigneeId) {
      if (userRole === 'staff') {
        const err = new Error('Staff cannot reassign tasks.');
        err.statusCode = 403;
        err.code = 'FORBIDDEN';
        throw err;
      }
    }

    const nextStatus = status || task.status;
    if (
      nextStatus === 'PENDING'
      && (
        resolvedAs !== undefined
        || resolutionType !== undefined
        || customerOutcome !== undefined
        || followUpRequired !== undefined
        || followUpDueAt !== undefined
        || followUpSummary !== undefined
        || resolutionSummary !== undefined
      )
    ) {
      const err = new Error('Outcome fields can only be recorded when a task is actioned or rejected.');
      err.statusCode = 400;
      err.code = 'INVALID_TASK_OUTCOME';
      throw err;
    }

    const changes = {};
    const oldValues = {};

    // Helper to track changes
    const setField = (field, value) => {
      if (value !== undefined && value !== task[field]) {
        changes[field] = value;
        oldValues[field] = task[field];
        task[field] = value;
      }
    };

      // Apply fields
      setField('status', status);
      setField('priority', priority);
      setField('category', category);
      setField('subType', subType);
      setField('sentiment', sentiment);
      if (memberId !== undefined) {
        if (memberId !== null) {
          const member = await Member.findOne({
            where: { id: memberId, wineryId },
            transaction: t
          });
          if (!member) {
            const err = new Error('Member not found');
            err.statusCode = 404;
            err.code = 'NOT_FOUND';
            throw err;
          }
        }
        setField('memberId', memberId);
        const nextCustomerType = memberId ? 'MEMBER' : ((task.payload?.manualIntake?.taskOrigin === 'EXTERNAL') ? 'VISITOR' : 'UNKNOWN');
        setField('customerType', nextCustomerType);
      }
      setField('suggestedReplyBody', suggestedReplyBody);
      const inferredSuggestedChannel = suggestedChannel !== undefined
        ? suggestedChannel
        : (!task.suggestedChannel && (
          suggestedRecipientEmail !== undefined
          || suggestedCc !== undefined
          || suggestedReplySubject !== undefined
        ) ? 'email' : undefined);
      setField('suggestedChannel', inferredSuggestedChannel);
      const nextSuggestedChannel = inferredSuggestedChannel !== undefined ? inferredSuggestedChannel : task.suggestedChannel;
      if (inferredSuggestedChannel !== undefined && inferredSuggestedChannel !== 'email') {
        setField('suggestedReplySubject', null);
        setField('suggestedRecipientEmail', null);
        setField('suggestedCc', null);
      } else {
        setField('suggestedReplySubject', nextSuggestedChannel === 'email' ? suggestedReplySubject : undefined);
      }
      setField('suggestedAction', suggestedAction);
      if (nextSuggestedChannel === 'email') {
        setField('suggestedRecipientEmail', suggestedRecipientEmail);
        setField('suggestedCc', suggestedCc);
      }
      setField('dueAt', dueAt ? new Date(dueAt) : dueAt);

    // Special logic: Linking
    if (parentTaskId !== undefined && parentTaskId !== task.parentTaskId) {
      setField('parentTaskId', parentTaskId);
      await auditService.logTaskAction({
        transaction: t,
        taskId: task.id,
        userId,
        actionType: 'LINKED_TASK',
        details: {
          parentTaskId,
          childTaskId: task.id
        }
      });
    }

    // Special logic: Assignment
    if (assigneeId !== undefined && assigneeId !== task.assigneeId) {
      const assignmentTarget = await validateTaskAssignmentTarget({
        taskId: task.id,
        wineryId,
        assigneeId,
        transaction: t
      });
      const oldAssignee = task.assigneeId;
      setField('assigneeId', assigneeId);
      await auditService.logTaskAction({
        transaction: t,
        taskId: task.id,
        userId,
        actionType: 'ASSIGNED',
        details: {
          from: oldAssignee,
          to: assigneeId
        }
      });

      await removeStaleAssignmentNotifications({
        userId: oldAssignee,
        taskId: task.id,
        transaction: t
      });

      await notifyTaskAssignee({
        assigneeId,
        task,
        assignedByUserId: userId,
        transaction: t
      });

      await completeStaffAssignmentReview({
        taskId: task.id,
        assignee: assignmentTarget.assignee,
        reviewSteps: assignmentTarget.staffReviewSteps,
        userId,
        transaction: t
      });
    }

    // Deep Payload update
      if (payload) {
        changes.payload = payload;
        oldValues.payload = task.payload;
        task.payload = payload;
      }

      if (memberId !== undefined) {
        const previousPayload = task.payload && typeof task.payload === 'object'
          ? JSON.parse(JSON.stringify(task.payload))
          : task.payload;
        const currentPayload = task.payload && typeof task.payload === 'object' ? { ...task.payload } : {};
        const currentManualIntake = currentPayload.manualIntake && typeof currentPayload.manualIntake === 'object'
          ? { ...currentPayload.manualIntake }
          : {};
        const confirmingSuggestedMember = Boolean(
          memberId
          && currentManualIntake.identityResolutionStatus === 'REVIEW_REQUIRED'
          && Number(currentManualIntake.suggestedMemberId) === Number(memberId)
        );

        currentPayload.manualIntake = {
          ...currentManualIntake,
          identityResolutionStatus: memberId
            ? (confirmingSuggestedMember ? 'REVIEW_CONFIRMED' : 'MANUALLY_LINKED')
            : 'UNLINKED',
          identityConfidence: memberId ? 'HIGH' : 'NONE',
          memberAutoLinked: false,
          memberMatchReason: memberId
            ? (confirmingSuggestedMember ? 'review_confirmed' : 'manually_linked')
            : null,
          suggestedMemberId: memberId ? currentManualIntake.suggestedMemberId || null : null,
          suggestedMemberLabel: memberId ? currentManualIntake.suggestedMemberLabel || null : null,
          suggestedMemberReason: memberId ? currentManualIntake.suggestedMemberReason || null : null
        };

        task.payload = currentPayload;
        changes.payload = currentPayload;
        oldValues.payload = oldValues.payload || previousPayload;
        task.changed('payload', true);
      }

    task.updatedBy = userId;
    await task.save({ transaction: t });

    // Generic Update Action
    if (Object.keys(changes).length > 0) {
      let actionType = 'MANUAL_UPDATE';
      if (changes.status === 'ACTIONED') actionType = 'ACTIONED';
      if (changes.status === 'REJECTED') actionType = 'REJECTED';

      await auditService.logTaskAction({
        transaction: t,
        taskId: task.id,
        userId,
        actionType,
        details: { changes, oldValues }
      });
    }

    if (changes.status === 'ACTIONED' || changes.status === 'REJECTED') {
      await removeTaskNotifications({ taskId: task.id, transaction: t });
    }

    // Notes
    if (notes) {
      const detailsObj = { note: notes };
      if (isPrivateNote) {
        detailsObj.isPrivate = true;
      }

      await auditService.logTaskAction({
        transaction: t,
        taskId: task.id,
        userId,
        actionType: 'NOTE_ADDED',
        details: detailsObj
      });
      noteAdded = true;

      // Process Mentions
      await processMentions({
        text: notes,
        wineryId,
        senderId: userId,
        taskId: task.id,
        transaction: t
      });
    }

    const outcomeInput = {
      resolvedAs,
      resolutionType,
      customerOutcome,
      resolutionSummary,
      followUpRequired,
      followUpDueAt,
      followUpSummary
    };
    if (changes.status !== 'ACTIONED') {
      const outcomeDiff = applyTaskOutcomeUpdates(task, outcomeInput, task.status);

      if (Object.keys(outcomeDiff.changes).length > 0) {
        task.updatedBy = userId;
        await task.save({ transaction: t });

        await auditService.logTaskAction({
          transaction: t,
          taskId: task.id,
          userId,
          actionType: 'OUTCOME_RECORDED',
          details: outcomeDiff
        });
      }
    }

    // EXECUTION TRIGGER (best-effort — don't block status change if execution fails)
      if (changes.status === 'ACTIONED') {
        try {
          const settings = await WinerySettings.findOne({ where: { wineryId } });
          await executionService.executeTask(task, t, settings);
        } catch (execErr) {
          logger.warn('Execution skipped for task', { taskId, reason: execErr.message });
        }

        const postExecutionOutcomeDiff = applyTaskOutcomeUpdates(task, outcomeInput, task.status);
        if (Object.keys(postExecutionOutcomeDiff.changes).length > 0) {
          task.updatedBy = userId;
          await task.save({ transaction: t });

          await auditService.logTaskAction({
            transaction: t,
            taskId: task.id,
            userId,
            actionType: 'OUTCOME_RECORDED',
            details: postExecutionOutcomeDiff
          });
        }

        const memberEnrichment = await enrichMemberFromTaskOutcome(task, t);
        if (memberEnrichment && (memberEnrichment.tagsAdded.length > 0 || memberEnrichment.noteAdded)) {
          await auditService.logTaskAction({
            transaction: t,
            taskId: task.id,
            userId,
            actionType: 'MEMBER_ENRICHED',
            details: memberEnrichment
          });
        }
      }

    await syncFollowUpAutomation(task, userId, t);

    await syncTaskWorkflow(task, t);

    await t.commit();
    logger.info('Task updated', { taskId, userId, changes: Object.keys(changes) });

    if (regenerateSuggestedReply) {
      regenerateRequested = true;
      await aiSuggestionService.generateAiSuggestion(task.id, wineryId, {
        force: true,
        includeHistory: true
      });
    }

    if (noteAdded && !regenerateSuggestedReply) {
      queueSuggestionRefresh(task.id, wineryId);
    }

    if (regenerateRequested) {
      const refreshed = await Task.findByPk(task.id);
      return taskDeadlineService.attachDeadlineState(refreshed || task);
    }
    return taskDeadlineService.attachDeadlineState(task);

  } catch (err) {
    if (!t.finished) await t.rollback();
    throw err;
  }
}

/**
 * Get tasks for a winery with filtering and pagination
 */
async function getTasksForWinery({ wineryId, userId, userRole, filters = {}, pagination = {} }) {
  const { status, type, priority, assignedToMe, category, sentiment, assigneeId, createdById, search, dateFrom, dateTo, sortBy, showOnlyFlagged, mentionedMe, actionedById, deadlineState } = filters;
  const { page = 1, pageSize = 20 } = pagination;
  const Sequelize = require('sequelize');
  const { UserTaskFlag, User, TaskAction } = require('../models');

  // Validate pagination parameters
  const limit = Math.min(Math.max(parseInt(pageSize) || 20, 1), 100);
  const offset = (Math.max(parseInt(page) || 1, 1) - 1) * limit;

  const whereClause = { wineryId };
  
  let idFilters = null;

  // --- FLAG FILTER ---
  if (showOnlyFlagged === 'true' || showOnlyFlagged === true) {
    const flags = await UserTaskFlag.findAll({ where: { userId } });
    const flaggedIds = flags.map(f => f.taskId);
    if (flaggedIds.length === 0) {
      // If none flagged by user, return empty instantly
      return { tasks: [], pagination: { page: 1, pageSize: limit, total: 0, totalPages: 0 }};
    }
    idFilters = flaggedIds;
  }

  // --- MENTIONS FILTER ---
  if (mentionedMe === 'true' || mentionedMe === true) {
    const currentUser = await User.findByPk(userId);
    if (currentUser && currentUser.displayName) {
      const mentionSearchOp = { [Op.like]: `%@${currentUser.displayName}%` };
      const actions = await TaskAction.findAll({
        attributes: ['taskId'],
        where: {
          actionType: 'NOTE_ADDED',
          [Op.and]: [
            Sequelize.where(
              Sequelize.cast(Sequelize.col('details'), 'char'),
              mentionSearchOp
            )
          ]
        }
      });
      const actionTaskIds = [...new Set(actions.map(a => a.taskId))];
      
      if (actionTaskIds.length === 0) {
        return { tasks: [], pagination: { page: 1, pageSize: limit, total: 0, totalPages: 0 }};
      }
      
      if (idFilters === null) {
        idFilters = actionTaskIds;
      } else {
        idFilters = idFilters.filter(id => actionTaskIds.includes(id));
        if (idFilters.length === 0) {
          return { tasks: [], pagination: { page: 1, pageSize: limit, total: 0, totalPages: 0 }};
        }
      }
    } else {
      // If no displayName exists, user cannot be mentioned
      return { tasks: [], pagination: { page: 1, pageSize: limit, total: 0, totalPages: 0 }};
    }
  }

  // --- ACTIONED BY FILTER ---
  if (actionedById && actionedById !== 'all') {
    const actionUserId = actionedById === 'me' ? userId : Number(actionedById);
    const actions = await TaskAction.findAll({
      attributes: ['taskId'],
      where: {
        userId: actionUserId,
        actionType: 'ACTIONED'
      }
    });
    const actionTaskIds = [...new Set(actions.map(a => a.taskId))];
    
    if (actionTaskIds.length === 0) {
      return { tasks: [], pagination: { page: 1, pageSize: limit, total: 0, totalPages: 0 }};
    }
    
    if (idFilters === null) {
      idFilters = actionTaskIds;
    } else {
      idFilters = idFilters.filter(id => actionTaskIds.includes(id));
      if (idFilters.length === 0) {
        return { tasks: [], pagination: { page: 1, pageSize: limit, total: 0, totalPages: 0 }};
      }
    }
  }

  if (idFilters !== null) {
    whereClause.id = { [Op.in]: idFilters };
  }

  // --- STANDARD FILTERS ---
  if (status && status !== 'all') whereClause.status = status;
  if (type && type !== 'all') whereClause.type = type;
  if (priority && priority !== 'all') whereClause.priority = priority;
  if (category && category !== 'all') whereClause.category = category;
  if (sentiment && sentiment !== 'all') whereClause.sentiment = sentiment;

  if (deadlineState && deadlineState !== 'all') {
    const normalizedDeadlineState = String(deadlineState).toUpperCase();
    const now = new Date();
    const dueSoonCutoff = new Date(now.getTime() + taskDeadlineService.getDeadlineConfig().dueSoonHours * 60 * 60 * 1000);

    if (normalizedDeadlineState === 'OVERDUE') {
      whereClause.status = 'PENDING';
      whereClause.dueAt = { [Op.lt]: now };
    } else if (normalizedDeadlineState === 'DUE_SOON') {
      whereClause.status = 'PENDING';
      whereClause.dueAt = {
        [Op.gte]: now,
        [Op.lte]: dueSoonCutoff
      };
    } else if (normalizedDeadlineState === 'SCHEDULED') {
      whereClause.status = 'PENDING';
      whereClause.dueAt = { [Op.gt]: dueSoonCutoff };
    }
  }

  // --- DATE RANGE FILTERS ---
  if (dateFrom || dateTo) {
    whereClause.createdAt = {};
    if (dateFrom) whereClause.createdAt[Op.gte] = new Date(dateFrom);
    if (dateTo) {
      // Set to end of day if only date provided
      const d = new Date(dateTo);
      d.setHours(23, 59, 59, 999);
      whereClause.createdAt[Op.lte] = d;
    }
  }

  if (assigneeId && assigneeId !== 'all') {
    if (assigneeId === 'unassigned') whereClause.assigneeId = null;
    else if (assigneeId === 'me') whereClause.assigneeId = userId; // Should already be covered by generic logic but explicit is safe
    else whereClause.assigneeId = Number(assigneeId);
  }

  if (createdById && createdById !== 'all') {
    if (createdById === 'system') whereClause.createdBy = null; // Assuming system is null or checks relation
    else whereClause.createdBy = Number(createdById);
  }

  // RBAC: Staff can only see their assigned tasks or unassigned tasks (unless overridden)
  if (userRole === 'staff') {
    whereClause[Op.or] = [
      { assigneeId: userId },
      { assigneeId: null }
    ];
  } else if (assignedToMe === 'true') {
    whereClause.assigneeId = userId;
  }





  // --- DEEP SEARCH ---
  if (search && search.trim()) {
    const term = `%${search.trim().toLowerCase()}%`;
    const searchOp = { [Op.like]: term };



    // 1. Find matching Members
    const members = await Member.findAll({
      attributes: ['id'],
      where: {
        wineryId,
        [Op.or]: [
          { firstName: searchOp },
          { lastName: searchOp },
          { email: searchOp },
          { phone: searchOp }
        ]
      }
    });
    const memberIds = members.map(m => m.id);

    // 2. Find matching TaskActions (Notes)
    // Cast details to text to search the JSON blob
    const actions = await TaskAction.findAll({
      attributes: ['taskId'],
      where: {
        actionType: 'NOTE_ADDED',
        [Op.and]: [
          Sequelize.where(
            Sequelize.cast(Sequelize.col('details'), 'char'),
            searchOp
          )
        ]
      }
    });
    const actionTaskIds = actions.map(a => a.taskId);

    // 3. Find matching Payloads (on Task itself)
    const payloadTasks = await Task.findAll({
      attributes: ['id'],
      where: {
        wineryId,
        [Op.and]: [
          Sequelize.where(
            Sequelize.cast(Sequelize.col('payload'), 'char'),
            searchOp
          )
        ]
      }
    });
    const payloadTaskIds = payloadTasks.map(t => t.id);

    // 4. Find matching linked Messages
    const messages = await Message.findAll({
      attributes: ['id', 'taskId'],
      where: {
        wineryId,
        [Op.or]: [
          { body: searchOp },
          { subject: searchOp }
        ]
      }
    });
    const messageTaskIds = messages
      .map(message => message.taskId)
      .filter(Boolean);
    const orphanMessageIds = messages
      .filter(message => !message.taskId)
      .map(message => message.id);
    let legacyMessageTaskIds = [];
    if (orphanMessageIds.length > 0) {
      const legacyMessageTasks = await Task.findAll({
        attributes: ['id'],
        where: {
          wineryId,
          messageId: {
            [Op.in]: orphanMessageIds
          }
        }
      });
      legacyMessageTaskIds = legacyMessageTasks.map(task => task.id);
    }

    // Combine explicit ID matches (from payload/notes)
    const combinedIds = [...new Set([
      ...actionTaskIds,
      ...payloadTaskIds,
      ...messageTaskIds,
      ...legacyMessageTaskIds
    ])];

    // Build the OR conditions
    const searchOrConditions = [];


    // A. ID Match (if numeric)
    // Use strict regex to avoid matching "123 abc" as ID 123
    const isStrictid = /^\d+$/.test(search.trim());
    if (isStrictid) {
      searchOrConditions.push({ id: parseInt(search.trim()) });
    }

    // B. Direct Column Matches
    searchOrConditions.push({ category: searchOp });
    searchOrConditions.push({ subType: searchOp });

    // C. Indirect Matches (Member, Note, Payload)
    if (combinedIds.length > 0) {
      searchOrConditions.push({ id: { [Op.in]: combinedIds } });
    }
    if (memberIds.length > 0) {
      searchOrConditions.push({ memberId: { [Op.in]: memberIds } });
    }

    // Apply to Main Where Clause
    whereClause[Op.and] = [
      ...(whereClause[Op.and] || []),
      { [Op.or]: searchOrConditions }
    ];
  }


  // Sorting
  const order = [
    [Sequelize.literal(taskDeadlineService.getDeadlineOrderExpression(Task.sequelize)), 'ASC'],
    [Sequelize.literal(taskDeadlineService.getOpenTaskDueAtOrderExpression(Task.sequelize)), 'ASC'],
    ['createdAt', sortBy === 'oldest' ? 'ASC' : 'DESC']
  ];


  // Prioritize exact ID match if search is strictly numeric
  if (search && /^\d+$/.test(search.trim())) {
    const exactId = parseInt(search.trim());
    // MySQL boolean expression: (id = val) returns 1 if true, 0 if false. DESC puts 1 (match) first.
    // Use qualified column name `Task`.`id` to avoid ambiguity with joined tables
    order.unshift([Sequelize.literal(`\`Task\`.\`id\` = ${exactId}`), 'DESC']);
  }


  const { count, rows } = await Task.findAndCountAll({
    where: whereClause,

    include: [
      { model: Member, attributes: ['id', 'firstName', 'lastName', 'email', 'phone'] },
      { model: User, as: 'Creator', attributes: ['id', 'displayName', 'role'] },
      { model: User, as: 'Assignee', attributes: ['id', 'displayName', 'email', 'role'] },
    ],
    order: order,
    limit,
    offset
  });

  return {
    tasks: rows.map(task => taskDeadlineService.attachDeadlineState(task)),
    pagination: {
      page: parseInt(page) || 1,
      pageSize: limit,
      total: count,
      totalPages: Math.ceil(count / limit)
    }
  };
}

/**
 * Get a single task by ID
 */
async function getTaskById({ taskId, wineryId }) {
  const task = await Task.findOne({
    where: { id: taskId, wineryId },
    include: [
      { model: Member },
      { model: Message },
      {
        model: Task,
        as: 'ParentTask',
        attributes: ['id', 'category', 'subType', 'status', 'resolvedAs', 'resolutionType', 'customerOutcome', 'resolvedAt']
      },
      {
        model: Message,
        as: 'Messages',
        separate: true,
        order: [['receivedAt', 'ASC'], ['id', 'ASC']],
        limit: 100
      },
      { model: User, as: 'Creator', attributes: ['id', 'displayName'] },
      { model: User, as: 'Assignee', attributes: ['id', 'displayName', 'email', 'role'] },
      {
        model: TaskStep,
        as: 'TaskSteps',
        separate: true,
        order: [['sortOrder', 'ASC'], ['id', 'ASC']],
        include: [{ model: User, as: 'Owner', attributes: ['id', 'displayName', 'email', 'role'] }]
      },
      {
        model: TaskAction,
        separate: true,
        order: [['createdAt', 'DESC']], // recent first
        limit: 50, // Safety limit
        include: [{ model: User, attributes: ['id', 'displayName', 'role'] }]
      },
      {
        model: Task,
        as: 'SubTasks',
        separate: true,
        order: [['dueAt', 'ASC'], ['id', 'ASC']],
        include: [
          { model: User, as: 'Assignee', attributes: ['id', 'displayName', 'email', 'role'] },
          { model: Member, attributes: ['id', 'firstName', 'lastName', 'email', 'phone'] }
        ]
      },
      noticeService.getLinkedNoticeInclude()
    ]
  });

  if (!task) {
    const err = new Error('Task not found');
    err.statusCode = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  // Re-sort actions for frontend if needed (frontend expects chronological?)
  // The frontend sorts them: .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  // So returning them DESC is fine, frontend will re-sort. 
  // But wait, if we limit 50 DESC, we get the *latest* 50.
  // Frontend sorts ASC. So we'll have the last 50 actions, in correct order after frontend sort.

  return taskDeadlineService.attachDeadlineState(task);
}

async function createTaskStep({ taskId, wineryId, userId, userRole, data }) {
  const t = await Task.sequelize.transaction();

  try {
    const task = await Task.findOne({ where: { id: taskId, wineryId }, transaction: t });
    if (!task) throw new Error('Task not found');
    assertCanMutateTaskStep({ task, userId, userRole, action: 'add workflow steps to this task' });

    const existingSteps = await getOrderedTaskSteps(taskId, t);
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
          transaction: t
        }
      );
    }

    const normalized = normalizeTaskStepInput({ ...data, sortOrder: insertSortOrder }, insertSortOrder, task.assigneeId || null);

    const step = await TaskStep.create({
      taskId,
      ...normalized,
      createdBy: userId,
      updatedBy: userId,
      completedAt: normalized.status === 'COMPLETED' ? new Date() : null
    }, { transaction: t });

    await auditService.logTaskAction({
      transaction: t,
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
    await syncTaskWorkflow(task, t);
    await t.commit();

    queueSuggestionRefresh(taskId, wineryId);
    return step;
  } catch (err) {
    if (!t.finished) await t.rollback();
    throw err;
  }
}

async function updateTaskStep({ taskId, stepId, wineryId, userId, userRole, updates }) {
  const t = await Task.sequelize.transaction();

  try {
    const task = await Task.findOne({ where: { id: taskId, wineryId } });
    if (!task) throw new Error('Task not found');

    const step = await TaskStep.findOne({ where: { id: stepId, taskId }, transaction: t });
    if (!step) throw new Error('Task step not found');
    assertCanMutateTaskStep({ task, step, userId, userRole, action: 'update this workflow step' });

    if (updates.ownerUserId !== undefined && updates.ownerUserId !== step.ownerUserId && userRole === 'staff') {
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
      setStepField('suggestionGeneratedAt', updates.suggestionGeneratedAt ? new Date(updates.suggestionGeneratedAt) : null);
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
    await step.save({ transaction: t });

    if (Object.keys(changes).length > 0) {
      await auditService.logTaskAction({
        transaction: t,
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
    await syncTaskWorkflow(task, t);
    await t.commit();

    queueSuggestionRefresh(taskId, wineryId);
    return step;
  } catch (err) {
    if (!t.finished) await t.rollback();
    throw err;
  }
}

async function reorderTaskSteps({ taskId, wineryId, userId, userRole, stepIds = [] }) {
  if (!['manager', 'admin'].includes(userRole)) {
    const err = new Error('Only managers can reorder workflow steps.');
    err.statusCode = 403;
    err.code = 'FORBIDDEN';
    throw err;
  }

  const t = await Task.sequelize.transaction();

  try {
    const task = await Task.findOne({ where: { id: taskId, wineryId }, transaction: t });
    if (!task) throw new Error('Task not found');

    const existingSteps = await getOrderedTaskSteps(taskId, t);
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
          { where: { id: uniqueRequestedIds[index], taskId }, transaction: t }
        );
      }

      await auditService.logTaskAction({
        transaction: t,
        taskId,
        userId,
        actionType: 'STEP_UPDATED',
        details: {
          changes: {
            stepOrder: uniqueRequestedIds
          },
          oldValues: {
            stepOrder: previousOrder
          }
        }
      });
    }

    task.updatedBy = userId;
    await syncTaskWorkflow(task, t);
    const steps = await getOrderedTaskSteps(taskId, t);
    await t.commit();

    if (changed) queueSuggestionRefresh(taskId, wineryId);
    return steps;
  } catch (err) {
    if (!t.finished) await t.rollback();
    throw err;
  }
}

async function generateTaskStepSuggestion({ taskId, stepId, wineryId, userId, userRole, options = {} }) {
  const { force = true } = options;
  const t = await Task.sequelize.transaction();

  try {
    const task = await Task.findOne({
      where: { id: taskId, wineryId },
      include: [
        { model: Member },
        { model: User, as: 'Assignee', attributes: ['id', 'displayName', 'email', 'role'] },
        {
          model: Message,
          as: 'Messages',
          required: false,
          separate: true,
          order: [['receivedAt', 'ASC'], ['id', 'ASC']],
          limit: 20
        },
        {
          model: TaskStep,
          as: 'TaskSteps',
          required: false,
          include: [{ model: User, as: 'Owner', attributes: ['id', 'displayName', 'email', 'role'] }]
        }
      ],
      transaction: t
    });

    if (!task) throw new Error('Task not found');

    const step = (task.TaskSteps || []).find((candidate) => Number(candidate.id) === Number(stepId));
    if (!step) throw new Error('Task step not found');
    assertCanMutateTaskStep({ task, step, userId, userRole, action: 'generate a draft for this workflow step' });

    if (!force && step.suggestedReplyBody && step.suggestedReplyBody.length > 5) {
      await t.commit();
      return step;
    }

    const channel = getStepSuggestionChannel(step, task);
    const target = resolveStepSuggestionTarget({ step, task, channel });
    const subject = channel === 'email'
      ? (target.subject || `Update: ${step.title}`)
      : null;
    const AiService = require('./ai');
    const prompt = buildStepSuggestionPrompt({ task, step, channel });

    let generatedBody = null;
    let generationError = null;
    try {
      generatedBody = await AiService.generate(prompt.trim(), {
        wineryId,
        member: task.Member,
        suggestedChannel: channel
      });
    } catch (err) {
      generationError = err;
      logger.warn('Step AI suggestion generation failed; using fallback draft', {
        taskId,
        stepId,
        error: err.message
      });
    }

    const replyBody = sanitizeTextOrNull(generatedBody)
      || buildFallbackStepSuggestionBody({ task, step, channel })
      || (channel === 'none'
        ? `Review and complete "${step.title}".`
        : 'Thanks for reaching out. The team will follow up shortly.');
    const suggestedAction = buildStepSuggestedAction(step, channel);
    const previous = {
      suggestedChannel: step.suggestedChannel,
      suggestedRecipientEmail: step.suggestedRecipientEmail,
      suggestedReplySubject: step.suggestedReplySubject,
      suggestionStatus: step.suggestionStatus
    };

    step.suggestedReplyBody = replyBody;
    step.suggestedReplySubject = subject;
    step.suggestedChannel = channel;
    step.suggestedAction = suggestedAction;
    step.suggestedRecipientEmail = channel === 'email' ? target.to : null;
    step.suggestedCc = channel === 'email' ? target.cc : null;
    step.suggestionStatus = 'DRAFT';
    step.suggestionGeneratedAt = new Date();
    step.suggestionError = generationError ? `Fallback draft used because AI generation failed: ${generationError.message}` : null;
    step.updatedBy = userId;
    await step.save({ transaction: t });

    await auditService.logTaskAction({
      transaction: t,
      taskId,
      userId,
      actionType: 'STEP_UPDATED',
      details: {
        source: 'STEP_SUGGESTION_GENERATED',
        stepId: step.id,
        title: step.title,
        changes: {
          suggestedChannel: step.suggestedChannel,
          suggestedRecipientEmail: step.suggestedRecipientEmail,
          suggestedReplySubject: step.suggestedReplySubject,
          suggestedAction: step.suggestedAction,
          suggestedReplyBodyPreview: previewText(step.suggestedReplyBody),
          suggestionStatus: step.suggestionStatus,
          suggestionGeneratedAt: step.suggestionGeneratedAt,
          fallbackUsed: Boolean(generationError)
        },
        oldValues: previous
      }
    });

    task.updatedBy = userId;
    await syncTaskWorkflow(task, t);
    await t.commit();

    return TaskStep.findOne({
      where: { id: stepId, taskId },
      include: [{ model: User, as: 'Owner', attributes: ['id', 'displayName', 'email', 'role'] }]
    });
  } catch (err) {
    if (!t.finished) await t.rollback();
    throw err;
  }
}

async function actionTaskStepSuggestion({ taskId, stepId, wineryId, userId, userRole, data = {} }) {
  const t = await Task.sequelize.transaction();

  try {
    const task = await Task.findOne({
      where: { id: taskId, wineryId },
      include: [
        { model: Member },
        { model: User, as: 'Assignee', attributes: ['id', 'displayName', 'email', 'role'] }
      ],
      transaction: t
    });
    if (!task) throw new Error('Task not found');

    const step = await TaskStep.findOne({
      where: { id: stepId, taskId },
      include: [{ model: User, as: 'Owner', attributes: ['id', 'displayName', 'email', 'role'] }],
      transaction: t
    });
    if (!step) throw new Error('Task step not found');
    assertCanMutateTaskStep({ task, step, userId, userRole, action: 'action this workflow step' });

    const setIfDefined = (field) => {
      if (data[field] !== undefined) {
        step[field] = data[field] === '' ? null : data[field];
      }
    };

    setIfDefined('suggestedReplyBody');
    setIfDefined('suggestedReplySubject');
    setIfDefined('suggestedChannel');
    setIfDefined('suggestedAction');
    setIfDefined('suggestedRecipientEmail');
    setIfDefined('suggestedCc');

    const channel = step.suggestedChannel || getStepSuggestionChannel(step, task);
    if (!STEP_SUGGESTION_CHANNELS.has(channel)) {
      const err = new Error('Unsupported suggestion channel.');
      err.statusCode = 400;
      err.code = 'INVALID_SUGGESTION_CHANNEL';
      throw err;
    }

    if (channel === 'voice') {
      const err = new Error('Voice step suggestions can be saved, but direct voice actioning is not supported yet.');
      err.statusCode = 400;
      err.code = 'VOICE_ACTION_UNSUPPORTED';
      throw err;
    }

    const target = resolveStepSuggestionTarget({ step, task, channel, overrides: data });
    const body = sanitizeTextOrNull(step.suggestedReplyBody);
    let providerResult = null;

    if (channel !== 'none') {
      if (!target.to) {
        const err = new Error('A recipient is required before actioning this step suggestion.');
        err.statusCode = 400;
        err.code = 'STEP_SUGGESTION_TARGET_REQUIRED';
        throw err;
      }

      if (!body) {
        const err = new Error('A message body is required before actioning this step suggestion.');
        err.statusCode = 400;
        err.code = 'STEP_SUGGESTION_BODY_REQUIRED';
        throw err;
      }

      const notificationService = require('./notifications/notification.service');
      providerResult = await notificationService.send({
        to: target.to,
        body,
        channel,
        subject: target.subject,
        cc: target.cc || null
      }, {
        wineryId,
        memberId: task.memberId || task.Member?.id || null,
        taskId,
        userId,
        transaction: t
      });
    }

    const now = new Date();
    const shouldComplete = data.completeStep !== false;
    const oldValues = {
      status: step.status,
      waitingOn: step.waitingOn,
      completionNotes: step.completionNotes,
      completedAt: step.completedAt,
      suggestionStatus: step.suggestionStatus
    };

    step.suggestedChannel = channel;
    step.suggestedReplyBody = body;
    step.suggestedReplySubject = target.subject || step.suggestedReplySubject || null;
    step.suggestedRecipientEmail = channel === 'email' ? target.to : step.suggestedRecipientEmail;
    step.suggestedCc = channel === 'email' ? target.cc : step.suggestedCc;
    step.suggestionStatus = channel === 'none' ? 'ACTIONED' : 'SENT';
    step.suggestionError = null;

    if (shouldComplete) {
      step.status = 'COMPLETED';
      step.waitingOn = 'NONE';
      step.blockedReason = null;
      step.completedAt = step.completedAt || now;
      step.completionNotes = sanitizeTextOrNull(data.completionNotes)
        || (channel === 'none'
          ? 'Internal step suggestion actioned.'
          : `Suggested ${channel} response sent to ${target.to}.`);
    }

    step.updatedBy = userId;
    await step.save({ transaction: t });

    await auditService.logTaskAction({
      transaction: t,
      taskId,
      userId,
      actionType: shouldComplete ? 'STEP_COMPLETED' : 'STEP_UPDATED',
      details: {
        source: 'STEP_SUGGESTION_ACTIONED',
        stepId: step.id,
        title: step.title,
        channel,
        target: target.to,
        subject: target.subject,
        cc: target.cc || null,
        provider: providerResult?.provider || null,
        providerStatus: providerResult?.status || null,
        externalId: providerResult?.sid || providerResult?.id || null,
        changes: {
          status: step.status,
          waitingOn: step.waitingOn,
          completionNotes: step.completionNotes,
          completedAt: step.completedAt,
          suggestionStatus: step.suggestionStatus
        },
        oldValues
      }
    });

    task.updatedBy = userId;
    await syncTaskWorkflow(task, t);
    await t.commit();

    const freshStep = await TaskStep.findOne({
      where: { id: stepId, taskId },
      include: [{ model: User, as: 'Owner', attributes: ['id', 'displayName', 'email', 'role'] }]
    });

    return {
      step: freshStep,
      providerResult
    };
  } catch (err) {
    if (!t.finished) await t.rollback();
    throw err;
  }
}

async function deleteTaskStep({ taskId, stepId, wineryId, userId, userRole }) {
  const t = await Task.sequelize.transaction();

  try {
    const task = await Task.findOne({ where: { id: taskId, wineryId } });
    if (!task) throw new Error('Task not found');

    const step = await TaskStep.findOne({ where: { id: stepId, taskId }, transaction: t });
    if (!step) throw new Error('Task step not found');
    assertCanMutateTaskStep({ task, step, userId, userRole, action: 'remove this workflow step' });

    await auditService.logTaskAction({
      transaction: t,
      taskId,
      userId,
      actionType: 'STEP_DELETED',
      details: {
        stepId: step.id,
        title: step.title,
        status: step.status
      }
    });

    await step.destroy({ transaction: t });

    task.updatedBy = userId;
    await syncTaskWorkflow(task, t);
    await t.commit();

    queueSuggestionRefresh(taskId, wineryId);
    return { deleted: true };
  } catch (err) {
    if (!t.finished) await t.rollback();
    throw err;
  }
}

module.exports = {
  createTask,
  updateTask,
  getTasksForWinery,
  getTaskById,
  createTaskStep,
  updateTaskStep,
  reorderTaskSteps,
  generateTaskStepSuggestion,
  actionTaskStepSuggestion,
  deleteTaskStep,
  updateNotePrivacy
};

/**
 * Toggle the isPrivate flag on an existing NOTE_ADDED TaskAction.
 * Only the note author or a manager/admin can toggle.
 */
async function updateNotePrivacy({ taskId, actionId, wineryId, userId, userRole, isPrivate }) {
  const { TaskAction } = require('../models');

  // Verify the task belongs to this winery
  const task = await Task.findOne({ where: { id: taskId, wineryId } });
  if (!task) throw new Error('Task not found');

  const action = await TaskAction.findOne({
    where: { id: actionId, taskId, actionType: 'NOTE_ADDED' }
  });
  if (!action) throw new Error('Task Action not found');

  // Only the author or a manager/admin can toggle privacy
  if (action.userId !== userId && userRole === 'staff') {
    const err = new Error('Only the note author or a manager can change note privacy.');
    err.statusCode = 403;
    err.code = 'FORBIDDEN';
    throw err;
  }

  const details = action.details || {};
  details.isPrivate = isPrivate;
  action.details = details;
  action.changed('details', true); // Force Sequelize to detect JSON change
  await action.save();

  logger.info('Note privacy toggled', { actionId, taskId, isPrivate, userId });
  return action;
}

/**
 * Helper to process text for user mentions
 */
async function processMentions({ text, wineryId, senderId, taskId, transaction }) {
  if (!text || !text.includes('@')) return;

  const users = await User.findAll({
    where: { wineryId },
    attributes: ['id', 'displayName']
  });

  for (const user of users) {
    if (user.id === senderId) continue;
    if (!user.displayName) continue;

    // Case-insensitive match for @DisplayName
    // Assuming simple names for now. If displayName has spaces, we check inclusion.
    const mentionPattern = new RegExp(`@${user.displayName}\\b`, 'i');

    if (mentionPattern.test(text)) {
      await Notification.create({
        userId: user.id,
        type: 'MENTION',
        message: `You were mentioned in a task note`,
        data: { taskId }
      }, { transaction });
    }
  }
}
