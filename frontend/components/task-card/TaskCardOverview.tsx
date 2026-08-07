'use client';

import { useMemo } from 'react';
import type { Staff, Task, TaskStep } from '../../lib/api';
import {
  formatShortDate,
  humanize,
  stepStatusClasses,
  workflowStateClasses,
} from './TaskCardSupport';
import { TaskSectionNavigation, type TaskPanelItem, type TaskPanelKey } from './TaskCardNavigation';
import { isDetailRecord } from './taskActivity';
import InvolvementBadge from '../InvolvementBadge';
import type { InvolvementSignal } from '../../lib/involvement';

interface TaskCardOverviewProps {
  task: Task;
  users: Staff[];
  orderedSteps: TaskStep[];
  requesterName: string;
  isFlagged: boolean;
  panelItems: TaskPanelItem[];
  activePanel: TaskPanelKey;
  getStepLockReason: (step?: TaskStep | null) => string;
  onToggleFlag: () => void;
  onSelectPanel: (panel: TaskPanelKey) => void;
  involvement?: InvolvementSignal | null;
}

export function TaskCardOverview({
  task,
  users,
  orderedSteps,
  requesterName,
  isFlagged,
  panelItems,
  activePanel,
  getStepLockReason,
  onToggleFlag,
  onSelectPanel,
  involvement,
}: TaskCardOverviewProps) {
  const activeStep = useMemo(
    () =>
      orderedSteps.find((step) => step.status === 'BLOCKED') ??
      orderedSteps.find((step) => step.status === 'IN_PROGRESS') ??
      orderedSteps.find((step) => step.status === 'PENDING') ??
      orderedSteps[0] ??
      null,
    [orderedSteps]
  );
  const activeStepIndex = activeStep
    ? orderedSteps.findIndex((step) => step.id === activeStep.id)
    : -1;
  const activeStepOwnerName =
    activeStep?.Owner?.displayName ||
    users.find((user) => user.id === activeStep?.ownerUserId)?.displayName ||
    'Unassigned';
  const taskTitle = humanize(task.subType || task.type || task.category || 'Task', 'Task');
  const requestPayload = useMemo((): Record<string, unknown> | null => {
    let raw: unknown = task.payload;
    if (typeof raw === 'string') {
      const rawText = raw.trim();
      try {
        raw = JSON.parse(raw);
      } catch {
        return rawText ? { originalText: rawText } : null;
      }
    }
    return isDetailRecord(raw) ? raw : null;
  }, [task.payload]);
  const summarizedTaskText =
    typeof requestPayload?.summary === 'string' ? requestPayload.summary.trim() : '';
  const originalRequestText =
    typeof requestPayload?.originalText === 'string' ? requestPayload.originalText.trim() : '';
  const requestSummary =
    summarizedTaskText ||
    originalRequestText ||
    String(task.notes || 'Original request and task context');
  const showOriginalRequestText = Boolean(
    originalRequestText && originalRequestText !== requestSummary
  );
  const activeStepSuggestionText =
    activeStep?.suggestedAction || activeStep?.suggestedReplyBody || '';
  const activeStepLockReason = getStepLockReason(activeStep);
  const showWorkflowBadge = Boolean(
    task.workflowState &&
    task.workflowState !== 'NOT_STARTED' &&
    !(task.status === 'ACTIONED' && task.workflowState === 'COMPLETED')
  );

  return (
    <>
      <div className="rounded-lg border border-[#dfe6da] bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <InvolvementBadge signal={involvement} />
              <span className="rounded-md border border-[#dce4d7] bg-[#f8faf6] px-2.5 py-1 text-[11px] font-bold uppercase text-[#536158]">
                {humanize(task.category || 'GENERAL')}
              </span>
              <span className="rounded-md border border-teal-100 bg-teal-50 px-2.5 py-1 text-[11px] font-bold uppercase text-teal-800">
                {task.areaScope === 'AREAS' && task.OperationalAreas?.length
                  ? task.OperationalAreas.map((area) => area.name).join(' + ')
                  : 'Organisation-wide'}
              </span>
              {showWorkflowBadge && (
                <span
                  className={`rounded-md border px-2.5 py-1 text-[11px] font-bold uppercase ${workflowStateClasses(task.workflowState || 'NOT_STARTED')}`}
                >
                  {humanize(task.workflowState || 'NOT_STARTED')}
                </span>
              )}
              {(task.isOverdue || task.isDueSoon) && (
                <span
                  className={`rounded-md border px-2.5 py-1 text-[11px] font-bold uppercase ${
                    task.isOverdue
                      ? 'border-red-200 bg-red-50 text-red-800'
                      : 'border-amber-200 bg-amber-50 text-amber-800'
                  }`}
                >
                  {task.isOverdue ? 'Overdue' : 'Due soon'}
                </span>
              )}
              {task.sentiment === 'NEGATIVE' && (
                <span className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-bold uppercase text-red-800">
                  Negative sentiment
                </span>
              )}
            </div>
            <div className="flex items-start gap-2">
              <button
                type="button"
                onClick={onToggleFlag}
                className={`icon-button -ml-2 -mt-1 ${isFlagged ? 'text-amber-500' : 'text-[#a4aea0] hover:text-amber-500'}`}
                title={isFlagged ? 'Unflag' : 'Flag for follow-up'}
                aria-label={isFlagged ? 'Unflag task' : 'Flag task'}
              >
                <svg
                  className="h-5 w-5"
                  fill={isFlagged ? 'currentColor' : 'none'}
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 16.9 6.6 19.8l1-6.1-4.4-4.3 6.1-.9L12 3Z"
                  />
                </svg>
              </button>
              <div className="min-w-0">
                <h3 className="break-words text-2xl font-semibold text-[#1c231f]">{taskTitle}</h3>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-[var(--muted)]">
                  <span className="font-medium text-[#344039]">{requesterName}</span>
                  <span>Case #{task.id}</span>
                  <span>Created {formatShortDate(task.createdAt)}</span>
                  <span>By {task.Creator?.displayName || 'System'}</span>
                </div>
              </div>
            </div>
          </div>
          <span
            className={`shrink-0 rounded-md border px-2.5 py-1 text-xs font-bold uppercase ${
              task.status === 'ACTIONED'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : task.status === 'REJECTED'
                  ? 'border-red-200 bg-red-50 text-red-800'
                  : 'border-amber-200 bg-amber-50 text-amber-800'
            }`}
          >
            {humanize(task.status)}
          </span>
        </div>
      </div>

      <section className="rounded-lg border border-[#dfe6da] bg-white p-4">
        <div className="mb-2 text-xs font-bold uppercase tracking-wider text-[#344039]">
          Initial issue
        </div>
        <div className="whitespace-pre-wrap text-sm leading-6 text-[#344039]">{requestSummary}</div>
        {showOriginalRequestText && (
          <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Original input
            </div>
            <div className="max-h-32 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {originalRequestText}
            </div>
          </div>
        )}
      </section>

      <section
        className={`rounded-lg border p-4 ${
          activeStep?.status === 'BLOCKED'
            ? 'border-red-200 bg-red-50/60'
            : task.workflowState === 'WAITING'
              ? 'border-amber-200 bg-amber-50/60'
              : 'border-[#cbded7] bg-[#f3faf7]'
        }`}
      >
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#0f766e]">
                Current step
              </span>
              {activeStep && (
                <>
                  <span
                    className={`rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase ${stepStatusClasses(activeStep.status)}`}
                  >
                    {humanize(activeStep.status)}
                  </span>
                  <span className="rounded-md border border-white/70 bg-white/70 px-2 py-0.5 text-[11px] font-bold uppercase text-[#536158]">
                    Step {activeStepIndex + 1} of {orderedSteps.length}
                  </span>
                </>
              )}
            </div>
            <h4 className="break-words text-xl font-semibold text-[#1c231f]">
              {activeStep ? activeStep.title : 'No workflow step recorded yet'}
            </h4>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#536158]">
              {activeStep?.description ||
                task.nextStepSummary ||
                'Add a workflow step to make the next action explicit.'}
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#667085]">
                  Owner
                </div>
                <div className="mt-0.5 font-medium text-[#1c231f]">{activeStepOwnerName}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#667085]">
                  Waiting on
                </div>
                <div className="mt-0.5 font-medium text-[#1c231f]">
                  {humanize(activeStep?.waitingOn || task.waitingOn || 'NONE')}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#667085]">
                  Due
                </div>
                <div
                  className={`mt-0.5 font-medium ${task.isOverdue ? 'text-red-700' : task.isDueSoon ? 'text-amber-700' : 'text-[#1c231f]'}`}
                >
                  {formatShortDate(activeStep?.dueAt || task.dueAt)}
                </div>
              </div>
            </div>
            {(activeStep?.blockedReason || task.blockedReason) && (
              <div className="mt-4 rounded-md border border-red-200 bg-white/80 p-3 text-sm text-red-800">
                <span className="font-semibold">Blocked:</span>{' '}
                {activeStep?.blockedReason || task.blockedReason}
              </div>
            )}
            {activeStepSuggestionText && (
              <div className="mt-4 rounded-md border border-blue-100 bg-white/80 p-3 text-sm text-slate-700">
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-blue-700">
                  Suggested action
                </div>
                <div className="line-clamp-3 whitespace-pre-wrap">{activeStepSuggestionText}</div>
              </div>
            )}
          </div>
          {activeStepLockReason && (
            <div className="w-full rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 xl:w-[260px]">
              {activeStepLockReason}
            </div>
          )}
        </div>
      </section>

      <TaskSectionNavigation
        items={panelItems}
        activePanel={activePanel}
        mode="mobile"
        onSelect={onSelectPanel}
      />
    </>
  );
}
