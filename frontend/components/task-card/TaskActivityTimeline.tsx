'use client';

import type { ReactNode } from 'react';
import type { Staff, TaskAction } from '../../lib/api';
import {
  actionKey,
  actionTimestamp,
  displayActionValue,
  displayAdvancedValue,
  formatActivityType,
  isDetailRecord,
  objectEntries,
} from './taskActivity';
import { formatEnumLabel, humanize, TaskActivityDetails, TaskActivityErrorBoundary } from './TaskCardSupport';

interface TaskActivityTimelineProps {
  taskId: number;
  actions: TaskAction[];
  users: Staff[];
  userRole?: string | null;
  currentUserId?: number | null;
  showAdvanced: boolean;
  updating: boolean;
  onToggleNotePrivacy: (actionId: number, currentIsPrivate: boolean) => void;
}

function BasicActivityDetails({
  action,
  users,
  userRole,
  currentUserId,
  updating,
  onToggleNotePrivacy,
}: Omit<TaskActivityTimelineProps, 'taskId' | 'actions' | 'showAdvanced'> & {
  action: TaskAction;
}): ReactNode {
  if (action.actionType === 'NOTE_ADDED' && action.details?.note) {
    const noteIsPrivate = action.details.isPrivate === true;
    const canToggle =
      userRole === 'manager' ||
      userRole === 'admin' ||
      Boolean(currentUserId && action.userId === currentUserId);

    return (
      <div
        className={`mt-2 rounded p-3 text-sm ${noteIsPrivate ? 'border border-red-200 bg-red-50 text-gray-800' : 'border border-yellow-200 bg-yellow-50 text-gray-800'}`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 italic">&quot;{displayActionValue(action.details.note)}&quot;</div>
          <div className="flex shrink-0 items-center gap-1">
            {noteIsPrivate && (
              <span className="text-xs font-bold uppercase tracking-wide text-red-500">
                Private
              </span>
            )}
            {canToggle && (
              <button
                type="button"
                onClick={() => onToggleNotePrivacy(action.id, noteIsPrivate)}
                disabled={updating}
                className={`rounded p-1 text-xs transition-colors hover:bg-gray-200 ${noteIsPrivate ? 'text-red-500' : 'text-gray-400'}`}
                title={noteIsPrivate ? 'Make Public' : 'Make Private'}
              >
                {noteIsPrivate ? '🔒' : '🔓'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (action.actionType === 'ASSIGNED') {
    const toUser = users.find((user) => user.id === Number(action.details?.to));
    const assigner =
      action.User?.displayName ||
      users.find((user) => user.id === action.userId)?.displayName ||
      'System';
    return (
      <div className="mt-2 rounded border border-blue-100 bg-blue-50 p-2 text-sm text-blue-900">
        <span className="font-semibold">Assigned to: </span>
        {toUser ? toUser.displayName : displayActionValue(action.details?.to)}
        <span className="ml-2 text-xs text-gray-500">by {assigner}</span>
      </div>
    );
  }

  if (action.actionType === 'ATTACHMENT_ADDED' || action.actionType === 'ATTACHMENT_DELETED') {
    return (
      <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">
        <div className="font-semibold">
          {action.actionType === 'ATTACHMENT_ADDED' ? 'Attachment added' : 'Attachment deleted'}
        </div>
        <div className="mt-1 text-xs text-slate-600">
          {displayActionValue(action.details?.filename || 'Attachment')}
          {action.details?.entityType && (
            <span className="ml-2 rounded bg-white px-1.5 py-0.5 font-semibold uppercase text-slate-500 ring-1 ring-slate-200">
              {humanize(String(action.details.entityType))}
            </span>
          )}
        </div>
      </div>
    );
  }

  if (
    ['STEP_CREATED', 'STEP_UPDATED', 'STEP_COMPLETED', 'STEP_DELETED'].includes(action.actionType)
  ) {
    const entries = objectEntries(action.details?.changes || {});
    const activityVerb =
      action.actionType === 'STEP_CREATED'
        ? 'Created'
        : action.actionType === 'STEP_UPDATED'
          ? 'Updated'
          : action.actionType === 'STEP_COMPLETED'
            ? 'Completed'
            : 'Deleted';
    return (
      <div className="mt-2 rounded border border-indigo-100 bg-indigo-50 p-3 text-sm text-indigo-900">
        <div className="font-semibold">
          {activityVerb} step: {action.details?.title || 'Untitled step'}
        </div>
        {entries.length > 0 && (
          <div className="mt-2 space-y-1 text-xs">
            {entries.map(([key, value]) => (
              <div key={key}>
                <span className="font-semibold uppercase text-indigo-700">
                  {humanize(key)}:
                </span>{' '}
                <span>{displayActionValue(value)}</span>
              </div>
            ))}
          </div>
        )}
        {action.details?.blockedReason && (
          <div className="mt-2 text-xs text-indigo-800">
            Reason: {displayActionValue(action.details.blockedReason)}
          </div>
        )}
      </div>
    );
  }

  if (action.actionType === 'MEMBER_ENRICHED') {
    return (
      <div className="mt-2 rounded border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-900">
        <div className="font-semibold">Customer record enriched</div>
        {Array.isArray(action.details?.tagsAdded) && action.details.tagsAdded.length > 0 && (
          <div className="mt-2 text-xs">Tags added: {action.details.tagsAdded.join(', ')}</div>
        )}
        {action.details?.memberId && (
          <div className="mt-1 text-xs">
            Member ID: {displayActionValue(action.details.memberId)}
          </div>
        )}
      </div>
    );
  }

  if (action.actionType === 'EXECUTION_RECORDED') {
    return (
      <div className="mt-2 rounded border border-cyan-100 bg-cyan-50 p-3 text-sm text-cyan-900">
        <div className="font-semibold">
          Execution recorded: {formatEnumLabel(action.details?.operation || action.details?.kind)}
        </div>
        <div className="mt-2 grid gap-1 text-xs">
          {action.details?.provider && (
            <div>
              <span className="font-semibold uppercase text-cyan-700">Provider:</span>{' '}
              {displayActionValue(action.details.provider)}
            </div>
          )}
          {action.details?.status && (
            <div>
              <span className="font-semibold uppercase text-cyan-700">Status:</span>{' '}
              {formatEnumLabel(action.details.status)}
            </div>
          )}
          {action.details?.channel && (
            <div>
              <span className="font-semibold uppercase text-cyan-700">Channel:</span>{' '}
              {displayActionValue(action.details.channel)}
            </div>
          )}
          {action.details?.referenceCode && (
            <div>
              <span className="font-semibold uppercase text-cyan-700">Reference:</span>{' '}
              {displayActionValue(action.details.referenceCode)}
            </div>
          )}
          {action.details?.target && (
            <div>
              <span className="font-semibold uppercase text-cyan-700">Target:</span>{' '}
              {displayActionValue(action.details.target)}
            </div>
          )}
          {action.details?.summary && (
            <div>
              <span className="font-semibold uppercase text-cyan-700">Summary:</span>{' '}
              {displayActionValue(action.details.summary)}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (action.actionType === 'OUTCOME_RECORDED') {
    const entries = objectEntries(action.details?.changes || {});
    return (
      <div className="mt-2 rounded border border-teal-100 bg-teal-50 p-3 text-sm text-teal-900">
        <div className="font-semibold">Outcome recorded</div>
        {entries.length > 0 && (
          <div className="mt-2 space-y-1 text-xs">
            {entries.map(([key, value]) => (
              <div key={key}>
                <span className="font-semibold uppercase text-teal-700">
                  {humanize(key)}:
                </span>{' '}
                <span>{displayActionValue(value)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (action.details && Object.keys(action.details).length > 0) {
    const entries = objectEntries(action.details.changes || action.details);
    if (entries.length > 0) {
      return (
        <div className="mt-2 rounded border border-gray-100 bg-gray-50 p-2 text-xs">
          {entries.map(([key, value]) => {
            let displayValue = displayActionValue(value);
            if (
              ['assigneeId', 'to', 'from'].includes(key) &&
              (typeof value === 'number' || typeof value === 'string')
            ) {
              displayValue =
                users.find((user) => user.id === Number(value))?.displayName || displayValue;
            }
            return (
              <div key={key} className="flex gap-2">
                <span className="font-semibold uppercase text-gray-500">
                  {humanize(key)}:
                </span>
                <span className="break-all text-gray-800">{displayValue}</span>
              </div>
            );
          })}
        </div>
      );
    }
  }
  return null;
}

function AdvancedActivityDetails({
  action,
  users,
}: {
  action: TaskAction;
  users: Staff[];
}): ReactNode {
  const details = isDetailRecord(action.details) ? action.details : {};
  const changes = isDetailRecord(details.changes) ? details.changes : details;
  const oldValues = isDetailRecord(details.oldValues) ? details.oldValues : null;
  const entries = objectEntries(changes);
  const oldEntries = objectEntries(oldValues);
  const formatField = (key: string, value: unknown) => {
    if (
      ['assigneeId', 'ownerUserId', 'to', 'from'].includes(key) &&
      (typeof value === 'number' || typeof value === 'string')
    ) {
      const user = users.find((candidate) => candidate.id === Number(value));
      if (user) return user.displayName;
    }
    return displayAdvancedValue(value);
  };

  return (
    <div className="mt-2 rounded border border-slate-200 bg-white p-3 text-xs text-slate-700">
      <div className="mb-2 text-sm font-semibold text-slate-900">
        {formatActivityType(action.actionType)}
      </div>
      {entries.length === 0 ? (
        <div className="text-slate-500">No detail fields recorded.</div>
      ) : (
        <div className="space-y-1">
          {entries.map(([key, value]) => (
            <div key={key} className="grid min-w-0 gap-1 sm:grid-cols-[150px_minmax(0,1fr)]">
              <span className="font-semibold uppercase text-slate-500">
                {humanize(key)}
              </span>
              <span className="min-w-0 whitespace-pre-wrap break-all text-slate-800">
                {formatField(key, value)}
              </span>
            </div>
          ))}
        </div>
      )}
      {oldEntries.length > 0 && (
        <div className="mt-3 border-t border-slate-100 pt-2">
          <div className="mb-1 font-semibold uppercase text-slate-500">Previous values</div>
          <div className="space-y-1">
            {oldEntries.map(([key, value]) => (
              <div key={key} className="grid min-w-0 gap-1 sm:grid-cols-[150px_minmax(0,1fr)]">
                <span className="font-semibold uppercase text-slate-500">
                  {humanize(key)}
                </span>
                <span className="min-w-0 whitespace-pre-wrap break-all text-slate-800">
                  {formatField(key, value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function TaskActivityTimeline({
  taskId,
  actions,
  users,
  userRole,
  currentUserId,
  showAdvanced,
  updating,
  onToggleNotePrivacy,
}: TaskActivityTimelineProps) {
  if (actions.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600">
        {showAdvanced
          ? 'No activity has been recorded yet.'
          : 'No high-impact activity has been recorded yet.'}
      </div>
    );
  }

  return actions.map((action, index) => (
    <TaskActivityErrorBoundary
      key={`${taskId}-${actionKey(action, index)}-${showAdvanced ? 'advanced' : 'basic'}`}
    >
      <div
        className="flex min-w-0 flex-col items-start rounded-lg border border-gray-100 bg-gray-50/50 p-3 text-sm"
        data-task-action-row="true"
        data-task-action-id={action.id ?? ''}
        data-task-action-type={String(action.actionType || '')}
      >
        <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
          <span className="font-bold text-gray-700">
            {displayActionValue(action.User?.displayName || 'System')}
          </span>
          <span>•</span>
          <span>{new Date(actionTimestamp(action)).toLocaleString()}</span>
        </div>
        <div className="w-full">
          <TaskActivityDetails
            action={action}
            showAdvancedActivity={showAdvanced}
            renderBasicDetails={(currentAction) => (
              <BasicActivityDetails
                action={currentAction}
                users={users}
                userRole={userRole}
                currentUserId={currentUserId}
                updating={updating}
                onToggleNotePrivacy={onToggleNotePrivacy}
              />
            )}
            renderAdvancedDetails={(currentAction) => (
              <AdvancedActivityDetails action={currentAction} users={users} />
            )}
          />
        </div>
      </div>
    </TaskActivityErrorBoundary>
  ));
}
