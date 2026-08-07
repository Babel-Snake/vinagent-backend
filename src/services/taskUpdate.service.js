const { Member, Task, TaskArea, WinerySettings } = require('../models');
const logger = require('../config/logger');
const { validateStatusTransition } = require('../utils/validation');
const aiSuggestionService = require('./aiSuggestion.service');
const auditService = require('./audit.service');
const executionService = require('./execution.service');
const operationalAreaService = require('./operationalArea.service');
const recordVisibility = require('./recordVisibility.service');
const taskDeadlineService = require('./taskDeadline.service');
const {
  completeStaffAssignmentReview,
  notifyTaskAssignee,
  removeStaleAssignmentNotifications,
  removeTaskNotifications,
  validateTaskAssignmentTarget
} = require('./taskAssignment.service');
const { getTaskAreaInclude, replaceTaskAreas } = require('./taskArea.service');
const { syncFollowUpAutomation } = require('./taskFollowUpAutomation.service');
const { enrichMemberFromTaskOutcome } = require('./taskMemberEnrichment.service');
const { processMentions } = require('./taskMention.service');
const { queueSuggestionRefresh } = require('./taskSuggestionRefresh.service');
const { applyTaskOutcomeUpdates } = require('./taskWorkflowPolicy.service');
const { syncTaskWorkflow } = require('./taskWorkflow.service');

async function updateTask({ taskId, wineryId, userId, userRole, updates }) {
  const transaction = await Task.sequelize.transaction();
  let noteAdded = false;
  let regenerateRequested = false;

  try {
    const task = await Task.findOne({
      where: { id: taskId, wineryId },
      include: [getTaskAreaInclude()],
      transaction
    });
    if (!task) throw new Error('Task not found');
    await recordVisibility.assertCanMutateTask(task, { wineryId, userId, userRole, transaction });
    const canManageThisTask = await recordVisibility.canManageTask(task, {
      wineryId,
      userId,
      userRole,
      transaction
    });

    const {
      status, payload, priority, notes, suggestedReplyBody,
      category, subType, sentiment, assigneeId, parentTaskId,
      suggestedChannel, suggestedReplySubject, suggestedAction,
      suggestedRecipientEmail, suggestedCc, regenerateSuggestedReply,
      isPrivateNote, dueAt, resolutionSummary, memberId,
      resolvedAs, resolutionType, customerOutcome,
      followUpRequired, followUpDueAt, followUpSummary,
      areaScope, primaryAreaId, linkedAreaIds
    } = updates;

    let areaPlacement = null;
    if (areaScope !== undefined || primaryAreaId !== undefined || linkedAreaIds !== undefined) {
      const currentLinks = await TaskArea.findAll({ where: { taskId: task.id, wineryId }, transaction });
      const currentPrimary = currentLinks.find(link => link.relationshipType === 'PRIMARY');
      areaPlacement = await operationalAreaService.validateAreaPlacement({
        wineryId,
        userId,
        userRole,
        areaScope: areaScope || task.areaScope,
        primaryAreaId: primaryAreaId !== undefined ? primaryAreaId : currentPrimary?.areaId || null,
        linkedAreaIds: linkedAreaIds !== undefined
          ? linkedAreaIds
          : currentLinks.filter(link => link.relationshipType !== 'PRIMARY').map(link => link.areaId),
        requireManage: true,
        transaction
      });
    }

    if (status && status !== task.status) {
      if (!validateStatusTransition(task.status, status)) {
        const err = new Error(`Invalid status transition: ${task.status} -> ${status}`);
        err.statusCode = 400;
        err.code = 'INVALID_STATUS_TRANSITION';
        throw err;
      }
    }

    if (status === 'REJECTED' && status !== task.status && !canManageThisTask) {
      const err = new Error('Staff cannot reject tasks.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    if (updates.assigneeId !== undefined && updates.assigneeId !== task.assigneeId && !canManageThisTask) {
      const err = new Error('Staff cannot reassign tasks.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
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
    const setField = (field, value) => {
      if (value !== undefined && value !== task[field]) {
        changes[field] = value;
        oldValues[field] = task[field];
        task[field] = value;
      }
    };

    setField('status', status);
    setField('priority', priority);
    setField('category', category);
    setField('subType', subType);
    setField('sentiment', sentiment);
    if (memberId !== undefined) {
      if (memberId !== null) {
        const member = await Member.findOne({
          where: { id: memberId, wineryId },
          transaction
        });
        if (!member) {
          const err = new Error('Member not found');
          err.statusCode = 404;
          err.code = 'NOT_FOUND';
          throw err;
        }
      }
      setField('memberId', memberId);
      const nextCustomerType = memberId
        ? 'MEMBER'
        : task.payload?.manualIntake?.taskOrigin === 'EXTERNAL' ? 'VISITOR' : 'UNKNOWN';
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
    const nextSuggestedChannel = inferredSuggestedChannel !== undefined
      ? inferredSuggestedChannel
      : task.suggestedChannel;
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
    if (areaPlacement) {
      setField('areaScope', areaPlacement.areaScope);
      changes.areaIds = areaPlacement.areaIds;
    }

    if (parentTaskId !== undefined && parentTaskId !== task.parentTaskId) {
      setField('parentTaskId', parentTaskId);
      await auditService.logTaskAction({
        transaction,
        taskId: task.id,
        userId,
        actionType: 'LINKED_TASK',
        details: { parentTaskId, childTaskId: task.id }
      });
    }

    if (assigneeId !== undefined && assigneeId !== task.assigneeId) {
      const assignmentTarget = await validateTaskAssignmentTarget({
        taskId: task.id,
        wineryId,
        assigneeId,
        transaction
      });
      const oldAssignee = task.assigneeId;
      setField('assigneeId', assigneeId);
      await auditService.logTaskAction({
        transaction,
        taskId: task.id,
        userId,
        actionType: 'ASSIGNED',
        details: { from: oldAssignee, to: assigneeId }
      });

      await removeStaleAssignmentNotifications({
        userId: oldAssignee,
        taskId: task.id,
        transaction
      });
      await notifyTaskAssignee({
        assigneeId,
        task,
        assignedByUserId: userId,
        transaction
      });
      await completeStaffAssignmentReview({
        taskId: task.id,
        assignee: assignmentTarget.assignee,
        reviewSteps: assignmentTarget.staffReviewSteps,
        userId,
        transaction
      });
    }

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

    if (areaPlacement) {
      await replaceTaskAreas({ taskId: task.id, wineryId, placement: areaPlacement, transaction });
    }

    task.updatedBy = userId;
    await task.save({ transaction });

    if (Object.keys(changes).length > 0) {
      let actionType = 'MANUAL_UPDATE';
      if (changes.status === 'ACTIONED') actionType = 'ACTIONED';
      if (changes.status === 'REJECTED') actionType = 'REJECTED';

      await auditService.logTaskAction({
        transaction,
        taskId: task.id,
        userId,
        actionType,
        details: { changes, oldValues }
      });
    }

    if (changes.status === 'ACTIONED' || changes.status === 'REJECTED') {
      await removeTaskNotifications({ taskId: task.id, transaction });
    }

    if (notes) {
      const details = { note: notes };
      if (isPrivateNote) details.isPrivate = true;

      await auditService.logTaskAction({
        transaction,
        taskId: task.id,
        userId,
        actionType: 'NOTE_ADDED',
        details
      });
      noteAdded = true;

      await processMentions({
        text: notes,
        wineryId,
        senderId: userId,
        taskId: task.id,
        transaction
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
        await task.save({ transaction });

        await auditService.logTaskAction({
          transaction,
          taskId: task.id,
          userId,
          actionType: 'OUTCOME_RECORDED',
          details: outcomeDiff
        });
      }
    }

    if (changes.status === 'ACTIONED') {
      try {
        const settings = await WinerySettings.findOne({ where: { wineryId } });
        await executionService.executeTask(task, transaction, settings);
      } catch (execErr) {
        logger.warn('Execution skipped for task', { taskId, reason: execErr.message });
      }

      const postExecutionOutcomeDiff = applyTaskOutcomeUpdates(task, outcomeInput, task.status);
      if (Object.keys(postExecutionOutcomeDiff.changes).length > 0) {
        task.updatedBy = userId;
        await task.save({ transaction });

        await auditService.logTaskAction({
          transaction,
          taskId: task.id,
          userId,
          actionType: 'OUTCOME_RECORDED',
          details: postExecutionOutcomeDiff
        });
      }

      const memberEnrichment = await enrichMemberFromTaskOutcome(task, transaction);
      if (memberEnrichment && (memberEnrichment.tagsAdded.length > 0 || memberEnrichment.noteAdded)) {
        await auditService.logTaskAction({
          transaction,
          taskId: task.id,
          userId,
          actionType: 'MEMBER_ENRICHED',
          details: memberEnrichment
        });
      }
    }

    await syncFollowUpAutomation(task, userId, transaction);
    await syncTaskWorkflow(task, transaction);

    await transaction.commit();
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
    if (!transaction.finished) await transaction.rollback();
    throw err;
  }
}

module.exports = {
  updateTask
};
