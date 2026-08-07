'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Task,
  TaskStep,
  IdentitySuggestedCandidate,
  updateTask,
  Staff,
} from '../lib/api';
import { TaskFilesPanel } from './task-card/TaskFilesPanel';
import { TaskOutcomeEditor } from './task-card/TaskOutcomeEditor';
import { TaskCustomerSummary, TaskRequestSummary } from './task-card/TaskCustomerSummary';
import { TaskCardOverview } from './task-card/TaskCardOverview';
import { TaskCardSidebar, type TaskPanelKey } from './task-card/TaskCardNavigation';
import { TaskConversationActivityPanel } from './task-card/TaskConversationActivityPanel';
import { TaskRecommendedActionEditor } from './task-card/TaskRecommendedActionEditor';
import { TaskWorkflowPanel } from './task-card/TaskWorkflowPanel';
import { useTaskCommunicationController } from './task-card/useTaskCommunicationController';
import { useTaskOutcomeController } from './task-card/useTaskOutcomeController';
import { useTaskRelationshipController } from './task-card/useTaskRelationshipController';
import { useTaskWorkflowController } from './task-card/useTaskWorkflowController';
import {
  formatEnumLabel,
  humanize,
  TaskSection,
} from './task-card/TaskCardSupport';
import { involvementSurfaceClass, taskInvolvement } from '../lib/involvement';

interface TaskCardProps {
  task: Task;
  users?: Staff[];
  onRefresh: () => void;
  canAssign?: boolean;
  userRole?: string | null;
  currentUserId?: number | null;
  currentUserAreaIds?: number[];
  isFlagged?: boolean;
  highlighted?: boolean;
  onToggleFlag?: (taskId: number) => void;
  autoExpand?: boolean;
  initialShowAdvancedActivity?: boolean;
}

const EMPTY_STAFF_LIST: Staff[] = [];

function errorMessage(error: unknown, fallback = 'Unknown error') {
  return error instanceof Error ? error.message : fallback;
}

export default function TaskCard({
  task,
  users: rawUsers = EMPTY_STAFF_LIST,
  onRefresh,
  canAssign = true,
  userRole,
  currentUserId,
  currentUserAreaIds = [],
  isFlagged = false,
  highlighted = false,
  onToggleFlag,
  autoExpand = false,
  initialShowAdvancedActivity = false,
}: TaskCardProps) {
  const users = useMemo(() => (Array.isArray(rawUsers) ? rawUsers : EMPTY_STAFF_LIST), [rawUsers]);
  const [updating, setUpdating] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [taskSteps, setTaskSteps] = useState<TaskStep[]>(task.TaskSteps || []);
  const [subTasks, setSubTasks] = useState<Task[]>(task.SubTasks || []);
  const [activePanel, setActivePanel] = useState<TaskPanelKey>('work');

  const isStaffAssignmentReview = useMemo(() => {
    const metadataFor = (step: TaskStep) => {
      const metadata = step.metadata;
      if (!metadata) return {};
      if (typeof metadata === 'object' && !Array.isArray(metadata)) return metadata;
      if (typeof metadata === 'string') {
        try {
          const parsed = JSON.parse(metadata);
          return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        } catch {
          return {};
        }
      }
      return {};
    };

    return taskSteps.some((step) => {
      const metadata = metadataFor(step) as { reason?: string; assignmentTargetRole?: string };
      return (
        metadata.reason === 'STAFF_CREATED_UNASSIGNED' && metadata.assignmentTargetRole === 'staff'
      );
    });
  }, [taskSteps]);

  const assignmentUsers = useMemo(
    () => (isStaffAssignmentReview ? users.filter((user) => user.role === 'staff') : users),
    [isStaffAssignmentReview, users]
  );
  const canManageNoticeLinks = userRole === 'manager' || userRole === 'admin';

  useEffect(() => {
    setActivePanel('work');
  }, [task]);

  async function handleStatusChange(newStatus: string) {
    setStatusError(null);
    setUpdating(true);
    try {
      const updates: Partial<Task> = { status: newStatus };
      if (newStatus === 'ACTIONED') {
        const nextChannel = recommendedActionDraft.channel || 'none';
        updates.suggestedReplyBody = recommendedActionDraft.replyBody;
        updates.suggestedChannel = nextChannel;
        updates.suggestedReplySubject =
          nextChannel === 'email' ? recommendedActionDraft.subject : '';
        updates.suggestedAction = recommendedActionDraft.action;
        updates.suggestedRecipientEmail =
          nextChannel === 'email' ? recommendedActionDraft.recipientEmail : '';
        updates.suggestedCc = nextChannel === 'email' ? recommendedActionDraft.ccEmail : '';
      }
      await updateTask(task.id, updates);
      onRefresh();
    } catch (err: unknown) {
      setStatusError(`Failed: ${errorMessage(err)}`);
    } finally {
      setUpdating(false);
    }
  }

  async function onToggleStar() {
    if (onToggleFlag) {
      onToggleFlag(task.id);
    }
  }

  const manualIntake = task.payload?.manualIntake || null;
  const followUpAutomation = task.payload?.followUpAutomation || null;
  const responseTargetPhone = task.Member?.phone || manualIntake?.requesterPhone || '';
  const {
    recommendedActionDraft,
    setRecommendedActionDraft,
    expandedActions,
    setExpandedActions,
    noteDraft: noteEdit,
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
    addNote: handleAddNote,
    toggleNotePrivacy: handleToggleNotePrivacy,
    regenerateSuggestion: handleRegenerateSuggestion,
  } = useTaskCommunicationController({
    task,
    users,
    userRole,
    currentUserId,
    autoExpand,
    initialShowAdvancedActivity,
    taskStepCount: taskSteps.length,
    subTaskCount: subTasks.length,
    setUpdating,
    setTaskSteps,
    setSubTasks,
    onRefresh,
    onError: setStatusError,
  });

  function selectPanel(panel: TaskPanelKey) {
    setActivePanel(panel);
    if (panel === 'conversation' || panel === 'activity') openHistory();
  }

  const {
    orderedSteps: orderedTaskSteps,
    openStepId,
    toggleStep,
    canReorderSteps,
    canOverrideStepOwnership,
    reorderMode,
    reorderDraft,
    draggedStepId,
    setDraggedStepId,
    activeSuggestionStepId,
    isAddStepOpen,
    toggleAddStep,
    createStepLockReason,
    newStep,
    updateNewStep,
    getStepLockReason,
    getSuggestionDraft: getStepSuggestionDraft,
    updateStep: handleStepUpdate,
    deleteStep: handleDeleteStep,
    updateSuggestionDraft: updateStepSuggestionDraft,
    generateSuggestion: handleGenerateStepSuggestion,
    saveSuggestion: handleSaveStepSuggestion,
    actionSuggestion: handleActionStepSuggestion,
    beginReorder: beginReorderSteps,
    cancelReorder: cancelReorderSteps,
    saveReorder: saveReorderSteps,
    moveReorderStep,
    createStep: handleCreateStep,
  } = useTaskWorkflowController({
    task,
    taskSteps,
    setTaskSteps,
    users,
    userRole,
    currentUserId,
    setUpdating,
    onHistoryChanged: loadHistory,
    onRefresh,
    onError: setStatusError,
  });
  const {
    linkedNotices,
    noticeLinking,
    linkNotice: handleLinkNotice,
    unlinkNotice: handleUnlinkNotice,
    confirmSuggestedMember: handleConfirmSuggestedMember,
    keepUnlinked: handleKeepUnlinked,
  } = useTaskRelationshipController({
    task,
    setUpdating,
    onHistoryChanged: loadHistory,
    onRefresh,
    onError: setStatusError,
  });
  const {
    resolvedAs: resolvedAsEdit,
    setResolvedAs: setResolvedAsEdit,
    resolutionType: resolutionTypeEdit,
    setResolutionType: setResolutionTypeEdit,
    customerOutcome: customerOutcomeEdit,
    setCustomerOutcome: setCustomerOutcomeEdit,
    resolutionSummary: resolutionSummaryEdit,
    setResolutionSummary: setResolutionSummaryEdit,
    followUpRequired: followUpRequiredEdit,
    setFollowUpRequired: setFollowUpRequiredEdit,
    followUpDueAt: followUpDueAtEdit,
    setFollowUpDueAt: setFollowUpDueAtEdit,
    followUpSummary: followUpSummaryEdit,
    setFollowUpSummary: setFollowUpSummaryEdit,
    assignTask: handleAssignment,
    saveOutcome: handleSaveOutcome,
  } = useTaskOutcomeController({
    task,
    setUpdating,
    onHistoryChanged: loadHistory,
    onRefresh,
    onError: setStatusError,
  });

  function formatInboundMethod(method?: string | null) {
    if (!method) return 'Unknown';
    return humanize(method, 'Unknown');
  }

  function formatIdentityResolutionStatus(status?: string | null) {
    if (!status) return 'Unresolved';
    return humanize(status, 'Unresolved');
  }

  function formatAutomationType(value?: string | null) {
    if (!value) return 'Automated follow-up';
    return humanize(value, 'Automated follow-up');
  }

  const assigneeName =
    task.Assignee?.displayName ||
    users.find((user) => user.id === task.assigneeId)?.displayName ||
    'Unassigned';
  const requesterName = task.Member
    ? `${task.Member.firstName || ''} ${task.Member.lastName || ''}`.trim()
    : manualIntake?.requesterName || 'Visitor / Internal task';
  const taskAttachmentLockReason = !canOverrideStepOwnership
    && task.assigneeId
    && Number(task.assigneeId) !== Number(currentUserId)
    ? `Task assigned to ${assigneeName}.`
    : '';
  const panelItems: Array<{ key: TaskPanelKey; label: string; detail: string }> = [
    {
      key: 'work',
      label: 'Work',
      detail: `${orderedTaskSteps.length} step${orderedTaskSteps.length === 1 ? '' : 's'}`,
    },
    {
      key: 'customer',
      label: 'Customer',
      detail: task.Member
        ? 'Linked record'
        : manualIntake
          ? formatIdentityResolutionStatus(manualIntake.identityResolutionStatus)
          : 'Requester',
    },
    {
      key: 'conversation',
      label: 'Conversation',
      detail: `${safeTaskMessages.length} message${safeTaskMessages.length === 1 ? '' : 's'}`,
    },
    {
      key: 'files',
      label: 'Files & Links',
      detail: `${linkedNotices.length} notice${linkedNotices.length === 1 ? '' : 's'}`,
    },
    { key: 'outcome', label: 'Outcome', detail: humanize(task.status) },
    {
      key: 'activity',
      label: 'Activity',
      detail: `${safeTaskActions.length} item${safeTaskActions.length === 1 ? '' : 's'}`,
    },
  ];
  const involvement = taskInvolvement(task, currentUserId ? { id: currentUserId, role: userRole || '', areaIds: currentUserAreaIds } : null);

  return (
    <div
      id={`task-${task.id}`}
      data-task-card-id={task.id}
      data-show-advanced-activity={showAdvancedActivity ? 'true' : 'false'}
      className={`min-w-0 rounded-lg border bg-[var(--surface)] p-4 shadow-sm transition-all duration-300 lg:grid lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start lg:gap-5 lg:p-5
                ${highlighted ? 'ring-2 ring-[var(--accent)] bg-teal-50/30' : ''}
                ${involvementSurfaceClass(involvement)}
            `}
    >
      {statusError && (
        <div role="alert" className="mb-4 flex items-start justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <p>{statusError}</p>
          <button type="button" onClick={() => setStatusError(null)} className="shrink-0 font-semibold underline">Dismiss</button>
        </div>
      )}
      <div className="min-w-0 w-full space-y-4">
        <TaskCardOverview
          task={task}
          users={users}
          orderedSteps={orderedTaskSteps}
          requesterName={requesterName}
          isFlagged={isFlagged}
          panelItems={panelItems}
          activePanel={activePanel}
          getStepLockReason={getStepLockReason}
          onToggleFlag={onToggleStar}
          onSelectPanel={selectPanel}
          involvement={involvement}
        />

        {activePanel === 'customer' && (
          <div className="space-y-4">
            <TaskCustomerSummary
              task={task}
              requesterName={requesterName}
              manualIntake={manualIntake}
            />

            {manualIntake && (
              <TaskSection
                title="Intake"
                summary={`${manualIntake.taskOrigin || 'UNKNOWN'} / ${formatInboundMethod(manualIntake.inboundMethod)} / ${formatIdentityResolutionStatus(manualIntake.identityResolutionStatus)}`}
              >
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Intake
                  </div>
                  <span className="px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider bg-white border border-slate-200 text-slate-700">
                    {manualIntake.taskOrigin || 'UNKNOWN'}
                  </span>
                  <span className="px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider bg-white border border-slate-200 text-slate-700">
                    {formatInboundMethod(manualIntake.inboundMethod)}
                  </span>
                  <span
                    className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider border ${
                      manualIntake.identityResolutionStatus === 'REVIEW_REQUIRED'
                        ? 'bg-amber-100 text-amber-800 border-amber-200'
                        : manualIntake.identityResolutionStatus === 'AUTO_LINKED' ||
                            manualIntake.identityResolutionStatus === 'AUTO_CREATED' ||
                            manualIntake.identityResolutionStatus === 'REVIEW_CONFIRMED' ||
                            manualIntake.identityResolutionStatus === 'MANUALLY_LINKED' ||
                            manualIntake.identityResolutionStatus === 'SELECTED_MEMBER'
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                          : 'bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    {formatIdentityResolutionStatus(manualIntake.identityResolutionStatus)}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Requester
                    </div>
                    <div className="text-slate-900">{manualIntake.requesterName || 'Unknown'}</div>
                  </div>
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Email
                    </div>
                    <div className="text-slate-900">
                      {manualIntake.requesterEmail || 'No email captured'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Phone
                    </div>
                    <div className="text-slate-900">
                      {manualIntake.requesterPhone || 'No phone captured'}
                    </div>
                  </div>
                </div>

                <div className="mt-3 text-xs text-slate-600">
                  Confidence: {manualIntake.identityConfidence || 'NONE'}
                  {manualIntake.memberMatchReason
                    ? ` • Match: ${manualIntake.memberMatchReason}`
                    : ''}
                  {manualIntake.suggestedMemberReason
                    ? ` • Review reason: ${manualIntake.suggestedMemberReason}`
                    : ''}
                </div>

                {manualIntake.identityResolutionStatus === 'REVIEW_REQUIRED' &&
                  Array.isArray(manualIntake.suggestedCandidates) &&
                  manualIntake.suggestedCandidates.length > 0 &&
                  !task.Member && (
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <div className="text-sm font-semibold text-amber-900">
                        Possible existing customers
                      </div>
                      <div className="mt-1 text-xs text-amber-800">
                        These matches were strong enough to surface, but not strong enough to
                        auto-link safely.
                      </div>
                      <div className="mt-3 space-y-2">
                        {manualIntake.suggestedCandidates.map(
                          (candidate: IdentitySuggestedCandidate) => (
                            <div
                              key={candidate.memberId}
                              className="rounded border border-amber-200 bg-white p-3"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <div className="text-sm font-semibold text-slate-900">
                                    {candidate.label || `Member ${candidate.memberId}`}
                                  </div>
                                  <div className="text-xs text-slate-600">
                                    {candidate.email || 'No email'} •{' '}
                                    {candidate.phone || 'No phone'}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="px-2 py-1 rounded bg-amber-100 text-amber-800 text-[11px] font-bold uppercase">
                                    {candidate.confidence || 'LOW'}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleConfirmSuggestedMember(candidate.memberId)}
                                    disabled={updating}
                                    className="px-3 py-1.5 rounded bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 disabled:opacity-50"
                                  >
                                    Link This Customer
                                  </button>
                                </div>
                              </div>
                              <div className="mt-2 text-xs text-slate-600">
                                {candidate.reason || 'Suggested match'}
                                {candidate.score ? ` • Score ${candidate.score}` : ''}
                              </div>
                            </div>
                          )
                        )}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={handleKeepUnlinked}
                          disabled={updating}
                          className="px-3 py-1.5 rounded border border-amber-300 bg-white text-amber-900 text-xs font-bold hover:bg-amber-100 disabled:opacity-50"
                        >
                          Keep Unlinked
                        </button>
                      </div>
                    </div>
                  )}
              </TaskSection>
            )}

            <TaskRequestSummary task={task} />
          </div>
        )}

        {activePanel === 'files' && (
          <TaskFilesPanel
            taskId={task.id}
            attachmentLockReason={taskAttachmentLockReason}
            canDeleteAllAttachments={canOverrideStepOwnership}
            currentUserId={currentUserId}
            linkedNotices={linkedNotices}
            canManageNoticeLinks={canManageNoticeLinks}
            noticeLinking={noticeLinking}
            onHistoryChanged={loadHistory}
            onUnlinkNotice={handleUnlinkNotice}
            onLinkNotice={handleLinkNotice}
          />
        )}

        {activePanel === 'outcome' && (
          <div className="space-y-4">
            <TaskOutcomeEditor
              task={task}
              assigneeName={assigneeName}
              userRole={userRole}
              canAssign={canAssign}
              isStaffAssignmentReview={isStaffAssignmentReview}
              assignmentUsers={assignmentUsers}
              updating={updating}
              resolvedAs={resolvedAsEdit}
              resolutionType={resolutionTypeEdit}
              customerOutcome={customerOutcomeEdit}
              resolutionSummary={resolutionSummaryEdit}
              followUpRequired={followUpRequiredEdit}
              followUpDueAt={followUpDueAtEdit}
              followUpSummary={followUpSummaryEdit}
              attachmentLockReason={taskAttachmentLockReason}
              canDeleteAllAttachments={canOverrideStepOwnership}
              currentUserId={currentUserId}
              onStatusChange={handleStatusChange}
              onAssignment={handleAssignment}
              onResolvedAsChange={setResolvedAsEdit}
              onResolutionTypeChange={setResolutionTypeEdit}
              onCustomerOutcomeChange={setCustomerOutcomeEdit}
              onResolutionSummaryChange={setResolutionSummaryEdit}
              onFollowUpRequiredChange={setFollowUpRequiredEdit}
              onFollowUpDueAtChange={setFollowUpDueAtEdit}
              onFollowUpSummaryChange={setFollowUpSummaryEdit}
              onSave={handleSaveOutcome}
              onHistoryChanged={loadHistory}
            />

            {(followUpAutomation?.isAutoGenerated || subTasks.length > 0) && (
              <TaskSection
                title="Linked Follow-ups"
                summary={
                  followUpAutomation?.automationType
                    ? formatAutomationType(followUpAutomation.automationType)
                    : 'Generated follow-up tasks'
                }
                count={subTasks.length}
              >
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-cyan-700">
                      Follow-up Automation
                    </div>
                    <div className="text-sm text-cyan-900">
                      Automated follow-up tasks keep the case moving after closure without relying
                      on memory or ad hoc notes.
                    </div>
                  </div>
                </div>

                {followUpAutomation?.isAutoGenerated && task.ParentTask && (
                  <div className="mb-4 rounded-lg border border-cyan-200 bg-white p-3 text-sm text-cyan-950">
                    <div className="font-semibold">
                      This task was auto-generated from task #{task.ParentTask.id}
                    </div>
                    <div className="mt-1 text-xs text-cyan-800">
                      {formatAutomationType(followUpAutomation.automationType)} • Parent outcome{' '}
                      {formatEnumLabel(task.ParentTask.resolvedAs || task.ParentTask.status)}
                    </div>
                  </div>
                )}

                {subTasks.length > 0 && (
                  <div className="space-y-3">
                    <div className="text-sm font-semibold text-cyan-900">
                      Generated follow-up tasks
                    </div>
                    {subTasks
                      .slice()
                      .sort(
                        (a, b) =>
                          new Date(a.dueAt || a.createdAt).getTime() -
                          new Date(b.dueAt || b.createdAt).getTime()
                      )
                      .map((subTask) => {
                        const automationMeta = subTask.payload?.followUpAutomation;
                        return (
                          <div
                            key={subTask.id}
                            className="rounded-lg border border-cyan-200 bg-white p-3"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <div className="text-sm font-semibold text-slate-900">
                                  Task #{subTask.id} •{' '}
                                  {(subTask.subType || subTask.type || 'FOLLOW UP').replace(
                                    /_/g,
                                    ' '
                                  )}
                                </div>
                                <div className="mt-1 text-xs text-slate-600">
                                  {formatAutomationType(automationMeta?.automationType)} • Due{' '}
                                  {subTask.dueAt
                                    ? new Date(subTask.dueAt).toLocaleString()
                                    : 'not scheduled'}
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`px-2 py-1 rounded text-[11px] font-bold uppercase tracking-wider ${
                                    subTask.status === 'PENDING'
                                      ? 'bg-yellow-100 text-yellow-800 border border-yellow-200'
                                      : subTask.status === 'ACTIONED'
                                        ? 'bg-green-100 text-green-800 border border-green-200'
                                        : 'bg-red-100 text-red-800 border border-red-200'
                                  }`}
                                >
                                  {formatEnumLabel(subTask.status)}
                                </span>
                                {subTask.Assignee && (
                                  <span className="px-2 py-1 rounded bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-bold uppercase tracking-wider">
                                    {subTask.Assignee.displayName}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="mt-2 text-sm text-slate-700">
                              {subTask.payload?.summary || 'No follow-up summary recorded.'}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </TaskSection>
            )}
          </div>
        )}

        {activePanel === 'work' && (
          <div className="space-y-4">
            <TaskWorkflowPanel
              summary={task.nextStepSummary}
              steps={orderedTaskSteps}
              users={users}
              userRole={userRole}
              currentUserId={currentUserId}
              updating={updating}
              openStepId={openStepId}
              canReorder={canReorderSteps}
              canOverrideOwnership={canOverrideStepOwnership}
              reorderMode={reorderMode}
              reorderDraft={reorderDraft}
              draggedStepId={draggedStepId}
              activeSuggestionStepId={activeSuggestionStepId}
              isAddStepOpen={isAddStepOpen}
              createStepLockReason={createStepLockReason}
              newStep={newStep}
              getStepLockReason={getStepLockReason}
              getSuggestionDraft={getStepSuggestionDraft}
              onToggleStep={toggleStep}
              onUpdateStep={handleStepUpdate}
              onDeleteStep={handleDeleteStep}
              onHistoryChanged={() => {
                void loadHistory();
              }}
              onSuggestionDraftChange={updateStepSuggestionDraft}
              onGenerateSuggestion={handleGenerateStepSuggestion}
              onSaveSuggestion={handleSaveStepSuggestion}
              onActionSuggestion={handleActionStepSuggestion}
              onBeginReorder={beginReorderSteps}
              onCancelReorder={cancelReorderSteps}
              onSaveReorder={saveReorderSteps}
              onMoveReorderStep={moveReorderStep}
              onDraggedStepChange={setDraggedStepId}
              onToggleAddStep={toggleAddStep}
              onNewStepChange={updateNewStep}
              onCreateStep={handleCreateStep}
            />
          </div>
        )}

        {(activePanel === 'conversation' || activePanel === 'activity') && (
          <div className="space-y-4">
            <TaskConversationActivityPanel
              panel={activePanel}
              taskId={task.id}
              messages={safeTaskMessages}
              allActivityCount={safeTaskActions.length}
              visibleActions={visibleTaskActions}
              users={users}
              userRole={userRole}
              currentUserId={currentUserId}
              updating={updating}
              historyOpen={historyOpen}
              historyLoading={historyLoading}
              historyError={historyError}
              showAdvancedActivity={showAdvancedActivity}
              noteDraft={noteEdit}
              isPrivateNote={isPrivateNote}
              mentionActive={mentionActive}
              mentionOptions={mentionOptions}
              onAdvancedActivityChange={handleAdvancedActivityToggle}
              onToggleNotePrivacy={handleToggleNotePrivacy}
              onNoteChange={handleNoteChange}
              onInsertMention={insertMention}
              onPrivateNoteChange={setIsPrivateNote}
              onAddNote={handleAddNote}
            />

            {activePanel === 'conversation' && task.status === 'PENDING' && (
              <TaskRecommendedActionEditor
                draft={recommendedActionDraft}
                expanded={expandedActions}
                updating={updating}
                assigneeLabel={
                  task.Assignee?.displayName
                    ? `${task.Assignee.displayName}${task.Assignee.email ? ` <${task.Assignee.email}>` : ' (Staff)'}`
                    : 'Winery System'
                }
                responseTargetPhone={responseTargetPhone}
                emailFallback={
                  task.suggestedRecipientEmail ||
                  task.Member?.email ||
                  manualIntake?.requesterEmail ||
                  ''
                }
                subjectFallback={
                  task.suggestedReplySubject ||
                  `Re: ${task.subType ? humanize(task.subType) : task.category ? humanize(task.category) : 'Task'}`
                }
                onDraftChange={(updates) =>
                  setRecommendedActionDraft((previous) => ({ ...previous, ...updates }))
                }
                onExpandedChange={setExpandedActions}
                onRegenerate={handleRegenerateSuggestion}
                onAction={() => handleStatusChange('ACTIONED')}
              />
            )}
          </div>
        )}
      </div>

      <TaskCardSidebar
        task={task}
        assigneeName={assigneeName}
        messageCount={safeTaskMessages.length}
        workflowStepCount={orderedTaskSteps.length}
        linkedNoticeCount={linkedNotices.length}
        panelItems={panelItems}
        activePanel={activePanel}
        onSelectPanel={selectPanel}
      />
    </div>
  );
}
