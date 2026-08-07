'use client';

import type { ChangeEvent } from 'react';
import type { Staff, TaskAction, TaskMessage } from '../../lib/api';
import { TaskActivityTimeline } from './TaskActivityTimeline';
import { TaskActivityAdvancedToggle, TaskConversationTimeline } from './TaskCommunicationPanels';
import { TaskSection } from './TaskCardSupport';

interface TaskConversationActivityPanelProps {
  panel: 'conversation' | 'activity';
  taskId: number;
  messages: TaskMessage[];
  allActivityCount: number;
  visibleActions: TaskAction[];
  users: Staff[];
  userRole?: string | null;
  currentUserId?: number | null;
  updating: boolean;
  historyOpen: boolean;
  historyLoading: boolean;
  historyError: string;
  showAdvancedActivity: boolean;
  noteDraft: string;
  isPrivateNote: boolean;
  mentionActive: boolean;
  mentionOptions: Staff[];
  onAdvancedActivityChange: (enabled: boolean) => void;
  onToggleNotePrivacy: (actionId: number, currentIsPrivate: boolean) => void;
  onNoteChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onInsertMention: (user: Staff) => void;
  onPrivateNoteChange: (isPrivate: boolean) => void;
  onAddNote: () => void;
}

function TaskNoteComposer({
  noteDraft,
  isPrivateNote,
  updating,
  mentionActive,
  mentionOptions,
  onNoteChange,
  onInsertMention,
  onPrivateNoteChange,
  onAddNote,
}: Pick<
  TaskConversationActivityPanelProps,
  | 'noteDraft'
  | 'isPrivateNote'
  | 'updating'
  | 'mentionActive'
  | 'mentionOptions'
  | 'onNoteChange'
  | 'onInsertMention'
  | 'onPrivateNoteChange'
  | 'onAddNote'
>) {
  return (
    <div className="mb-2 flex items-start gap-2">
      <div className="relative flex-1">
        {mentionActive && mentionOptions.length > 0 && (
          <div className="absolute bottom-full left-0 z-50 mb-1 max-h-48 w-64 divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
            <div className="sticky top-0 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-500">
              Mention Staff
            </div>
            {mentionOptions.map((user) => (
              <button
                key={user.id}
                type="button"
                className="w-full px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-blue-50 focus:bg-blue-50 focus:outline-none"
                onClick={() => onInsertMention(user)}
              >
                <div className="font-medium text-gray-900">{user.displayName}</div>
                <div className="text-xs text-gray-500">{user.role || 'Staff'}</div>
              </button>
            ))}
          </div>
        )}

        <textarea
          className="min-h-[50px] w-full resize-none rounded-lg border border-gray-300 p-3 pr-24 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
          value={noteDraft}
          onChange={onNoteChange}
          placeholder="Add a note... (type @ to mention)"
          rows={1}
        />
        <div className="absolute bottom-1.5 right-1.5 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPrivateNoteChange(!isPrivateNote)}
            className={`rounded-md p-1.5 text-xs font-bold transition-colors ${isPrivateNote ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
            title={
              isPrivateNote
                ? 'Note will be private (only tagged users and managers can see it)'
                : 'Note will be public (everyone can see it)'
            }
          >
            {isPrivateNote ? '🔒 Private' : '🔓 Public'}
          </button>
          <button
            type="button"
            onClick={onAddNote}
            disabled={updating || !noteDraft.trim()}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-gray-800 disabled:opacity-50"
          >
            Add Note
          </button>
        </div>
      </div>
    </div>
  );
}

export function TaskConversationActivityPanel({
  panel,
  taskId,
  messages,
  allActivityCount,
  visibleActions,
  users,
  userRole,
  currentUserId,
  updating,
  historyOpen,
  historyLoading,
  historyError,
  showAdvancedActivity,
  noteDraft,
  isPrivateNote,
  mentionActive,
  mentionOptions,
  onAdvancedActivityChange,
  onToggleNotePrivacy,
  onNoteChange,
  onInsertMention,
  onPrivateNoteChange,
  onAddNote,
}: TaskConversationActivityPanelProps) {
  const isConversation = panel === 'conversation';
  const count = isConversation ? messages.length : allActivityCount;
  const summary = isConversation
    ? `${messages.length} message${messages.length === 1 ? '' : 's'} / notes`
    : `${allActivityCount} activity item${allActivityCount === 1 ? '' : 's'}`;

  return (
    <TaskSection
      title={isConversation ? 'Conversation' : 'Activity'}
      summary={summary}
      count={count}
    >
      {!isConversation && historyOpen && (
        <TaskActivityAdvancedToggle
          enabled={showAdvancedActivity}
          onChange={onAdvancedActivityChange}
        />
      )}

      {historyOpen && (
        <div className="mb-4 space-y-4" data-task-activity-panel="true">
          {historyLoading && (
            <div className="animate-pulse text-sm text-gray-500">Loading activity...</div>
          )}
          {historyError && <div className="text-sm text-red-600">{historyError}</div>}
          {!historyLoading && (
            <div className="space-y-4">
              {isConversation ? (
                <TaskConversationTimeline messages={messages} />
              ) : (
                <TaskActivityTimeline
                  taskId={taskId}
                  actions={visibleActions}
                  users={users}
                  userRole={userRole}
                  currentUserId={currentUserId}
                  showAdvanced={showAdvancedActivity}
                  updating={updating}
                  onToggleNotePrivacy={onToggleNotePrivacy}
                />
              )}
            </div>
          )}
        </div>
      )}

      {isConversation && (
        <TaskNoteComposer
          noteDraft={noteDraft}
          isPrivateNote={isPrivateNote}
          updating={updating}
          mentionActive={mentionActive}
          mentionOptions={mentionOptions}
          onNoteChange={onNoteChange}
          onInsertMention={onInsertMention}
          onPrivateNoteChange={onPrivateNoteChange}
          onAddNote={onAddNote}
        />
      )}
    </TaskSection>
  );
}
