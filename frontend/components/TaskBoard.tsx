'use client';

import { Task, TaskAction, getTask, updateTask, Staff } from '../lib/api';
import { useState } from 'react';

interface TaskBoardProps {
    tasks: Task[];
    users: Staff[];
    onRefresh: () => void;
    canAssign?: boolean;
    userRole?: string | null;
}

export default function TaskBoard({ tasks, users, onRefresh, canAssign = true, userRole }: TaskBoardProps) {
    const [updating, setUpdating] = useState<number | null>(null);
    const [replyEdits, setReplyEdits] = useState<{ [key: number]: string }>({});
    const [subjectEdits, setSubjectEdits] = useState<{ [key: number]: string }>({});
    const [channelEdits, setChannelEdits] = useState<{ [key: number]: string }>({});
    const [expandedActions, setExpandedActions] = useState<{ [key: number]: boolean }>({});
    const [noteEdits, setNoteEdits] = useState<{ [key: number]: string }>({});
    const [historyOpen, setHistoryOpen] = useState<{ [key: number]: boolean }>({});
    const [historyLoading, setHistoryLoading] = useState<{ [key: number]: boolean }>({});
    const [historyError, setHistoryError] = useState<{ [key: number]: string }>({});
    const [taskHistory, setTaskHistory] = useState<{ [key: number]: TaskAction[] }>({});

    async function handleStatusChange(id: number, newStatus: string, currentTask: Task) {
        setUpdating(id);
        try {
            const updates: any = { status: newStatus };

            // If approving, include all editable fields
            if (newStatus === 'APPROVED') {
                updates.suggestedReplyBody = replyEdits[id] ?? currentTask.suggestedReplyBody;
                updates.suggestedChannel = channelEdits[id] ?? currentTask.suggestedChannel ?? 'email';
                updates.suggestedReplySubject = subjectEdits[id] ?? currentTask.suggestedReplySubject;
            }

            await updateTask(id, updates);
            onRefresh();

            // Clear local edit state for this task
            setReplyEdits(prev => {
                const next = { ...prev };
                delete next[id];
                return next;
            });
        } catch (err: any) {
            alert('Failed: ' + err.message);
        } finally {
            setUpdating(null);
        }
    }

    async function handleAssignment(id: number, assigneeId: string) {
        setUpdating(id);
        try {
            // Handle unassignment if value is empty string (if we add that option)
            // But for now assuming we assign to a valid ID.
            if (!assigneeId) return;

            await updateTask(id, { assigneeId: parseInt(assigneeId) });
            onRefresh();
        } catch (err: any) {
            alert('Failed to assign: ' + err.message);
        } finally {
            setUpdating(null);
        }
    }

    async function handleAddNote(taskId: number) {
        const note = (noteEdits[taskId] || '').trim();
        if (!note) return;
        setUpdating(taskId);
        try {
            await updateTask(taskId, { notes: note });
            setNoteEdits(prev => ({ ...prev, [taskId]: '' }));
            if (historyOpen[taskId]) {
                await loadHistory(taskId);
            }
            onRefresh();
        } catch (err: any) {
            alert('Failed to add note: ' + err.message);
        } finally {
            setUpdating(null);
        }
    }

    async function loadHistory(taskId: number) {
        if (historyLoading[taskId]) return;
        setHistoryLoading(prev => ({ ...prev, [taskId]: true }));
        setHistoryError(prev => ({ ...prev, [taskId]: '' }));
        try {
            const task = await getTask(taskId);
            setTaskHistory(prev => ({ ...prev, [taskId]: task.TaskActions || [] }));
        } catch (err: any) {
            setHistoryError(prev => ({ ...prev, [taskId]: err.message || 'Failed to load history' }));
        } finally {
            setHistoryLoading(prev => ({ ...prev, [taskId]: false }));
        }
    }

    async function handleRegenerateSuggestion(taskId: number) {
        setUpdating(taskId);
        try {
            await updateTask(taskId, { regenerateSuggestedReply: true });
            await loadHistory(taskId);
            onRefresh();
        } catch (err: any) {
            alert('Failed to generate suggestion: ' + err.message);
        } finally {
            setUpdating(null);
        }
    }

    function formatActionLabel(actionType: string) {
        return actionType.replace(/_/g, ' ');
    }

    function renderActionDetails(action: TaskAction) {
        // 1. NOTES
        if (action.actionType === 'NOTE_ADDED' && action.details?.note) {
            return (
                <div className="mt-2 text-sm text-gray-800 bg-yellow-50 border border-yellow-200 rounded p-3 italic">
                    "{action.details.note}"
                </div>
            );
        }

        // 2. ASSIGNED
        if (action.actionType === 'ASSIGNED') {
            const toUser = users.find(u => u.id === Number(action.details.to));
            // Try action.User.displayName, then lookup from users list, then 'System'
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

        // 3. STATUS CHANGES / ASSIGNMENTS / ETC (Structured Data)
        if (action.details && Object.keys(action.details).length > 0) {
            // Check for 'changes' object common in audit logs
            const changes = action.details.changes || action.details;

            // If simple key-value pairs, render clean list
            const entries = Object.entries(changes);
            if (entries.length > 0) {
                return (
                    <div className="mt-2 bg-gray-50 border border-gray-100 rounded p-2 text-xs">
                        {entries.map(([key, value]: [string, any]) => {
                            let displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value);

                            // Resolve User IDs to Names
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

    if (tasks.length === 0) {
        return (
            <div className="text-center py-12 bg-white rounded-lg shadow">
                <p className="text-gray-500">No tasks found.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {tasks.map(task => (
                <div key={task.id} className="bg-white rounded-lg shadow p-6 flex flex-col md:flex-row items-start justify-between gap-4">
                    <div className="flex-1 w-full">
                        {/* Header */}
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                            <span className={`px-2 py-1 rounded text-xs font-bold uppercase tracking-wide
                                ${task.category === 'OPERATIONS' ? 'bg-purple-100 text-purple-800' : ''}
                                ${task.category === 'ORDER' ? 'bg-blue-100 text-blue-800' : ''}
                                ${task.category === 'BOOKING' ? 'bg-pink-100 text-pink-800' : ''}
                                ${task.category === 'ACCOUNT' ? 'bg-orange-100 text-orange-800' : ''}
                                ${task.category === 'GENERAL' ? 'bg-gray-100 text-gray-800' : ''}
                            `}>
                                {task.category || 'GENERAL'}
                            </span>

                            <span className={`px-2 py-1 rounded text-xs font-medium
                                ${task.status === 'PENDING_REVIEW' ? 'bg-yellow-100 text-yellow-800' : ''}
                                ${task.status === 'APPROVED' ? 'bg-green-100 text-green-800' : ''}
                                ${task.status === 'REJECTED' ? 'bg-red-100 text-red-800' : ''}
                                ${task.status === 'EXECUTED' ? 'bg-blue-100 text-blue-800' : ''}
                            `}>
                                {task.status.replace('_', ' ')}
                            </span>

                            {task.sentiment === 'NEGATIVE' && (
                                <span className="px-2 py-1 rounded text-xs font-bold bg-red-600 text-white animate-pulse">
                                    NEGATIVE
                                </span>
                            )}
                            {task.sentiment === 'POSITIVE' && (
                                <span className="px-2 py-1 rounded text-xs font-bold bg-green-600 text-white">
                                    POSITIVE
                                </span>
                            )}
                            {task.sentiment === 'NEUTRAL' && (
                                <span className="px-2 py-1 rounded text-xs font-bold bg-gray-500 text-white">
                                    NEUTRAL
                                </span>
                            )}

                            <span className="text-sm text-gray-400">#{task.id}</span>
                            <span className="text-sm text-gray-400">{new Date(task.createdAt).toLocaleString()}</span>
                            <span className="text-sm text-gray-400">
                                Created by: {task.Creator?.displayName || 'System'}
                            </span>
                        </div>

                        {/* Body */}
                        <h3 className="text-lg font-semibold text-gray-900 mb-1">
                            {task.subType ? task.subType.replace(/_/g, ' ') : task.type}
                        </h3>

                        <div className="text-sm text-gray-600 mb-3">
                            {task.Member ? (
                                <span className="font-medium text-blue-600">
                                    Member: {task.Member.firstName} {task.Member.lastName}
                                </span>
                            ) : (
                                <span className="italic text-gray-500">Visitor / Internal</span>
                            )}
                        </div>

                        {canAssign && (
                            <div className="flex items-center gap-4 text-sm text-gray-500 mb-3 bg-gray-50 rounded px-3 py-2 w-fit">
                                <span className="text-gray-500">👤 </span>
                                <select
                                    className="bg-transparent border-none text-sm font-medium text-gray-700 focus:ring-0 cursor:pointer hover:text-blue-600 p-0"
                                    value={task.assigneeId || ''}
                                    onChange={(e) => handleAssignment(task.id, e.target.value)}
                                    disabled={updating === task.id}
                                >
                                    <option value="" className="text-gray-400">Unassigned</option>
                                    {users.map(u => (
                                        <option key={u.id} value={u.id}>
                                            {u.displayName}
                                        </option>
                                    ))}
                                </select>
                                {updating === task.id && <span className="text-xs text-blue-500 animate-pulse">Saving...</span>}
                            </div>

                        )}

                        {/* Payload Display */}
                        {(() => {
                            let content = null;
                            let raw = task.payload;

                            // Try to parse if string
                            if (typeof raw === 'string') {
                                try {
                                    raw = JSON.parse(raw);
                                } catch (e) {
                                    // ignore, keep as string
                                }
                            }

                            // Check for structured data
                            if (raw && typeof raw === 'object' && (raw.summary || raw.originalText)) {
                                content = (
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
                                        {/* Show other fields if any, excluding summary/originalText */}
                                        {Object.keys(raw).some(k => k !== 'summary' && k !== 'originalText') && (
                                            <div className="bg-gray-50 p-3 border-t border-gray-100 text-xs text-gray-500 font-mono">
                                                <div className="mb-1 font-bold">Extra Data:</div>
                                                {JSON.stringify(
                                                    Object.fromEntries(Object.entries(raw).filter(([k]) => k !== 'summary' && k !== 'originalText')),
                                                    null,
                                                    2
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            } else {
                                // Fallback to raw JSON
                                content = (
                                    <div className="bg-gray-50 rounded p-3 text-sm font-mono text-gray-700 whitespace-pre-wrap max-h-32 overflow-y-auto mb-4">
                                        {JSON.stringify(raw, null, 2)}
                                    </div>
                                );
                            }

                            return content;
                        })()}

                        {/* History Stack & Activity */}
                        <div className="mt-6 border-t border-gray-100 pt-4">

                            {/* Toggle History Button (if closed) */}
                            {/* Toggle History/Notes Button - Always visible to allow toggle */}
                            <button
                                onClick={() => {
                                    if (historyOpen[task.id]) {
                                        setHistoryOpen(prev => ({ ...prev, [task.id]: false }));
                                    } else {
                                        setHistoryOpen(prev => ({ ...prev, [task.id]: true }));
                                        loadHistory(task.id);
                                    }
                                }}
                                className="text-xs text-blue-600 hover:text-blue-800 font-medium mb-3 flex items-center gap-1"
                            >
                                <span>Task Notes</span>
                                <span>{historyOpen[task.id] ? '▲' : '▼'}</span>
                            </button>

                            {/* History Feed (Expanded) */}
                            {historyOpen[task.id] && (
                                <div className="mb-4 space-y-4">
                                    {historyLoading[task.id] && (
                                        <div className="text-sm text-gray-500 animate-pulse">Loading activity...</div>
                                    )}
                                    {historyError[task.id] && (
                                        <div className="text-sm text-red-600">{historyError[task.id]}</div>
                                    )}

                                    {!historyLoading[task.id] && (
                                        <>
                                            {/* Sort Oldest -> Newest and Filter */}
                                            {(taskHistory[task.id] || [])
                                                .filter(a => {
                                                    if (a.actionType === 'TASK_CREATED' || a.actionType === 'MANUAL_CREATED') return false;
                                                    // Filter redundant MANUAL_UPDATE if it only contains assigneeId (covered by ASSIGNED)
                                                    if (a.actionType === 'MANUAL_UPDATE' && a.details?.changes) {
                                                        const keys = Object.keys(a.details.changes).filter(k => k !== 'assigneeId');
                                                        if (keys.length === 0) return false;
                                                    }
                                                    return true;
                                                }) // Filter redundant creation and updates
                                                .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) // Chronological
                                                .map(action => (
                                                    <div key={action.id} className="text-sm group flex flex-col items-start bg-gray-50/50 p-3 rounded-lg border border-gray-100">
                                                        <div className="flex flex-wrap items-center gap-2 text-gray-500 text-xs mb-1">
                                                            <span className="font-bold text-gray-700">{action.User?.displayName || 'System'}</span>
                                                            <span>•</span>
                                                            <span>{new Date(action.createdAt).toLocaleString()}</span>
                                                            <span className="bg-gray-100 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider border border-gray-200">
                                                                {formatActionLabel(action.actionType)}
                                                            </span>
                                                        </div>
                                                        <div className="w-full">
                                                            {renderActionDetails(action)}
                                                        </div>
                                                    </div>
                                                ))}

                                            {/* Hide Button */}
                                            {/* <button onClick={() => setHistoryOpen(prev => ({...prev, [task.id]: false}))} className="text-xs text-gray-400 hover:text-gray-600 mb-2">Hide activity ▲</button> */}
                                        </>
                                    )}
                                </div>
                            )}

                            {/* Add Note Input (Always Visible - Bottom of Stack) */}
                            <div className="mb-2 flex gap-2 items-start transition-all">
                                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs font-bold shrink-0">
                                    YOU
                                </div>
                                <div className="flex-1 relative">
                                    <textarea
                                        className="w-full text-sm p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none pr-24 min-h-[50px] resize-none overflow-hidden"
                                        rows={1}
                                        onInput={(e) => {
                                            const target = e.target as HTMLTextAreaElement;
                                            target.style.height = 'auto';
                                            target.style.height = target.scrollHeight + 'px';
                                        }}
                                        value={noteEdits[task.id] ?? ''}
                                        onChange={e => setNoteEdits({ ...noteEdits, [task.id]: e.target.value })}
                                        placeholder="Add a note or reply..."
                                    />
                                    <div className="absolute bottom-1.5 right-1.5">
                                        <button
                                            onClick={() => handleAddNote(task.id)}
                                            disabled={updating === task.id || !(noteEdits[task.id] || '').trim()}
                                            className="px-3 py-1.5 bg-gray-900 text-white rounded-md text-xs font-bold hover:bg-gray-800 disabled:opacity-50 disabled:bg-gray-300"
                                        >
                                            Add Note
                                        </button>
                                    </div>
                                </div>
                            </div>



                            {/* Recommended Current Action Section */}
                            {task.status === 'PENDING_REVIEW' && (
                                <div className="border border-blue-200 rounded-lg overflow-hidden mb-4 shadow-sm">
                                    {/* Header */}
                                    <button
                                        onClick={() => setExpandedActions({ ...expandedActions, [task.id]: !expandedActions[task.id] })}
                                        className="w-full flex items-center justify-between p-3 bg-blue-50 hover:bg-blue-100 transition-colors text-left"
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className="text-blue-700 font-bold text-sm">✨ Recommended Current Action</span>
                                            {task.suggestedReplyBody ? (
                                                <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded border border-green-200 font-semibold">Ready</span>
                                            ) : (
                                                <span className="text-[10px] bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded border border-yellow-200">Not generated</span>
                                            )}
                                        </div>
                                        <span className="text-blue-400 text-xs">{expandedActions[task.id] ? 'COLLAPSE' : 'EXPAND'}</span>
                                    </button>

                                    {/* Expanded Content */}
                                    {expandedActions[task.id] && (
                                        <div className="p-4 bg-white border-t border-blue-100 space-y-3">

                                            {/* Regenerate Suggestion Link (Moved Inside) */}
                                            <div className="flex justify-end mb-2">
                                                <button
                                                    onClick={() => handleRegenerateSuggestion(task.id)}
                                                    disabled={updating === task.id}
                                                    className="text-xs text-blue-600 hover:underline disabled:opacity-50 flex items-center gap-1"
                                                >
                                                    <span>⟳ Regenerate Suggestion</span>
                                                </button>
                                            </div>

                                            {task.suggestedReplyBody ? (
                                                <>
                                                    <div className="flex gap-4">
                                                        <div className="flex-1">
                                                            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Message Preview</label>
                                                            <textarea
                                                                className="w-full text-sm p-3 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-sans"
                                                                rows={4}
                                                                value={replyEdits[task.id] ?? task.suggestedReplyBody}
                                                                onChange={e => setReplyEdits({ ...replyEdits, [task.id]: e.target.value })}
                                                                placeholder="Edit the suggested response..."
                                                            />
                                                        </div>
                                                        <div className="w-1/3 min-w-[200px] space-y-3">
                                                            <div>
                                                                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Channel</label>
                                                                <select
                                                                    className="w-full text-sm border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                                                    value={channelEdits[task.id] ?? task.suggestedChannel ?? 'email'}
                                                                    onChange={e => setChannelEdits({ ...channelEdits, [task.id]: e.target.value })}
                                                                >
                                                                    <option value="email">Email</option>
                                                                    <option value="sms">SMS</option>
                                                                    <option value="voice">Voice</option>
                                                                    <option value="none">None (Internal)</option>
                                                                </select>
                                                            </div>
                                                            {(channelEdits[task.id] ?? task.suggestedChannel ?? 'email') === 'email' && (
                                                                <div>
                                                                    <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Subject</label>
                                                                    <input
                                                                        type="text"
                                                                        className="w-full text-sm border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                                                        value={subjectEdits[task.id] ?? task.suggestedReplySubject ?? ''}
                                                                        onChange={e => setSubjectEdits({ ...subjectEdits, [task.id]: e.target.value })}
                                                                        placeholder="Email subject..."
                                                                    />
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="flex justify-end pt-2">
                                                        <button
                                                            onClick={() => handleStatusChange(task.id, 'APPROVED', task)}
                                                            disabled={updating === task.id}
                                                            className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-bold hover:bg-blue-700 shadow-sm disabled:opacity-50"
                                                        >
                                                            Approve & Send
                                                        </button>
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="text-sm text-gray-500 italic py-4 text-center">
                                                    No suggestion yet.
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                        </div>
                    </div>

                    {/* Actions Column (Right Side) */}
                    <div className="flex flex-col gap-2 min-w-[140px] ml-4 pt-1">
                        <div className={`text-sm font-medium border rounded py-2 px-2 w-full flex items-center justify-between gap-1 relative
                            ${task.status === 'APPROVED' ? 'bg-green-50 text-green-700 border-green-200' : ''}
                            ${task.status === 'REJECTED' ? 'bg-red-50 text-red-700 border-red-200' : ''}
                            ${task.status === 'EXECUTED' ? 'bg-blue-50 text-blue-700 border-blue-200' : ''}
                            ${task.status === 'PENDING_REVIEW' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' : ''}
                            ${task.status === 'IN_PROGRESS' ? 'bg-purple-50 text-purple-700 border-purple-200' : ''}
                        `}>
                            {userRole === 'staff' ? (
                                /* Staff: Read-only status badge */
                                <span className="font-medium">
                                    {task.status === 'PENDING_REVIEW' && 'Pending Review'}
                                    {task.status === 'APPROVED' && 'Approved'}
                                    {task.status === 'REJECTED' && 'Rejected'}
                                    {task.status === 'EXECUTED' && 'Executed'}
                                    {task.status === 'IN_PROGRESS' && 'In Progress'}
                                    {task.status === 'CANCELLED' && 'Cancelled'}
                                </span>
                            ) : (
                                /* Manager/Admin: Status dropdown */
                                <>
                                    <select
                                        className="bg-transparent border-none text-sm font-medium focus:ring-0 cursor-pointer p-0 w-full appearance-none z-10"
                                        value={task.status}
                                        onChange={(e) => handleStatusChange(task.id, e.target.value, task)}
                                        disabled={updating === task.id}
                                    >
                                        <option value="PENDING_REVIEW">Pending Review</option>
                                        <option value="IN_PROGRESS">In Progress</option>
                                        <option value="APPROVED">Approved</option>
                                        <option value="REJECTED">Rejected</option>
                                        <option value="EXECUTED">Executed</option>
                                        <option value="CANCELLED">Cancelled</option>
                                    </select>
                                    {/* Down Arrow Icon */}
                                    <div className="pointer-events-none absolute right-2 top-1/2 transform -translate-y-1/2 text-current opacity-70">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
