'use client';

import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { fetchTaskPage, fetchTaskQueueSummary, Pagination as PaginationMeta, Task, TaskQueueSummary, getUsers, Staff, getMyProfile, getFlaggedTaskIds, toggleTaskFlag, fetchOperationalAreas, OperationalArea } from '../../../lib/api';
import TaskBoard from '../../../components/TaskBoard';
import CreateTaskModal from '../../../components/CreateTaskModal';
import TaskFilters from '../../../components/TaskFilters';
import TaskDetailModal from '../../../components/TaskDetailModal';
import Pagination from '../../../components/Pagination';
import WorkSubnav from '../../../components/WorkSubnav';
import { clientLogger } from '../../../lib/clientLogger';
import { errorMessage } from '../../../lib/errors';

export default function TasksPage() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [users, setUsers] = useState<Staff[]>([]);
    const [areas, setAreas] = useState<OperationalArea[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [userRole, setUserRole] = useState<string | null>(null);
    const [currentUserId, setCurrentUserId] = useState<number | null>(null);
    const [currentUserAreaIds, setCurrentUserAreaIds] = useState<number[]>([]);
    const [profileLoaded, setProfileLoaded] = useState(false);
    const [filters, setFilters] = useState({
        category: 'all',
        priority: 'all',
        status: 'PENDING',
        sentiment: 'all',
        assigneeId: 'all',
        createdById: 'all',
        areaId: 'all',
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
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [pagination, setPagination] = useState<PaginationMeta>({ page: 1, pageSize: 20, total: 0, totalPages: 1 });
    const [queueSummary, setQueueSummary] = useState<TaskQueueSummary>({
        matching: 0,
        highPriority: 0,
        waiting: 0,
        blocked: 0,
        unassigned: 0,
        overdue: 0,
        dueSoon: 0,
        identityReview: 0,
        followUps: 0
    });

    const searchParams = useSearchParams();
    const router = useRouter();

    const highlightedTaskId = searchParams.get('taskId');
    useEffect(() => {
        if (highlightedTaskId) {
            setActiveTaskId(parseInt(highlightedTaskId));
        }
    }, [highlightedTaskId]);

    useEffect(() => {
        let cancelled = false;
        const hasExplicitAssignee = new URLSearchParams(window.location.search).has('assigneeId');
        getMyProfile()
            .then(profileData => {
                if (cancelled) return;
                const profileUser = profileData?.user;
                setUserRole(profileUser?.role || null);
                setCurrentUserId(profileUser?.id || null);
                setCurrentUserAreaIds(profileUser?.areaIds || profileUser?.areaMemberships?.map(membership => membership.areaId) || []);
                if (profileUser?.role === 'staff' && !hasExplicitAssignee) {
                    setFilters(current => current.assigneeId === 'all' ? { ...current, assigneeId: 'me' } : current);
                }
            })
            .catch(err => {
                if (!cancelled) setError(errorMessage(err, 'Failed to load your queue preferences'));
            })
            .finally(() => {
                if (!cancelled) setProfileLoaded(true);
            });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        const nextFilters: Partial<typeof filters> = {};
        const assigneeId = searchParams.get('assigneeId');
        const mentionedMe = searchParams.get('mentionedMe');
        const deadlineState = searchParams.get('deadlineState');
        const requestedPage = Number.parseInt(searchParams.get('page') || '1', 10);
        const requestedPageSize = Number.parseInt(searchParams.get('pageSize') || '20', 10);

        if (assigneeId) nextFilters.assigneeId = assigneeId;
        if (mentionedMe === '1' || mentionedMe === 'true') nextFilters.mentionedMe = true;
        if (deadlineState) nextFilters.deadlineState = deadlineState;

        if (Number.isFinite(requestedPage) && requestedPage > 0) {
            setPage(previous => previous === requestedPage ? previous : requestedPage);
        }
        if ([20, 50, 100].includes(requestedPageSize)) {
            setPageSize(previous => previous === requestedPageSize ? previous : requestedPageSize);
        }

        if (Object.keys(nextFilters).length > 0) {
            setFilters(prev => {
                const merged = { ...prev, ...nextFilters };
                const changed = Object.entries(nextFilters).some(([key, value]) => prev[key as keyof typeof prev] !== value);
                return changed ? merged : prev;
            });
        }
    }, [searchParams]);

    async function loadTasks() {
        if (!profileLoaded) return;
        try {
            setLoading(true);
            const [taskPage, summary] = await Promise.all([
                fetchTaskPage({ ...filters, page, pageSize }),
                fetchTaskQueueSummary(filters)
            ]);
            setTasks(taskPage.tasks);
            setPagination(taskPage.pagination);
            setQueueSummary(summary);

            // Fetch users for everyone to support ID resolution in history
            try {
                const usersData = await getUsers();
                setUsers(usersData);
            } catch {
                setUsers([]);
            }
            try {
                setAreas(await fetchOperationalAreas());
            } catch {
                setAreas([]);
            }
            setError('');

            // Fetch flags
            try {
                const flagIds = await getFlaggedTaskIds();
                setFlaggedTaskIds(flagIds);
            } catch (err) {
                clientLogger.error('Failed to load flags', err);
            }
        } catch (err: unknown) {
            setError(errorMessage(err));
        } finally {
            setLoading(false);
        }
    }

    const loadTasksFromEffect = useEffectEvent(() => {
        void loadTasks();
    });

    // Reload when filters change (debouncing search is handled by user action or natural delay, 
    // but here we just react to state change. For better perf with typing, we might want a separate effect 
    // or rely on TaskFilters to debounce the state update. Assuming TaskFilters updates state instantly:
    // We should probably debounce the load if search is typing.
    // However, existing TaskFilters likely updates state instantly.
    // For now, to keep it simple, we reload on filter change.)
    useEffect(() => {
        const timer = setTimeout(() => {
            loadTasksFromEffect();
        }, 300); // 300ms debounce to prevent spamming on typing
        return () => clearTimeout(timer);
    }, [filters, highlightedTaskId, page, pageSize, profileLoaded]);

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

    function updateListQuery(updates: Record<string, string | null>) {
        const nextParams = new URLSearchParams(searchParams.toString());
        Object.entries(updates).forEach(([key, value]) => {
            if (value === null) nextParams.delete(key);
            else nextParams.set(key, value);
        });
        const query = nextParams.toString();
        router.replace(query ? `/tasks?${query}` : '/tasks', { scroll: false });
    }

    function handleFilterChange(nextFilters: typeof filters) {
        setFilters(nextFilters);
        setPage(1);
        updateListQuery({ page: null });
    }

    function handlePageChange(nextPage: number) {
        const boundedPage = Math.min(Math.max(nextPage, 1), Math.max(pagination.totalPages, 1));
        if (boundedPage === page) return;
        setPage(boundedPage);
        updateListQuery({ page: boundedPage === 1 ? null : String(boundedPage) });
    }

    function handlePageSizeChange(nextPageSize: number) {
        if (nextPageSize === pageSize && page === 1) return;
        setPageSize(nextPageSize);
        setPage(1);
        updateListQuery({ page: null, pageSize: nextPageSize === 20 ? null : String(nextPageSize) });
    }

    const handleCloseModal = () => {
        setActiveTaskId(null);
        updateListQuery({ taskId: null });
    };

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Work queue</h1>
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

            <WorkSubnav />

            {error && (
                <div className="mb-5 rounded-md border border-red-200 bg-red-50 p-4">
                    <p className="text-sm font-medium text-red-800">{error}</p>
                </div>
            )}

            <section className="mb-5" aria-labelledby="queue-signals-heading">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                    <h2 id="queue-signals-heading" className="text-sm font-bold uppercase tracking-wider text-[#344039]">Queue signals</h2>
                    <p className="text-xs text-[var(--muted)]">Exact totals for every task matching the current filters.</p>
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-9">
                <QueueMetric label="Matching" value={queueSummary.matching} tone="slate" />
                <QueueMetric label="High Priority" value={queueSummary.highPriority} tone="red" />
                <QueueMetric label="Waiting" value={queueSummary.waiting} tone="amber" />
                <QueueMetric label="Blocked" value={queueSummary.blocked} tone="red" />
                <QueueMetric label="Unassigned" value={queueSummary.unassigned} tone="orange" />
                <QueueMetric label="Overdue" value={queueSummary.overdue} tone="red" />
                <QueueMetric label="Due Soon" value={queueSummary.dueSoon} tone="teal" />
                <QueueMetric label="Identity Review" value={queueSummary.identityReview} tone="purple" />
                <QueueMetric label="Follow-ups" value={queueSummary.followUps} tone="green" />
                </div>
            </section>

            <TaskFilters
                filters={filters}
                onFilterChange={handleFilterChange}
                tasks={tasks}
                users={users}
                areas={areas}
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
                    currentUserId={currentUserId}
                    currentUserAreaIds={currentUserAreaIds}
                    flaggedTaskIds={flaggedTaskIds}
                    onToggleFlag={async (id) => {
                        const isFlagged = await toggleTaskFlag(id);
                        setFlaggedTaskIds(prev => isFlagged ? [...prev, id] : prev.filter(fid => fid !== id));
                    }}
                    onTaskClick={(taskId) => {
                        setActiveTaskId(taskId);
                        updateListQuery({ taskId: String(taskId) });
                    }}
                />
            )}

            {!loading && (
                <Pagination
                    pagination={pagination}
                    itemLabel="task"
                    onPageChange={handlePageChange}
                    onPageSizeChange={handlePageSizeChange}
                />
            )}

            {activeTaskId && (
                <TaskDetailModal
                    taskId={activeTaskId}
                    users={users}
                    userRole={userRole}
                    currentUserId={currentUserId}
                    currentUserAreaIds={currentUserAreaIds}
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
