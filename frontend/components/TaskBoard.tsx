'use client';

import { Task, updateTask } from '../lib/api';
import { useState } from 'react';

interface TaskBoardProps {
    tasks: Task[];
    onRefresh: () => void;
}

export default function TaskBoard({ tasks, onRefresh }: TaskBoardProps) {
    const [updating, setUpdating] = useState<number | null>(null);

    async function handleStatusChange(id: number, newStatus: string) {
        setUpdating(id);
        try {
            await updateTask(id, { status: newStatus });
            onRefresh();
        } catch (err: any) {
            alert('Failed: ' + err.message);
        } finally {
            setUpdating(null);
        }
    }

    async function handleAssignment(id: number, assigneeId: number) {
        setUpdating(id);
        try {
            await updateTask(id, { assigneeId });
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
                    <div className="flex-1">
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

                        <div className="flex items-center gap-4 text-sm text-gray-500 mb-3">
                            {task.Assignee ? (
                                <span className="flex items-center gap-1">
                                    👤 Assigned to: <b className="text-gray-700">{task.Assignee.displayName}</b>
                                </span>
                            ) : (
                                <button
                                    onClick={() => handleAssignment(task.id, 7)} // Mock assign to self (ID 7)
                                    className="text-blue-500 hover:underline text-xs"
                                >
                                    + Assign to me
                                </button>
                            )}
                        </div>

                        {/* Payload Preview */}
                        <div className="bg-gray-50 rounded p-3 text-sm font-mono text-gray-700 whitespace-pre-wrap max-h-32 overflow-y-auto">
                            {JSON.stringify(task.payload, null, 2)}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-2 min-w-[120px]">
                        {task.status === 'PENDING_REVIEW' && (
                            <>
                                <button
                                    onClick={() => handleStatusChange(task.id, 'APPROVED')}
                                    disabled={updating === task.id}
                                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm font-medium transition-colors disabled:opacity-50"
                                >
                                    Approve
                                </button>
                                <button
                                    onClick={() => handleStatusChange(task.id, 'REJECTED')}
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
