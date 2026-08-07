'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type Dispatch,
  type SetStateAction,
} from 'react';
import {
  getTask,
  updateNotePrivacy,
  updateTask,
  type Staff,
  type Task,
  type TaskAction,
  type TaskMessage,
  type TaskStep,
} from '../../lib/api';
import type { RecommendedActionDraft } from './TaskRecommendedActionEditor';
import { actionTimestamp, isHighImpactActivity } from './taskActivity';
import { useTaskActivityDiagnostics } from './useTaskActivityDiagnostics';

interface TaskCommunicationControllerOptions {
  task: Task;
  users: Staff[];
  userRole?: string | null;
  currentUserId?: number | null;
  autoExpand: boolean;
  initialShowAdvancedActivity: boolean;
  taskStepCount: number;
  subTaskCount: number;
  setUpdating: Dispatch<SetStateAction<boolean>>;
  setTaskSteps: Dispatch<SetStateAction<TaskStep[]>>;
  setSubTasks: Dispatch<SetStateAction<Task[]>>;
  onRefresh: () => void;
  onError: (message: string) => void;
}

type TaskNoteUpdate = Partial<Task> & { isPrivateNote?: boolean };

function errorMessage(error: unknown, fallback = 'Unknown error') {
  return error instanceof Error ? error.message : fallback;
}

function recommendedActionFromTask(task: Task): RecommendedActionDraft {
  return {
    replyBody: task.suggestedReplyBody || '',
    subject: task.suggestedReplySubject || '',
    channel: task.suggestedChannel || 'email',
    action: task.suggestedAction || '',
    recipientEmail: task.suggestedRecipientEmail || '',
    ccEmail: task.suggestedCc || '',
  };
}

export function useTaskCommunicationController({
  task,
  users,
  userRole,
  currentUserId,
  autoExpand,
  initialShowAdvancedActivity,
  taskStepCount,
  subTaskCount,
  setUpdating,
  setTaskSteps,
  setSubTasks,
  onRefresh,
  onError,
}: TaskCommunicationControllerOptions) {
  const [recommendedActionDraft, setRecommendedActionDraft] = useState<RecommendedActionDraft>(() =>
    recommendedActionFromTask(task)
  );
  const [expandedActions, setExpandedActions] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [isPrivateNote, setIsPrivateNote] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(autoExpand);
  const [showAdvancedActivity, setShowAdvancedActivity] = useState(initialShowAdvancedActivity);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [taskActions, setTaskActions] = useState<TaskAction[]>(task.TaskActions || []);
  const [taskMessages, setTaskMessages] = useState<TaskMessage[]>(
    task.Messages || (task.Message ? [task.Message] : [])
  );
  const [mentionActive, setMentionActive] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const [mentionOptions, setMentionOptions] = useState<Staff[]>([]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const freshTask = await getTask(task.id);
      setTaskActions(freshTask.TaskActions || []);
      setTaskMessages(freshTask.Messages || (freshTask.Message ? [freshTask.Message] : []));
      setTaskSteps(freshTask.TaskSteps || []);
      setSubTasks(freshTask.SubTasks || []);
    } catch (error: unknown) {
      setHistoryError(errorMessage(error, 'Failed to load history'));
    } finally {
      setHistoryLoading(false);
    }
  }, [setSubTasks, setTaskSteps, task.id]);

  useEffect(() => {
    setRecommendedActionDraft(recommendedActionFromTask(task));
    setTaskActions(task.TaskActions || []);
    setTaskMessages(task.Messages || (task.Message ? [task.Message] : []));
    setTaskSteps(task.TaskSteps || []);
    setSubTasks(task.SubTasks || []);
  }, [setSubTasks, setTaskSteps, task]);

  useEffect(() => {
    if (autoExpand) void loadHistory();
  }, [autoExpand, loadHistory]);

  const canSeePrivateNote = useCallback(
    (action: TaskAction) => {
      if (userRole === 'manager' || userRole === 'admin') return true;
      if (currentUserId && action.userId === currentUserId) return true;
      if (currentUserId) {
        const currentUser = users.find((user) => user.id === currentUserId);
        if (currentUser?.displayName && action.details?.note) {
          return action.details.note.includes(`@${currentUser.displayName}`);
        }
      }
      return false;
    },
    [currentUserId, userRole, users]
  );

  const safeTaskActions = useMemo(
    () =>
      Array.isArray(taskActions)
        ? taskActions.filter((action): action is TaskAction =>
            Boolean(action && typeof action === 'object' && !Array.isArray(action))
          )
        : [],
    [taskActions]
  );
  const visibleTaskActions = useMemo(
    () =>
      safeTaskActions
        .filter(
          (action) =>
            !['TASK_CREATED', 'CREATED', 'MANUAL_CREATED'].includes(String(action.actionType || ''))
        )
        .filter(
          (action) =>
            String(action.actionType || '') !== 'NOTE_ADDED' ||
            !action.details?.isPrivate ||
            canSeePrivateNote(action)
        )
        .filter((action) => showAdvancedActivity || isHighImpactActivity(action))
        .slice()
        .sort((first, second) => actionTimestamp(first) - actionTimestamp(second)),
    [canSeePrivateNote, safeTaskActions, showAdvancedActivity]
  );
  const safeTaskMessages = useMemo(
    () =>
      Array.isArray(taskMessages)
        ? taskMessages.filter((message): message is TaskMessage =>
            Boolean(message && typeof message === 'object')
          )
        : [],
    [taskMessages]
  );

  const handleAdvancedActivityToggle = useTaskActivityDiagnostics({
    taskId: task.id,
    showAdvancedActivity,
    historyOpen,
    historyLoading,
    historyError,
    safeTaskActions,
    safeTaskMessageCount: safeTaskMessages.length,
    visibleTaskActions,
    taskStepCount,
    subTaskCount,
    onAdvancedActivityChange: setShowAdvancedActivity,
  });

  function openHistory() {
    if (historyOpen) return;
    setHistoryOpen(true);
    void loadHistory();
  }

  function handleNoteChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const value = event.target.value;
    const cursorPosition = event.target.selectionStart || 0;
    setNoteDraft(value);
    const match = value.substring(0, cursorPosition).match(/(?:^|\s)@([a-zA-Z0-9_]*)$/);
    if (!match) {
      setMentionActive(false);
      return;
    }

    const query = match[1].toLowerCase();
    setMentionActive(true);
    setMentionQuery(query);
    setMentionStartIndex(cursorPosition - query.length - 1);
    setMentionOptions(users.filter((user) => user.displayName?.toLowerCase().includes(query)));
  }

  function insertMention(user: Staff) {
    if (mentionStartIndex === -1 || !user.displayName) return;
    const beforeMention = noteDraft.substring(0, mentionStartIndex);
    const afterCursor = noteDraft.substring(mentionStartIndex + mentionQuery.length + 1);
    setNoteDraft(beforeMention + `@${user.displayName} ` + afterCursor.replace(/^\s+/, ''));
    setMentionActive(false);
  }

  async function addNote() {
    const note = noteDraft.trim();
    if (!note) return;
    setUpdating(true);
    try {
      await updateTask(task.id, { notes: note, isPrivateNote } as TaskNoteUpdate);
      setNoteDraft('');
      setIsPrivateNote(false);
      setMentionActive(false);
      if (historyOpen) await loadHistory();
      onRefresh();
    } catch (error: unknown) {
      onError('Failed to add note: ' + errorMessage(error));
    } finally {
      setUpdating(false);
    }
  }

  async function toggleNotePrivacy(actionId: number, currentIsPrivate: boolean) {
    setUpdating(true);
    try {
      await updateNotePrivacy(task.id, actionId, !currentIsPrivate);
      await loadHistory();
    } catch (error: unknown) {
      onError('Failed to toggle note privacy: ' + errorMessage(error));
    } finally {
      setUpdating(false);
    }
  }

  async function regenerateSuggestion() {
    setUpdating(true);
    try {
      const refreshedTask = await updateTask(task.id, { regenerateSuggestedReply: true });
      setRecommendedActionDraft(recommendedActionFromTask(refreshedTask));
      await loadHistory();
      onRefresh();
    } catch (error: unknown) {
      onError('Failed to generate suggestion: ' + errorMessage(error));
    } finally {
      setUpdating(false);
    }
  }

  return {
    recommendedActionDraft,
    setRecommendedActionDraft,
    expandedActions,
    setExpandedActions,
    noteDraft,
    isPrivateNote,
    setIsPrivateNote,
    mentionActive,
    mentionOptions,
    historyOpen,
    historyLoading,
    historyError,
    showAdvancedActivity,
    safeTaskActions,
    visibleTaskActions,
    safeTaskMessages,
    loadHistory,
    openHistory,
    handleAdvancedActivityToggle,
    handleNoteChange,
    insertMention,
    addNote,
    toggleNotePrivacy,
    regenerateSuggestion,
  };
}
