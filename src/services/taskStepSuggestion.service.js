const STEP_SUGGESTION_CHANNELS = new Set(['sms', 'email', 'voice', 'none']);
const CUSTOMER_STEP_TYPES = new Set(['CUSTOMER_MESSAGE', 'FOLLOW_UP', 'CUSTOMER_WAIT']);
const EMAIL_STEP_TYPES = new Set(['CUSTOMER_MESSAGE', 'FOLLOW_UP', 'EXTERNAL', 'APPROVAL']);

function getManualIntake(task) {
  return task?.payload?.manualIntake || {};
}

function getStepSuggestionChannel(step, task) {
  if (step?.suggestedChannel && STEP_SUGGESTION_CHANNELS.has(step.suggestedChannel)) return step.suggestedChannel;
  if (CUSTOMER_STEP_TYPES.has(step?.stepType) && task?.suggestedChannel && STEP_SUGGESTION_CHANNELS.has(task.suggestedChannel)) {
    return task.suggestedChannel;
  }
  if (EMAIL_STEP_TYPES.has(step?.stepType)) return 'email';
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
    return { to: task?.Member?.phone || manualIntake.requesterPhone || null, subject: null, cc: null };
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
  const messageLines = (task.Messages || []).map((message, index) => {
    const timestamp = message.receivedAt || message.createdAt;
    const subject = message.subject ? ` subject="${message.subject}"` : '';
    const body = (message.body || '').replace(/\s+/g, ' ').trim();
    const preview = body.length > 280 ? `${body.slice(0, 277)}...` : body;
    return `${index + 1}. [${message.direction}] ${message.source}${subject} at ${new Date(timestamp).toISOString()} :: ${preview || '[no body]'}`;
  });
  const stepLines = (task.TaskSteps || [])
    .sort((a, b) => a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder : a.id - b.id)
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
  if (channel === 'sms') return `${greeting} thanks for your message. The team is reviewing this and will follow up shortly.`;
  return [
    greeting,
    '',
    'Thanks for your message. The team is reviewing this now and will follow up shortly with the next step.',
    '',
    'Kind regards,',
    'The winery team'
  ].join('\n');
}

module.exports = {
  buildFallbackStepSuggestionBody,
  buildStepSuggestedAction,
  buildStepSuggestionPrompt,
  getStepSuggestionChannel,
  resolveStepSuggestionTarget
};
