'use client';

import { useEffect, useState } from 'react';
import { getTask, Task, Staff } from '../lib/api';
import TaskCard from './TaskCard';

interface TaskDetailModalProps {
    taskId: number;
    users: Staff[];
    userRole: string | null;
    currentUserId?: number | null;
    onClose: () => void;
    onRefresh: () => void;
    isFlagged?: boolean;
    onToggleFlag?: (taskId: number) => void;
}

export default function TaskDetailModal({
    taskId,
    users,
    userRole,
    currentUserId,
    onClose,
    onRefresh,
    isFlagged,
    onToggleFlag
}: TaskDetailModalProps) {
    const [task, setTask] = useState<Task | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        async function loadTask() {
            try {
                setLoading(true);
                const data = await getTask(taskId);
                setTask(data);
            } catch (err: any) {
                setError(err.message || 'Failed to load task');
            } finally {
                setLoading(false);
            }
        }
        loadTask();
    }, [taskId]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6" role="dialog" aria-modal="true">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-gray-900 bg-opacity-75 transition-opacity backdrop-blur-sm"
                aria-hidden="true"
                onClick={onClose}
            ></div>

            {/* Modal Panel */}
            <div className="relative bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col z-10">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-white z-20">
                    <h3 className="text-xl font-bold text-gray-900">
                        Task Details <span className="text-gray-400 font-normal text-sm ml-2">#{taskId}</span>
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
                    >
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="overflow-y-auto p-6 bg-gray-50 flex-1">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-64">
                            <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-600 mb-4"></div>
                            <p className="text-gray-500 font-medium">Loading task...</p>
                        </div>
                    ) : error ? (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
                            <p className="text-red-700 font-medium mb-2">Failed to load task</p>
                            <p className="text-sm text-red-500">{error}</p>
                            <button onClick={() => window.location.reload()} className="mt-4 text-sm underline text-red-600">Reload Page</button>
                        </div>
                    ) : task ? (
                        <div className="space-y-4">
                            {/* Debug Info (Temporary, can be removed if user confirms fix) */}
                            {/* <pre className="text-xs text-gray-400 mb-4">{JSON.stringify({id: task.id, status: task.status, hasMember: !!task.Member}, null, 2)}</pre> */}

                            <TaskCard
                                task={task}
                                users={users}
                                userRole={userRole}
                                currentUserId={currentUserId}
                                onRefresh={() => {
                                    onRefresh();
                                    // Reload this modal's data too
                                    getTask(taskId).then(setTask).catch(console.error);
                                }}
                                canAssign={userRole !== 'staff'}
                                isFlagged={isFlagged}
                                onToggleFlag={onToggleFlag}
                                autoExpand={true}
                                highlighted={false} // Force no highlight style
                            />
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
