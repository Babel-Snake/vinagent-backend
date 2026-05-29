'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { fetchTasks, Task, getUsers, Staff, getMyProfile, getFlaggedTaskIds, toggleTaskFlag } from '../../../lib/api';
import TaskBoard from '../../../components/TaskBoard';
import CreateTaskModal from '../../../components/CreateTaskModal';
import TaskFilters from '../../../components/TaskFilters';
import TaskDetailModal from '../../../components/TaskDetailModal';

export default function TasksPage() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [users, setUsers] = useState<Staff[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [userRole, setUserRole] = useState<string | null>(null);
    const [currentUserId, setCurrentUserId] = useState<number | null>(null);
    const [filters, setFilters] = useState({
        category: 'all',
        priority: 'all',
        status: 'PENDING',
        sentiment: 'all',
        assigneeId: 'all',
        createdById: 'all',
        actionedById: 'all',
        search: '',
        showOnlyFlagged: false,
        mentionedMe: false,
        deadlineState: 'all',
        sortBy: 'newest',
        dateFrom: '',
        dateTo: '',
        dateRangeType: 'all'
    });

    const [flaggedTaskIds, setFlaggedTaskIds] = useState<number[]>([]);
    const [activeTaskId, setActiveTaskId] = useState<number | null>(null);

    const searchParams = useSearchParams();
    const router = useRouter();

    const highlightedTaskId = searchParams.get('taskId');
    useEffect(() => {
        if (highlightedTaskId) {
            setActiveTaskId(parseInt(highlightedTaskId));
        }
    }, [highlightedTaskId]);

    useEffect(() => {
        const nextFilters: Partial<typeof filters> = {};
        const assigneeId = searchParams.get('assigneeId');
        const mentionedMe = searchParams.get('mentionedMe');
        const deadlineState = searchParams.get('deadlineState');

        if (assigneeId) nextFilters.assigneeId = assigneeId;
        if (mentionedMe === '1' || mentionedMe === 'true') nextFilters.mentionedMe = true;
        if (deadlineState) nextFilters.deadlineState = deadlineState;

        if (Object.keys(nextFilters).length > 0) {
            setFilters(prev => {
                const merged = { ...prev, ...nextFilters };
                const changed = Object.entries(nextFilters).some(([key, value]) => prev[key as keyof typeof prev] !== value);
                return changed ? merged : prev;
            });
        }
    }, [searchParams]);

    async function loadTasks() {
        try {
            setLoading(true);
            let role = userRole;
            if (!role) {
                const profileData = await getMyProfile();
                role = profileData?.user?.role || null;
                setUserRole(role);
                setCurrentUserId(profileData?.user?.id || null);
            }

            // Pass current filters to API
            const tasksData = await fetchTasks(filters);
            setTasks(tasksData);

            // Fetch users for everyone to support ID resolution in history
            try {
                const usersData = await getUsers();
                setUsers(usersData);
            } catch {
                setUsers([]);
            }
            setError('');

            // Fetch flags
            try {
                const flagIds = await getFlaggedTaskIds();
                setFlaggedTaskIds(flagIds);
            } catch (err) {
                console.error('Failed to load flags', err);
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    // Reload when filters change (debouncing search is handled by user action or natural delay, 
    // but here we just react to state change. For better perf with typing, we might want a separate effect 
    // or rely on TaskFilters to debounce the state update. Assuming TaskFilters updates state instantly:
    // We should probably debounce the load if search is typing.
    // However, existing TaskFilters likely updates state instantly.
    // For now, to keep it simple, we reload on filter change.)
    useEffect(() => {
        const timer = setTimeout(() => {
            loadTasks();
        }, 300); // 300ms debounce to prevent spamming on typing
        return () => clearTimeout(timer);
    }, [filters, highlightedTaskId]); // highlightedTaskId trigger is legacy, technically not needed if we rely on initial load

    const sortedTasks = useMemo(() => {
        const rankFor = (task: Task) => {
            if (typeof task.deadlineSortRank === 'number') return task.deadlineSortRank;
            if (task.isOverdue) return 0;
            if (task.isDueSoon) return 1;
            if (task.dueAt) return 2;
            return 3;
        };

        return [...tasks].sort((a, b) => {
            const rankDelta = rankFor(a) - rankFor(b);
            if (rankDelta !== 0) return rankDelta;

            const dueA = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
            const dueB = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
            if (dueA !== dueB) return dueA - dueB;

            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
    }, [tasks]);

    const queueStats = useMemo(() => {
        const payloadFor = (task: Task) => {
            if (!task.payload) return {};
            if (typeof task.payload === 'string') {
                try {
                    return JSON.parse(task.payload);
                } catch {
                    return {};
                }
            }
            return task.payload;
        };

        return {
            total: tasks.length,
            highPriority: tasks.filter(task => task.priority === 'high').length,
            waiting: tasks.filter(task => task.workflowState === 'WAITING').length,
            blocked: tasks.filter(task => task.workflowState === 'BLOCKED').length,
            unassigned: tasks.filter(task => !task.assigneeId && task.status === 'PENDING').length,
            overdue: tasks.filter(task => task.isOverdue).length,
            dueSoon: tasks.filter(task => task.isDueSoon).length,
            identityReview: tasks.filter(task => {
                const manualIntake = payloadFor(task)?.manualIntake;
                return manualIntake?.identityResolutionStatus === 'REVIEW_REQUIRED';
            }).length,
            followUps: tasks.filter(task => task.followUpRequired || task.parentTaskId || payloadFor(task)?.followUpAutomation).length
        };
    }, [tasks]);

    const handleCloseModal = () => {
        setActiveTaskId(null);
        router.push('/tasks');
    };

    return (
        <div className="page-shell">
            <div className="page-header">
                <div>
                    <h1 className="text-2xl font-semibold text-[#1c231f]">Operations queue</h1>
                    <p className="page-kicker">
                        Triage inbound requests, workflow steps, customer follow-up, and staff handoffs from one case list.
                    </p>
                </div>
                <div className="flex shrink-0 gap-3">
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="btn-primary"
                    >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14m7-7H5" />
                        </svg>
                        New Task
                    </button>
                </div>
            </div>

            {error && (
                <div className="mb-5 rounded-md border border-red-200 bg-red-50 p-4">
                    <p className="text-sm font-medium text-red-800">{error}</p>
                </div>
            )}

            <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-9">
                <QueueMetric label="Loaded" value={queueStats.total} tone="slate" />
                <QueueMetric label="High Priority" value={queueStats.highPriority} tone="red" />
                <QueueMetric label="Waiting" value={queueStats.waiting} tone="amber" />
                <QueueMetric label="Blocked" value={queueStats.blocked} tone="red" />
                <QueueMetric label="Unassigned" value={queueStats.unassigned} tone="orange" />
                <QueueMetric label="Overdue" value={queueStats.overdue} tone="red" />
                <QueueMetric label="Due Soon" value={queueStats.dueSoon} tone="teal" />
                <QueueMetric label="Identity Review" value={queueStats.identityReview} tone="purple" />
                <QueueMetric label="Follow-ups" value={queueStats.followUps} tone="green" />
            </div>

            <TaskFilters
                filters={filters}
                onFilterChange={setFilters}
                tasks={tasks}
                users={users}
                currentUserId={currentUserId}
            />

            {loading ? (
                <div className="surface-panel py-14 text-center">
                    <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-[#d9dfd2] border-t-[var(--brand)]"></div>
                    <p className="mt-3 text-sm font-medium text-[var(--muted)]">Loading queue...</p>
                </div>
            ) : (
                <TaskBoard
                    tasks={sortedTasks}
                    users={users}
                    flaggedTaskIds={flaggedTaskIds}
                    onToggleFlag={async (id) => {
                        const isFlagged = await toggleTaskFlag(id);
                        setFlaggedTaskIds(prev => isFlagged ? [...prev, id] : prev.filter(fid => fid !== id));
                    }}
                    onTaskClick={setActiveTaskId}
                />
            )}

            {activeTaskId && (
                <TaskDetailModal
                    taskId={activeTaskId}
                    users={users}
                    userRole={userRole}
                    currentUserId={currentUserId}
                    onClose={handleCloseModal}
                    onRefresh={loadTasks}
                    isFlagged={flaggedTaskIds.includes(activeTaskId)}
                    onToggleFlag={async (id) => {
                        const isFlagged = await toggleTaskFlag(id);
                        setFlaggedTaskIds(prev => isFlagged ? [...prev, id] : prev.filter(fid => fid !== id));
                    }}
                />
            )}

            {showCreateModal && (
                <CreateTaskModal
                    onClose={() => setShowCreateModal(false)}
                    userRole={userRole}
                    currentUserId={currentUserId}
                    onCreated={() => {
                        setShowCreateModal(false);
                        loadTasks();
                    }}
                />
            )}
        </div>
    );
}

function QueueMetric({
    label,
    value,
    tone
}: {
    label: string;
    value: number;
    tone: 'slate' | 'red' | 'amber' | 'orange' | 'teal' | 'purple' | 'green';
}) {
    const toneClasses: Record<typeof tone, string> = {
        slate: 'bg-slate-500',
        red: 'bg-red-500',
        amber: 'bg-amber-500',
        orange: 'bg-orange-500',
        teal: 'bg-teal-600',
        purple: 'bg-violet-500',
        green: 'bg-emerald-500'
    };

    return (
        <div className="metric-tile">
            <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[11px] font-bold uppercase text-[var(--muted)]">{label}</span>
                <span className={`status-dot ${toneClasses[tone]}`}></span>
            </div>
            <div className="mt-2 text-2xl font-semibold text-[#1c231f]">{value}</div>
        </div>
    );
}
