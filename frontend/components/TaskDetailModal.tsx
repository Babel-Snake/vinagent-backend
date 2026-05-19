'use client';

import { Component, type ReactNode, useEffect, useState } from 'react';
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

const TASK_MODAL_DEBUG_KEY = 'vinagent:debug-task-modal';

function isTaskModalDebugEnabled() {
    if (typeof window === 'undefined') return false;

    try {
        return window.sessionStorage.getItem(TASK_MODAL_DEBUG_KEY) === '1'
            || new URLSearchParams(window.location.search).get('debugTaskModal') === '1';
    } catch {
        return false;
    }
}

function errorMessage(error: unknown, fallback = 'Failed to load task') {
    return error instanceof Error ? error.message : fallback;
}

function formatTaskLabel(task?: Task | null) {
    if (!task) return 'Task details';
    return String(task.subType || task.type || task.category || 'Task')
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, char => char.toUpperCase());
}

function requesterLabel(task?: Task | null) {
    if (!task) return null;
    if (task.Member) {
        return `${task.Member.firstName || ''} ${task.Member.lastName || ''}`.trim() || null;
    }
    return task.payload?.manualIntake?.requesterName || null;
}

function modalElementSnapshot(label: string, element: Element | null) {
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

function taskModalDebugSnapshot() {
    if (typeof document === 'undefined') return [];

    return [
        modalElementSnapshot('modal root', document.querySelector('[data-task-detail-modal="true"]')),
        modalElementSnapshot('modal panel', document.querySelector('[data-task-detail-panel="true"]')),
        modalElementSnapshot('modal content', document.querySelector('[data-task-detail-content="true"]')),
        modalElementSnapshot('task card', document.querySelector('[data-task-card-id]')),
        modalElementSnapshot('activity panel', document.querySelector('[data-task-activity-panel="true"]')),
        modalElementSnapshot('advanced toggle', document.querySelector('[data-task-advanced-toggle="true"]'))
    ];
}

function logTaskModalDebugError(label: string, error: unknown, extra?: Record<string, unknown>) {
    if (!isTaskModalDebugEnabled()) return;

    console.groupCollapsed(`[TaskModalDebug] ${label}`);
    console.error(error);
    if (extra) console.log(extra);
    console.table(taskModalDebugSnapshot());
    console.groupEnd();
}

interface TaskCardPanelErrorBoundaryProps {
    children: ReactNode;
}

interface TaskCardPanelErrorBoundaryState {
    hasError: boolean;
    message: string;
}

class TaskCardPanelErrorBoundary extends Component<TaskCardPanelErrorBoundaryProps, TaskCardPanelErrorBoundaryState> {
    state = { hasError: false, message: '' };

    static getDerivedStateFromError(error: Error) {
        return {
            hasError: true,
            message: error?.message || 'The task detail panel could not be displayed.'
        };
    }

    componentDidCatch(error: Error) {
        console.error('Task detail panel render failed', error);
        logTaskModalDebugError('task card error boundary caught render failure', error);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-red-800">
                    <p className="font-semibold">Task details could not be displayed.</p>
                    <p className="mt-2 text-sm">{this.state.message}</p>
                </div>
            );
        }

        return this.props.children;
    }
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
                if (isTaskModalDebugEnabled()) {
                    console.groupCollapsed(`[TaskModalDebug] task loaded task=${taskId}`);
                    console.log({
                        taskId,
                        status: data.status,
                        category: data.category,
                        actionCount: Array.isArray(data.TaskActions) ? data.TaskActions.length : 0,
                        messageCount: Array.isArray(data.Messages) ? data.Messages.length : data.Message ? 1 : 0,
                        stepCount: Array.isArray(data.TaskSteps) ? data.TaskSteps.length : 0,
                        subTaskCount: Array.isArray(data.SubTasks) ? data.SubTasks.length : 0
                    });
                    console.table((data.TaskActions || []).map((action, index) => ({
                        index,
                        id: action.id,
                        actionType: action.actionType,
                        createdAt: action.createdAt,
                        detailsType: Array.isArray(action.details) ? 'array' : typeof action.details,
                        detailKeys: action.details && typeof action.details === 'object' && !Array.isArray(action.details)
                            ? Object.keys(action.details).join(',')
                            : ''
                    })));
                    console.groupEnd();
                }
            } catch (err: unknown) {
                setError(errorMessage(err));
            } finally {
                setLoading(false);
            }
        }
        loadTask();
    }, [taskId]);

    useEffect(() => {
        const handleWindowError = (event: ErrorEvent) => {
            logTaskModalDebugError('window error while task modal mounted', event.error || event.message, {
                taskId,
                message: event.message,
                filename: event.filename,
                line: event.lineno,
                column: event.colno
            });
        };

        const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
            logTaskModalDebugError('unhandled rejection while task modal mounted', event.reason, {
                taskId
            });
        };

        window.addEventListener('error', handleWindowError);
        window.addEventListener('unhandledrejection', handleUnhandledRejection);

        if (isTaskModalDebugEnabled()) {
            console.info(`[TaskModalDebug] modal debug listeners active for task=${taskId}`);
            window.setTimeout(() => {
                console.groupCollapsed(`[TaskModalDebug] modal mounted task=${taskId}`);
                console.table(taskModalDebugSnapshot());
                console.groupEnd();
            }, 0);
        }

        return () => {
            window.removeEventListener('error', handleWindowError);
            window.removeEventListener('unhandledrejection', handleUnhandledRejection);
        };
    }, [taskId]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
            role="dialog"
            aria-modal="true"
            data-task-detail-modal="true"
            data-task-id={taskId}
        >
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-[#1c231f]/70 transition-opacity backdrop-blur-sm"
                aria-hidden="true"
                onClick={onClose}
            ></div>

            {/* Modal Panel */}
            <div
                className="relative z-10 flex max-h-[92vh] w-full max-w-6xl flex-col overflow-clip rounded-lg bg-[var(--surface)] shadow-2xl"
                data-task-detail-panel="true"
                style={{ overflowAnchor: 'none' }}
            >

                {/* Header */}
                <div className="z-20 flex items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--surface)] px-5 py-4">
                    <div className="min-w-0">
                        <h3 className="truncate text-xl font-bold text-[#1c231f]">{formatTaskLabel(task)}</h3>
                        <p className="truncate text-sm text-[var(--muted)]">
                            Case #{taskId}{requesterLabel(task) ? ` / ${requesterLabel(task)}` : ''}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="icon-button text-[var(--muted)] hover:bg-[#eef1e8]"
                        aria-label="Close task details"
                    >
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div
                    className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[var(--background)] p-3 sm:p-5"
                    data-task-detail-content="true"
                    style={{ overflowAnchor: 'none' }}
                >
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-64">
                            <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-[#d9dfd2] border-t-[var(--brand)]"></div>
                            <p className="font-medium text-[var(--muted)]">Loading task...</p>
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

                            <TaskCardPanelErrorBoundary key={taskId}>
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
                                    autoExpand={false}
                                    highlighted={false} // Force no highlight style
                                />
                            </TaskCardPanelErrorBoundary>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
