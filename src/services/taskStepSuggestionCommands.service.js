const { Member, Message, Task, TaskStep, User } = require('../models');
const logger = require('../config/logger');
const auditService = require('./audit.service');
const recordVisibility = require('./recordVisibility.service');
const {
  buildFallbackStepSuggestionBody,
  buildStepSuggestedAction,
  buildStepSuggestionPrompt,
  getStepSuggestionChannel,
  resolveStepSuggestionTarget
} = require('./taskStepSuggestion.service');
const {
  STEP_SUGGESTION_CHANNELS,
  assertCanMutateTaskStep,
  previewText,
  sanitizeTextOrNull
} = require('./taskWorkflowPolicy.service');
const { syncTaskWorkflow } = require('./taskWorkflow.service');

async function generateTaskStepSuggestion({ taskId, stepId, wineryId, userId, userRole, options = {} }) {
  const { force = true } = options;
  const transaction = await Task.sequelize.transaction();

  try {
    const task = await Task.findOne({
      where: { id: taskId, wineryId },
      include: [
        { model: Member, where: { wineryId }, required: false },
        { model: User, as: 'Assignee', where: { wineryId }, attributes: ['id', 'displayName', 'email', 'role'], required: false },
        {
          model: Message,
          as: 'Messages',
          where: { wineryId },
          required: false,
          separate: true,
          order: [['receivedAt', 'ASC'], ['id', 'ASC']],
          limit: 20
        },
        {
          model: TaskStep,
          as: 'TaskSteps',
          required: false,
          include: [{ model: User, as: 'Owner', where: { wineryId }, attributes: ['id', 'displayName', 'email', 'role'], required: false }]
        }
      ],
      transaction
    });

    if (!task) throw new Error('Task not found');
    const managerOverride = await recordVisibility.canManageTask(task, {
      wineryId,
      userId,
      userRole,
      transaction
    });
    await recordVisibility.assertCanMutateTask(task, { wineryId, userId, userRole });

    const step = (task.TaskSteps || []).find(candidate => Number(candidate.id) === Number(stepId));
    if (!step) throw new Error('Task step not found');
    assertCanMutateTaskStep({
      task,
      step,
      userId,
      userRole,
      managerOverride,
      action: 'generate a draft for this workflow step'
    });

    if (!force && step.suggestedReplyBody && step.suggestedReplyBody.length > 5) {
      await transaction.commit();
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
    step.suggestionError = generationError
      ? `Fallback draft used because AI generation failed: ${generationError.message}`
      : null;
    step.updatedBy = userId;
    await step.save({ transaction });

    await auditService.logTaskAction({
      transaction,
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
    await syncTaskWorkflow(task, transaction);
    await transaction.commit();

    return TaskStep.findOne({
      where: { id: stepId, taskId },
      include: [{ model: User, as: 'Owner', where: { wineryId }, attributes: ['id', 'displayName', 'email', 'role'], required: false }]
    });
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    throw err;
  }
}

async function actionTaskStepSuggestion({ taskId, stepId, wineryId, userId, userRole, data = {} }) {
  const transaction = await Task.sequelize.transaction();

  try {
    const task = await Task.findOne({
      where: { id: taskId, wineryId },
      include: [
        { model: Member, where: { wineryId }, required: false },
        { model: User, as: 'Assignee', where: { wineryId }, attributes: ['id', 'displayName', 'email', 'role'], required: false }
      ],
      transaction
    });
    if (!task) throw new Error('Task not found');
    const managerOverride = await recordVisibility.canManageTask(task, {
      wineryId,
      userId,
      userRole,
      transaction
    });
    await recordVisibility.assertCanMutateTask(task, { wineryId, userId, userRole });

    const step = await TaskStep.findOne({
      where: { id: stepId, taskId },
      include: [{ model: User, as: 'Owner', where: { wineryId }, attributes: ['id', 'displayName', 'email', 'role'], required: false }],
      transaction
    });
    if (!step) throw new Error('Task step not found');
    assertCanMutateTaskStep({
      task,
      step,
      userId,
      userRole,
      managerOverride,
      action: 'action this workflow step'
    });

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
        transaction
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
    await step.save({ transaction });

    await auditService.logTaskAction({
      transaction,
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
    await syncTaskWorkflow(task, transaction);
    await transaction.commit();

    const freshStep = await TaskStep.findOne({
      where: { id: stepId, taskId },
      include: [{ model: User, as: 'Owner', where: { wineryId }, attributes: ['id', 'displayName', 'email', 'role'], required: false }]
    });

    return {
      step: freshStep,
      providerResult
    };
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    throw err;
  }
}

module.exports = {
  actionTaskStepSuggestion,
  generateTaskStepSuggestion
};
