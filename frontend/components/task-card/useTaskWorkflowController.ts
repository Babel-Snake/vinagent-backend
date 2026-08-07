'use client';

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import {
  actionTaskStepSuggestion,
  createTaskStep,
  deleteTaskStep,
  generateTaskStepSuggestion,
  getTask,
  reorderTaskSteps,
  updateTaskStep,
  type Staff,
  type Task,
  type TaskStep,
  type TaskStepInput,
} from '../../lib/api';
import { defaultOpenStepId, sortedTaskSteps } from './TaskCardSupport';

interface NewWorkflowStepDraft {
  title: string;
  description: string;
  stepType: string;
  waitingOn: string;
  ownerUserId: number | '';
  dueAt: string;
  insertPosition: string;
}

interface TaskWorkflowControllerOptions {
  task: Task;
  taskSteps: TaskStep[];
  setTaskSteps: Dispatch<SetStateAction<TaskStep[]>>;
  users: Staff[];
  userRole?: string | null;
  currentUserId?: number | null;
  setUpdating: Dispatch<SetStateAction<boolean>>;
  onHistoryChanged: () => Promise<void>;
  onRefresh: () => void;
  onError: (message: string) => void;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error';
}

function defaultSuggestionChannel(step: TaskStep) {
  if (step.suggestedChannel) return step.suggestedChannel;
  return ['CUSTOMER_MESSAGE', 'FOLLOW_UP', 'CUSTOMER_WAIT', 'APPROVAL', 'EXTERNAL'].includes(
    step.stepType
  )
    ? 'email'
    : 'none';
}

export function useTaskWorkflowController({
  task,
  taskSteps,
  setTaskSteps,
  users,
  userRole,
  currentUserId,
  setUpdating,
  onHistoryChanged,
  onRefresh,
  onError,
}: TaskWorkflowControllerOptions) {
  const [openStepId, setOpenStepId] = useState<number | null>(() => defaultOpenStepId(taskSteps));
  const [reorderMode, setReorderMode] = useState(false);
  const [reorderDraft, setReorderDraft] = useState<TaskStep[]>(() => sortedTaskSteps(taskSteps));
  const [draggedStepId, setDraggedStepId] = useState<number | null>(null);
  const [suggestionDrafts, setSuggestionDrafts] = useState<Record<number, Partial<TaskStep>>>({});
  const [activeSuggestionStepId, setActiveSuggestionStepId] = useState<number | null>(null);
  const [newStep, setNewStep] = useState<NewWorkflowStepDraft>(() => ({
    title: '',
    description: '',
    stepType: 'INTERNAL',
    waitingOn: 'STAFF',
    ownerUserId: task.assigneeId || '',
    dueAt: '',
    insertPosition: 'end',
  }));
  const [isAddStepOpen, setIsAddStepOpen] = useState(false);
  const orderedSteps = useMemo(() => sortedTaskSteps(taskSteps), [taskSteps]);
  const canReorderSteps = userRole === 'manager' || userRole === 'admin';
  const canOverrideStepOwnership = userRole === 'manager' || userRole === 'admin';
  const assigneeName =
    task.Assignee?.displayName ||
    users.find((user) => user.id === task.assigneeId)?.displayName ||
    'Unassigned';

  useEffect(() => {
    setReorderDraft(sortedTaskSteps(task.TaskSteps || []));
    setOpenStepId(defaultOpenStepId(task.TaskSteps || []));
    setSuggestionDrafts({});
    setNewStep((previous) => ({ ...previous, ownerUserId: task.assigneeId || '' }));
    setIsAddStepOpen(false);
  }, [task]);

  function stepOwnerName(step: TaskStep) {
    return (
      step.Owner?.displayName ||
      users.find((user) => user.id === step.ownerUserId)?.displayName ||
      'assigned staff member'
    );
  }

  function getStepLockReason(step?: TaskStep | null) {
    if (!step || canOverrideStepOwnership) return '';
    if (step.ownerUserId && Number(step.ownerUserId) !== Number(currentUserId)) {
      return `Assigned to ${stepOwnerName(step)}.`;
    }
    if (!step.ownerUserId && task.assigneeId && Number(task.assigneeId) !== Number(currentUserId)) {
      return `Task assigned to ${assigneeName}.`;
    }
    return '';
  }

  function getCreateStepLockReason() {
    if (canOverrideStepOwnership) return '';
    if (task.assigneeId && Number(task.assigneeId) !== Number(currentUserId)) {
      return `Task assigned to ${assigneeName}.`;
    }
    return '';
  }

  function getSuggestionDraft(step: TaskStep): Partial<TaskStep> {
    return {
      suggestedAction: step.suggestedAction || '',
      suggestedChannel: defaultSuggestionChannel(step),
      suggestedRecipientEmail:
        step.suggestedRecipientEmail ||
        task.suggestedRecipientEmail ||
        task.Member?.email ||
        task.payload?.manualIntake?.requesterEmail ||
        '',
      suggestedCc: step.suggestedCc || task.suggestedCc || '',
      suggestedReplySubject:
        step.suggestedReplySubject || task.suggestedReplySubject || `Update: ${step.title}`,
      suggestedReplyBody: step.suggestedReplyBody || '',
      ...(suggestionDrafts[step.id] || {}),
    };
  }

  function updateSuggestionDraft(stepId: number, updates: Partial<TaskStep>) {
    setSuggestionDrafts((previous) => ({
      ...previous,
      [stepId]: { ...(previous[stepId] || {}), ...updates },
    }));
  }

  async function updateStep(stepId: number, updates: Partial<TaskStepInput>) {
    const step = taskSteps.find((item) => item.id === stepId);
    const lockReason = getStepLockReason(step);
    if (lockReason) {
      onError(`You cannot update this workflow step. ${lockReason}`);
      return;
    }

    setUpdating(true);
    try {
      await updateTaskStep(task.id, stepId, updates);
      await onHistoryChanged();
      onRefresh();
    } catch (error: unknown) {
      onError('Failed to update step: ' + errorMessage(error));
    } finally {
      setUpdating(false);
    }
  }

  async function generateSuggestion(stepId: number) {
    const step = taskSteps.find((item) => item.id === stepId);
    const lockReason = getStepLockReason(step);
    if (lockReason) {
      onError(`You cannot generate a draft for this workflow step. ${lockReason}`);
      return;
    }

    setUpdating(true);
    setActiveSuggestionStepId(stepId);
    setOpenStepId(stepId);
    try {
      const generatedStep = await generateTaskStepSuggestion(task.id, stepId, true);
      setTaskSteps((previous) =>
        previous.map((item) => (item.id === stepId ? generatedStep : item))
      );
      setSuggestionDrafts((previous) => ({
        ...previous,
        [stepId]: {
          suggestedAction: generatedStep.suggestedAction || '',
          suggestedChannel:
            generatedStep.suggestedChannel || defaultSuggestionChannel(generatedStep),
          suggestedRecipientEmail: generatedStep.suggestedRecipientEmail || '',
          suggestedCc: generatedStep.suggestedCc || '',
          suggestedReplySubject: generatedStep.suggestedReplySubject || '',
          suggestedReplyBody: generatedStep.suggestedReplyBody || '',
        },
      }));
      await onHistoryChanged();
      onRefresh();
    } catch (error: unknown) {
      onError('Failed to generate step suggestion: ' + errorMessage(error));
    } finally {
      setActiveSuggestionStepId(null);
      setUpdating(false);
    }
  }

  async function saveSuggestion(step: TaskStep) {
    const lockReason = getStepLockReason(step);
    if (lockReason) {
      onError(`You cannot save a draft for this workflow step. ${lockReason}`);
      return;
    }

    const draft = getSuggestionDraft(step);
    setUpdating(true);
    setActiveSuggestionStepId(step.id);
    try {
      const savedStep = await updateTaskStep(task.id, step.id, {
        suggestedAction: draft.suggestedAction || null,
        suggestedChannel: draft.suggestedChannel || null,
        suggestedRecipientEmail: draft.suggestedRecipientEmail || null,
        suggestedCc: draft.suggestedCc || null,
        suggestedReplySubject: draft.suggestedReplySubject || null,
        suggestedReplyBody: draft.suggestedReplyBody || null,
        suggestionStatus: 'SAVED',
      });
      setTaskSteps((previous) => previous.map((item) => (item.id === step.id ? savedStep : item)));
      setSuggestionDrafts((previous) => {
        const next = { ...previous };
        delete next[step.id];
        return next;
      });
      await onHistoryChanged();
      onRefresh();
    } catch (error: unknown) {
      onError('Failed to save step suggestion: ' + errorMessage(error));
    } finally {
      setActiveSuggestionStepId(null);
      setUpdating(false);
    }
  }

  async function actionSuggestion(step: TaskStep) {
    const lockReason = getStepLockReason(step);
    if (lockReason) {
      onError(`You cannot action this workflow step. ${lockReason}`);
      return;
    }

    const draft = getSuggestionDraft(step);
    setUpdating(true);
    setActiveSuggestionStepId(step.id);
    try {
      const result = await actionTaskStepSuggestion(task.id, step.id, {
        suggestedAction: draft.suggestedAction || null,
        suggestedChannel: draft.suggestedChannel || null,
        suggestedRecipientEmail: draft.suggestedRecipientEmail || null,
        suggestedCc: draft.suggestedCc || null,
        suggestedReplySubject: draft.suggestedReplySubject || null,
        suggestedReplyBody: draft.suggestedReplyBody || null,
        completeStep: true,
      });
      setTaskSteps((previous) =>
        previous.map((item) => (item.id === step.id ? result.step : item))
      );
      setSuggestionDrafts((previous) => {
        const next = { ...previous };
        delete next[step.id];
        return next;
      });
      await onHistoryChanged();
      onRefresh();
    } catch (error: unknown) {
      onError('Failed to action step suggestion: ' + errorMessage(error));
    } finally {
      setActiveSuggestionStepId(null);
      setUpdating(false);
    }
  }

  async function createStep() {
    if (!newStep.title.trim()) return;
    const lockReason = getCreateStepLockReason();
    if (lockReason) {
      onError(`You cannot add workflow steps to this task. ${lockReason}`);
      return;
    }

    setUpdating(true);
    try {
      const sortOrder =
        newStep.insertPosition === 'end'
          ? orderedSteps.length
          : Math.max(0, Math.min(Number(newStep.insertPosition) || 0, orderedSteps.length));
      const createdStep = await createTaskStep(task.id, {
        title: newStep.title.trim(),
        description: newStep.description.trim() || null,
        stepType: newStep.stepType,
        waitingOn: newStep.waitingOn,
        ownerUserId: newStep.ownerUserId === '' ? null : newStep.ownerUserId,
        dueAt: newStep.dueAt ? new Date(newStep.dueAt).toISOString() : null,
        sortOrder,
      });
      const refreshedTask = await getTask(task.id);
      setTaskSteps(refreshedTask.TaskSteps || []);
      setOpenStepId(createdStep.id);
      setNewStep((previous) => ({
        ...previous,
        title: '',
        description: '',
        stepType: 'INTERNAL',
        waitingOn: 'STAFF',
        dueAt: '',
        insertPosition: 'end',
      }));
      setIsAddStepOpen(false);
      await onHistoryChanged();
      onRefresh();
    } catch (error: unknown) {
      onError('Failed to add step: ' + errorMessage(error));
    } finally {
      setUpdating(false);
    }
  }

  async function deleteStep(stepId: number) {
    const step = taskSteps.find((item) => item.id === stepId);
    const lockReason = getStepLockReason(step);
    if (lockReason) {
      onError(`You cannot remove this workflow step. ${lockReason}`);
      return;
    }

    setUpdating(true);
    try {
      await deleteTaskStep(task.id, stepId);
      await onHistoryChanged();
      onRefresh();
    } catch (error: unknown) {
      onError('Failed to delete step: ' + errorMessage(error));
    } finally {
      setUpdating(false);
    }
  }

  function beginReorder() {
    setReorderDraft(orderedSteps);
    setOpenStepId(null);
    setReorderMode(true);
  }

  function cancelReorder() {
    setReorderDraft(orderedSteps);
    setDraggedStepId(null);
    setReorderMode(false);
  }

  function moveReorderStep(fromIndex: number, toIndex: number) {
    setReorderDraft((previous) => {
      if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= previous.length) return previous;
      const nextIndex = Math.max(0, Math.min(toIndex, previous.length - 1));
      const next = [...previous];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(nextIndex, 0, moved);
      return next;
    });
  }

  async function saveReorder() {
    setUpdating(true);
    try {
      const reorderedSteps = await reorderTaskSteps(
        task.id,
        reorderDraft.map((step) => step.id)
      );
      setTaskSteps(reorderedSteps);
      setReorderDraft(sortedTaskSteps(reorderedSteps));
      setDraggedStepId(null);
      setReorderMode(false);
      await onHistoryChanged();
      onRefresh();
    } catch (error: unknown) {
      onError('Failed to reorder steps: ' + errorMessage(error));
    } finally {
      setUpdating(false);
    }
  }

  return {
    orderedSteps,
    openStepId,
    toggleStep: (stepId: number) =>
      setOpenStepId((previous) => (previous === stepId ? null : stepId)),
    canReorderSteps,
    canOverrideStepOwnership,
    reorderMode,
    reorderDraft,
    draggedStepId,
    setDraggedStepId,
    activeSuggestionStepId,
    isAddStepOpen,
    toggleAddStep: () => setIsAddStepOpen((previous) => !previous),
    createStepLockReason: getCreateStepLockReason(),
    newStep,
    updateNewStep: (updates: Partial<NewWorkflowStepDraft>) =>
      setNewStep((previous) => ({ ...previous, ...updates })),
    getStepLockReason,
    getSuggestionDraft,
    updateStep,
    deleteStep,
    updateSuggestionDraft,
    generateSuggestion,
    saveSuggestion,
    actionSuggestion,
    beginReorder,
    cancelReorder,
    saveReorder,
    moveReorderStep,
    createStep,
  };
}
