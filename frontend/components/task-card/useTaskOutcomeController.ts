'use client';

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { updateTask, type Task } from '../../lib/api';
import { formatDateTimeInput } from './TaskCardSupport';

interface TaskOutcomeControllerOptions {
  task: Task;
  setUpdating: Dispatch<SetStateAction<boolean>>;
  onHistoryChanged: () => Promise<void>;
  onRefresh: () => void;
  onError: (message: string) => void;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error';
}

export function useTaskOutcomeController({
  task,
  setUpdating,
  onHistoryChanged,
  onRefresh,
  onError,
}: TaskOutcomeControllerOptions) {
  const [resolvedAs, setResolvedAs] = useState(task.resolvedAs || '');
  const [resolutionType, setResolutionType] = useState(task.resolutionType || '');
  const [customerOutcome, setCustomerOutcome] = useState(task.customerOutcome || '');
  const [resolutionSummary, setResolutionSummary] = useState(task.resolutionSummary || '');
  const [followUpRequired, setFollowUpRequired] = useState(Boolean(task.followUpRequired));
  const [followUpDueAt, setFollowUpDueAt] = useState(() => formatDateTimeInput(task.followUpDueAt));
  const [followUpSummary, setFollowUpSummary] = useState(task.followUpSummary || '');

  useEffect(() => {
    setResolvedAs(task.resolvedAs || '');
    setResolutionType(task.resolutionType || '');
    setCustomerOutcome(task.customerOutcome || '');
    setResolutionSummary(task.resolutionSummary || '');
    setFollowUpRequired(Boolean(task.followUpRequired));
    setFollowUpDueAt(formatDateTimeInput(task.followUpDueAt));
    setFollowUpSummary(task.followUpSummary || '');
  }, [task]);

  async function assignTask(assigneeId: string) {
    if (!assigneeId) return;
    setUpdating(true);
    try {
      await updateTask(task.id, { assigneeId: Number.parseInt(assigneeId, 10) });
      onRefresh();
    } catch (error: unknown) {
      onError('Failed to assign: ' + errorMessage(error));
    } finally {
      setUpdating(false);
    }
  }

  async function saveOutcome() {
    setUpdating(true);
    try {
      await updateTask(task.id, {
        resolvedAs: resolvedAs || null,
        resolutionType: resolutionType || null,
        customerOutcome: customerOutcome || null,
        resolutionSummary: resolutionSummary.trim() || null,
        followUpRequired,
        followUpDueAt:
          followUpRequired && followUpDueAt ? new Date(followUpDueAt).toISOString() : null,
        followUpSummary: followUpRequired && followUpSummary.trim() ? followUpSummary.trim() : null,
      });
      await onHistoryChanged();
      onRefresh();
    } catch (error: unknown) {
      onError('Failed to save outcome: ' + errorMessage(error));
    } finally {
      setUpdating(false);
    }
  }

  return {
    resolvedAs,
    setResolvedAs,
    resolutionType,
    setResolutionType,
    customerOutcome,
    setCustomerOutcome,
    resolutionSummary,
    setResolutionSummary,
    followUpRequired,
    setFollowUpRequired,
    followUpDueAt,
    setFollowUpDueAt,
    followUpSummary,
    setFollowUpSummary,
    assignTask,
    saveOutcome,
  };
}
