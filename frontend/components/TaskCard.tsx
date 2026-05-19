'use client';

import { Component, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
    Task,
    TaskAction,
    TaskStepInput,
    TaskMessage,
    TaskStep,
    IdentitySuggestedCandidate,
    actionTaskStepSuggestion,
    createTaskStep,
    deleteTaskStep,
    generateTaskStepSuggestion,
    getTask,
    linkTaskNotice,
    Notice,
    reorderTaskSteps,
    unlinkTaskNotice,
    updateTask,
    updateNotePrivacy,
    updateTaskStep,
    Staff
} from '../lib/api';
import AttachmentPanel from './AttachmentPanel';

interface TaskCardProps {
    task: Task;
    users?: Staff[];
    onRefresh: () => void;
    canAssign?: boolean;
    userRole?: string | null;
    currentUserId?: number | null;
    isFlagged?: boolean;
    highlighted?: boolean;
    onToggleFlag?: (taskId: number) => void;
    autoExpand?: boolean;
    initialShowAdvancedActivity?: boolean;
}

const RESOLVED_AS_OPTIONS = ['COMPLETED', 'WORKAROUND', 'ESCALATED', 'DECLINED', 'DUPLICATE', 'NO_ACTION'];
const RESOLUTION_TYPE_OPTIONS = [
    'EXECUTED',
    'REPLIED',
    'MANUAL_WORKAROUND',
    'POLICY_DECLINE',
    'CUSTOMER_NO_RESPONSE',
    'NO_ACTION_NEEDED',
    'SPAM_OR_INVALID',
    'EXTERNAL_ESCALATION',
    'INTERNAL_ESCALATION',
    'MERGED_DUPLICATE',
    'ALREADY_RESOLVED',
    'INFO_ONLY'
];
const CUSTOMER_OUTCOME_OPTIONS = [
    'BOOKING_CONFIRMED',
    'ORDER_UPDATED',
    'ACCOUNT_UPDATED',
    'INFO_PROVIDED',
    'ISSUE_RESOLVED',
    'REQUEST_DECLINED',
    'REFERRED',
    'NO_CHANGE',
    'UNKNOWN'
];

const BASIC_ACTIVITY_ACTION_TYPES = new Set([
    'ACTIONED',
    'REJECTED',
    'ASSIGNED',
    'LINKED_TASK',
    'NOTE_ADDED',
    'STEP_COMPLETED',
    'ATTACHMENT_ADDED',
    'ATTACHMENT_DELETED',
    'EXECUTION_TRIGGERED',
    'EXECUTION_RECORDED',
    'OUTCOME_RECORDED',
    'MEMBER_ENRICHED'
]);

const BASIC_MANUAL_UPDATE_FIELDS = new Set(['memberId', 'priority', 'dueAt', 'parentTaskId']);
const TASK_MODAL_DEBUG_KEY = 'vinagent:debug-task-modal';
const EMPTY_STAFF_LIST: Staff[] = [];

type TaskUpdatePayload = Partial<Task> & {
    isPrivateNote?: boolean;
};

function errorMessage(error: unknown, fallback = 'Unknown error') {
    return error instanceof Error ? error.message : fallback;
}

function isHighImpactActivity(action: TaskAction) {
    if (BASIC_ACTIVITY_ACTION_TYPES.has(action.actionType)) return true;
    if (action.actionType !== 'MANUAL_UPDATE') return false;

    const changes = action.details?.changes || {};
    return Object.keys(changes).some(key => BASIC_MANUAL_UPDATE_FIELDS.has(key));
}

function displayActionValue(value: unknown) {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);

    try {
        const seen = new WeakSet();
        const serialized = JSON.stringify(value, (_key, nestedValue) => {
            if (typeof nestedValue === 'bigint') return String(nestedValue);
            if (typeof nestedValue === 'symbol') return nestedValue.toString();
            if (typeof nestedValue === 'function') return '[Function]';
            if (nestedValue && typeof nestedValue === 'object') {
                if (seen.has(nestedValue)) return '[Circular]';
                seen.add(nestedValue);
            }
            return nestedValue;
        });
        if (serialized === undefined) return String(value);
        return serialized;
    } catch {
        try {
            return String(value);
        } catch {
            return '[Unable to display value]';
        }
    }
}

function objectEntries(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    try {
        return Object.entries(value);
    } catch {
        return [];
    }
}

function isDetailRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function truncateDisplayValue(value: string, maxLength = 2000) {
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength)}... [truncated]`;
}

function displayAdvancedValue(value: unknown) {
    return truncateDisplayValue(displayActionValue(value));
}

function formatActivityType(value?: string | null) {
    if (!value) return 'Activity';
    return String(value).replace(/_/g, ' ');
}

function actionTimestamp(action: TaskAction) {
    const time = new Date(action.createdAt || 0).getTime();
    return Number.isFinite(time) ? time : 0;
}

function actionKey(action: TaskAction, index: number) {
    return action.id ?? `${action.actionType || 'activity'}-${actionTimestamp(action)}-${index}`;
}

function isTaskModalDebugEnabled() {
    if (typeof window === 'undefined') return false;

    try {
        return window.sessionStorage.getItem(TASK_MODAL_DEBUG_KEY) === '1'
            || new URLSearchParams(window.location.search).get('debugTaskModal') === '1';
    } catch {
        return false;
    }
}

function logTaskModalDebugFlat(label: string, payload: unknown) {
    if (!isTaskModalDebugEnabled()) return;

    try {
        console.info(`[TaskModalDebugFlat] ${label} ${JSON.stringify(payload)}`);
    } catch {
        console.info(`[TaskModalDebugFlat] ${label} [payload could not be serialized]`);
    }
}

function detailSnippet(value: unknown) {
    return truncateDisplayValue(displayActionValue(value), 500);
}

function elementSnapshot(label: string, element: Element | null) {
    if (!element || typeof window === 'undefined') {
        return { label, exists: false };
    }

    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    return {
        label,
        exists: true,
        rect: {
            top: Math.round(rect.top),
            left: Math.round(rect.left),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            bottom: Math.round(rect.bottom),
            right: Math.round(rect.right)
        },
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        position: style.position,
        overflow: `${style.overflowX}/${style.overflowY}`,
        scroll: {
            top: Math.round(element.scrollTop),
            left: Math.round(element.scrollLeft),
            height: Math.round(element.scrollHeight),
            width: Math.round(element.scrollWidth),
            clientHeight: Math.round(element.clientHeight),
            clientWidth: Math.round(element.clientWidth)
        },
        pointerEvents: style.pointerEvents,
        zIndex: style.zIndex
    };
}

interface TaskActivityErrorBoundaryProps {
    children: ReactNode;
}

interface TaskActivityErrorBoundaryState {
    hasError: boolean;
}

class TaskActivityErrorBoundary extends Component<TaskActivityErrorBoundaryProps, TaskActivityErrorBoundaryState> {
    state = { hasError: false };

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    Some activity details could not be displayed, but the task itself is still available.
                </div>
            );
        }

        return this.props.children;
    }
}

interface TaskActivityDetailsProps {
    action: TaskAction;
    showAdvancedActivity: boolean;
    renderBasicDetails: (action: TaskAction) => ReactNode;
    renderAdvancedDetails: (action: TaskAction) => ReactNode;
}

function TaskActivityDetails({
    action,
    showAdvancedActivity,
    renderBasicDetails,
    renderAdvancedDetails
}: TaskActivityDetailsProps) {
    return (
        <>{showAdvancedActivity ? renderAdvancedDetails(action) : renderBasicDetails(action)}</>
    );
}

interface TaskSectionProps {
    title: string;
    summary?: string;
    count?: number;
    open: boolean;
    onToggle: () => void;
    children: ReactNode;
}

function TaskSection({ title, summary, count, open, onToggle, children }: TaskSectionProps) {
    return (
        <section className="overflow-hidden rounded-lg border border-[#dfe6da] bg-white">
            <button
                type="button"
                onClick={onToggle}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-[#f8faf6]"
                aria-expanded={open}
            >
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-[#344039]">{title}</span>
                        {typeof count === 'number' && (
                            <span className="rounded bg-white px-2 py-0.5 text-[11px] font-bold text-slate-500 ring-1 ring-slate-200">
                                {count}
                            </span>
                        )}
                    </div>
                    {summary && <div className="mt-1 truncate text-sm text-slate-600">{summary}</div>}
                </div>
                <span className={`shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 9 6 6 6-6" />
                    </svg>
                </span>
            </button>
            {open && <div className="border-t border-slate-200 p-4">{children}</div>}
        </section>
    );
}

function defaultTaskSections(task: Task) {
    const manualIntake = task.payload?.manualIntake || null;
    return {
        intake: Boolean(manualIntake?.identityResolutionStatus === 'REVIEW_REQUIRED'),
        request: true,
        workflow: false,
        outcome: task.status !== 'PENDING',
        followups: Boolean(task.payload?.followUpAutomation?.isAutoGenerated || task.SubTasks?.length),
        notices: Boolean(task.LinkedNotices?.length),
        attachments: false,
        steps: true,
        activity: false
    };
}

function sortedTaskSteps(steps: TaskStep[]) {
    return [...steps].sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.id - b.id;
    });
}

function defaultOpenStepId(steps: TaskStep[]) {
    const sorted = sortedTaskSteps(steps);
    return sorted.find(step => step.status === 'IN_PROGRESS')?.id
        ?? sorted.find(step => step.status === 'BLOCKED')?.id
        ?? sorted.find(step => step.status === 'PENDING')?.id
        ?? sorted[0]?.id
        ?? null;
}

function humanize(value?: string | null, fallback = 'Not recorded') {
    if (!value) return fallback;
    return String(value).replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
}

function formatShortDate(value?: string | null) {
    if (!value) return 'Not set';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Not set';
    return new Intl.DateTimeFormat('en-AU', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit'
    }).format(date);
}

function stepStatusClasses(status?: string | null) {
    if (status === 'COMPLETED') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    if (status === 'BLOCKED') return 'border-red-200 bg-red-50 text-red-800';
    if (status === 'IN_PROGRESS') return 'border-blue-200 bg-blue-50 text-blue-800';
    if (status === 'PENDING') return 'border-amber-200 bg-amber-50 text-amber-800';
    return 'border-slate-200 bg-slate-50 text-slate-700';
}

function workflowStateClasses(state?: string | null) {
    if (state === 'COMPLETED') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    if (state === 'BLOCKED') return 'border-red-200 bg-red-50 text-red-800';
    if (state === 'WAITING') return 'border-amber-200 bg-amber-50 text-amber-800';
    if (state === 'IN_PROGRESS') return 'border-blue-200 bg-blue-50 text-blue-800';
    return 'border-slate-200 bg-slate-50 text-slate-700';
}

function CaseSidebarItem({
    label,
    value,
    tone = 'normal'
}: {
    label: string;
    value: string;
    tone?: 'normal' | 'warning' | 'danger';
}) {
    const valueClass = tone === 'danger'
        ? 'text-red-700'
        : tone === 'warning'
            ? 'text-amber-700'
            : 'text-[#1c231f]';

    return (
        <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">{label}</div>
            <div className={`mt-0.5 break-words font-medium ${valueClass}`}>{value}</div>
        </div>
    );
}

export default function TaskCard({
    task,
    users: rawUsers = EMPTY_STAFF_LIST,
    onRefresh,
    canAssign = true,
    userRole,
    currentUserId,
    isFlagged = false,
    highlighted = false,
    onToggleFlag,
    autoExpand = false,
    initialShowAdvancedActivity = false
}: TaskCardProps) {
    const users = useMemo(() => Array.isArray(rawUsers) ? rawUsers : EMPTY_STAFF_LIST, [rawUsers]);
    const [updating, setUpdating] = useState(false);
    const [replyEdit, setReplyEdit] = useState(task.suggestedReplyBody || '');
    const [subjectEdit, setSubjectEdit] = useState(task.suggestedReplySubject || '');
    const [channelEdit, setChannelEdit] = useState(task.suggestedChannel || 'email');
    const [actionEdit, setActionEdit] = useState(task.suggestedAction || '');
    const [recipientEmailEdit, setRecipientEmailEdit] = useState(task.suggestedRecipientEmail || '');
    const [ccEmailEdit, setCcEmailEdit] = useState(task.suggestedCc || '');
    const [expandedActions, setExpandedActions] = useState(false);
    const [noteEdit, setNoteEdit] = useState('');
    const [isPrivateNote, setIsPrivateNote] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(autoExpand);
    const [showAdvancedActivity, setShowAdvancedActivity] = useState(initialShowAdvancedActivity);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState('');
    const [taskActions, setTaskActions] = useState<TaskAction[]>(task.TaskActions || []);
    const [taskMessages, setTaskMessages] = useState<TaskMessage[]>(task.Messages || (task.Message ? [task.Message] : []));
    const [taskSteps, setTaskSteps] = useState<TaskStep[]>(task.TaskSteps || []);
    const [openStepId, setOpenStepId] = useState<number | null>(() => defaultOpenStepId(task.TaskSteps || []));
    const [reorderMode, setReorderMode] = useState(false);
    const [reorderDraft, setReorderDraft] = useState<TaskStep[]>(() => sortedTaskSteps(task.TaskSteps || []));
    const [draggedStepId, setDraggedStepId] = useState<number | null>(null);
    const [stepSuggestionDrafts, setStepSuggestionDrafts] = useState<Record<number, Partial<TaskStep>>>({});
    const [activeStepSuggestionId, setActiveStepSuggestionId] = useState<number | null>(null);
    const [subTasks, setSubTasks] = useState<Task[]>(task.SubTasks || []);
    const [linkedNotices, setLinkedNotices] = useState<Notice[]>(task.LinkedNotices || []);
    const [noticeIdInput, setNoticeIdInput] = useState('');
    const [noticeLinking, setNoticeLinking] = useState(false);
    const [newStepTitle, setNewStepTitle] = useState('');
    const [newStepDescription, setNewStepDescription] = useState('');
    const [newStepType, setNewStepType] = useState('INTERNAL');
    const [newStepWaitingOn, setNewStepWaitingOn] = useState('STAFF');
    const [newStepOwnerId, setNewStepOwnerId] = useState<number | ''>(task.assigneeId || '');
    const [newStepDueAt, setNewStepDueAt] = useState('');
    const [newStepInsertPosition, setNewStepInsertPosition] = useState('end');
    const [resolvedAsEdit, setResolvedAsEdit] = useState(task.resolvedAs || '');
    const [resolutionTypeEdit, setResolutionTypeEdit] = useState(task.resolutionType || '');
    const [customerOutcomeEdit, setCustomerOutcomeEdit] = useState(task.customerOutcome || '');
    const [resolutionSummaryEdit, setResolutionSummaryEdit] = useState(task.resolutionSummary || '');
    const [followUpRequiredEdit, setFollowUpRequiredEdit] = useState(Boolean(task.followUpRequired));
    const [followUpDueAtEdit, setFollowUpDueAtEdit] = useState('');
    const [followUpSummaryEdit, setFollowUpSummaryEdit] = useState(task.followUpSummary || '');
    const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => defaultTaskSections(task));

    // Mentions state
    const [mentionActive, setMentionActive] = useState(false);
    const [mentionQuery, setMentionQuery] = useState('');
    const [mentionStartIndex, setMentionStartIndex] = useState(-1);
    const [mentionOptions, setMentionOptions] = useState<Staff[]>([]);

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

        return taskSteps.some(step => {
            const metadata = metadataFor(step) as { reason?: string; assignmentTargetRole?: string };
            return metadata.reason === 'STAFF_CREATED_UNASSIGNED' && metadata.assignmentTargetRole === 'staff';
        });
    }, [taskSteps]);

    const assignmentUsers = useMemo(() => (
        isStaffAssignmentReview
            ? users.filter(user => user.role === 'staff')
            : users
    ), [isStaffAssignmentReview, users]);
    const canManageNoticeLinks = userRole === 'manager' || userRole === 'admin';
    const canReorderSteps = userRole === 'manager' || userRole === 'admin';
    const canOverrideStepOwnership = userRole === 'manager' || userRole === 'admin';

    function stepOwnerName(step: TaskStep) {
        return step.Owner?.displayName
            || users.find(user => user.id === step.ownerUserId)?.displayName
            || 'assigned staff member';
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

    function getTaskAttachmentLockReason() {
        if (canOverrideStepOwnership) return '';
        if (task.assigneeId && Number(task.assigneeId) !== Number(currentUserId)) {
            return `Task assigned to ${assigneeName}.`;
        }
        return '';
    }

    useEffect(() => {
        setReplyEdit(task.suggestedReplyBody || '');
        setSubjectEdit(task.suggestedReplySubject || '');
        setChannelEdit(task.suggestedChannel || 'email');
        setActionEdit(task.suggestedAction || '');
        setRecipientEmailEdit(task.suggestedRecipientEmail || '');
        setCcEmailEdit(task.suggestedCc || '');
        setTaskActions(task.TaskActions || []);
        setTaskMessages(task.Messages || (task.Message ? [task.Message] : []));
        setTaskSteps(task.TaskSteps || []);
        setReorderDraft(sortedTaskSteps(task.TaskSteps || []));
        setOpenStepId(defaultOpenStepId(task.TaskSteps || []));
        setStepSuggestionDrafts({});
        setSubTasks(task.SubTasks || []);
        setLinkedNotices(task.LinkedNotices || []);
        setNoticeIdInput('');
        setNewStepOwnerId(task.assigneeId || '');
        setResolvedAsEdit(task.resolvedAs || '');
        setResolutionTypeEdit(task.resolutionType || '');
        setCustomerOutcomeEdit(task.customerOutcome || '');
        setResolutionSummaryEdit(task.resolutionSummary || '');
        setFollowUpRequiredEdit(Boolean(task.followUpRequired));
        setFollowUpDueAtEdit(formatDateTimeInput(task.followUpDueAt));
        setFollowUpSummaryEdit(task.followUpSummary || '');
        setOpenSections(defaultTaskSections(task));
    }, [task]);

    function toggleSection(sectionKey: string) {
        setOpenSections(prev => ({
            ...prev,
            [sectionKey]: !prev[sectionKey]
        }));
    }

    function toggleStep(stepId: number) {
        setOpenStepId(prev => prev === stepId ? null : stepId);
    }

    async function handleStatusChange(newStatus: string) {
        setUpdating(true);
        try {
            const updates: Partial<Task> = { status: newStatus };
            if (newStatus === 'ACTIONED') {
                const nextChannel = channelEdit || 'none';
                updates.suggestedReplyBody = replyEdit;
                updates.suggestedChannel = nextChannel;
                updates.suggestedReplySubject = nextChannel === 'email' ? subjectEdit : '';
                updates.suggestedAction = actionEdit;
                updates.suggestedRecipientEmail = nextChannel === 'email' ? recipientEmailEdit : '';
                updates.suggestedCc = nextChannel === 'email' ? ccEmailEdit : '';
            }
            await updateTask(task.id, updates);
            onRefresh();
        } catch (err: unknown) {
            alert('Failed: ' + errorMessage(err));
        } finally {
            setUpdating(false);
        }
    }

    async function handleAssignment(assigneeId: string) {
        if (!assigneeId) return;
        setUpdating(true);
        try {
            await updateTask(task.id, { assigneeId: parseInt(assigneeId) });
            onRefresh();
        } catch (err: unknown) {
            alert('Failed to assign: ' + errorMessage(err));
        } finally {
            setUpdating(false);
        }
    }

    async function handleLinkNotice() {
        const noticeId = Number(noticeIdInput);
        if (!Number.isInteger(noticeId) || noticeId < 1) {
            alert('Enter a valid notice ID.');
            return;
        }

        setNoticeLinking(true);
        try {
            const updated = await linkTaskNotice(task.id, noticeId);
            setLinkedNotices(updated.LinkedNotices || []);
            setNoticeIdInput('');
            onRefresh();
        } catch (err: unknown) {
            alert('Failed to link notice: ' + errorMessage(err));
        } finally {
            setNoticeLinking(false);
        }
    }

    async function handleUnlinkNotice(noticeId: number) {
        setNoticeLinking(true);
        try {
            const updated = await unlinkTaskNotice(task.id, noticeId);
            setLinkedNotices(updated.LinkedNotices || []);
            onRefresh();
        } catch (err: unknown) {
            alert('Failed to unlink notice: ' + errorMessage(err));
        } finally {
            setNoticeLinking(false);
        }
    }

    async function handleAddNote() {
        const note = noteEdit.trim();
        if (!note) return;
        setUpdating(true);
        try {
            await updateTask(task.id, { notes: note, isPrivateNote } as TaskUpdatePayload);
            setNoteEdit('');
            setIsPrivateNote(false);
            setMentionActive(false);
            if (historyOpen) {
                await loadHistory();
            }
            onRefresh();
        } catch (err: unknown) {
            alert('Failed to add note: ' + errorMessage(err));
        } finally {
            setUpdating(false);
        }
    }

    async function handleToggleNotePrivacy(actionId: number, currentIsPrivate: boolean) {
        setUpdating(true);
        try {
            await updateNotePrivacy(task.id, actionId, !currentIsPrivate);
            await loadHistory();
        } catch (err: unknown) {
            alert('Failed to toggle note privacy: ' + errorMessage(err));
        } finally {
            setUpdating(false);
        }
    }

    const canSeePrivateNote = useCallback((action: TaskAction): boolean => {
        // Managers/admins always see everything
        if (userRole === 'manager' || userRole === 'admin') return true;
        // Author can always see their own note
        if (currentUserId && action.userId === currentUserId) return true;
        // If user is @tagged in the note text
        if (currentUserId) {
            const currentUser = users.find(u => u.id === currentUserId);
            if (currentUser?.displayName && action.details?.note) {
                if (action.details.note.includes(`@${currentUser.displayName}`)) return true;
            }
        }
        return false;
    }, [currentUserId, userRole, users]);

    // Handle typing in the note field to detect @mentions
    function handleNoteChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
        const val = e.target.value;
        const pos = e.target.selectionStart || 0;
        setNoteEdit(val);

        // Look backwards from cursor to find an @ symbol
        const textBeforeCursor = val.substring(0, pos);
        const match = textBeforeCursor.match(/(?:^|\s)@([a-zA-Z0-9_]*)$/);

        if (match) {
            const query = match[1].toLowerCase();
            const startIndex = pos - query.length - 1; // -1 for the '@'
            setMentionActive(true);
            setMentionQuery(query);
            setMentionStartIndex(startIndex);

            // Filter users based on query
            const filtered = users.filter(u =>
                u.displayName && u.displayName.toLowerCase().includes(query)
            );
            setMentionOptions(filtered);
        } else {
            setMentionActive(false);
        }
    }

    function insertMention(user: Staff) {
        if (mentionStartIndex === -1 || !user.displayName) return;

        const beforeMention = noteEdit.substring(0, mentionStartIndex);
        const afterCursor = noteEdit.substring(mentionStartIndex + mentionQuery.length + 1); // +1 for '@'

        // Ensure strictly one space after name, replace any existing spaces right after the cursor
        const newText = beforeMention + `@${user.displayName} ` + afterCursor.replace(/^\s+/, '');

        setNoteEdit(newText);
        setMentionActive(false);
        // We ideally want to refocus and reset cursor here, but standard state update works fine for basic UX
    }

    const loadHistory = useCallback(async () => {
        setHistoryLoading(true);
        setHistoryError('');
        try {
            const freshTask = await getTask(task.id);
            setTaskActions(freshTask.TaskActions || []);
            setTaskMessages(freshTask.Messages || (freshTask.Message ? [freshTask.Message] : []));
            setTaskSteps(freshTask.TaskSteps || []);
            setSubTasks(freshTask.SubTasks || []);
        } catch (err: unknown) {
            setHistoryError(errorMessage(err, 'Failed to load history'));
        } finally {
            setHistoryLoading(false);
        }
    }, [task.id]);

    useEffect(() => {
        if (autoExpand) {
            loadHistory();
        }
    }, [autoExpand, loadHistory]);

    async function handleRegenerateSuggestion() {
        setUpdating(true);
        try {
            const refreshedTask = await updateTask(task.id, { regenerateSuggestedReply: true });
            
            // Immediately sync the local React state with the newly generated answers
            setReplyEdit(refreshedTask.suggestedReplyBody || '');
            setSubjectEdit(refreshedTask.suggestedReplySubject || '');
            setChannelEdit(refreshedTask.suggestedChannel || 'email');
            setActionEdit(refreshedTask.suggestedAction || '');
            setRecipientEmailEdit(refreshedTask.suggestedRecipientEmail || '');
            setCcEmailEdit(refreshedTask.suggestedCc || '');

            await loadHistory();
            onRefresh();
        } catch (err: unknown) {
            alert('Failed to generate suggestion: ' + errorMessage(err));
        } finally {
            setUpdating(false);
        }
    }

    async function onToggleStar() {
        if (onToggleFlag) {
            onToggleFlag(task.id);
        }
    }

    async function handleStepUpdate(stepId: number, updates: Partial<TaskStepInput>) {
        const step = taskSteps.find(item => item.id === stepId);
        const lockReason = getStepLockReason(step);
        if (lockReason) {
            alert(`You cannot update this workflow step. ${lockReason}`);
            return;
        }

        setUpdating(true);
        try {
            await updateTaskStep(task.id, stepId, updates);
            await loadHistory();
            onRefresh();
        } catch (err: unknown) {
            alert('Failed to update step: ' + errorMessage(err));
        } finally {
            setUpdating(false);
        }
    }

    function defaultStepSuggestionChannel(step: TaskStep) {
        if (step.suggestedChannel) return step.suggestedChannel;
        if (['CUSTOMER_MESSAGE', 'FOLLOW_UP', 'CUSTOMER_WAIT', 'APPROVAL', 'EXTERNAL'].includes(step.stepType)) {
            return 'email';
        }
        return 'none';
    }

    function getStepSuggestionDraft(step: TaskStep): Partial<TaskStep> {
        return {
            suggestedAction: step.suggestedAction || '',
            suggestedChannel: defaultStepSuggestionChannel(step),
            suggestedRecipientEmail: step.suggestedRecipientEmail || task.suggestedRecipientEmail || task.Member?.email || task.payload?.manualIntake?.requesterEmail || '',
            suggestedCc: step.suggestedCc || task.suggestedCc || '',
            suggestedReplySubject: step.suggestedReplySubject || task.suggestedReplySubject || `Update: ${step.title}`,
            suggestedReplyBody: step.suggestedReplyBody || '',
            ...(stepSuggestionDrafts[step.id] || {})
        };
    }

    function updateStepSuggestionDraft(stepId: number, updates: Partial<TaskStep>) {
        setStepSuggestionDrafts(prev => ({
            ...prev,
            [stepId]: {
                ...(prev[stepId] || {}),
                ...updates
            }
        }));
    }

    async function handleGenerateStepSuggestion(stepId: number) {
        const step = taskSteps.find(item => item.id === stepId);
        const lockReason = getStepLockReason(step);
        if (lockReason) {
            alert(`You cannot generate a draft for this workflow step. ${lockReason}`);
            return;
        }

        setUpdating(true);
        setActiveStepSuggestionId(stepId);
        setOpenStepId(stepId);
        try {
            const generatedStep = await generateTaskStepSuggestion(task.id, stepId, true);
            setTaskSteps(prev => prev.map(step => step.id === stepId ? generatedStep : step));
            setStepSuggestionDrafts(prev => ({
                ...prev,
                [stepId]: {
                    suggestedAction: generatedStep.suggestedAction || '',
                    suggestedChannel: generatedStep.suggestedChannel || defaultStepSuggestionChannel(generatedStep),
                    suggestedRecipientEmail: generatedStep.suggestedRecipientEmail || '',
                    suggestedCc: generatedStep.suggestedCc || '',
                    suggestedReplySubject: generatedStep.suggestedReplySubject || '',
                    suggestedReplyBody: generatedStep.suggestedReplyBody || ''
                }
            }));
            await loadHistory();
            onRefresh();
        } catch (err: unknown) {
            alert('Failed to generate step suggestion: ' + errorMessage(err));
        } finally {
            setActiveStepSuggestionId(null);
            setUpdating(false);
        }
    }

    async function handleSaveStepSuggestion(step: TaskStep) {
        const lockReason = getStepLockReason(step);
        if (lockReason) {
            alert(`You cannot save a draft for this workflow step. ${lockReason}`);
            return;
        }

        const draft = getStepSuggestionDraft(step);
        setUpdating(true);
        setActiveStepSuggestionId(step.id);
        try {
            const savedStep = await updateTaskStep(task.id, step.id, {
                suggestedAction: draft.suggestedAction || null,
                suggestedChannel: draft.suggestedChannel || null,
                suggestedRecipientEmail: draft.suggestedRecipientEmail || null,
                suggestedCc: draft.suggestedCc || null,
                suggestedReplySubject: draft.suggestedReplySubject || null,
                suggestedReplyBody: draft.suggestedReplyBody || null,
                suggestionStatus: 'SAVED'
            });
            setTaskSteps(prev => prev.map(item => item.id === step.id ? savedStep : item));
            setStepSuggestionDrafts(prev => {
                const next = { ...prev };
                delete next[step.id];
                return next;
            });
            await loadHistory();
            onRefresh();
        } catch (err: unknown) {
            alert('Failed to save step suggestion: ' + errorMessage(err));
        } finally {
            setActiveStepSuggestionId(null);
            setUpdating(false);
        }
    }

    async function handleActionStepSuggestion(step: TaskStep) {
        const lockReason = getStepLockReason(step);
        if (lockReason) {
            alert(`You cannot action this workflow step. ${lockReason}`);
            return;
        }

        const draft = getStepSuggestionDraft(step);
        setUpdating(true);
        setActiveStepSuggestionId(step.id);
        try {
            const result = await actionTaskStepSuggestion(task.id, step.id, {
                suggestedAction: draft.suggestedAction || null,
                suggestedChannel: draft.suggestedChannel || null,
                suggestedRecipientEmail: draft.suggestedRecipientEmail || null,
                suggestedCc: draft.suggestedCc || null,
                suggestedReplySubject: draft.suggestedReplySubject || null,
                suggestedReplyBody: draft.suggestedReplyBody || null,
                completeStep: true
            });
            setTaskSteps(prev => prev.map(item => item.id === step.id ? result.step : item));
            setStepSuggestionDrafts(prev => {
                const next = { ...prev };
                delete next[step.id];
                return next;
            });
            await loadHistory();
            onRefresh();
        } catch (err: unknown) {
            alert('Failed to action step suggestion: ' + errorMessage(err));
        } finally {
            setActiveStepSuggestionId(null);
            setUpdating(false);
        }
    }

    async function handleCreateStep() {
        if (!newStepTitle.trim()) return;
        const lockReason = getCreateStepLockReason();
        if (lockReason) {
            alert(`You cannot add workflow steps to this task. ${lockReason}`);
            return;
        }

        setUpdating(true);
        try {
            const insertSortOrder = newStepInsertPosition === 'end'
                ? orderedTaskSteps.length
                : Math.max(0, Math.min(Number(newStepInsertPosition) || 0, orderedTaskSteps.length));
            const createdStep = await createTaskStep(task.id, {
                title: newStepTitle.trim(),
                description: newStepDescription.trim() || null,
                stepType: newStepType,
                waitingOn: newStepWaitingOn,
                ownerUserId: newStepOwnerId === '' ? null : newStepOwnerId,
                dueAt: newStepDueAt ? new Date(newStepDueAt).toISOString() : null,
                sortOrder: insertSortOrder
            });
            const refreshedTask = await getTask(task.id);
            setTaskSteps(refreshedTask.TaskSteps || []);
            setOpenStepId(createdStep.id);
            setNewStepTitle('');
            setNewStepDescription('');
            setNewStepType('INTERNAL');
            setNewStepWaitingOn('STAFF');
            setNewStepDueAt('');
            setNewStepInsertPosition('end');
            await loadHistory();
            onRefresh();
        } catch (err: unknown) {
            alert('Failed to add step: ' + errorMessage(err));
        } finally {
            setUpdating(false);
        }
    }

    async function handleDeleteStep(stepId: number) {
        const step = taskSteps.find(item => item.id === stepId);
        const lockReason = getStepLockReason(step);
        if (lockReason) {
            alert(`You cannot remove this workflow step. ${lockReason}`);
            return;
        }

        setUpdating(true);
        try {
            await deleteTaskStep(task.id, stepId);
            await loadHistory();
            onRefresh();
        } catch (err: unknown) {
            alert('Failed to delete step: ' + errorMessage(err));
        } finally {
            setUpdating(false);
        }
    }

    function beginReorderSteps() {
        setReorderDraft(orderedTaskSteps);
        setOpenStepId(null);
        setReorderMode(true);
    }

    function cancelReorderSteps() {
        setReorderDraft(orderedTaskSteps);
        setDraggedStepId(null);
        setReorderMode(false);
    }

    function moveReorderStep(fromIndex: number, toIndex: number) {
        setReorderDraft(prev => {
            if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= prev.length) return prev;
            const nextIndex = Math.max(0, Math.min(toIndex, prev.length - 1));
            const next = [...prev];
            const [moved] = next.splice(fromIndex, 1);
            next.splice(nextIndex, 0, moved);
            return next;
        });
    }

    async function saveReorderSteps() {
        setUpdating(true);
        try {
            const reorderedSteps = await reorderTaskSteps(task.id, reorderDraft.map(step => step.id));
            setTaskSteps(reorderedSteps);
            setReorderDraft(sortedTaskSteps(reorderedSteps));
            setDraggedStepId(null);
            setReorderMode(false);
            await loadHistory();
            onRefresh();
        } catch (err: unknown) {
            alert('Failed to reorder steps: ' + errorMessage(err));
        } finally {
            setUpdating(false);
        }
    }

    function formatDateTimeInput(value?: string | null) {
        if (!value) return '';
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return '';
        const local = new Date(parsed.getTime() - (parsed.getTimezoneOffset() * 60000));
        return local.toISOString().slice(0, 16);
    }

    const manualIntake = task.payload?.manualIntake || null;
    const followUpAutomation = task.payload?.followUpAutomation || null;
    const responseTargetPhone = task.Member?.phone || manualIntake?.requesterPhone || '';

    function formatInboundMethod(method?: string | null) {
        if (!method) return 'Unknown';
        return method.replace(/_/g, ' ');
    }

    function formatIdentityResolutionStatus(status?: string | null) {
        if (!status) return 'Unresolved';
        return status.replace(/_/g, ' ');
    }

    function formatMessageTimestamp(message: TaskMessage) {
        return new Date(message.receivedAt || message.createdAt).toLocaleString();
    }

    function formatEnumLabel(value?: string | null) {
        if (!value) return 'Not recorded';
        return String(value).replace(/_/g, ' ');
    }

    function formatAutomationType(value?: string | null) {
        if (!value) return 'Automated follow-up';
        return value.replace(/_/g, ' ');
    }

    async function handleSaveOutcome() {
        setUpdating(true);
        try {
            await updateTask(task.id, {
                resolvedAs: resolvedAsEdit || null,
                resolutionType: resolutionTypeEdit || null,
                customerOutcome: customerOutcomeEdit || null,
                resolutionSummary: resolutionSummaryEdit.trim() || null,
                followUpRequired: followUpRequiredEdit,
                followUpDueAt: followUpRequiredEdit && followUpDueAtEdit
                    ? new Date(followUpDueAtEdit).toISOString()
                    : null,
                followUpSummary: followUpRequiredEdit && followUpSummaryEdit.trim()
                    ? followUpSummaryEdit.trim()
                    : null
            });
            await loadHistory();
            onRefresh();
        } catch (err: unknown) {
            alert('Failed to save outcome: ' + errorMessage(err));
        } finally {
            setUpdating(false);
        }
    }

    async function handleConfirmSuggestedMember(memberId: number) {
        if (!memberId) return;
        setUpdating(true);
        try {
            await updateTask(task.id, { memberId: Number(memberId) });
            await loadHistory();
            onRefresh();
        } catch (err: unknown) {
            alert('Failed to confirm customer match: ' + errorMessage(err));
        } finally {
            setUpdating(false);
        }
    }

    async function handleKeepUnlinked() {
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
                        memberMatchReason: null
                    }
                }
            });
            await loadHistory();
            onRefresh();
        } catch (err: unknown) {
            alert('Failed to keep task unlinked: ' + errorMessage(err));
        } finally {
            setUpdating(false);
        }
    }

    function renderActionDetails(action: TaskAction) {
        try {
        if (action.actionType === 'NOTE_ADDED' && action.details?.note) {
            const noteIsPrivate = action.details.isPrivate === true;
            const canToggle = userRole === 'manager' || userRole === 'admin' || (currentUserId && action.userId === currentUserId);

            return (
                <div className={`mt-2 text-sm rounded p-3 ${noteIsPrivate ? 'bg-red-50 border border-red-200 text-gray-800' : 'bg-yellow-50 border border-yellow-200 text-gray-800'}`}>
                    <div className="flex items-center justify-between gap-2">
                        <div className="italic flex-1">
                            &quot;{displayActionValue(action.details.note)}&quot;
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                            {noteIsPrivate && (
                                <span className="text-xs font-bold text-red-500 uppercase tracking-wide">Private</span>
                            )}
                            {canToggle && (
                                <button
                                    onClick={() => handleToggleNotePrivacy(action.id, noteIsPrivate)}
                                    disabled={updating}
                                    className={`p-1 rounded text-xs hover:bg-gray-200 transition-colors ${noteIsPrivate ? 'text-red-500' : 'text-gray-400'}`}
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
            const toUser = users.find(u => u.id === Number(action.details?.to));
            let assigner = action.User?.displayName;
            if (!assigner && action.userId) {
                const assignerUser = users.find(u => u.id === action.userId);
                assigner = assignerUser?.displayName;
            }
            assigner = assigner || 'System';

            return (
                <div className="mt-2 text-sm bg-blue-50 border border-blue-100 rounded p-2 text-blue-900">
                    <span className="font-semibold">Assigned to: </span>
                    {toUser ? toUser.displayName : displayActionValue(action.details?.to)}
                    <span className="text-gray-500 ml-2 text-xs">by {assigner}</span>
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
                                {String(action.details.entityType).replace(/_/g, ' ')}
                            </span>
                        )}
                    </div>
                </div>
            );
        }

        if (action.actionType === 'STEP_CREATED' || action.actionType === 'STEP_UPDATED' || action.actionType === 'STEP_COMPLETED' || action.actionType === 'STEP_DELETED') {
            const changes = action.details?.changes || {};
            const entries = objectEntries(changes);
            return (
                <div className="mt-2 text-sm bg-indigo-50 border border-indigo-100 rounded p-3 text-indigo-900">
                    <div className="font-semibold">
                        {action.actionType === 'STEP_CREATED' && `Created step: ${action.details?.title || 'Untitled step'}`}
                        {action.actionType === 'STEP_UPDATED' && `Updated step: ${action.details?.title || 'Untitled step'}`}
                        {action.actionType === 'STEP_COMPLETED' && `Completed step: ${action.details?.title || 'Untitled step'}`}
                        {action.actionType === 'STEP_DELETED' && `Deleted step: ${action.details?.title || 'Untitled step'}`}
                    </div>
                    {entries.length > 0 && (
                        <div className="mt-2 space-y-1 text-xs">
                            {entries.map(([key, value]) => (
                                <div key={key}>
                                    <span className="font-semibold uppercase text-indigo-700">{key.replace(/_/g, ' ')}:</span>{' '}
                                    <span>{displayActionValue(value)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                    {action.details?.blockedReason && (
                        <div className="mt-2 text-xs text-indigo-800">Reason: {displayActionValue(action.details.blockedReason)}</div>
                    )}
                </div>
            );
        }

        if (action.actionType === 'MEMBER_ENRICHED') {
            return (
                <div className="mt-2 text-sm bg-emerald-50 border border-emerald-100 rounded p-3 text-emerald-900">
                    <div className="font-semibold">Customer record enriched</div>
                    {Array.isArray(action.details?.tagsAdded) && action.details.tagsAdded.length > 0 && (
                        <div className="mt-2 text-xs">
                            Tags added: {action.details.tagsAdded.join(', ')}
                        </div>
                    )}
                    {action.details?.memberId && (
                        <div className="mt-1 text-xs">Member ID: {displayActionValue(action.details.memberId)}</div>
                    )}
                </div>
            );
        }

        if (action.actionType === 'EXECUTION_RECORDED') {
            return (
                <div className="mt-2 text-sm bg-cyan-50 border border-cyan-100 rounded p-3 text-cyan-900">
                    <div className="font-semibold">
                        Execution recorded: {formatEnumLabel(action.details?.operation || action.details?.kind)}
                    </div>
                    <div className="mt-2 grid gap-1 text-xs">
                        {action.details?.provider && (
                            <div><span className="font-semibold uppercase text-cyan-700">Provider:</span> {displayActionValue(action.details.provider)}</div>
                        )}
                        {action.details?.status && (
                            <div><span className="font-semibold uppercase text-cyan-700">Status:</span> {formatEnumLabel(action.details.status)}</div>
                        )}
                        {action.details?.channel && (
                            <div><span className="font-semibold uppercase text-cyan-700">Channel:</span> {displayActionValue(action.details.channel)}</div>
                        )}
                        {action.details?.referenceCode && (
                            <div><span className="font-semibold uppercase text-cyan-700">Reference:</span> {displayActionValue(action.details.referenceCode)}</div>
                        )}
                        {action.details?.target && (
                            <div><span className="font-semibold uppercase text-cyan-700">Target:</span> {displayActionValue(action.details.target)}</div>
                        )}
                        {action.details?.summary && (
                            <div><span className="font-semibold uppercase text-cyan-700">Summary:</span> {displayActionValue(action.details.summary)}</div>
                        )}
                    </div>
                </div>
            );
        }

        if (action.actionType === 'OUTCOME_RECORDED') {
            const changes = action.details?.changes || {};
            const entries = objectEntries(changes);
            return (
                <div className="mt-2 text-sm bg-teal-50 border border-teal-100 rounded p-3 text-teal-900">
                    <div className="font-semibold">Outcome recorded</div>
                    {entries.length > 0 && (
                        <div className="mt-2 space-y-1 text-xs">
                            {entries.map(([key, value]) => (
                                <div key={key}>
                                    <span className="font-semibold uppercase text-teal-700">{key.replace(/_/g, ' ')}:</span>{' '}
                                    <span>{displayActionValue(value)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            );
        }

        if (action.details && Object.keys(action.details).length > 0) {
            const changes = action.details.changes || action.details;
            const entries = objectEntries(changes);
            if (entries.length > 0) {
                return (
                    <div className="mt-2 bg-gray-50 border border-gray-100 rounded p-2 text-xs">
                        {entries.map(([key, value]) => {
                            let displayValue = displayActionValue(value);
                            if ((key === 'assigneeId' || key === 'to' || key === 'from') && (typeof value === 'number' || typeof value === 'string')) {
                                const uid = Number(value);
                                const u = users.find(user => user.id === uid);
                                if (u) displayValue = u.displayName;
                            }
                            return (
                                <div key={key} className="flex gap-2">
                                    <span className="font-semibold text-gray-500 uppercase">{key.replace(/_/g, ' ')}:</span>
                                    <span className="text-gray-800 break-all">{displayValue}</span>
                                </div>
                            );
                        })}
                    </div>
                );
            }
        }
        return null;
        } catch (err) {
            console.error('Failed to render task activity details', err, action);
            return (
                <div className="mt-2 rounded border border-red-100 bg-red-50 p-2 text-xs text-red-700">
                    Activity details could not be displayed.
                </div>
            );
        }
    }

    function renderAdvancedActionDetails(action: TaskAction) {
        try {
            const details = isDetailRecord(action.details)
                ? action.details
                : {};
            const changes = isDetailRecord(details.changes)
                ? details.changes
                : details;
            const oldValues = isDetailRecord(details.oldValues)
                ? details.oldValues
                : null;
            const entries = objectEntries(changes);
            const oldEntries = objectEntries(oldValues);

            const formatField = (key: string, value: unknown) => {
                if ((key === 'assigneeId' || key === 'ownerUserId' || key === 'to' || key === 'from') && (typeof value === 'number' || typeof value === 'string')) {
                    const user = users.find(u => u.id === Number(value));
                    if (user) return user.displayName;
                }
                return displayAdvancedValue(value);
            };

            return (
                <div className="mt-2 rounded border border-slate-200 bg-white p-3 text-xs text-slate-700">
                    <div className="mb-2 text-sm font-semibold text-slate-900">{formatActivityType(action.actionType)}</div>
                    {entries.length === 0 ? (
                        <div className="text-slate-500">No detail fields recorded.</div>
                    ) : (
                        <div className="space-y-1">
                            {entries.map(([key, value]) => (
                            <div key={key} className="grid min-w-0 gap-1 sm:grid-cols-[150px_minmax(0,1fr)]">
                                <span className="font-semibold uppercase text-slate-500">{key.replace(/_/g, ' ')}</span>
                                <span className="min-w-0 break-all whitespace-pre-wrap text-slate-800">{formatField(key, value)}</span>
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
                                        <span className="font-semibold uppercase text-slate-500">{key.replace(/_/g, ' ')}</span>
                                        <span className="min-w-0 break-all whitespace-pre-wrap text-slate-800">{formatField(key, value)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            );
        } catch (err) {
            console.error('Failed to render advanced task activity details', err, action);
            return (
                <div className="mt-2 rounded border border-red-100 bg-red-50 p-2 text-xs text-red-700">
                    Advanced activity details could not be displayed.
                </div>
            );
        }
    }

    const safeTaskActions = useMemo(() => (Array.isArray(taskActions)
        ? taskActions.filter((action): action is TaskAction => (
            Boolean(action && typeof action === 'object' && !Array.isArray(action))
        ))
        : []), [taskActions]);
    const visibleTaskActions = useMemo(() => safeTaskActions
        .filter(action => !['TASK_CREATED', 'CREATED', 'MANUAL_CREATED'].includes(String(action.actionType || '')))
        .filter(action => {
            if (String(action.actionType || '') === 'NOTE_ADDED' && action.details?.isPrivate) {
                return canSeePrivateNote(action);
            }
            return true;
        })
        .filter(action => showAdvancedActivity || isHighImpactActivity(action))
        .slice()
        .sort((a, b) => actionTimestamp(a) - actionTimestamp(b)), [canSeePrivateNote, safeTaskActions, showAdvancedActivity]);
    const safeTaskMessages = useMemo(() => (Array.isArray(taskMessages)
        ? taskMessages.filter((message): message is TaskMessage => Boolean(message && typeof message === 'object'))
        : []), [taskMessages]);
    const orderedTaskSteps = useMemo(() => sortedTaskSteps(taskSteps), [taskSteps]);
    const activeStep = useMemo(() => (
        orderedTaskSteps.find(step => step.status === 'BLOCKED')
        ?? orderedTaskSteps.find(step => step.status === 'IN_PROGRESS')
        ?? orderedTaskSteps.find(step => step.status === 'PENDING')
        ?? orderedTaskSteps[0]
        ?? null
    ), [orderedTaskSteps]);
    const activeStepIndex = activeStep
        ? orderedTaskSteps.findIndex(step => step.id === activeStep.id)
        : -1;
    const assigneeName = task.Assignee?.displayName
        || users.find(user => user.id === task.assigneeId)?.displayName
        || 'Unassigned';
    const activeStepOwnerName = activeStep?.Owner?.displayName
        || users.find(user => user.id === activeStep?.ownerUserId)?.displayName
        || 'Unassigned';
    const taskTitle = humanize(task.subType || task.type || task.category || 'Task', 'Task');
    const requesterName = task.Member
        ? `${task.Member.firstName || ''} ${task.Member.lastName || ''}`.trim()
        : manualIntake?.requesterName || 'Visitor / Internal task';
    const requestSummary = String(task.payload?.summary || task.payload?.originalText || task.notes || 'Original request and task context');
    const activeStepSuggestionText = activeStep
        ? activeStep.suggestedAction || activeStep.suggestedReplyBody || ''
        : '';
    const activeStepLockReason = getStepLockReason(activeStep);
    const createStepLockReason = getCreateStepLockReason();
    const taskAttachmentLockReason = getTaskAttachmentLockReason();
    const showTopWorkflowBadge = Boolean(
        task.workflowState
        && task.workflowState !== 'NOT_STARTED'
        && !(task.status === 'ACTIONED' && task.workflowState === 'COMPLETED')
    );

    const logActivityLayoutSnapshot = useCallback((label: string) => {
        if (!isTaskModalDebugEnabled()) return;

        const actionRows = Array.from(document.querySelectorAll(`[data-task-card-id="${task.id}"] [data-task-action-row="true"]`))
            .map((row, index) => elementSnapshot(`action row ${index + 1}`, row));
        const snapshots = [
            elementSnapshot('modal root', document.querySelector('[data-task-detail-modal="true"]')),
            elementSnapshot('modal panel', document.querySelector('[data-task-detail-panel="true"]')),
            elementSnapshot('modal content', document.querySelector('[data-task-detail-content="true"]')),
            elementSnapshot('task card', document.querySelector(`[data-task-card-id="${task.id}"]`)),
            elementSnapshot('activity panel', document.querySelector(`[data-task-card-id="${task.id}"] [data-task-activity-panel="true"]`)),
            ...actionRows
        ];

        console.groupCollapsed(`[TaskModalDebug] ${label} task=${task.id} advanced=${showAdvancedActivity}`);
        console.table(snapshots);
        console.groupEnd();
        logTaskModalDebugFlat('layout', {
            label,
            taskId: task.id,
            advanced: showAdvancedActivity,
            snapshots
        });
    }, [showAdvancedActivity, task.id]);

    function handleAdvancedActivityToggle(checked: boolean) {
        if (isTaskModalDebugEnabled()) {
            const actions = safeTaskActions.map((action, index) => ({
                index,
                id: action.id,
                actionType: action.actionType,
                highImpact: isHighImpactActivity(action),
                createdAt: action.createdAt,
                detailsType: Array.isArray(action.details) ? 'array' : typeof action.details,
                detailKeys: isDetailRecord(action.details) ? Object.keys(action.details).join(',') : '',
                detailSnippet: detailSnippet(action.details)
            }));
            const summary = {
                taskId: task.id,
                previousAdvanced: showAdvancedActivity,
                nextAdvanced: checked,
                historyOpen,
                historyLoading,
                taskActions: safeTaskActions.length,
                visibleBeforeToggle: visibleTaskActions.length,
                actions
            };

            console.groupCollapsed(`[TaskModalDebug] advanced toggle click task=${task.id}`);
            console.log(summary);
            console.table(actions);
            console.groupEnd();
            logTaskModalDebugFlat('advanced-toggle', summary);
        }

        setShowAdvancedActivity(checked);
    }

    useEffect(() => {
        if (!isTaskModalDebugEnabled()) return;

        const advancedOnlyActions = visibleTaskActions.filter(action => !isHighImpactActivity(action));
        const hiddenInBasicActions = safeTaskActions
            .filter(action => !['TASK_CREATED', 'CREATED', 'MANUAL_CREATED'].includes(String(action.actionType || '')))
            .filter(action => !isHighImpactActivity(action));
        const visibleActions = visibleTaskActions.map((action, index) => ({
            index,
            id: action.id,
            actionType: action.actionType,
            highImpact: isHighImpactActivity(action),
            createdAt: action.createdAt,
            user: action.User?.displayName || 'System',
            detailsType: Array.isArray(action.details) ? 'array' : typeof action.details,
            detailKeys: isDetailRecord(action.details) ? Object.keys(action.details).join(',') : '',
            detailSnippet: detailSnippet(action.details)
        }));
        const summary = {
            taskId: task.id,
            historyOpen,
            historyLoading,
            historyError,
            safeTaskActions: safeTaskActions.length,
            safeTaskMessages: safeTaskMessages.length,
            visibleTaskActions: visibleTaskActions.length,
            hiddenInBasicActions: hiddenInBasicActions.length,
            advancedOnlyVisibleActions: advancedOnlyActions.length,
            taskStepCount: taskSteps.length,
            subTaskCount: subTasks.length,
            visibleActions
        };

        console.groupCollapsed(`[TaskModalDebug] activity state task=${task.id} advanced=${showAdvancedActivity}`);
        console.log(summary);
        console.table(visibleActions);
        console.groupEnd();
        logTaskModalDebugFlat('activity-state', {
            advanced: showAdvancedActivity,
            ...summary
        });

        const frame = window.requestAnimationFrame(() => logActivityLayoutSnapshot('layout after render'));
        const timer = window.setTimeout(() => logActivityLayoutSnapshot('layout 250ms after render'), 250);

        return () => {
            window.cancelAnimationFrame(frame);
            window.clearTimeout(timer);
        };
    }, [
        showAdvancedActivity,
        historyOpen,
        historyLoading,
        historyError,
        task.id,
        safeTaskActions,
        safeTaskMessages.length,
        visibleTaskActions,
        taskSteps.length,
        subTasks.length,
        logActivityLayoutSnapshot
    ]);

    return (
        <div
            id={`task-${task.id}`}
            data-task-card-id={task.id}
            data-show-advanced-activity={showAdvancedActivity ? 'true' : 'false'}
            className={`min-w-0 rounded-lg border bg-[var(--surface)] p-4 shadow-sm transition-all duration-300 lg:grid lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start lg:gap-5 lg:p-5
                ${highlighted ? 'ring-2 ring-[var(--accent)] bg-teal-50/30' : ''}
                ${task.priority === 'high' ? 'border-l-4 border-l-red-500' : ''}
                ${task.priority === 'normal' || !task.priority ? 'border-l-4 border-l-amber-500' : ''}
                ${task.priority === 'low' ? 'border-l-4 border-l-teal-500' : ''}
            `}
        >
            <div className="min-w-0 w-full space-y-4">
                <div className="rounded-lg border border-[#dfe6da] bg-white p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                                <span className="rounded-md border border-[#dce4d7] bg-[#f8faf6] px-2.5 py-1 text-[11px] font-bold uppercase text-[#536158]">
                                    {humanize(task.category || 'GENERAL')}
                                </span>
                                {showTopWorkflowBadge && (
                                    <span className={`rounded-md border px-2.5 py-1 text-[11px] font-bold uppercase ${workflowStateClasses(task.workflowState || 'NOT_STARTED')}`}>
                                        {humanize(task.workflowState || 'NOT_STARTED')}
                                    </span>
                                )}
                                {(task.isOverdue || task.isDueSoon) && (
                                    <span className={`rounded-md border px-2.5 py-1 text-[11px] font-bold uppercase ${
                                        task.isOverdue
                                            ? 'border-red-200 bg-red-50 text-red-800'
                                            : 'border-amber-200 bg-amber-50 text-amber-800'
                                    }`}>
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
                                    onClick={onToggleStar}
                                    className={`icon-button -ml-2 -mt-1 ${isFlagged ? 'text-amber-500' : 'text-[#a4aea0] hover:text-amber-500'}`}
                                    title={isFlagged ? 'Unflag' : 'Flag for follow-up'}
                                    aria-label={isFlagged ? 'Unflag task' : 'Flag task'}
                                >
                                    <svg className="h-5 w-5" fill={isFlagged ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 16.9 6.6 19.8l1-6.1-4.4-4.3 6.1-.9L12 3Z" />
                                    </svg>
                                </button>
                                <div className="min-w-0">
                                    <h3 className="break-words text-2xl font-semibold text-[#1c231f]">
                                        {taskTitle}
                                    </h3>
                                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-[var(--muted)]">
                                        <span className="font-medium text-[#344039]">{requesterName}</span>
                                        <span>Case #{task.id}</span>
                                        <span>Created {formatShortDate(task.createdAt)}</span>
                                        <span>By {task.Creator?.displayName || 'System'}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <span className={`shrink-0 rounded-md border px-2.5 py-1 text-xs font-bold uppercase ${
                            task.status === 'ACTIONED'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                : task.status === 'REJECTED'
                                    ? 'border-red-200 bg-red-50 text-red-800'
                                    : 'border-amber-200 bg-amber-50 text-amber-800'
                        }`}>
                            {humanize(task.status)}
                        </span>
                    </div>
                </div>

                <section className={`rounded-lg border p-4 ${
                    activeStep?.status === 'BLOCKED'
                        ? 'border-red-200 bg-red-50/60'
                        : task.workflowState === 'WAITING'
                            ? 'border-amber-200 bg-amber-50/60'
                            : 'border-[#cbded7] bg-[#f3faf7]'
                }`}>
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0">
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                                <span className="text-xs font-bold uppercase tracking-wider text-[#0f766e]">Current step</span>
                                {activeStep && (
                                    <>
                                        <span className={`rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase ${stepStatusClasses(activeStep.status)}`}>
                                            {humanize(activeStep.status)}
                                        </span>
                                        <span className="rounded-md border border-white/70 bg-white/70 px-2 py-0.5 text-[11px] font-bold uppercase text-[#536158]">
                                            Step {activeStepIndex + 1} of {orderedTaskSteps.length}
                                        </span>
                                    </>
                                )}
                            </div>
                            <h4 className="break-words text-xl font-semibold text-[#1c231f]">
                                {activeStep ? activeStep.title : 'No workflow step recorded yet'}
                            </h4>
                            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#536158]">
                                {activeStep?.description || task.nextStepSummary || 'Add a workflow step to make the next action explicit.'}
                            </p>
                            <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                                <div>
                                    <div className="text-[11px] font-bold uppercase tracking-wider text-[#667085]">Owner</div>
                                    <div className="mt-0.5 font-medium text-[#1c231f]">{activeStepOwnerName}</div>
                                </div>
                                <div>
                                    <div className="text-[11px] font-bold uppercase tracking-wider text-[#667085]">Waiting on</div>
                                    <div className="mt-0.5 font-medium text-[#1c231f]">{humanize(activeStep?.waitingOn || task.waitingOn || 'NONE')}</div>
                                </div>
                                <div>
                                    <div className="text-[11px] font-bold uppercase tracking-wider text-[#667085]">Due</div>
                                    <div className={`mt-0.5 font-medium ${task.isOverdue ? 'text-red-700' : task.isDueSoon ? 'text-amber-700' : 'text-[#1c231f]'}`}>
                                        {formatShortDate(activeStep?.dueAt || task.dueAt)}
                                    </div>
                                </div>
                            </div>
                            {(activeStep?.blockedReason || task.blockedReason) && (
                                <div className="mt-4 rounded-md border border-red-200 bg-white/80 p-3 text-sm text-red-800">
                                    <span className="font-semibold">Blocked:</span> {activeStep?.blockedReason || task.blockedReason}
                                </div>
                            )}
                            {activeStepSuggestionText && (
                                <div className="mt-4 rounded-md border border-blue-100 bg-white/80 p-3 text-sm text-slate-700">
                                    <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-blue-700">Suggested action</div>
                                    <div className="line-clamp-3 whitespace-pre-wrap">{activeStepSuggestionText}</div>
                                </div>
                            )}
                        </div>
                        {activeStep && (
                            <div className="flex w-full flex-wrap gap-2 xl:w-[260px] xl:justify-end">
                                {activeStepLockReason && (
                                    <div className="w-full rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                                        {activeStepLockReason}
                                    </div>
                                )}
                                {(activeStep.status === 'PENDING' || activeStep.status === 'BLOCKED') && (
                                    <button
                                        type="button"
                                        disabled={updating || Boolean(activeStepLockReason)}
                                        onClick={() => handleStepUpdate(activeStep.id, { status: 'IN_PROGRESS', blockedReason: null })}
                                        className="btn-primary"
                                    >
                                        Start Step
                                    </button>
                                )}
                                {(activeStep.status === 'IN_PROGRESS' || activeStep.status === 'BLOCKED') && (
                                    <button
                                        type="button"
                                        disabled={updating || Boolean(activeStepLockReason)}
                                        onClick={() => {
                                            const completionNotes = window.prompt('Optional completion note', activeStep.completionNotes || '') || '';
                                            handleStepUpdate(activeStep.id, { status: 'COMPLETED', completionNotes, blockedReason: null, waitingOn: 'NONE' });
                                        }}
                                        className="btn-primary bg-emerald-700 hover:bg-emerald-800"
                                    >
                                        Complete
                                    </button>
                                )}
                                <button
                                    type="button"
                                    disabled={updating || Boolean(activeStepLockReason)}
                                    onClick={() => handleGenerateStepSuggestion(activeStep.id)}
                                    className="btn-secondary"
                                >
                                    {activeStepSuggestionText ? 'Regenerate Draft' : 'Generate Draft'}
                                </button>
                                {activeStep.status !== 'BLOCKED' && activeStep.status !== 'COMPLETED' && (
                                    <button
                                        type="button"
                                        disabled={updating || Boolean(activeStepLockReason)}
                                        onClick={() => {
                                            const blockedReason = window.prompt('Why is this step blocked?', activeStep.blockedReason || '');
                                            if (blockedReason !== null) {
                                                handleStepUpdate(activeStep.id, { status: 'BLOCKED', blockedReason: blockedReason.trim() || 'Blocked', completionNotes: null });
                                            }
                                        }}
                                        className="btn-secondary text-red-700"
                                        title="Mark this current step as blocked and record what is stopping progress."
                                    >
                                        Mark Blocked
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </section>

                <div className="hidden mb-4 flex flex-wrap items-center gap-2">
                    <span className={`rounded-md px-3 py-1.5 text-xs font-bold uppercase
                        ${task.category === 'OPERATIONS' ? 'bg-purple-50 text-purple-700 border border-purple-200' : ''}
                        ${task.category === 'ORDER' ? 'bg-sky-50 text-sky-700 border border-sky-200' : ''}
                        ${task.category === 'BOOKING' ? 'bg-pink-50 text-pink-700 border border-pink-200' : ''}
                        ${task.category === 'ACCOUNT' ? 'bg-orange-50 text-orange-700 border border-orange-200' : ''}
                        ${task.category === 'GENERAL' ? 'bg-gray-50 text-gray-700 border border-gray-200' : ''}
                    `}>
                        {task.category || 'GENERAL'}
                    </span>

                    <span className={`rounded-md px-3 py-1.5 text-xs font-bold uppercase
                        ${task.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800 border border-yellow-200' : ''}
                        ${task.status === 'ACTIONED' ? 'bg-green-100 text-green-800 border border-green-200' : ''}
                        ${task.status === 'REJECTED' ? 'bg-red-100 text-red-800 border border-red-200' : ''}
                    `}>
                        {task.status.replace('_', ' ')}
                    </span>

                    {(task.isOverdue || task.isDueSoon) && (
                        <span className={`rounded-md px-3 py-1.5 text-xs font-bold uppercase border ${
                            task.isOverdue
                                ? 'bg-red-100 text-red-800 border-red-200'
                                : 'bg-amber-100 text-amber-800 border-amber-200'
                        }`}>
                            {task.isOverdue ? 'Overdue' : 'Due soon'}
                        </span>
                    )}

                    {task.resolvedAs && (
                        <span className="rounded-md border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-bold uppercase text-slate-700">
                            {formatEnumLabel(task.resolvedAs)}
                        </span>
                    )}

                    {task.sentiment === 'NEGATIVE' && (
                        <span className="px-3 py-1.5 rounded-md text-xs font-bold bg-red-600 text-white animate-pulse shadow-sm">
                            NEGATIVE
                        </span>
                    )}
                    {task.sentiment === 'POSITIVE' && (
                        <span className="px-3 py-1.5 rounded-md text-xs font-bold bg-green-600 text-white shadow-sm">
                            POSITIVE
                        </span>
                    )}

                    <div className="ml-auto flex flex-wrap items-center gap-1.5 text-sm font-medium text-[var(--muted)]">
                        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>{new Date(task.createdAt).toLocaleString()}</span>
                        <span className="text-gray-300 px-1">•</span>
                        <span className="text-gray-500">by {task.Creator ? task.Creator.displayName : 'System'}</span>
                    </div>
                </div>

                <div className="hidden mb-2 items-center gap-3">
                    <button
                        onClick={onToggleStar}
                        className={`icon-button ${isFlagged ? 'text-amber-500' : 'text-[#a4aea0] hover:text-amber-500'}`}
                        title={isFlagged ? "Unflag" : "Flag for follow-up"}
                        aria-label={isFlagged ? 'Unflag task' : 'Flag task'}
                    >
                        <svg className="h-6 w-6" fill={isFlagged ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 16.9 6.6 19.8l1-6.1-4.4-4.3 6.1-.9L12 3Z" />
                        </svg>
                    </button>
                    <h3 className="text-2xl font-bold text-[#1c231f]">
                        {task.subType ? task.subType.replace(/_/g, ' ') : task.type}
                    </h3>
                </div>

                <div className="hidden text-sm mb-6">
                    {task.Member ? (
                        <span className="inline-flex items-center gap-1.5 bg-gray-100 px-3 py-1 rounded-full font-semibold text-gray-700">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            {task.Member.firstName} {task.Member.lastName}
                        </span>
                    ) : (
                        <span className="italic text-gray-500">Visitor / Internal Task</span>
                    )}
                </div>

                {manualIntake && (
                    <TaskSection
                        title="Intake"
                        summary={`${manualIntake.taskOrigin || 'UNKNOWN'} / ${formatInboundMethod(manualIntake.inboundMethod)} / ${formatIdentityResolutionStatus(manualIntake.identityResolutionStatus)}`}
                        open={openSections.intake}
                        onToggle={() => toggleSection('intake')}
                    >
                        <div className="flex flex-wrap items-center gap-2 mb-3">
                            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Intake</div>
                            <span className="px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider bg-white border border-slate-200 text-slate-700">
                                {manualIntake.taskOrigin || 'UNKNOWN'}
                            </span>
                            <span className="px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider bg-white border border-slate-200 text-slate-700">
                                {formatInboundMethod(manualIntake.inboundMethod)}
                            </span>
                            <span className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider border ${
                                manualIntake.identityResolutionStatus === 'REVIEW_REQUIRED'
                                    ? 'bg-amber-100 text-amber-800 border-amber-200'
                                    : manualIntake.identityResolutionStatus === 'AUTO_LINKED' || manualIntake.identityResolutionStatus === 'AUTO_CREATED' || manualIntake.identityResolutionStatus === 'REVIEW_CONFIRMED' || manualIntake.identityResolutionStatus === 'MANUALLY_LINKED' || manualIntake.identityResolutionStatus === 'SELECTED_MEMBER'
                                        ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                        : 'bg-slate-100 text-slate-700 border-slate-200'
                            }`}>
                                {formatIdentityResolutionStatus(manualIntake.identityResolutionStatus)}
                            </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                            <div>
                                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Requester</div>
                                <div className="text-slate-900">{manualIntake.requesterName || 'Unknown'}</div>
                            </div>
                            <div>
                                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Email</div>
                                <div className="text-slate-900">{manualIntake.requesterEmail || 'No email captured'}</div>
                            </div>
                            <div>
                                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Phone</div>
                                <div className="text-slate-900">{manualIntake.requesterPhone || 'No phone captured'}</div>
                            </div>
                        </div>

                        <div className="mt-3 text-xs text-slate-600">
                            Confidence: {manualIntake.identityConfidence || 'NONE'}
                            {manualIntake.memberMatchReason ? ` • Match: ${manualIntake.memberMatchReason}` : ''}
                            {manualIntake.suggestedMemberReason ? ` • Review reason: ${manualIntake.suggestedMemberReason}` : ''}
                        </div>

                        {manualIntake.identityResolutionStatus === 'REVIEW_REQUIRED' && Array.isArray(manualIntake.suggestedCandidates) && manualIntake.suggestedCandidates.length > 0 && !task.Member && (
                            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                                <div className="text-sm font-semibold text-amber-900">Possible existing customers</div>
                                <div className="mt-1 text-xs text-amber-800">
                                    These matches were strong enough to surface, but not strong enough to auto-link safely.
                                </div>
                                <div className="mt-3 space-y-2">
                                    {manualIntake.suggestedCandidates.map((candidate: IdentitySuggestedCandidate) => (
                                        <div key={candidate.memberId} className="rounded border border-amber-200 bg-white p-3">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <div>
                                                    <div className="text-sm font-semibold text-slate-900">{candidate.label || `Member ${candidate.memberId}`}</div>
                                                    <div className="text-xs text-slate-600">
                                                        {candidate.email || 'No email'} • {candidate.phone || 'No phone'}
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
                                    ))}
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

                {canAssign && (
                    <div className="hidden items-center gap-3 text-sm text-gray-700 mb-6 bg-gray-50/80 border border-gray-200 rounded-lg px-4 py-2.5 w-fit shadow-sm">
                        <span className="font-bold text-gray-500 uppercase text-xs tracking-wider">
                            {isStaffAssignmentReview ? 'Assign to staff:' : 'Assign to:'}
                        </span>
                        <select
                            className="bg-transparent border-none text-sm font-semibold text-gray-900 focus:ring-0 cursor-pointer hover:text-blue-600 p-0"
                            value={task.assigneeId || ''}
                            onChange={(e) => handleAssignment(e.target.value)}
                            disabled={updating}
                        >
                            <option value="" className="text-gray-400">Unassigned</option>
                            {assignmentUsers.map(u => (
                                <option key={u.id} value={u.id}>{u.displayName}</option>
                            ))}
                        </select>
                    </div>
                )}

                <TaskSection
                    title="Request"
                    summary={requestSummary}
                    open={openSections.request}
                    onToggle={() => toggleSection('request')}
                >
                    {(() => {
                        let raw = task.payload;
                        if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { } }
                        if (raw && typeof raw === 'object' && (raw.summary || raw.originalText)) {
                            return (
                                <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
                                    {raw.summary && (
                                        <div className="bg-gray-50 px-4 py-2 border-b border-gray-100">
                                            <div className="text-xs font-bold text-gray-500 uppercase tracking-wide">Summary</div>
                                            <div className="font-medium text-gray-900">{raw.summary}</div>
                                        </div>
                                    )}
                                    {raw.originalText && (
                                        <div className="p-4">
                                            <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Original Request</div>
                                            <div className="text-gray-700 whitespace-pre-wrap font-sans">{raw.originalText}</div>
                                        </div>
                                    )}
                                </div>
                            );
                        }
                        return (
                            <div className="bg-gray-50 rounded p-3 text-sm font-mono text-gray-700 whitespace-pre-wrap max-h-32 overflow-y-auto">
                                {JSON.stringify(raw, null, 2)}
                            </div>
                        );
                    })()}
                </TaskSection>

                <TaskSection
                    title="Attachments"
                    summary="Files and images attached to this task"
                    open={openSections.attachments}
                    onToggle={() => toggleSection('attachments')}
                >
                    <AttachmentPanel
                        entityType="TASK"
                        entityId={task.id}
                        title="Task Attachments"
                        canUpload={!taskAttachmentLockReason}
                        canDeleteAll={canOverrideStepOwnership}
                        currentUserId={currentUserId}
                        disabledReason={taskAttachmentLockReason}
                        onChanged={loadHistory}
                    />
                </TaskSection>

                <TaskSection
                    title="Linked Notices"
                    summary={linkedNotices.length > 0 ? `${linkedNotices.length} notice${linkedNotices.length === 1 ? '' : 's'} linked` : 'No notices linked'}
                    count={linkedNotices.length}
                    open={openSections.notices}
                    onToggle={() => toggleSection('notices')}
                >
                    {linkedNotices.length === 0 ? (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                            No NoticeBoard context is linked to this task yet.
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {linkedNotices.map(notice => (
                                <div key={notice.id} className="rounded-lg border border-slate-200 bg-white p-3">
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="text-sm font-semibold text-slate-900">Notice #{notice.id}</span>
                                                {notice.isPinned && (
                                                    <span className="rounded bg-rose-50 px-2 py-0.5 text-[11px] font-bold uppercase text-rose-700 ring-1 ring-rose-200">Pinned</span>
                                                )}
                                                <span className={`rounded px-2 py-0.5 text-[11px] font-bold uppercase ring-1 ${
                                                    notice.priority === 'urgent'
                                                        ? 'bg-red-50 text-red-700 ring-red-200'
                                                        : notice.priority === 'important'
                                                            ? 'bg-amber-50 text-amber-800 ring-amber-200'
                                                            : 'bg-slate-50 text-slate-700 ring-slate-200'
                                                }`}>
                                                    {notice.priority}
                                                </span>
                                                <span className="rounded bg-teal-50 px-2 py-0.5 text-[11px] font-bold uppercase text-teal-800 ring-1 ring-teal-200">
                                                    {notice.category ? notice.category.replace(/_/g, ' ') : 'GENERAL'}
                                                </span>
                                            </div>
                                            <div className="mt-1 break-words text-sm text-slate-800">{notice.title}</div>
                                            <div className="mt-1 text-xs text-slate-500">
                                                Created {notice.createdAt ? new Date(notice.createdAt).toLocaleDateString() : 'unknown'}
                                            </div>
                                        </div>
                                        {canManageNoticeLinks && (
                                            <button
                                                type="button"
                                                onClick={() => handleUnlinkNotice(notice.id)}
                                                disabled={noticeLinking}
                                                className="btn-secondary shrink-0 text-red-700"
                                            >
                                                Unlink
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {canManageNoticeLinks && (
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                            <input
                                type="number"
                                min="1"
                                className="form-control sm:max-w-40"
                                value={noticeIdInput}
                                onChange={(e) => setNoticeIdInput(e.target.value)}
                                placeholder="Notice ID"
                            />
                            <button
                                type="button"
                                onClick={handleLinkNotice}
                                disabled={noticeLinking || !noticeIdInput.trim()}
                                className="btn-secondary"
                            >
                                Link Notice
                            </button>
                        </div>
                    )}
                </TaskSection>

                <TaskSection
                    title="Workflow Summary"
                    summary={`${formatEnumLabel(task.workflowState || 'NOT_STARTED')}${task.nextStepSummary ? ` / ${task.nextStepSummary}` : ''}`}
                    open={openSections.workflow}
                    onToggle={() => toggleSection('workflow')}
                >
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Workflow</div>
                        <span className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider
                            ${task.workflowState === 'NOT_STARTED' ? 'bg-slate-100 text-slate-700 border border-slate-200' : ''}
                            ${task.workflowState === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-800 border border-blue-200' : ''}
                            ${task.workflowState === 'WAITING' ? 'bg-amber-100 text-amber-800 border border-amber-200' : ''}
                            ${task.workflowState === 'BLOCKED' ? 'bg-red-100 text-red-800 border border-red-200' : ''}
                            ${task.workflowState === 'COMPLETED' ? 'bg-green-100 text-green-800 border border-green-200' : ''}
                            ${task.workflowState === 'CANCELLED' ? 'bg-gray-200 text-gray-700 border border-gray-300' : ''}
                        `}>
                            {task.workflowState ? task.workflowState.replace(/_/g, ' ') : 'NOT STARTED'}
                        </span>
                        {task.waitingOn && task.waitingOn !== 'NONE' && (
                            <span className="px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider bg-white border border-slate-200 text-slate-700">
                                Waiting On {task.waitingOn}
                            </span>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                        <div>
                            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Next Step</div>
                            <div className="text-slate-900">{task.nextStepSummary || 'No next step recorded yet'}</div>
                        </div>
                        <div>
                            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Due</div>
                            <div className={`${
                                task.isOverdue
                                    ? 'font-semibold text-red-700'
                                    : task.isDueSoon
                                        ? 'font-semibold text-amber-700'
                                        : 'text-slate-900'
                            }`}>
                                {task.dueAt ? new Date(task.dueAt).toLocaleString() : 'No due date'}
                            </div>
                        </div>
                        <div>
                            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Blocked Reason</div>
                            <div className="text-slate-900">{task.blockedReason || 'Not blocked'}</div>
                        </div>
                    </div>
                </TaskSection>

                <TaskSection
                    title="Outcome & Follow-up"
                    summary={task.status === 'PENDING' ? 'Available after task closure' : `${formatEnumLabel(task.resolvedAs || 'Outcome pending')}${task.followUpRequired ? ' / Follow-up required' : ''}`}
                    open={openSections.outcome}
                    onToggle={() => toggleSection('outcome')}
                >
                    <div className="flex items-center justify-between gap-3 mb-4">
                        <div>
                            <div className="text-xs font-bold uppercase tracking-wider text-teal-700">Outcome & Follow-up</div>
                            <div className="text-sm text-teal-900">
                                {task.status === 'PENDING'
                                    ? 'Close or reject the task first to record the final operational outcome.'
                                    : 'Record what actually happened so reporting, AI, and follow-up stay grounded in the real case result.'}
                            </div>
                        </div>
                        {task.resolvedAt && (
                            <div className="text-xs text-teal-800 font-medium">
                                Resolved {new Date(task.resolvedAt).toLocaleString()}
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                        <div>
                            <label className="block text-[11px] font-bold uppercase tracking-wider text-teal-700 mb-1">Resolved As</label>
                            <select
                                className="w-full rounded border border-teal-200 bg-white p-2 text-sm disabled:bg-teal-100"
                                value={resolvedAsEdit}
                                onChange={(e) => setResolvedAsEdit(e.target.value)}
                                disabled={updating || task.status === 'PENDING'}
                            >
                                <option value="">Select outcome</option>
                                {RESOLVED_AS_OPTIONS.map(option => (
                                    <option key={option} value={option}>{formatEnumLabel(option)}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[11px] font-bold uppercase tracking-wider text-teal-700 mb-1">Resolution Type</label>
                            <select
                                className="w-full rounded border border-teal-200 bg-white p-2 text-sm disabled:bg-teal-100"
                                value={resolutionTypeEdit}
                                onChange={(e) => setResolutionTypeEdit(e.target.value)}
                                disabled={updating || task.status === 'PENDING'}
                            >
                                <option value="">Select resolution type</option>
                                {RESOLUTION_TYPE_OPTIONS.map(option => (
                                    <option key={option} value={option}>{formatEnumLabel(option)}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[11px] font-bold uppercase tracking-wider text-teal-700 mb-1">Customer Outcome</label>
                            <select
                                className="w-full rounded border border-teal-200 bg-white p-2 text-sm disabled:bg-teal-100"
                                value={customerOutcomeEdit}
                                onChange={(e) => setCustomerOutcomeEdit(e.target.value)}
                                disabled={updating || task.status === 'PENDING'}
                            >
                                <option value="">Select customer outcome</option>
                                {CUSTOMER_OUTCOME_OPTIONS.map(option => (
                                    <option key={option} value={option}>{formatEnumLabel(option)}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        <div>
                            <label className="block text-[11px] font-bold uppercase tracking-wider text-teal-700 mb-1">Resolution Summary</label>
                            <textarea
                                className="w-full rounded border border-teal-200 bg-white p-3 text-sm disabled:bg-teal-100"
                                rows={3}
                                value={resolutionSummaryEdit}
                                onChange={(e) => setResolutionSummaryEdit(e.target.value)}
                                disabled={updating || task.status === 'PENDING'}
                                placeholder="Summarize the actual outcome of this case."
                            />
                        </div>
                        <div className="space-y-3">
                            <label className="flex items-center gap-2 text-sm font-medium text-teal-900">
                                <input
                                    type="checkbox"
                                    checked={followUpRequiredEdit}
                                    onChange={(e) => setFollowUpRequiredEdit(e.target.checked)}
                                    disabled={updating || task.status === 'PENDING'}
                                />
                                Follow-up still required after closure
                            </label>
                            <div className="grid grid-cols-1 gap-3">
                                <div>
                                    <label className="block text-[11px] font-bold uppercase tracking-wider text-teal-700 mb-1">Follow-up Due</label>
                                    <input
                                        type="datetime-local"
                                        className="w-full rounded border border-teal-200 bg-white p-2 text-sm disabled:bg-teal-100"
                                        value={followUpDueAtEdit}
                                        onChange={(e) => setFollowUpDueAtEdit(e.target.value)}
                                        disabled={updating || task.status === 'PENDING' || !followUpRequiredEdit}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-bold uppercase tracking-wider text-teal-700 mb-1">Follow-up Summary</label>
                                    <textarea
                                        className="w-full rounded border border-teal-200 bg-white p-3 text-sm disabled:bg-teal-100"
                                        rows={2}
                                        value={followUpSummaryEdit}
                                        onChange={(e) => setFollowUpSummaryEdit(e.target.value)}
                                        disabled={updating || task.status === 'PENDING' || !followUpRequiredEdit}
                                        placeholder="Describe the callback, reminder, or next contact needed."
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {task.status !== 'PENDING' && (
                        <div className="mt-4 flex justify-end">
                            <button
                                type="button"
                                onClick={handleSaveOutcome}
                                disabled={updating}
                                className="px-4 py-2 rounded bg-teal-700 text-white text-sm font-bold hover:bg-teal-800 disabled:opacity-50"
                            >
                                Save Outcome
                            </button>
                        </div>
                    )}

                    {task.status !== 'PENDING' && (
                        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                            <AttachmentPanel
                                entityType="TASK_OUTCOME"
                                entityId={task.id}
                                title="Outcome Attachments"
                                canUpload={!taskAttachmentLockReason}
                                canDeleteAll={canOverrideStepOwnership}
                                currentUserId={currentUserId}
                                disabledReason={taskAttachmentLockReason}
                                compact
                                onChanged={loadHistory}
                            />
                            <AttachmentPanel
                                entityType="TASK_FOLLOW_UP"
                                entityId={task.id}
                                title="Follow-up Attachments"
                                canUpload={!taskAttachmentLockReason}
                                canDeleteAll={canOverrideStepOwnership}
                                currentUserId={currentUserId}
                                disabledReason={taskAttachmentLockReason}
                                compact
                                onChanged={loadHistory}
                            />
                        </div>
                    )}
                </TaskSection>

                {(followUpAutomation?.isAutoGenerated || subTasks.length > 0) && (
                    <TaskSection
                        title="Linked Follow-ups"
                        summary={followUpAutomation?.automationType ? formatAutomationType(followUpAutomation.automationType) : 'Generated follow-up tasks'}
                        count={subTasks.length}
                        open={openSections.followups}
                        onToggle={() => toggleSection('followups')}
                    >
                        <div className="flex items-center justify-between gap-3 mb-4">
                            <div>
                                <div className="text-xs font-bold uppercase tracking-wider text-cyan-700">Follow-up Automation</div>
                                <div className="text-sm text-cyan-900">
                                    Automated follow-up tasks keep the case moving after closure without relying on memory or ad hoc notes.
                                </div>
                            </div>
                        </div>

                        {followUpAutomation?.isAutoGenerated && task.ParentTask && (
                            <div className="mb-4 rounded-lg border border-cyan-200 bg-white p-3 text-sm text-cyan-950">
                                <div className="font-semibold">This task was auto-generated from task #{task.ParentTask.id}</div>
                                <div className="mt-1 text-xs text-cyan-800">
                                    {formatAutomationType(followUpAutomation.automationType)} • Parent outcome {formatEnumLabel(task.ParentTask.resolvedAs || task.ParentTask.status)}
                                </div>
                            </div>
                        )}

                        {subTasks.length > 0 && (
                            <div className="space-y-3">
                                <div className="text-sm font-semibold text-cyan-900">Generated follow-up tasks</div>
                                {subTasks
                                    .slice()
                                    .sort((a, b) => new Date(a.dueAt || a.createdAt).getTime() - new Date(b.dueAt || b.createdAt).getTime())
                                    .map((subTask) => {
                                        const automationMeta = subTask.payload?.followUpAutomation;
                                        return (
                                            <div key={subTask.id} className="rounded-lg border border-cyan-200 bg-white p-3">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <div>
                                                        <div className="text-sm font-semibold text-slate-900">
                                                            Task #{subTask.id} • {(subTask.subType || subTask.type || 'FOLLOW UP').replace(/_/g, ' ')}
                                                        </div>
                                                        <div className="mt-1 text-xs text-slate-600">
                                                            {formatAutomationType(automationMeta?.automationType)} • Due {subTask.dueAt ? new Date(subTask.dueAt).toLocaleString() : 'not scheduled'}
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className={`px-2 py-1 rounded text-[11px] font-bold uppercase tracking-wider ${
                                                            subTask.status === 'PENDING'
                                                                ? 'bg-yellow-100 text-yellow-800 border border-yellow-200'
                                                                : subTask.status === 'ACTIONED'
                                                                    ? 'bg-green-100 text-green-800 border border-green-200'
                                                                    : 'bg-red-100 text-red-800 border border-red-200'
                                                        }`}>
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

                <TaskSection
                    title="Workflow Steps"
                    summary={task.nextStepSummary || 'No active step recorded'}
                    count={taskSteps.length}
                    open={openSections.steps}
                    onToggle={() => toggleSection('steps')}
                >
                    <div className="flex items-center justify-between gap-3 mb-4">
                        <div>
                            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Workflow Steps</div>
                            <div className="text-sm text-slate-600">Use structured steps for handoffs, blockers, and staged completion.</div>
                        </div>
                        {canReorderSteps && orderedTaskSteps.length > 1 && (
                            <div className="flex shrink-0 items-center gap-2">
                                {reorderMode ? (
                                    <>
                                        <button
                                            type="button"
                                            disabled={updating}
                                            onClick={cancelReorderSteps}
                                            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            disabled={updating}
                                            onClick={saveReorderSteps}
                                            className="rounded bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                                        >
                                            Save Order
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        type="button"
                                        disabled={updating}
                                        onClick={beginReorderSteps}
                                        className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                                    >
                                        Reorder
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {reorderMode ? (
                        <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3">
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                <div>
                                    <div className="text-xs font-bold uppercase tracking-wider text-blue-700">Reorder Workflow</div>
                                    <div className="text-sm text-slate-600">Drag a step into position, or use the arrow controls.</div>
                                </div>
                            </div>
                            <div className="space-y-2">
                                {reorderDraft.map((step, index) => {
                                    const ownerName = users.find(user => user.id === step.ownerUserId)?.displayName || 'Unassigned';
                                    const isDragging = draggedStepId === step.id;

                                    return (
                                        <div
                                            key={step.id}
                                            draggable={!updating}
                                            onDragStart={(event) => {
                                                setDraggedStepId(step.id);
                                                event.dataTransfer.effectAllowed = 'move';
                                                event.dataTransfer.setData('text/plain', String(step.id));
                                            }}
                                            onDragOver={(event) => {
                                                event.preventDefault();
                                                const activeStepId = draggedStepId ?? Number(event.dataTransfer.getData('text/plain'));
                                                const fromIndex = reorderDraft.findIndex(candidate => candidate.id === activeStepId);
                                                if (fromIndex >= 0 && fromIndex !== index) {
                                                    moveReorderStep(fromIndex, index);
                                                }
                                            }}
                                            onDragEnd={() => setDraggedStepId(null)}
                                            className={`flex items-center gap-3 rounded-lg border bg-white p-3 shadow-sm transition ${isDragging ? 'border-blue-400 opacity-70' : 'border-slate-200'}`}
                                        >
                                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
                                                {index + 1}
                                            </div>
                                            <div className="flex min-w-0 flex-1 items-center gap-3">
                                                <div className="cursor-grab select-none rounded border border-slate-200 bg-slate-50 px-2 py-1 text-sm font-bold text-slate-500 active:cursor-grabbing" aria-hidden="true">
                                                    ::
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="truncate text-sm font-semibold text-slate-900">{step.title}</div>
                                                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                                                        <span>{step.status.replace(/_/g, ' ')}</span>
                                                        <span>{step.waitingOn}</span>
                                                        <span>{ownerName}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex shrink-0 items-center gap-1">
                                                <button
                                                    type="button"
                                                    disabled={updating || index === 0}
                                                    onClick={() => moveReorderStep(index, index - 1)}
                                                    className="h-8 rounded border border-slate-300 bg-white px-2 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                                                    aria-label={`Move ${step.title} up`}
                                                >
                                                    Up
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={updating || index === reorderDraft.length - 1}
                                                    onClick={() => moveReorderStep(index, index + 1)}
                                                    className="h-8 rounded border border-slate-300 bg-white px-2 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                                                    aria-label={`Move ${step.title} down`}
                                                >
                                                    Down
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {orderedTaskSteps
                            .map((step, index) => {
                                const isStepOpen = openStepId === step.id;
                                const ownerName = users.find(user => user.id === step.ownerUserId)?.displayName || 'Unassigned';
                                const dueSummary = step.dueAt ? new Date(step.dueAt).toLocaleDateString() : 'No due date';
                                const stepLockReason = getStepLockReason(step);

                                return (
                                    <div key={step.id} className={`overflow-hidden rounded-lg border bg-slate-50 ${isStepOpen ? 'border-blue-200 shadow-sm' : 'border-slate-200'}`}>
                                        <button
                                            type="button"
                                            onClick={() => toggleStep(step.id)}
                                            className="flex w-full items-start justify-between gap-3 p-3 text-left hover:bg-slate-100"
                                            aria-expanded={isStepOpen}
                                        >
                                            <div className="min-w-0">
                                                <div className="mb-2 flex flex-wrap items-center gap-2">
                                                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Step {index + 1}</span>
                                                    <span className={`px-2 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider
                                                        ${step.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800 border border-yellow-200' : ''}
                                                        ${step.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-800 border border-blue-200' : ''}
                                                        ${step.status === 'BLOCKED' ? 'bg-red-100 text-red-800 border border-red-200' : ''}
                                                        ${step.status === 'COMPLETED' ? 'bg-green-100 text-green-800 border border-green-200' : ''}
                                                        ${(step.status === 'SKIPPED' || step.status === 'CANCELLED') ? 'bg-gray-100 text-gray-700 border border-gray-200' : ''}
                                                    `}>
                                                        {step.status.replace(/_/g, ' ')}
                                                    </span>
                                                    <span className="px-2 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider bg-white border border-slate-200 text-slate-700">
                                                        {step.waitingOn}
                                                    </span>
                                                    {step.suggestionStatus && (
                                                        <span className="rounded bg-blue-50 px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-blue-700">
                                                            Suggestion {step.suggestionStatus}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-sm font-semibold text-slate-900">{step.title}</div>
                                                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                                                    <span>Owner: {ownerName}</span>
                                                    <span>Due: {dueSummary}</span>
                                                </div>
                                            </div>
                                            <span className="shrink-0 rounded border border-slate-200 bg-white px-2 py-1 text-xs font-bold uppercase text-slate-600">
                                                {isStepOpen ? 'Collapse' : 'Open'}
                                            </span>
                                        </button>

                                        {isStepOpen && (
                                            <div className="border-t border-slate-200 p-3">
                                                {step.description && (
                                                    <div className="mb-3 text-sm text-slate-600 whitespace-pre-wrap">{step.description}</div>
                                                )}
                                                {stepLockReason && (
                                                    <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                                                        {stepLockReason}
                                                    </div>
                                                )}

                                    <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                                        <div>
                                            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Owner</label>
                                            <select
                                                className="w-full rounded border border-slate-300 bg-white p-2 text-sm"
                                                value={step.ownerUserId ?? ''}
                                                disabled={updating || userRole === 'staff'}
                                                onChange={(e) => handleStepUpdate(step.id, { ownerUserId: e.target.value ? Number(e.target.value) : null })}
                                            >
                                                <option value="">Unassigned</option>
                                                {users.map(user => (
                                                    <option key={user.id} value={user.id}>{user.displayName}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Waiting On</label>
                                            <select
                                                className="w-full rounded border border-slate-300 bg-white p-2 text-sm"
                                                value={step.waitingOn}
                                                disabled={updating || Boolean(stepLockReason)}
                                                onChange={(e) => handleStepUpdate(step.id, { waitingOn: e.target.value })}
                                            >
                                                {['NONE', 'STAFF', 'CUSTOMER', 'MANAGER', 'EXTERNAL'].map(option => (
                                                    <option key={option} value={option}>{option}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Due</label>
                                            <input
                                                type="datetime-local"
                                                className="w-full rounded border border-slate-300 bg-white p-2 text-sm"
                                                value={formatDateTimeInput(step.dueAt)}
                                                disabled={updating || Boolean(stepLockReason)}
                                                onChange={(e) => handleStepUpdate(step.id, { dueAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
                                            />
                                        </div>
                                    </div>

                                    {(step.blockedReason || step.completionNotes) && (
                                        <div className="mt-3 space-y-1 text-sm">
                                            {step.blockedReason && (
                                                <div className="text-red-700"><span className="font-semibold">Blocked:</span> {step.blockedReason}</div>
                                            )}
                                            {step.completionNotes && (
                                                <div className="text-green-700"><span className="font-semibold">Completion Note:</span> {step.completionNotes}</div>
                                            )}
                                        </div>
                                    )}

                                    <div className="mt-3">
                                        <AttachmentPanel
                                            entityType="TASK_STEP"
                                            entityId={step.id}
                                            title="Step Attachments"
                                            canUpload={!stepLockReason}
                                            canDeleteAll={canOverrideStepOwnership}
                                            currentUserId={currentUserId}
                                            disabledReason={stepLockReason}
                                            compact
                                            onChanged={loadHistory}
                                        />
                                    </div>

                                    {(() => {
                                        const draft = getStepSuggestionDraft(step);
                                        const draftChannel = String(draft.suggestedChannel || 'none');
                                        const hasSuggestion = Boolean(
                                            draft.suggestedReplyBody
                                            || draft.suggestedAction
                                            || step.suggestionStatus
                                            || step.suggestionGeneratedAt
                                        );
                                        const suggestionBusy = updating && activeStepSuggestionId === step.id;

                                        return (
                                            <div className="mt-3 rounded-md border border-blue-100 bg-white p-3">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="text-xs font-bold uppercase tracking-wider text-blue-700">Step Suggestion</span>
                                                        {step.suggestionStatus && (
                                                            <span className="rounded bg-blue-50 px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-blue-700">
                                                                {step.suggestionStatus}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <button
                                                        type="button"
                                                        disabled={updating || Boolean(stepLockReason)}
                                                        onClick={() => handleGenerateStepSuggestion(step.id)}
                                                        className="rounded border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                                                    >
                                                        {suggestionBusy ? 'Generating...' : hasSuggestion ? 'Regenerate' : 'Generate'}
                                                    </button>
                                                </div>

                                                {hasSuggestion && (
                                                    <div className="mt-3 space-y-3">
                                                        <div>
                                                            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500">Action</label>
                                                            <textarea
                                                                className="w-full rounded border border-slate-300 p-2 text-sm"
                                                                rows={2}
                                                                value={String(draft.suggestedAction || '')}
                                                                disabled={Boolean(stepLockReason)}
                                                                onChange={(e) => updateStepSuggestionDraft(step.id, { suggestedAction: e.target.value })}
                                                            />
                                                        </div>

                                                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                                                            <div>
                                                                <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500">Channel</label>
                                                                <select
                                                                    className="w-full rounded border border-slate-300 bg-white p-2 text-sm"
                                                                    value={draftChannel}
                                                                    disabled={Boolean(stepLockReason)}
                                                                    onChange={(e) => updateStepSuggestionDraft(step.id, { suggestedChannel: e.target.value })}
                                                                >
                                                                    <option value="email">Email</option>
                                                                    <option value="sms">SMS</option>
                                                                    <option value="voice">Voice</option>
                                                                    <option value="none">None</option>
                                                                </select>
                                                            </div>

                                                            {draftChannel === 'email' && (
                                                                <>
                                                                    <div>
                                                                        <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500">To</label>
                                                                        <input
                                                                            type="email"
                                                                            className="w-full rounded border border-slate-300 p-2 text-sm"
                                                                            value={String(draft.suggestedRecipientEmail || '')}
                                                                            disabled={Boolean(stepLockReason)}
                                                                            onChange={(e) => updateStepSuggestionDraft(step.id, { suggestedRecipientEmail: e.target.value })}
                                                                        />
                                                                    </div>
                                                                    <div>
                                                                        <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500">CC</label>
                                                                        <input
                                                                            type="text"
                                                                            className="w-full rounded border border-slate-300 p-2 text-sm"
                                                                            value={String(draft.suggestedCc || '')}
                                                                            disabled={Boolean(stepLockReason)}
                                                                            onChange={(e) => updateStepSuggestionDraft(step.id, { suggestedCc: e.target.value })}
                                                                        />
                                                                    </div>
                                                                </>
                                                            )}
                                                        </div>

                                                        {draftChannel === 'email' && (
                                                            <div>
                                                                <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500">Subject</label>
                                                                <input
                                                                    type="text"
                                                                    className="w-full rounded border border-slate-300 p-2 text-sm"
                                                                    value={String(draft.suggestedReplySubject || '')}
                                                                    disabled={Boolean(stepLockReason)}
                                                                    onChange={(e) => updateStepSuggestionDraft(step.id, { suggestedReplySubject: e.target.value })}
                                                                />
                                                            </div>
                                                        )}

                                                        <div>
                                                            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                                                {draftChannel === 'none' ? 'Internal Note' : 'Message'}
                                                            </label>
                                                            <textarea
                                                                className="w-full rounded border border-slate-300 p-2 text-sm"
                                                                rows={4}
                                                                value={String(draft.suggestedReplyBody || '')}
                                                                disabled={Boolean(stepLockReason)}
                                                                onChange={(e) => updateStepSuggestionDraft(step.id, { suggestedReplyBody: e.target.value })}
                                                            />
                                                        </div>

                                                        {step.suggestionError && (
                                                            <div className="text-xs font-semibold text-red-700">{step.suggestionError}</div>
                                                        )}

                                                        <div className="flex flex-wrap justify-end gap-2">
                                                            <button
                                                                type="button"
                                                                disabled={updating || Boolean(stepLockReason)}
                                                                onClick={() => handleSaveStepSuggestion(step)}
                                                                className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                                                            >
                                                                Save Draft
                                                            </button>
                                                            <button
                                                                type="button"
                                                                disabled={updating || Boolean(stepLockReason) || draftChannel === 'voice' || (draftChannel !== 'none' && !draft.suggestedReplyBody)}
                                                                onClick={() => handleActionStepSuggestion(step)}
                                                                className="rounded bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                                                            >
                                                                {draftChannel === 'none' ? 'Action Step' : 'Send & Complete'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}

                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            disabled={updating || Boolean(stepLockReason)}
                                            onClick={() => handleStepUpdate(step.id, { status: 'IN_PROGRESS', blockedReason: null })}
                                            className="px-2.5 py-1.5 rounded bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-50"
                                        >
                                            Start
                                        </button>
                                        <button
                                            type="button"
                                            disabled={updating || Boolean(stepLockReason)}
                                            onClick={() => {
                                                const completionNotes = window.prompt('Optional completion note', step.completionNotes || '') || '';
                                                handleStepUpdate(step.id, { status: 'COMPLETED', completionNotes, blockedReason: null, waitingOn: 'NONE' });
                                            }}
                                            className="px-2.5 py-1.5 rounded bg-green-600 text-white text-xs font-bold hover:bg-green-700 disabled:opacity-50"
                                        >
                                            Complete
                                        </button>
                                        <button
                                            type="button"
                                            disabled={updating || Boolean(stepLockReason)}
                                            onClick={() => {
                                                const blockedReason = window.prompt('Why is this step blocked?', step.blockedReason || '');
                                                if (blockedReason !== null) {
                                                    handleStepUpdate(step.id, { status: 'BLOCKED', blockedReason: blockedReason.trim() || 'Blocked', completionNotes: null });
                                                }
                                            }}
                                            className="px-2.5 py-1.5 rounded bg-red-600 text-white text-xs font-bold hover:bg-red-700 disabled:opacity-50"
                                        >
                                            Block
                                        </button>
                                        <button
                                            type="button"
                                            disabled={updating || Boolean(stepLockReason)}
                                            onClick={() => handleStepUpdate(step.id, { status: 'PENDING', blockedReason: null, completionNotes: null })}
                                            className="px-2.5 py-1.5 rounded bg-slate-700 text-white text-xs font-bold hover:bg-slate-800 disabled:opacity-50"
                                        >
                                            Reopen
                                        </button>
                                        <button
                                            type="button"
                                            disabled={updating || Boolean(stepLockReason)}
                                            onClick={() => handleDeleteStep(step.id)}
                                            className="px-2.5 py-1.5 rounded border border-slate-300 bg-white text-slate-700 text-xs font-bold hover:bg-slate-100 disabled:opacity-50"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-3">
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Add Step</div>
                        {createStepLockReason && (
                            <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                                {createStepLockReason}
                            </div>
                        )}
                        <div className="space-y-3">
                            <input
                                type="text"
                                className="w-full rounded border border-slate-300 p-2 text-sm"
                                placeholder="Step title"
                                value={newStepTitle}
                                disabled={Boolean(createStepLockReason)}
                                onChange={(e) => setNewStepTitle(e.target.value)}
                            />
                            <textarea
                                className="w-full rounded border border-slate-300 p-2 text-sm"
                                rows={2}
                                placeholder="What needs to happen in this step?"
                                value={newStepDescription}
                                disabled={Boolean(createStepLockReason)}
                                onChange={(e) => setNewStepDescription(e.target.value)}
                            />
                            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                                <select className="rounded border border-slate-300 p-2 text-sm" value={newStepInsertPosition} disabled={Boolean(createStepLockReason)} onChange={(e) => setNewStepInsertPosition(e.target.value)}>
                                    <option value="end">End of workflow</option>
                                    {orderedTaskSteps.length > 0 && <option value="0">Before step 1</option>}
                                    {orderedTaskSteps.map((step, index) => (
                                        <option key={step.id} value={index + 1}>
                                            {index === orderedTaskSteps.length - 1
                                                ? `After step ${index + 1}`
                                                : `After step ${index + 1} / before step ${index + 2}`}
                                        </option>
                                    ))}
                                </select>
                                <select className="rounded border border-slate-300 p-2 text-sm" value={newStepType} disabled={Boolean(createStepLockReason)} onChange={(e) => setNewStepType(e.target.value)}>
                                    {['INTERNAL', 'CUSTOMER_MESSAGE', 'CUSTOMER_WAIT', 'APPROVAL', 'EXTERNAL', 'EXECUTION', 'FOLLOW_UP', 'OTHER'].map(option => (
                                        <option key={option} value={option}>{option}</option>
                                    ))}
                                </select>
                                <select className="rounded border border-slate-300 p-2 text-sm" value={newStepWaitingOn} disabled={Boolean(createStepLockReason)} onChange={(e) => setNewStepWaitingOn(e.target.value)}>
                                    {['NONE', 'STAFF', 'CUSTOMER', 'MANAGER', 'EXTERNAL'].map(option => (
                                        <option key={option} value={option}>{option}</option>
                                    ))}
                                </select>
                                <select className="rounded border border-slate-300 p-2 text-sm" value={newStepOwnerId} disabled={Boolean(createStepLockReason)} onChange={(e) => setNewStepOwnerId(e.target.value ? Number(e.target.value) : '')}>
                                    <option value="">Unassigned</option>
                                    {users.map(user => (
                                        <option key={user.id} value={user.id}>{user.displayName}</option>
                                    ))}
                                </select>
                                <input
                                    type="datetime-local"
                                    className="rounded border border-slate-300 p-2 text-sm"
                                    value={newStepDueAt}
                                    disabled={Boolean(createStepLockReason)}
                                    onChange={(e) => setNewStepDueAt(e.target.value)}
                                />
                            </div>
                            <div className="flex justify-end">
                                <button
                                    type="button"
                                    onClick={handleCreateStep}
                                    disabled={updating || Boolean(createStepLockReason) || !newStepTitle.trim()}
                                    className="px-3 py-2 rounded bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 disabled:opacity-50"
                                >
                                    Add Workflow Step
                                </button>
                            </div>
                        </div>
                    </div>
                </TaskSection>

                <TaskSection
                    title="Activity & Notes"
                    summary={`${safeTaskMessages.length} messages / ${safeTaskActions.length} activity items`}
                    count={safeTaskMessages.length + safeTaskActions.length}
                    open={openSections.activity}
                    onToggle={() => {
                        const nextOpen = !openSections.activity;
                        if (nextOpen && !historyOpen) loadHistory();
                        setHistoryOpen(nextOpen);
                        toggleSection('activity');
                    }}
                >
                    {historyOpen && (
                        <div className="mb-3 flex justify-end">
                            <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
                                <span>Advanced</span>
                                <input
                                    data-task-advanced-toggle="true"
                                    type="checkbox"
                                    className="sr-only"
                                    checked={showAdvancedActivity}
                                    onChange={(e) => handleAdvancedActivityToggle(e.target.checked)}
                                />
                                <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${showAdvancedActivity ? 'bg-slate-900' : 'bg-slate-300'}`}>
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${showAdvancedActivity ? 'translate-x-4' : 'translate-x-1'}`}></span>
                                </span>
                            </label>
                        </div>
                    )}

                    {historyOpen && (
                        <div className="mb-4 space-y-4" data-task-activity-panel="true">
                            {historyLoading && <div className="text-sm text-gray-500 animate-pulse">Loading activity...</div>}
                            {historyError && <div className="text-sm text-red-600">{historyError}</div>}
                            {!historyLoading && (
                                <div className="space-y-4">
                                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                                        <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Communication Timeline</div>
                                        {safeTaskMessages.length === 0 ? (
                                            <div className="text-sm text-slate-600">No linked inbound or outbound messages are attached to this task yet.</div>
                                        ) : (
                                            <div className="space-y-3">
                                                {safeTaskMessages
                                                    .slice()
                                                    .sort((a, b) => new Date(a.receivedAt || a.createdAt).getTime() - new Date(b.receivedAt || b.createdAt).getTime())
                                                    .map(message => (
                                                        <div key={message.id} className="rounded-lg border border-slate-200 bg-white p-3">
                                                            <div className="flex flex-wrap items-center gap-2 text-xs mb-2">
                                                                <span className={`px-2 py-1 rounded font-bold uppercase tracking-wider ${
                                                                    message.direction === 'inbound'
                                                                        ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                                                        : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                                                }`}>
                                                                    {displayActionValue(message.direction)}
                                                                </span>
                                                                <span className="px-2 py-1 rounded bg-slate-100 text-slate-700 border border-slate-200 font-bold uppercase tracking-wider">
                                                                    {displayActionValue(message.source)}
                                                                </span>
                                                                <span className="text-slate-500">{formatMessageTimestamp(message)}</span>
                                                            </div>
                                                            {message.subject && (
                                                                <div className="text-sm font-semibold text-slate-900 mb-1">{displayActionValue(message.subject)}</div>
                                                            )}
                                                            <div className="text-sm text-slate-700 whitespace-pre-wrap">
                                                                {message.body ? displayActionValue(message.body) : 'No message body captured.'}
                                                            </div>
                                                        </div>
                                                    ))}
                                            </div>
                                        )}
                                    </div>

                                    {visibleTaskActions.length === 0 && (
                                            <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600">
                                                {showAdvancedActivity ? 'No activity has been recorded yet.' : 'No high-impact activity has been recorded yet.'}
                                            </div>
                                        )}

                                    {visibleTaskActions.map((action, index) => (
                                        <TaskActivityErrorBoundary key={`${task.id}-${actionKey(action, index)}-${showAdvancedActivity ? 'advanced' : 'basic'}`}>
                                            <div
                                                className="min-w-0 text-sm flex flex-col items-start bg-gray-50/50 p-3 rounded-lg border border-gray-100"
                                                data-task-action-row="true"
                                                data-task-action-id={action.id ?? ''}
                                                data-task-action-type={String(action.actionType || '')}
                                            >
                                                <div className="flex flex-wrap items-center gap-2 text-gray-500 text-xs mb-1">
                                                    <span className="font-bold text-gray-700">{displayActionValue(action.User?.displayName || 'System')}</span>
                                                    <span>•</span>
                                                    <span>{new Date(actionTimestamp(action)).toLocaleString()}</span>
                                                </div>
                                                <div className="w-full">
                                                    <TaskActivityDetails
                                                        action={action}
                                                        showAdvancedActivity={showAdvancedActivity}
                                                        renderBasicDetails={renderActionDetails}
                                                        renderAdvancedDetails={renderAdvancedActionDetails}
                                                    />
                                                </div>
                                            </div>
                                        </TaskActivityErrorBoundary>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Add Note */}
                    <div className="mb-2 flex gap-2 items-start">
                        <div className="flex-1 relative">
                            {/* Mention Dropdown */}
                            {mentionActive && mentionOptions.length > 0 && (
                                <div className="absolute bottom-full mb-1 left-0 w-64 max-h-48 overflow-y-auto bg-white border border-gray-200 shadow-lg rounded-md z-50 divide-y divide-gray-100">
                                    <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 bg-gray-50 sticky top-0">
                                        Mention Staff
                                    </div>
                                    {mentionOptions.map(user => (
                                        <button
                                            key={user.id}
                                            className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 focus:bg-blue-50 focus:outline-none transition-colors"
                                            onClick={() => insertMention(user)}
                                        >
                                            <div className="font-medium text-gray-900">{user.displayName}</div>
                                            <div className="text-xs text-gray-500">{user.role || 'Staff'}</div>
                                        </button>
                                    ))}
                                </div>
                            )}

                            <textarea
                                className="w-full text-sm p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none pr-24 min-h-[50px] resize-none"
                                value={noteEdit}
                                onChange={handleNoteChange}
                                placeholder="Add a note... (type @ to mention)"
                                rows={1}
                            />
                            <div className="absolute bottom-1.5 right-1.5 flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setIsPrivateNote(!isPrivateNote)}
                                    className={`p-1.5 rounded-md text-xs font-bold transition-colors ${isPrivateNote ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
                                    title={isPrivateNote ? 'Note will be Private (only tagged users & managers can see)' : 'Note will be Public (everyone can see)'}
                                >
                                    {isPrivateNote ? '🔒 Private' : '🔓 Public'}
                                </button>
                                <button
                                    onClick={handleAddNote}
                                    disabled={updating || !noteEdit.trim()}
                                    className="px-3 py-1.5 bg-gray-900 text-white rounded-md text-xs font-bold hover:bg-gray-800 disabled:opacity-50"
                                >
                                    Add Note
                                </button>
                            </div>
                        </div>
                    </div>

                </TaskSection>

                {/* AI Suggestion Section */}
                {task.status === 'PENDING' && (
                        <div className="border border-blue-200 rounded-lg overflow-hidden mt-4 shadow-sm">
                            <button
                                onClick={() => setExpandedActions(!expandedActions)}
                                className="w-full flex items-center justify-between p-3 bg-blue-50 hover:bg-blue-100 text-left"
                            >
                                <span className="text-blue-700 font-bold text-sm">✨ Recommended Current Action</span>
                                <span className="text-blue-400 text-xs">{expandedActions ? 'COLLAPSE' : 'EXPAND'}</span>
                            </button>
                            {expandedActions && (
                                <div className="p-4 bg-white border-t border-blue-100 space-y-3">
                                    <div className="flex justify-end">
                                        <button 
                                            onClick={handleRegenerateSuggestion} 
                                            disabled={updating} 
                                            className={`text-xs text-blue-600 hover:underline ${updating ? 'opacity-50 cursor-not-allowed animate-pulse' : ''}`}
                                        >
                                            {updating ? '⟳ Regenerating...' : '⟳ Regenerate'}
                                        </button>
                                    </div>

                                    {/* Internal Routing Recommendation */}
                                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                                            <div className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-1">🧭 Internal Routing Recommendation</div>
                                            <textarea
                                                className="w-full text-sm p-2 border border-amber-200 rounded bg-white text-amber-950"
                                                rows={3}
                                                value={actionEdit}
                                                onChange={(e) => setActionEdit(e.target.value)}
                                                placeholder="No internal action suggested"
                                            />
                                    </div>

                                    {/* Sender, Recipient & CC */}
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">📤 From</label>
                                            <input
                                                type="text"
                                                className="w-full text-sm p-2 border border-gray-300 rounded bg-gray-50 text-gray-600"
                                                value={task.Assignee?.displayName
                                                    ? `${task.Assignee.displayName}${task.Assignee.email ? ` <${task.Assignee.email}>` : ' (Staff)'}`
                                                    : 'Winery System'}
                                                readOnly
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">📧 To</label>
                                            <input
                                                type="text"
                                                className={`w-full text-sm p-2 border border-gray-300 rounded ${channelEdit === 'email' ? '' : 'bg-gray-50 text-gray-600'}`}
                                                value={channelEdit === 'email' ? recipientEmailEdit : (channelEdit === 'sms' || channelEdit === 'voice' ? responseTargetPhone : 'No customer reply')}
                                                onChange={(e) => {
                                                    if (channelEdit === 'email') setRecipientEmailEdit(e.target.value);
                                                }}
                                                placeholder={channelEdit === 'email' ? 'No email identified' : 'No phone identified'}
                                                readOnly={channelEdit !== 'email'}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">📋 CC</label>
                                            <input
                                                type="text"
                                                className={`w-full text-sm p-2 border rounded ${channelEdit === 'email' ? 'border-gray-300' : 'border-gray-200 bg-gray-50 text-gray-500'}`}
                                                value={channelEdit === 'email' ? ccEmailEdit : 'Not required'}
                                                onChange={(e) => {
                                                    if (channelEdit === 'email') setCcEmailEdit(e.target.value);
                                                }}
                                                placeholder={channelEdit === 'email' ? 'No CC suggested' : ''}
                                                readOnly={channelEdit !== 'email'}
                                            />
                                        </div>
                                    </div>

                                    <div className="flex gap-4 flex-col lg:flex-row">
                                        <div className="flex-1">
                                            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">
                                                {channelEdit === 'voice' ? 'Call Notes' : channelEdit === 'none' ? 'Internal Note' : 'Message Preview'}
                                            </label>
                                            <textarea
                                                className="w-full text-sm p-3 border border-gray-300 rounded"
                                                rows={4}
                                                value={replyEdit}
                                                onChange={e => setReplyEdit(e.target.value)}
                                            />
                                        </div>
                                        <div className="w-full lg:w-1/3 space-y-3">
                                            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Channel</label>
                                            <select
                                                className="w-full text-sm border-gray-300 rounded"
                                                value={channelEdit}
                                                onChange={(e) => {
                                                    const nextChannel = e.target.value;
                                                    setChannelEdit(nextChannel);
                                                    if (nextChannel !== 'email') {
                                                        setRecipientEmailEdit('');
                                                        setCcEmailEdit('');
                                                        setSubjectEdit('');
                                                    } else {
                                                        setRecipientEmailEdit(task.suggestedRecipientEmail || task.Member?.email || manualIntake?.requesterEmail || '');
                                                        setSubjectEdit(task.suggestedReplySubject || `Re: ${task.subType?.replace(/_/g, ' ') || task.category || 'Task'}`);
                                                    }
                                                }}
                                            >
                                                <option value="email">Email</option>
                                                <option value="sms">SMS</option>
                                                <option value="voice">Voice</option>
                                                <option value="none">None (Internal)</option>
                                            </select>
                                            {channelEdit === 'email' && (
                                                <>
                                                    <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Subject</label>
                                                    <input type="text" className="w-full text-sm border-gray-300 rounded" value={subjectEdit} onChange={e => setSubjectEdit(e.target.value)} />
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex justify-end pt-2">
                                        <button onClick={() => handleStatusChange('ACTIONED')} disabled={updating} className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-bold shadow-sm hover:bg-blue-700">
                                            {channelEdit === 'voice' ? 'Mark Call Complete' : channelEdit === 'none' ? 'Mark Actioned' : 'Action & Send'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                )}
            </div>

            <aside className="mt-5 space-y-3 lg:sticky lg:top-4 lg:mt-0">
                <div className="rounded-lg border border-[#dfe6da] bg-white p-4">
                    <div className="mb-3 text-xs font-bold uppercase tracking-wider text-[#344039]">Case controls</div>
                    <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">Status</label>
                    <div className={`relative w-full rounded-md border px-2 py-2 text-sm font-medium
                        ${task.status === 'ACTIONED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : ''}
                        ${task.status === 'PENDING' ? 'bg-amber-50 text-amber-700 border-amber-200' : ''}
                        ${task.status === 'REJECTED' ? 'bg-red-50 text-red-700 border-red-200' : ''}
                    `}>
                        <select
                            className="w-full border-none bg-transparent p-0 text-sm font-medium"
                            value={task.status}
                            onChange={(e) => handleStatusChange(e.target.value)}
                            disabled={updating}
                        >
                            <option value="PENDING">Pending</option>
                            <option value="ACTIONED">Actioned</option>
                            {(userRole !== 'staff') && <option value="REJECTED">Rejected</option>}
                        </select>
                    </div>

                    {canAssign && (
                        <div className="mt-3">
                            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">
                                {isStaffAssignmentReview ? 'Assign to staff' : 'Assignee'}
                            </label>
                            <select
                                className="form-control"
                                value={task.assigneeId || ''}
                                onChange={(e) => handleAssignment(e.target.value)}
                                disabled={updating}
                            >
                                <option value="">Unassigned</option>
                                {assignmentUsers.map(u => (
                                    <option key={u.id} value={u.id}>{u.displayName}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                <div className="rounded-lg border border-[#dfe6da] bg-white p-4">
                    <div className="mb-3 text-xs font-bold uppercase tracking-wider text-[#344039]">At a glance</div>
                    <div className="space-y-3 text-sm">
                        <CaseSidebarItem label="Assignee" value={assigneeName} tone={task.assigneeId ? 'normal' : 'warning'} />
                        <CaseSidebarItem label="Due" value={formatShortDate(task.dueAt)} tone={task.isOverdue ? 'danger' : task.isDueSoon ? 'warning' : 'normal'} />
                        <CaseSidebarItem label="Waiting On" value={humanize(task.waitingOn || 'NONE')} tone={task.waitingOn && task.waitingOn !== 'NONE' ? 'warning' : 'normal'} />
                        <CaseSidebarItem label="Priority" value={`${humanize(task.priority || 'normal')} priority`} tone={task.priority === 'high' ? 'danger' : 'normal'} />
                        <CaseSidebarItem label="Messages" value={String(safeTaskMessages.length)} />
                        <CaseSidebarItem label="Workflow Steps" value={String(orderedTaskSteps.length)} />
                        {linkedNotices.length > 0 && (
                            <CaseSidebarItem label="Linked Notices" value={String(linkedNotices.length)} />
                        )}
                    </div>
                </div>

                <div className="rounded-lg border border-[#dfe6da] bg-white p-4">
                    <div className="mb-3 text-xs font-bold uppercase tracking-wider text-[#344039]">Quick actions</div>
                    <div className="flex flex-col gap-2">
                        <button
                            type="button"
                            className="btn-secondary justify-center"
                            onClick={() => {
                                const nextOpen = !openSections.activity;
                                if (nextOpen && !historyOpen) loadHistory();
                                setHistoryOpen(nextOpen);
                                setOpenSections(prev => ({ ...prev, activity: nextOpen }));
                            }}
                        >
                            {openSections.activity ? 'Hide Notes' : 'Notes & History'}
                        </button>
                        <button
                            type="button"
                            className="btn-secondary justify-center"
                            onClick={() => setOpenSections(prev => ({ ...prev, notices: !prev.notices }))}
                        >
                            {openSections.notices ? 'Hide Notices' : 'Linked Notices'}
                        </button>
                        <button
                            type="button"
                            className="btn-secondary justify-center"
                            onClick={() => setOpenSections(prev => ({ ...prev, outcome: !prev.outcome }))}
                        >
                            {openSections.outcome ? 'Hide Outcome' : 'Outcome'}
                        </button>
                    </div>
                </div>
            </aside>
        </div>
    );
}
