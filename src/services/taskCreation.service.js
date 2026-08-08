const { Op } = require('sequelize');
const { CalendarEvent, CalendarEventTask, Message, Task, User, WinerySettings } = require('../models');
const logger = require('../config/logger');
const auditService = require('./audit.service');
const customerIdentityService = require('./customerIdentity.service');
const operationalAreaService = require('./operationalArea.service');
const taskDeadlineService = require('./taskDeadline.service');
const {
  findManagerUserId,
  notifyManagerAssignmentReview,
  notifyTaskAssignee
} = require('./taskAssignment.service');
const { replaceTaskAreas } = require('./taskArea.service');
const { processMentions } = require('./taskMention.service');
const {
  STAFF_ASSIGNMENT_REVIEW_REASON,
  STAFF_ASSIGNMENT_TARGET_ROLE
} = require('./taskWorkflowPolicy.service');
const { createTaskSteps, syncTaskWorkflow } = require('./taskWorkflow.service');
const { assertTaskRelationshipsBelongToWinery } = require('./taskTenantScope.service');
const { safeRecordUsageEvent } = require('./usageTracking.service');
const { METRICS } = require('./usageMetricCatalog');

async function determineAutoAssignee(wineryId, data) {
  if (data.sentiment === 'NEGATIVE') {
    const manager = await User.findOne({ where: { wineryId, role: 'manager' } });
    if (manager) return manager.id;
  }

  if (data.category === 'OPERATIONS' || data.category === 'INTERNAL') {
    const manager = await User.findOne({ where: { wineryId, role: 'manager' } });
    if (manager) return manager.id;
  }

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

async function createTask({
  wineryId,
  userId,
  userRole = null,
  data,
  source = 'manual',
  transaction = null,
  allowCrossUserAssignment = false,
  allowCrossAreaPlacement = false,
  recordCreatedByUserId = null
}) {
  const ownTransaction = !transaction;
  const activeTransaction = transaction || await Task.sequelize.transaction();

  try {
    const {
      category, subType, customerType, type, memberId, messageId,
      payload, priority, notes, sentiment, assigneeId, parentTaskId,
      initialNote, suggestedReplyBody, suggestedChannel, suggestedReplySubject,
      suggestedAction, suggestedRecipientEmail, suggestedCc, dueAt,
      resolutionSummary, steps = [], taskOrigin, inboundMethod,
      requesterName, requesterEmail, requesterPhone, calendarEventIds = []
    } = data;
    const requestedAssigneeId = assigneeId || null;
    const requestedSteps = Array.isArray(steps) ? steps : [];
    await assertTaskRelationshipsBelongToWinery({
      wineryId,
      memberId: data.identityResolution?.memberId || memberId || null,
      assigneeId: requestedAssigneeId,
      parentTaskId,
      steps: requestedSteps,
      transaction: activeTransaction
    });
    const areaPlacement = await operationalAreaService.validateAreaPlacement({
      wineryId,
      userId,
      userRole,
      areaScope: data.areaScope,
      primaryAreaId: data.primaryAreaId,
      linkedAreaIds: data.linkedAreaIds || [],
      requireAccess: userRole === 'staff' && !allowCrossAreaPlacement,
      transaction: activeTransaction
    });
    const { managedAreaIds } = userRole === 'staff'
      ? await operationalAreaService.getUserAreaAccess({
        userId,
        wineryId,
        transaction: activeTransaction
      })
      : { managedAreaIds: [] };
    const isAreaManagerCreator = areaPlacement.areaScope === 'AREAS'
      && areaPlacement.areaIds.length > 0
      && areaPlacement.areaIds.every(areaId => managedAreaIds.includes(areaId));
    const isStaffCreator = userRole === 'staff' && !isAreaManagerCreator && !allowCrossUserAssignment;
    const persistedCreatorId = recordCreatedByUserId || userId;

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

    const settings = await WinerySettings.findOne({ where: { wineryId }, transaction: activeTransaction });
    const identityConfig = customerIdentityService.getIdentityMatchingConfig(settings);
    let linkedMessage = null;
    if (messageId) {
      linkedMessage = await Message.findOne({
        where: { id: messageId, wineryId },
        transaction: activeTransaction
      });
      if (!linkedMessage) {
        const err = new Error('Message not found');
        err.statusCode = 404;
        err.code = 'NOT_FOUND';
        throw err;
      }
    }

    const resolvedTaskOrigin = taskOrigin
      || (category === 'INTERNAL' || category === 'SYSTEM' ? 'INTERNAL' : 'EXTERNAL');
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
        transaction: activeTransaction,
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
      ? await findManagerUserId(wineryId, activeTransaction)
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

    const task = await Task.create({
      wineryId,
      category: category || 'INTERNAL',
      subType: subType || 'INTERNAL_TASK',
      customerType: resolvedCustomerType,
      type: subType || type || 'INTERNAL_TASK',
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
      createdBy: persistedCreatorId,
      updatedBy: persistedCreatorId,
      assigneeId: finalAssigneeId,
      parentTaskId: parentTaskId || null,
      areaScope: areaPlacement.areaScope
    }, { transaction: activeTransaction });

    await safeRecordUsageEvent({
      wineryId,
      actorUserId: persistedCreatorId,
      metricKey: METRICS.TASK_CREATED,
      quantity: 1,
      occurredAt: task.createdAt || new Date(),
      sourceType: 'task',
      sourceId: task.id,
      idempotencyKey: `task:${task.id}:created`,
      dimensions: {
        source,
        category: task.category,
        automation: 'false'
      },
      transaction: activeTransaction
    });

    await replaceTaskAreas({
      taskId: task.id,
      wineryId,
      placement: areaPlacement,
      transaction: activeTransaction
    });

    if (linkedMessage) {
      const messageUpdates = { taskId: task.id };
      if (resolvedMemberId && linkedMessage.memberId !== resolvedMemberId) {
        messageUpdates.memberId = resolvedMemberId;
      }
      await linkedMessage.update(messageUpdates, { transaction: activeTransaction });
    }

    await auditService.logTaskAction({
      transaction: activeTransaction,
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
        transaction: activeTransaction,
        taskId: task.id,
        userId,
        actionType: 'ASSIGNED',
        details: { from: null, to: finalAssigneeId }
      });

      await notifyTaskAssignee({
        assigneeId: finalAssigneeId,
        task,
        assignedByUserId: userId,
        transaction: activeTransaction
      });
    }

    if (parentTaskId) {
      await auditService.logTaskAction({
        transaction: activeTransaction,
        taskId: task.id,
        userId,
        actionType: 'LINKED_TASK',
        details: {
          parentTaskId,
          childTaskId: task.id
        }
      });
    }

    let createdWorkflowSteps = [];
    if (workflowSteps.length > 0) {
      createdWorkflowSteps = await createTaskSteps({
        taskId: task.id,
        steps: workflowSteps,
        fallbackOwnerUserId: finalAssigneeId,
        userId,
        transaction: activeTransaction
      });
    }

    if (requiresManagerAssignmentReview && managerReviewOwnerId) {
      await notifyManagerAssignmentReview({
        managerUserId: managerReviewOwnerId,
        task,
        step: createdWorkflowSteps[0],
        createdByUserId: userId,
        transaction: activeTransaction
      });
    }

    await linkTaskToCalendarEvents({
      taskId: task.id,
      calendarEventIds,
      wineryId,
      userId,
      transaction: activeTransaction
    });

    if (initialNote && initialNote.trim()) {
      await auditService.logTaskAction({
        transaction: activeTransaction,
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
        transaction: activeTransaction
      });
    }

    await syncTaskWorkflow(task, activeTransaction);

    if (ownTransaction) {
      await activeTransaction.commit();
    }
    logger.info('Task created', { taskId: task.id, userId, wineryId, source });

    return taskDeadlineService.attachDeadlineState(task);
  } catch (err) {
    if (ownTransaction && !activeTransaction.finished) await activeTransaction.rollback();
    throw err;
  }
}

module.exports = {
  createTask
};
