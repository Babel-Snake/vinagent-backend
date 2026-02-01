'use client';

import { Task, TaskAction, getTask, updateTask, Staff } from '../lib/api';
import { useState } from 'react';

interface TaskBoardProps {
    tasks: Task[];
    users: Staff[];
    onRefresh: () => void;
    canAssign?: boolean;
}

export default function TaskBoard({ tasks, users, onRefresh, canAssign = true }: TaskBoardProps) {
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

        // 2. STATUS CHANGES / ASSIGNMENTS / ETC (Structured Data)
        if (action.details && Object.keys(action.details).length > 0) {
            // Check for 'changes' object common in audit logs
            const changes = action.details.changes || action.details;

            // If simple key-value pairs, render clean list
            const entries = Object.entries(changes);
            if (entries.length > 0) {
                return (
                    <div className="mt-2 bg-gray-50 border border-gray-100 rounded p-2 text-xs">
                        {entries.map(([key, value]: [string, any]) => (
                            <div key={key} className="flex gap-2">
                                <span className="font-semibold text-gray-500 uppercase">{key.replace(/_/g, ' ')}:</span>
                                <span className="text-gray-800 break-all">{
                                    typeof value === 'object' ? JSON.stringify(value) : String(value)
                                }</span>
                            </div>
                        ))}
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
                                    className="bg-transparent border-none text-sm font-medium text-gray-700 focus:ring-0 cursor-pointer hover:text-blue-600 p-0"
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

                        {/* Notes */}
                        <div className="mb-4">
                            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Add Note</label>
                            <div className="flex flex-col sm:flex-row gap-2">
                                <textarea
                                    className="w-full text-sm p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                    rows={2}
                                    value={noteEdits[task.id] ?? ''}
                                    onChange={e => setNoteEdits({ ...noteEdits, [task.id]: e.target.value })}
                                    placeholder="Add a quick update or follow-up..."
                                />
                                <button
                                    onClick={() => handleAddNote(task.id)}
                                    disabled={updating === task.id || !(noteEdits[task.id] || '').trim()}
                                    className="px-4 py-2 bg-gray-900 text-white rounded text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
                                >
                                    Add Note
                                </button>
                            </div>
                        </div>

                        {/* History */}
                        <div className="mb-4">
                            <button
                                onClick={() => {
                                    const nextOpen = !historyOpen[task.id];
                                    setHistoryOpen(prev => ({ ...prev, [task.id]: nextOpen }));
                                    if (nextOpen && !taskHistory[task.id]) {
                                        loadHistory(task.id);
                                    }
                                }}
                                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                            >
                                {historyOpen[task.id] ? 'Hide History' : 'Show History'}
                            </button>

                            {historyOpen[task.id] && (
                                <div className="mt-3 border border-gray-100 rounded p-3 bg-gray-50">
                                    {historyLoading[task.id] && (
                                        <div className="text-sm text-gray-500">Loading history...</div>
                                    )}
                                    {historyError[task.id] && (
                                        <div className="text-sm text-red-600">{historyError[task.id]}</div>
                                    )}
                                    {!historyLoading[task.id] && !historyError[task.id] && (
                                        <>
                                            {(taskHistory[task.id] || []).length === 0 ? (
                                                <div className="text-sm text-gray-500">No history yet.</div>
                                            ) : (
                                                <div className="space-y-4">
                                                    {(taskHistory[task.id] || []).map(action => (
                                                        <div key={action.id} className="text-sm group">
                                                            <div className="flex flex-wrap items-center gap-2 text-gray-600">
                                                                <span className="font-semibold text-gray-800 bg-gray-100 px-2 py-0.5 rounded text-xs">{formatActionLabel(action.actionType)}</span>
                                                                <span className="text-xs text-gray-400">
                                                                    {new Date(action.createdAt).toLocaleString()} by {action.User?.displayName || 'System'}
                                                                </span>
                                                            </div>
                                                            {renderActionDetails(action)}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            <div className="mt-4">
                                                <button
                                                    onClick={() => handleRegenerateSuggestion(task.id)}
                                                    disabled={updating === task.id}
                                                    className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                                                >
                                                    Generate Next Suggested Action
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Recommended Action Section */}
                        {task.status === 'PENDING_REVIEW' && (
                            <div className="border border-blue-200 rounded overflow-hidden mb-2">
                                {/* Header - Always visible */}
                                <button
                                    onClick={() => setExpandedActions({ ...expandedActions, [task.id]: !expandedActions[task.id] })}
                                    className="w-full flex items-center justify-between p-3 bg-blue-50 hover:bg-blue-100 transition-colors text-left"
                                >
                                    <div className="flex items-center gap-2">
                                        <span className="text-blue-600 font-bold text-sm">📋 Recommended Action</span>
                                        {task.suggestedReplyBody ? (
                                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Ready</span>
                                        ) : (
                                            <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">Not generated</span>
                                        )}
                                    </div>
                                    <span className="text-gray-400">{expandedActions[task.id] ? '▲' : '▼'}</span>
                                </button>

                                {/* Expanded Content */}
                                {expandedActions[task.id] && (
                                    <div className="p-4 bg-white border-t border-blue-100 space-y-3">
                                        {task.suggestedReplyBody ? (
                                            <>
                                                {/* Response Channel & Contact */}
                                                <div className="grid grid-cols-2 gap-4">
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
                                                    <div>
                                                        <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Recipient</label>
                                                        {task.Member ? (
                                                            <div className="text-sm py-2 px-3 bg-gray-50 rounded border border-gray-200">
                                                                <div className="font-medium">{task.Member.firstName} {task.Member.lastName}</div>
                                                                <div className="text-xs text-gray-500">
                                                                    {(channelEdits[task.id] ?? task.suggestedChannel) === 'email'
                                                                        ? task.Member.email
                                                                        : task.Member.phone || task.Member.email}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="text-sm py-2 px-3 bg-yellow-50 rounded border border-yellow-200 text-yellow-700">
                                                                No member linked
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Subject Line (only for email) */}
                                                {(channelEdits[task.id] ?? task.suggestedChannel ?? 'email') === 'email' && (
                                                    <div>
                                                        <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Subject</label>
                                                        <input
                                                            type="text"
                                                            className="w-full text-sm border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                                            value={subjectEdits[task.id] ?? task.suggestedReplySubject ?? ''}
                                                            onChange={e => setSubjectEdits({ ...subjectEdits, [task.id]: e.target.value })}
                                                            placeholder="Email subject line..."
                                                        />
                                                    </div>
                                                )}

                                                {/* Reply Body */}
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Message</label>
                                                    <textarea
                                                        className="w-full text-sm p-3 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono"
                                                        rows={4}
                                                        value={replyEdits[task.id] ?? task.suggestedReplyBody}
                                                        onChange={e => setReplyEdits({ ...replyEdits, [task.id]: e.target.value })}
                                                        placeholder="Edit the suggested response..."
                                                    />
                                                </div>

                                                <p className="text-xs text-gray-400">Review and edit the response above, then click Approve to send.</p>
                                            </>
                                        ) : (
                                            <div className="text-sm text-gray-500 italic py-4 text-center">
                                                No suggestion yet. Use "Generate Next Suggested Action" in History.
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    < div className="flex flex-col gap-2 min-w-[140px] ml-4" >
                        {
                            task.status === 'PENDING_REVIEW' && (
                                <>
                                    <button
                                        onClick={() => handleStatusChange(task.id, 'APPROVED', task)}
                                        disabled={updating === task.id}
                                        className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm font-medium transition-colors disabled:opacity-50 flex flex-col items-center"
                                    >
                                        <span>Approve</span>
                                        {(replyEdits[task.id] || task.suggestedReplyBody) && (
                                            <span className="text-[10px] opacity-80">& Send Reply</span>
                                        )}
                                    </button>
                                    <button
                                        onClick={() => handleStatusChange(task.id, 'REJECTED', task)}
                                        disabled={updating === task.id}
                                        className="px-4 py-2 bg-white border border-red-300 text-red-700 rounded hover:bg-red-50 text-sm font-medium transition-colors disabled:opacity-50"
                                    >
                                        Reject
                                    </button>
                                </>
                            )
                        }
                        {
                            task.status !== 'PENDING_REVIEW' && (
                                <div className="text-sm text-gray-400 font-medium text-center border border-gray-100 rounded py-2">
                                    {task.status === 'APPROVED' ? '✅ Approved' : 'Actioned'}
                                </div>
                            )
                        }
                    </div>
                </div >
            ))
            }
        </div >
    );
}
