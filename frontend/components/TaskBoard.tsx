'use client';

import { Task, updateTask, Staff } from '../lib/api';
import { useState } from 'react';

interface TaskBoardProps {
    tasks: Task[];
    users: Staff[];
    onRefresh: () => void;
}

export default function TaskBoard({ tasks, users, onRefresh }: TaskBoardProps) {
    const [updating, setUpdating] = useState<number | null>(null);
    const [replyEdits, setReplyEdits] = useState<{ [key: number]: string }>({});

    async function handleStatusChange(id: number, newStatus: string, currentTask: Task) {
        setUpdating(id);
        try {
            const updates: any = { status: newStatus };

            // If approving, include the (possibly edited) reply
            if (newStatus === 'APPROVED' && (replyEdits[id] !== undefined || currentTask.suggestedReplyBody)) {
                updates.suggestedReplyBody = replyEdits[id] ?? currentTask.suggestedReplyBody;
                updates.suggestedChannel = currentTask.suggestedChannel || 'sms';
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

                        {/* Payload Preview */}
                        <div className="bg-gray-50 rounded p-3 text-sm font-mono text-gray-700 whitespace-pre-wrap max-h-32 overflow-y-auto mb-4">
                            {JSON.stringify(task.payload, null, 2)}
                        </div>

                        {/* Draft Reply UI */}
                        {task.status === 'PENDING_REVIEW' && (task.suggestedReplyBody || task.suggestedChannel === 'sms') && (
                            <div className="bg-blue-50 border border-blue-100 rounded p-4 mb-2">
                                <h4 className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-2">
                                    Suggested Reply ({task.suggestedChannel || 'sms'})
                                </h4>
                                <textarea
                                    className="w-full text-sm p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                    rows={3}
                                    value={replyEdits[task.id] ?? (task.suggestedReplyBody || '')}
                                    onChange={e => setReplyEdits({ ...replyEdits, [task.id]: e.target.value })}
                                    placeholder="Draft a reply..."
                                />
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-2 min-w-[140px] ml-4">
                        {task.status === 'PENDING_REVIEW' && (
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
                        )}
                        {task.status !== 'PENDING_REVIEW' && (
                            <div className="text-sm text-gray-400 font-medium text-center border border-gray-100 rounded py-2">
                                {task.status === 'APPROVED' ? '✅ Approved' : 'Actioned'}
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}
