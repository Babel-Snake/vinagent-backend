'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
    CalendarEvent,
    fetchNotices,
    fetchTasks,
    getCalendarEvents,
    getMyProfile,
    Notice,
    Task
} from '../../../lib/api';

type HomeProfile = {
    id: number;
    displayName?: string | null;
    email?: string | null;
    role?: string | null;
    wineryName?: string | null;
};

function startOfToday() {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
}

function addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
}

function formatDateTime(value?: string | null) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleString('en-AU', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit'
    });
}

function formatDate(value?: string | null) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString('en-AU', {
        day: 'numeric',
        month: 'short'
    });
}

function taskLabel(task: Task) {
    const subtype = task.subType ? task.subType.replace(/_/g, ' ') : '';
    return subtype || task.category || `Task #${task.id}`;
}

function taskMeta(task: Task) {
    const bits = [`#${task.id}`];
    if (task.Member) bits.push(`${task.Member.firstName} ${task.Member.lastName}`);
    if (task.Assignee?.displayName) bits.push(`Assigned to ${task.Assignee.displayName}`);
    if (task.dueAt) bits.push(`Due ${formatDateTime(task.dueAt)}`);
    return bits;
}

function noticeMeta(notice: Notice) {
    const bits = [notice.category.replace(/_/g, ' ')];
    if (notice.priority !== 'normal') bits.push(notice.priority);
    if (notice.effectiveFrom) bits.push(`Starts ${formatDate(notice.effectiveFrom)}`);
    if (notice.expiresAt) bits.push(`Ends ${formatDate(notice.expiresAt)}`);
    return bits;
}

function uniqueTasks(tasks: Task[]) {
    const seen = new Set<number>();
    return tasks.filter(task => {
        if (seen.has(task.id)) return false;
        seen.add(task.id);
        return true;
    });
}

function sortTasks(tasks: Task[]) {
    return [...tasks].sort((a, b) => {
        const rankFor = (task: Task) => {
            if (task.isOverdue) return 0;
            if (task.isDueSoon) return 1;
            if (task.priority === 'high') return 2;
            if (task.workflowState === 'BLOCKED') return 3;
            if (task.dueAt) return 4;
            return 5;
        };

        const rankDelta = rankFor(a) - rankFor(b);
        if (rankDelta !== 0) return rankDelta;

        const dueA = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
        const dueB = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
        if (dueA !== dueB) return dueA - dueB;

        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
}

function taskBadges(task: Task, profile?: HomeProfile | null) {
    const badges = [];
    if (task.isOverdue) badges.push({ label: 'Overdue', tone: 'red' as const });
    else if (task.isDueSoon) badges.push({ label: 'Due soon', tone: 'amber' as const });
    if (task.assigneeId && profile?.id && task.assigneeId === profile.id) badges.push({ label: 'Assigned to me', tone: 'brand' as const });
    if (!task.assigneeId) badges.push({ label: 'Unassigned', tone: 'slate' as const });
    if (task.workflowState === 'BLOCKED') badges.push({ label: 'Blocked', tone: 'red' as const });
    if (task.workflowState === 'WAITING') badges.push({ label: 'Waiting', tone: 'amber' as const });
    if (task.priority === 'high') badges.push({ label: 'High priority', tone: 'orange' as const });
    return badges.slice(0, 3);
}

export default function HomePage() {
    const [profile, setProfile] = useState<HomeProfile | null>(null);
    const [assignedTasks, setAssignedTasks] = useState<Task[]>([]);
    const [mentionedTasks, setMentionedTasks] = useState<Task[]>([]);
    const [overdueTasks, setOverdueTasks] = useState<Task[]>([]);
    const [dueSoonTasks, setDueSoonTasks] = useState<Task[]>([]);
    const [highPriorityTasks, setHighPriorityTasks] = useState<Task[]>([]);
    const [unassignedTasks, setUnassignedTasks] = useState<Task[]>([]);
    const [notices, setNotices] = useState<Notice[]>([]);
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;

        async function loadHome() {
            try {
                setLoading(true);
                const today = startOfToday();
                const rangeEnd = addDays(today, 7);
                const profileData = await getMyProfile();
                const profileUser = profileData?.user || null;
                const isManager = ['manager', 'admin'].includes(profileUser?.role || '');
                const personalDeadlineFilter = isManager ? {} : { assigneeId: 'me' };

                const [assigned, mentions, overdue, dueSoon, highPriority, unassigned, noticeData, calendarData] = await Promise.all([
                    fetchTasks({ status: 'PENDING', assigneeId: 'me', pageSize: 20 }),
                    fetchTasks({ status: 'all', mentionedMe: true, pageSize: 20 }),
                    fetchTasks({ deadlineState: 'OVERDUE', ...personalDeadlineFilter, pageSize: 20 }),
                    fetchTasks({ deadlineState: 'DUE_SOON', ...personalDeadlineFilter, pageSize: 20 }),
                    isManager ? fetchTasks({ status: 'PENDING', priority: 'high', pageSize: 20 }) : Promise.resolve([]),
                    isManager ? fetchTasks({ status: 'PENDING', assigneeId: 'unassigned', pageSize: 20 }) : Promise.resolve([]),
                    fetchNotices({ status: 'active', pageSize: 20 }),
                    getCalendarEvents(today, rangeEnd).catch(() => [])
                ]);

                if (!cancelled) {
                    setProfile(profileUser);
                    setAssignedTasks(assigned);
                    setMentionedTasks(mentions);
                    setOverdueTasks(overdue);
                    setDueSoonTasks(dueSoon);
                    setHighPriorityTasks(highPriority);
                    setUnassignedTasks(unassigned);
                    setNotices(noticeData.notices);
                    setEvents(calendarData);
                    setError('');
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Failed to load home dashboard');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        loadHome();
        return () => {
            cancelled = true;
        };
    }, []);

    const taskFocus = useMemo(() => (
        sortTasks(uniqueTasks([
            ...overdueTasks,
            ...dueSoonTasks,
            ...highPriorityTasks,
            ...unassignedTasks,
            ...assignedTasks
        ])).slice(0, 8)
    ), [assignedTasks, dueSoonTasks, highPriorityTasks, overdueTasks, unassignedTasks]);

    const mentionFocus = useMemo(() => sortTasks(mentionedTasks).slice(0, 5), [mentionedTasks]);
    const noticeFocus = useMemo(() => notices.slice(0, 5), [notices]);
    const eventFocus = useMemo(() => events.slice(0, 6), [events]);
    const displayName = profile?.displayName || profile?.email || 'there';
    const isManager = ['manager', 'admin'].includes(profile?.role || '');

    const stats = {
        taskFocus: taskFocus.length,
        overdue: overdueTasks.length,
        dueSoon: dueSoonTasks.length,
        highPriority: highPriorityTasks.length,
        unassigned: unassignedTasks.length,
        mentions: mentionedTasks.length,
        notices: notices.length,
        events: events.length
    };

    return (
        <div className="page-shell">
            <div className="page-header">
                <div>
                    <h1 className="text-2xl font-semibold text-[#1c231f]">Home</h1>
                    <p className="page-kicker">Welcome back, {displayName}. Here is the work that needs direct attention.</p>
                </div>
            </div>

            {error && (
                <div className="mb-5 rounded-md border border-red-200 bg-red-50 p-4">
                    <p className="text-sm font-medium text-red-800">{error}</p>
                </div>
            )}

            <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                <HomeMetric label="Focus" value={stats.taskFocus} tone="brand" />
                <HomeMetric label="Overdue" value={stats.overdue} tone="red" />
                <HomeMetric label="Due Soon" value={stats.dueSoon} tone="amber" />
                {isManager && <HomeMetric label="High Priority" value={stats.highPriority} tone="orange" />}
                {isManager && <HomeMetric label="Unassigned" value={stats.unassigned} tone="slate" />}
                <HomeMetric label="Mentions" value={stats.mentions} tone="purple" />
                <HomeMetric label="Notices" value={stats.notices} tone="teal" />
                <HomeMetric label="Upcoming" value={stats.events} tone="slate" />
            </div>

            {loading ? (
                <div className="surface-panel py-14 text-center">
                    <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-[#d9dfd2] border-t-[var(--brand)]"></div>
                    <p className="mt-3 text-sm font-medium text-[var(--muted)]">Loading home...</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
                    <div className="space-y-5">
                        <HomeSection
                            title="Task Focus"
                            href={isManager ? '/tasks' : '/tasks?assigneeId=me'}
                            empty="No assigned, overdue, or due-soon tasks need attention."
                        >
                            {taskFocus.map(task => (
                                <TaskAttentionRow key={task.id} task={task} profile={profile} />
                            ))}
                        </HomeSection>

                        <HomeSection
                            title="Mentions"
                            href="/tasks?mentionedMe=1"
                            empty="No current task mentions."
                        >
                            {mentionFocus.map(task => (
                                <TaskAttentionRow key={task.id} task={task} profile={profile} compact />
                            ))}
                        </HomeSection>
                    </div>

                    <div className="space-y-5">
                        <HomeSection
                            title="Notices For Me"
                            href="/noticeboard"
                            empty="No active notices are directed to you."
                        >
                            {noticeFocus.map(notice => (
                                <NoticeRow key={notice.id} notice={notice} />
                            ))}
                        </HomeSection>

                        <HomeSection
                            title="Upcoming"
                            href="/calendar"
                            empty="No calendar items in the next seven days."
                        >
                            {eventFocus.map(event => (
                                <EventRow key={event.id} event={event} />
                            ))}
                        </HomeSection>
                    </div>
                </div>
            )}
        </div>
    );
}

function HomeSection({
    title,
    href,
    empty,
    children
}: {
    title: string;
    href: string;
    empty: string;
    children: React.ReactNode;
}) {
    const isEmpty = !Array.isArray(children) || children.length === 0;

    return (
        <section className="surface-panel overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
                <h2 className="text-sm font-bold uppercase tracking-wider text-[#344039]">{title}</h2>
                <Link href={href} className="text-sm font-semibold text-[var(--brand-strong)] hover:underline">View</Link>
            </div>
            <div className="divide-y divide-slate-100">
                {isEmpty ? (
                    <div className="px-4 py-8 text-sm text-[var(--muted)]">{empty}</div>
                ) : children}
            </div>
        </section>
    );
}

function TaskAttentionRow({ task, profile, compact = false }: { task: Task; profile?: HomeProfile | null; compact?: boolean }) {
    const badges = taskBadges(task, profile);

    return (
        <Link href={`/tasks?taskId=${task.id}`} className={`block px-4 py-3 hover:bg-[#f8faf6] ${compact ? 'py-3' : 'py-4'}`}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="break-words text-sm font-semibold text-[#1c231f]">{taskLabel(task)}</div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
                        {taskMeta(task).map(bit => <span key={bit}>{bit}</span>)}
                    </div>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1">
                    {badges.map(badge => <AttentionBadge key={badge.label} label={badge.label} tone={badge.tone} />)}
                </div>
            </div>
        </Link>
    );
}

function NoticeRow({ notice }: { notice: Notice }) {
    return (
        <Link href="/noticeboard" className="block px-4 py-3 hover:bg-[#f8faf6]">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="break-words text-sm font-semibold text-[#1c231f]">{notice.title}</div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
                        {noticeMeta(notice).map(bit => <span key={bit}>{bit}</span>)}
                    </div>
                    {notice.bodyPreview && (
                        <div className="mt-2 line-clamp-2 text-sm leading-5 text-[#536158]">{notice.bodyPreview}</div>
                    )}
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1">
                    {notice.isPinned && <AttentionBadge label="Pinned" tone="brand" />}
                    {notice.priority === 'urgent' && <AttentionBadge label="Urgent" tone="red" />}
                    {notice.priority === 'important' && <AttentionBadge label="Important" tone="amber" />}
                </div>
            </div>
        </Link>
    );
}

function EventRow({ event }: { event: CalendarEvent }) {
    const start = formatDateTime(event.start);
    const linkedTask = event.LinkedTask ? `Task #${event.LinkedTask.id}` : null;

    return (
        <Link href="/calendar" className="block px-4 py-3 hover:bg-[#f8faf6]">
            <div className="break-words text-sm font-semibold text-[#1c231f]">{event.title}</div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
                {start && <span>{start}</span>}
                <span>{event.type.replace(/_/g, ' ')}</span>
                {linkedTask && <span>{linkedTask}</span>}
            </div>
        </Link>
    );
}

function HomeMetric({
    label,
    value,
    tone
}: {
    label: string;
    value: number;
    tone: 'brand' | 'red' | 'amber' | 'orange' | 'purple' | 'teal' | 'slate';
}) {
    const toneClasses: Record<typeof tone, string> = {
        brand: 'bg-[var(--brand)]',
        red: 'bg-red-500',
        amber: 'bg-amber-500',
        orange: 'bg-orange-500',
        purple: 'bg-violet-500',
        teal: 'bg-teal-600',
        slate: 'bg-slate-500'
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

function AttentionBadge({ label, tone }: { label: string; tone: 'brand' | 'red' | 'amber' | 'orange' | 'slate' }) {
    const classes = {
        brand: 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-strong)]',
        red: 'border-red-200 bg-red-50 text-red-700',
        amber: 'border-amber-200 bg-amber-50 text-amber-800',
        orange: 'border-orange-200 bg-orange-50 text-orange-800',
        slate: 'border-slate-200 bg-slate-50 text-slate-700'
    };

    return (
        <span className={`rounded-md border px-2 py-1 text-[11px] font-bold uppercase ${classes[tone]}`}>
            {label}
        </span>
    );
}
