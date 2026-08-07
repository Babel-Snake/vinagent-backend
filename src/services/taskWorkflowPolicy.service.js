const {
  getDefaultTaskOutcome,
  clearTaskOutcomeFields,
  pickTaskOutcomeSnapshot
} = require('../utils/taskOutcome');

const CLOSED_TASK_STATUSES = new Set(['ACTIONED', 'REJECTED']);
const STAFF_ASSIGNMENT_REVIEW_REASON = 'STAFF_CREATED_UNASSIGNED';
const STAFF_ASSIGNMENT_TARGET_ROLE = 'staff';
const STEP_SUGGESTION_CHANNELS = new Set(['sms', 'email', 'voice', 'none']);

function isPrivilegedTaskRole(userRole) {
  return ['manager', 'admin'].includes(userRole);
}

function createStepPermissionError(message, code = 'STEP_ACTION_FORBIDDEN') {
  const err = new Error(message);
  err.statusCode = 403;
  err.code = code;
  return err;
}

function assertCanMutateTaskStep({ task, step = null, userId, userRole, managerOverride = false, action = 'update this workflow step' }) {
  if (isPrivilegedTaskRole(userRole) || managerOverride) return;
  if (!userId) throw createStepPermissionError(`You do not have permission to ${action}.`);
  if (step?.ownerUserId && Number(step.ownerUserId) !== Number(userId)) {
    throw createStepPermissionError('This workflow step is assigned to another staff member.');
  }
  if (!step?.ownerUserId && task?.assigneeId && Number(task.assigneeId) !== Number(userId)) {
    throw createStepPermissionError('This task is assigned to another staff member.');
  }
}

function appendMemberNote(existingNotes, newLine) {
  if (!newLine) return existingNotes || null;
  if (existingNotes && existingNotes.includes(newLine)) return existingNotes;
  return existingNotes ? `${existingNotes}\n${newLine}` : newLine;
}

function parseStepMetadata(step) {
  const metadata = step?.metadata;
  if (!metadata) return {};
  if (typeof metadata === 'object' && !Array.isArray(metadata)) return metadata;
  if (typeof metadata !== 'string') return {};
  try {
    const parsed = JSON.parse(metadata);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isStaffAssignmentReviewStep(step) {
  return parseStepMetadata(step).reason === STAFF_ASSIGNMENT_REVIEW_REASON;
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
  return trimmed || null;
}

function sanitizeDateOrNull(value) {
  if (value === undefined) return undefined;
  return value ? new Date(value) : null;
}

function previewText(value, maxLength = 180) {
  if (!value) return null;
  const compact = String(value).replace(/\s+/g, ' ').trim();
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 3)}...` : compact;
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
    const followUpRequired = updates.followUpRequired !== undefined ? Boolean(updates.followUpRequired) : Boolean(task.followUpRequired);
    task.resolvedAs = updates.resolvedAs !== undefined ? (updates.resolvedAs || defaults.resolvedAs) : (task.resolvedAs || defaults.resolvedAs);
    task.resolutionType = updates.resolutionType !== undefined ? (updates.resolutionType || defaults.resolutionType) : (task.resolutionType || defaults.resolutionType);
    task.customerOutcome = updates.customerOutcome !== undefined ? (updates.customerOutcome || defaults.customerOutcome) : (task.customerOutcome || defaults.customerOutcome);
    task.resolutionSummary = updates.resolutionSummary !== undefined ? sanitizeTextOrNull(updates.resolutionSummary) : sanitizeTextOrNull(task.resolutionSummary);
    task.followUpRequired = followUpRequired;
    task.followUpDueAt = followUpRequired ? (updates.followUpDueAt !== undefined ? sanitizeDateOrNull(updates.followUpDueAt) : (task.followUpDueAt || null)) : null;
    task.followUpSummary = followUpRequired ? (updates.followUpSummary !== undefined ? sanitizeTextOrNull(updates.followUpSummary) : sanitizeTextOrNull(task.followUpSummary)) : null;
    task.resolvedAt = task.resolvedAt || new Date();
  }
  return diffOutcomeSnapshots(before, pickTaskOutcomeSnapshot(task));
}

module.exports = {
  STAFF_ASSIGNMENT_REVIEW_REASON,
  STAFF_ASSIGNMENT_TARGET_ROLE,
  STEP_SUGGESTION_CHANNELS,
  appendMemberNote,
  applyTaskOutcomeUpdates,
  assertCanMutateTaskStep,
  diffOutcomeSnapshots,
  isStaffAssignmentReviewStep,
  normalizeTaskStepInput,
  previewText,
  sanitizeTextOrNull
};
