'use client';

import { useState, useEffect } from 'react';
import {
    Task,
    TaskAction,
    TaskStep,
    createTaskStep,
    deleteTaskStep,
    getTask,
    updateTask,
    updateNotePrivacy,
    updateTaskStep,
    Staff,
    toggleTaskFlag
} from '../lib/api';

interface TaskCardProps {
    task: Task;
    users: Staff[];
    onRefresh: () => void;
    canAssign?: boolean;
    userRole?: string | null;
    currentUserId?: number | null;
    isFlagged?: boolean;
    highlighted?: boolean;
    onToggleFlag?: (taskId: number) => void;
    autoExpand?: boolean;
}

export default function TaskCard({
    task,
    users,
    onRefresh,
    canAssign = true,
    userRole,
    currentUserId,
    isFlagged = false,
    highlighted = false,
    onToggleFlag,
    autoExpand = false
}: TaskCardProps) {
    const [updating, setUpdating] = useState(false);
    const [replyEdit, setReplyEdit] = useState(task.suggestedReplyBody || '');
    const [subjectEdit, setSubjectEdit] = useState(task.suggestedReplySubject || '');
    const [channelEdit, setChannelEdit] = useState(task.suggestedChannel || 'email');
    const [expandedActions, setExpandedActions] = useState(false);
    const [noteEdit, setNoteEdit] = useState('');
    const [isPrivateNote, setIsPrivateNote] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(autoExpand);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState('');
    const [taskActions, setTaskActions] = useState<TaskAction[]>(task.TaskActions || []);
    const [taskSteps, setTaskSteps] = useState<TaskStep[]>(task.TaskSteps || []);
    const [newStepTitle, setNewStepTitle] = useState('');
    const [newStepDescription, setNewStepDescription] = useState('');
    const [newStepType, setNewStepType] = useState('INTERNAL');
    const [newStepWaitingOn, setNewStepWaitingOn] = useState('STAFF');
    const [newStepOwnerId, setNewStepOwnerId] = useState<number | ''>(task.assigneeId || '');
    const [newStepDueAt, setNewStepDueAt] = useState('');

    // Mentions state
    const [mentionActive, setMentionActive] = useState(false);
    const [mentionQuery, setMentionQuery] = useState('');
    const [mentionStartIndex, setMentionStartIndex] = useState(-1);
    const [mentionOptions, setMentionOptions] = useState<Staff[]>([]);

    useEffect(() => {
        if (autoExpand) {
            loadHistory();
        }
    }, [autoExpand]);

    useEffect(() => {
        setReplyEdit(task.suggestedReplyBody || '');
        setSubjectEdit(task.suggestedReplySubject || '');
        setChannelEdit(task.suggestedChannel || 'email');
        setTaskActions(task.TaskActions || []);
        setTaskSteps(task.TaskSteps || []);
        setNewStepOwnerId(task.assigneeId || '');
    }, [task]);

    async function handleStatusChange(newStatus: string) {
        setUpdating(true);
        try {
            const updates: any = { status: newStatus };
            if (newStatus === 'ACTIONED') {
                updates.suggestedReplyBody = replyEdit;
                updates.suggestedChannel = channelEdit;
                updates.suggestedReplySubject = subjectEdit;
            }
            await updateTask(task.id, updates);
            onRefresh();
        } catch (err: any) {
            alert('Failed: ' + err.message);
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
        } catch (err: any) {
            alert('Failed to assign: ' + err.message);
        } finally {
            setUpdating(false);
        }
    }

    async function handleAddNote() {
        const note = noteEdit.trim();
        if (!note) return;
        setUpdating(true);
        try {
            await updateTask(task.id, { notes: note, isPrivateNote } as any);
            setNoteEdit('');
            setIsPrivateNote(false);
            setMentionActive(false);
            if (historyOpen) {
                await loadHistory();
            }
            onRefresh();
        } catch (err: any) {
            alert('Failed to add note: ' + err.message);
        } finally {
            setUpdating(false);
        }
    }

    async function handleToggleNotePrivacy(actionId: number, currentIsPrivate: boolean) {
        setUpdating(true);
        try {
            await updateNotePrivacy(task.id, actionId, !currentIsPrivate);
            await loadHistory();
        } catch (err: any) {
            alert('Failed to toggle note privacy: ' + err.message);
        } finally {
            setUpdating(false);
        }
    }

    function canSeePrivateNote(action: TaskAction): boolean {
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
    }

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

    async function loadHistory() {
        if (historyLoading) return;
        setHistoryLoading(true);
        setHistoryError('');
        try {
            const freshTask = await getTask(task.id);
            setTaskActions(freshTask.TaskActions || []);
            setTaskSteps(freshTask.TaskSteps || []);
        } catch (err: any) {
            setHistoryError(err.message || 'Failed to load history');
        } finally {
            setHistoryLoading(false);
        }
    }

    async function handleRegenerateSuggestion() {
        setUpdating(true);
        try {
            const refreshedTask = await updateTask(task.id, { regenerateSuggestedReply: true });
            
            // Immediately sync the local React state with the newly generated answers
            setReplyEdit(refreshedTask.suggestedReplyBody || '');
            setSubjectEdit(refreshedTask.suggestedReplySubject || '');
            setChannelEdit(refreshedTask.suggestedChannel || 'email');

            await loadHistory();
            onRefresh();
        } catch (err: any) {
            alert('Failed to generate suggestion: ' + err.message);
        } finally {
            setUpdating(false);
        }
    }

    async function onToggleStar() {
        if (onToggleFlag) {
            onToggleFlag(task.id);
        }
    }

    async function handleStepUpdate(stepId: number, updates: any) {
        setUpdating(true);
        try {
            await updateTaskStep(task.id, stepId, updates);
            await loadHistory();
            onRefresh();
        } catch (err: any) {
            alert('Failed to update step: ' + err.message);
        } finally {
            setUpdating(false);
        }
    }

    async function handleCreateStep() {
        if (!newStepTitle.trim()) return;
        setUpdating(true);
        try {
            await createTaskStep(task.id, {
                title: newStepTitle.trim(),
                description: newStepDescription.trim() || null,
                stepType: newStepType,
                waitingOn: newStepWaitingOn,
                ownerUserId: newStepOwnerId === '' ? null : newStepOwnerId,
                dueAt: newStepDueAt ? new Date(newStepDueAt).toISOString() : null
            });
            setNewStepTitle('');
            setNewStepDescription('');
            setNewStepType('INTERNAL');
            setNewStepWaitingOn('STAFF');
            setNewStepDueAt('');
            await loadHistory();
            onRefresh();
        } catch (err: any) {
            alert('Failed to add step: ' + err.message);
        } finally {
            setUpdating(false);
        }
    }

    async function handleDeleteStep(stepId: number) {
        setUpdating(true);
        try {
            await deleteTaskStep(task.id, stepId);
            await loadHistory();
            onRefresh();
        } catch (err: any) {
            alert('Failed to delete step: ' + err.message);
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

    function renderActionDetails(action: TaskAction) {
        if (action.actionType === 'NOTE_ADDED' && action.details?.note) {
            const noteIsPrivate = action.details.isPrivate === true;
            const canToggle = userRole === 'manager' || userRole === 'admin' || (currentUserId && action.userId === currentUserId);

            return (
                <div className={`mt-2 text-sm rounded p-3 ${noteIsPrivate ? 'bg-red-50 border border-red-200 text-gray-800' : 'bg-yellow-50 border border-yellow-200 text-gray-800'}`}>
                    <div className="flex items-center justify-between gap-2">
                        <div className="italic flex-1">
                            "{action.details.note}"
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
            const toUser = users.find(u => u.id === Number(action.details.to));
            let assigner = action.User?.displayName;
            if (!assigner && action.userId) {
                const assignerUser = users.find(u => u.id === action.userId);
                assigner = assignerUser?.displayName;
            }
            assigner = assigner || 'System';

            return (
                <div className="mt-2 text-sm bg-blue-50 border border-blue-100 rounded p-2 text-blue-900">
                    <span className="font-semibold">Assigned to: </span>
                    {toUser ? toUser.displayName : action.details.to}
                    <span className="text-gray-500 ml-2 text-xs">by {assigner}</span>
                </div>
            );
        }

        if (action.actionType === 'STEP_CREATED' || action.actionType === 'STEP_UPDATED' || action.actionType === 'STEP_COMPLETED' || action.actionType === 'STEP_DELETED') {
            const changes = action.details?.changes || {};
            return (
                <div className="mt-2 text-sm bg-indigo-50 border border-indigo-100 rounded p-3 text-indigo-900">
                    <div className="font-semibold">
                        {action.actionType === 'STEP_CREATED' && `Created step: ${action.details?.title || 'Untitled step'}`}
                        {action.actionType === 'STEP_UPDATED' && `Updated step: ${action.details?.title || 'Untitled step'}`}
                        {action.actionType === 'STEP_COMPLETED' && `Completed step: ${action.details?.title || 'Untitled step'}`}
                        {action.actionType === 'STEP_DELETED' && `Deleted step: ${action.details?.title || 'Untitled step'}`}
                    </div>
                    {Object.keys(changes).length > 0 && (
                        <div className="mt-2 space-y-1 text-xs">
                            {Object.entries(changes).map(([key, value]) => (
                                <div key={key}>
                                    <span className="font-semibold uppercase text-indigo-700">{key.replace(/_/g, ' ')}:</span>{' '}
                                    <span>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                    {action.details?.blockedReason && (
                        <div className="mt-2 text-xs text-indigo-800">Reason: {action.details.blockedReason}</div>
                    )}
                </div>
            );
        }

        if (action.details && Object.keys(action.details).length > 0) {
            const changes = action.details.changes || action.details;
            const entries = Object.entries(changes);
            if (entries.length > 0) {
                return (
                    <div className="mt-2 bg-gray-50 border border-gray-100 rounded p-2 text-xs">
                        {entries.map(([key, value]: [string, any]) => {
                            let displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
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
    }

    return (
        <div
            id={`task-${task.id}`}
            className={`bg-white shadow-sm border-y border-r border-l-4 border-gray-100 rounded-xl p-6 lg:p-8 flex flex-col items-start gap-4 transition-all duration-500 
                ${highlighted ? 'ring-2 ring-blue-500 bg-blue-50/30' : ''}
                ${task.priority === 'high' ? 'border-l-red-500' : ''}
                ${task.priority === 'normal' || !task.priority ? 'border-l-amber-500' : ''}
                ${task.priority === 'low' ? 'border-l-blue-400' : ''}
            `}
        >
            <div className="flex-1 w-full">
                {/* Header */}
                <div className="flex items-center gap-3 mb-4 flex-wrap">
                    <span className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider
                        ${task.category === 'OPERATIONS' ? 'bg-purple-50 text-purple-700 border border-purple-200' : ''}
                        ${task.category === 'ORDER' ? 'bg-sky-50 text-sky-700 border border-sky-200' : ''}
                        ${task.category === 'BOOKING' ? 'bg-pink-50 text-pink-700 border border-pink-200' : ''}
                        ${task.category === 'ACCOUNT' ? 'bg-orange-50 text-orange-700 border border-orange-200' : ''}
                        ${task.category === 'GENERAL' ? 'bg-gray-50 text-gray-700 border border-gray-200' : ''}
                    `}>
                        {task.category || 'GENERAL'}
                    </span>

                    <span className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider
                        ${task.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800 border border-yellow-200' : ''}
                        ${task.status === 'ACTIONED' ? 'bg-green-100 text-green-800 border border-green-200' : ''}
                        ${task.status === 'REJECTED' ? 'bg-red-100 text-red-800 border border-red-200' : ''}
                    `}>
                        {task.status.replace('_', ' ')}
                    </span>

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

                    <div className="flex items-center gap-1.5 text-sm font-medium text-gray-500 ml-auto">
                        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>{new Date(task.createdAt).toLocaleString()}</span>
                        <span className="text-gray-300 px-1">•</span>
                        <span className="text-gray-500">by {task.Creator ? task.Creator.displayName : 'System'}</span>
                    </div>
                </div>

                <div className="flex items-center gap-3 mb-2">
                    <button
                        onClick={onToggleStar}
                        className={`text-3xl focus:outline-none transition-transform hover:scale-125 ${isFlagged ? 'text-yellow-400' : 'text-gray-300'}`}
                        title={isFlagged ? "Unflag" : "Flag for follow-up"}
                    >
                        {isFlagged ? '★' : '☆'}
                    </button>
                    <h3 className="text-2xl font-bold text-gray-900 tracking-tight">
                        {task.subType ? task.subType.replace(/_/g, ' ') : task.type}
                    </h3>
                </div>

                <div className="text-sm mb-6">
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

                {canAssign && (
                    <div className="flex items-center gap-3 text-sm text-gray-700 mb-6 bg-gray-50/80 border border-gray-200 rounded-lg px-4 py-2.5 w-fit shadow-sm">
                        <span className="font-bold text-gray-500 uppercase text-xs tracking-wider">Assign to:</span>
                        <select
                            className="bg-transparent border-none text-sm font-semibold text-gray-900 focus:ring-0 cursor-pointer hover:text-blue-600 p-0"
                            value={task.assigneeId || ''}
                            onChange={(e) => handleAssignment(e.target.value)}
                            disabled={updating}
                        >
                            <option value="" className="text-gray-400">Unassigned</option>
                            {users.map(u => (
                                <option key={u.id} value={u.id}>{u.displayName}</option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Payload */}
                {(() => {
                    let raw = task.payload;
                    if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch (e) { } }
                    if (raw && typeof raw === 'object' && (raw.summary || raw.originalText)) {
                        return (
                            <div className="bg-white border boundary-gray-200 rounded-md overflow-hidden mb-4">
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
                        <div className="bg-gray-50 rounded p-3 text-sm font-mono text-gray-700 whitespace-pre-wrap max-h-32 overflow-y-auto mb-4">
                            {JSON.stringify(raw, null, 2)}
                        </div>
                    );
                })()}

                <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
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
                            <div className="text-slate-900">{task.dueAt ? new Date(task.dueAt).toLocaleString() : 'No due date'}</div>
                        </div>
                        <div>
                            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Blocked Reason</div>
                            <div className="text-slate-900">{task.blockedReason || 'Not blocked'}</div>
                        </div>
                    </div>
                </div>

                <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-3 mb-4">
                        <div>
                            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Workflow Steps</div>
                            <div className="text-sm text-slate-600">Use structured steps for handoffs, blockers, and staged completion.</div>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {taskSteps
                            .sort((a, b) => {
                                if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
                                return a.id - b.id;
                            })
                            .map((step, index) => (
                                <div key={step.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                    <div className="flex flex-wrap items-center gap-2 mb-2">
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
                                    </div>

                                    <div className="text-sm font-semibold text-slate-900">{step.title}</div>
                                    {step.description && (
                                        <div className="mt-1 text-sm text-slate-600 whitespace-pre-wrap">{step.description}</div>
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
                                                disabled={updating}
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
                                                disabled={updating}
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

                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            disabled={updating}
                                            onClick={() => handleStepUpdate(step.id, { status: 'IN_PROGRESS', blockedReason: null })}
                                            className="px-2.5 py-1.5 rounded bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-50"
                                        >
                                            Start
                                        </button>
                                        <button
                                            type="button"
                                            disabled={updating}
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
                                            disabled={updating}
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
                                            disabled={updating}
                                            onClick={() => handleStepUpdate(step.id, { status: 'PENDING', blockedReason: null, completionNotes: null })}
                                            className="px-2.5 py-1.5 rounded bg-slate-700 text-white text-xs font-bold hover:bg-slate-800 disabled:opacity-50"
                                        >
                                            Reopen
                                        </button>
                                        <button
                                            type="button"
                                            disabled={updating}
                                            onClick={() => handleDeleteStep(step.id)}
                                            className="px-2.5 py-1.5 rounded border border-slate-300 bg-white text-slate-700 text-xs font-bold hover:bg-slate-100 disabled:opacity-50"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </div>
                            ))}
                    </div>

                    <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-3">
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Add Step</div>
                        <div className="space-y-3">
                            <input
                                type="text"
                                className="w-full rounded border border-slate-300 p-2 text-sm"
                                placeholder="Step title"
                                value={newStepTitle}
                                onChange={(e) => setNewStepTitle(e.target.value)}
                            />
                            <textarea
                                className="w-full rounded border border-slate-300 p-2 text-sm"
                                rows={2}
                                placeholder="What needs to happen in this step?"
                                value={newStepDescription}
                                onChange={(e) => setNewStepDescription(e.target.value)}
                            />
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                <select className="rounded border border-slate-300 p-2 text-sm" value={newStepType} onChange={(e) => setNewStepType(e.target.value)}>
                                    {['INTERNAL', 'CUSTOMER_MESSAGE', 'CUSTOMER_WAIT', 'APPROVAL', 'EXTERNAL', 'EXECUTION', 'FOLLOW_UP', 'OTHER'].map(option => (
                                        <option key={option} value={option}>{option}</option>
                                    ))}
                                </select>
                                <select className="rounded border border-slate-300 p-2 text-sm" value={newStepWaitingOn} onChange={(e) => setNewStepWaitingOn(e.target.value)}>
                                    {['NONE', 'STAFF', 'CUSTOMER', 'MANAGER', 'EXTERNAL'].map(option => (
                                        <option key={option} value={option}>{option}</option>
                                    ))}
                                </select>
                                <select className="rounded border border-slate-300 p-2 text-sm" value={newStepOwnerId} onChange={(e) => setNewStepOwnerId(e.target.value ? Number(e.target.value) : '')}>
                                    <option value="">Unassigned</option>
                                    {users.map(user => (
                                        <option key={user.id} value={user.id}>{user.displayName}</option>
                                    ))}
                                </select>
                                <input
                                    type="datetime-local"
                                    className="rounded border border-slate-300 p-2 text-sm"
                                    value={newStepDueAt}
                                    onChange={(e) => setNewStepDueAt(e.target.value)}
                                />
                            </div>
                            <div className="flex justify-end">
                                <button
                                    type="button"
                                    onClick={handleCreateStep}
                                    disabled={updating || !newStepTitle.trim()}
                                    className="px-3 py-2 rounded bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 disabled:opacity-50"
                                >
                                    Add Workflow Step
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Notes/History Section */}
                <div className="mt-6 border-t border-gray-100 pt-4">
                    <button
                        onClick={() => {
                            if (!historyOpen) loadHistory();
                            setHistoryOpen(!historyOpen);
                        }}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium mb-3 flex items-center gap-1"
                    >
                        <span>Task Notes</span>
                        <span>{historyOpen ? '▲' : '▼'}</span>
                    </button>

                    {historyOpen && (
                        <div className="mb-4 space-y-4">
                            {historyLoading && <div className="text-sm text-gray-500 animate-pulse">Loading activity...</div>}
                            {historyError && <div className="text-sm text-red-600">{historyError}</div>}
                            {!historyLoading && (
                                <div className="space-y-4">
                                    {taskActions
                                        .filter(a => a.actionType !== 'TASK_CREATED' && a.actionType !== 'MANUAL_CREATED')
                                        .filter(a => {
                                            // Hide private notes the user shouldn't see
                                            if (a.actionType === 'NOTE_ADDED' && a.details?.isPrivate) {
                                                return canSeePrivateNote(a);
                                            }
                                            return true;
                                        })
                                        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
                                        .map(action => (
                                            <div key={action.id} className="text-sm flex flex-col items-start bg-gray-50/50 p-3 rounded-lg border border-gray-100">
                                                <div className="flex flex-wrap items-center gap-2 text-gray-500 text-xs mb-1">
                                                    <span className="font-bold text-gray-700">{action.User?.displayName || 'System'}</span>
                                                    <span>•</span>
                                                    <span>{new Date(action.createdAt).toLocaleString()}</span>
                                                </div>
                                                <div className="w-full">{renderActionDetails(action)}</div>
                                            </div>
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
                                    {task.suggestedAction && (
                                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                                            <div className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-1">🧭 Internal Routing Recommendation</div>
                                            <div className="text-sm text-amber-900">{task.suggestedAction}</div>
                                        </div>
                                    )}

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
                                                className="w-full text-sm p-2 border border-gray-300 rounded bg-gray-50 text-gray-600"
                                                value={task.suggestedRecipientEmail || ''}
                                                readOnly
                                                placeholder="No recipient identified"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">📋 CC</label>
                                            <input
                                                type="text"
                                                className="w-full text-sm p-2 border border-gray-300 rounded bg-gray-50 text-gray-600"
                                                value={task.suggestedCc || ''}
                                                readOnly
                                                placeholder="No CC suggested"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex gap-4 flex-col lg:flex-row">
                                        <div className="flex-1">
                                            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Message Preview</label>
                                            <textarea
                                                className="w-full text-sm p-3 border border-gray-300 rounded"
                                                rows={4}
                                                value={replyEdit}
                                                onChange={e => setReplyEdit(e.target.value)}
                                            />
                                        </div>
                                        <div className="w-full lg:w-1/3 space-y-3">
                                            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Channel</label>
                                            <select className="w-full text-sm border-gray-300 rounded" value={channelEdit} onChange={e => setChannelEdit(e.target.value)}>
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
                                        <button onClick={() => handleStatusChange('ACTIONED')} disabled={updating} className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-bold shadow-sm hover:bg-blue-700">Action & Send</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Status Column */}
            <div className="flex flex-col gap-2 min-w-[140px] ml-4 pt-1">
                <div className={`text-sm font-medium border rounded py-2 px-2 w-full relative
                    ${task.status === 'ACTIONED' ? 'bg-green-50 text-green-700 border-green-200' : ''}
                    ${task.status === 'PENDING' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' : ''}
                    ${task.status === 'REJECTED' ? 'bg-red-50 text-red-700 border-red-200' : ''}
                `}>
                    <select
                        className="bg-transparent border-none text-sm font-medium w-full p-0"
                        value={task.status}
                        onChange={(e) => handleStatusChange(e.target.value)}
                        disabled={updating}
                    >
                        <option value="PENDING">Pending</option>
                        <option value="ACTIONED">Actioned</option>
                        {(userRole !== 'staff') && <option value="REJECTED">Rejected</option>}
                    </select>
                </div>
            </div>
        </div>
    );
}
