'use client';

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import {
  linkTaskNotice,
  unlinkTaskNotice,
  updateTask,
  type Notice,
  type Task,
} from '../../lib/api';

interface TaskRelationshipControllerOptions {
  task: Task;
  setUpdating: Dispatch<SetStateAction<boolean>>;
  onHistoryChanged: () => Promise<void>;
  onRefresh: () => void;
  onError: (message: string) => void;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error';
}

export function useTaskRelationshipController({
  task,
  setUpdating,
  onHistoryChanged,
  onRefresh,
  onError,
}: TaskRelationshipControllerOptions) {
  const [linkedNotices, setLinkedNotices] = useState<Notice[]>(task.LinkedNotices || []);
  const [noticeLinking, setNoticeLinking] = useState(false);

  useEffect(() => {
    setLinkedNotices(task.LinkedNotices || []);
  }, [task]);

  async function linkNotice(noticeId: number) {
    if (!Number.isInteger(noticeId) || noticeId < 1) {
      onError('Choose a valid notice to link.');
      return;
    }

    setNoticeLinking(true);
    try {
      const updated = await linkTaskNotice(task.id, noticeId);
      setLinkedNotices(updated.LinkedNotices || []);
      onRefresh();
    } catch (error: unknown) {
      onError('Failed to link notice: ' + errorMessage(error));
    } finally {
      setNoticeLinking(false);
    }
  }

  async function unlinkNotice(noticeId: number) {
    setNoticeLinking(true);
    try {
      const updated = await unlinkTaskNotice(task.id, noticeId);
      setLinkedNotices(updated.LinkedNotices || []);
      onRefresh();
    } catch (error: unknown) {
      onError('Failed to unlink notice: ' + errorMessage(error));
    } finally {
      setNoticeLinking(false);
    }
  }

  async function confirmSuggestedMember(memberId: number) {
    if (!memberId) return;
    setUpdating(true);
    try {
      await updateTask(task.id, { memberId: Number(memberId) });
      await onHistoryChanged();
      onRefresh();
    } catch (error: unknown) {
      onError('Failed to confirm customer match: ' + errorMessage(error));
    } finally {
      setUpdating(false);
    }
  }

  async function keepUnlinked() {
    const manualIntake = task.payload?.manualIntake;
    if (!manualIntake) return;
    setUpdating(true);
    try {
      await updateTask(task.id, {
        payload: {
          ...(task.payload || {}),
          manualIntake: {
            ...manualIntake,
            identityResolutionStatus: 'REVIEW_DISMISSED',
            identityConfidence: 'NONE',
            memberAutoLinked: false,
            memberMatchReason: null,
          },
        },
      });
      await onHistoryChanged();
      onRefresh();
    } catch (error: unknown) {
      onError('Failed to keep task unlinked: ' + errorMessage(error));
    } finally {
      setUpdating(false);
    }
  }

  return {
    linkedNotices,
    noticeLinking,
    linkNotice,
    unlinkNotice,
    confirmSuggestedMember,
    keepUnlinked,
  };
}
