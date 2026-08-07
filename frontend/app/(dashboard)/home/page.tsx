'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
    CalendarEvent,
    fetchNotices,
    fetchOperationalRecords,
    fetchProjects,
    fetchTaskPage,
    getCalendarEvents,
    getMyProfile,
    Notice,
    OperationalRecord,
    Project,
    Task,
    TaskListResponse,
    UserProfile
} from '../../../lib/api';
import { operationalLabel } from '../../../lib/operationalPresentation';
import InvolvementBadge from '../../../components/InvolvementBadge';
import { eventInvolvement, involvementSurfaceClass, noteInvolvement, noticeInvolvement, projectInvolvement, taskInvolvement } from '../../../lib/involvement';

type TaskCounts = {
    assigned: number;
    mentions: number;
    overdue: number;
    dueSoon: number;
    highPriority: number;
    unassigned: number;
};

const EMPTY_TASK_PAGE: TaskListResponse = {
    tasks: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 }
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
    const subtype = task.subType ? operationalLabel(task.subType) : '';
    return subtype || (task.category ? operationalLabel(task.category) : '') || `Task #${task.id}`;
}

function taskMeta(task: Task) {
    const bits = [`#${task.id}`];
    if (task.Member) bits.push(`${task.Member.firstName} ${task.Member.lastName}`);
    if (task.Assignee?.displayName) bits.push(`Assigned to ${task.Assignee.displayName}`);
    if (task.dueAt) bits.push(`Due ${formatDateTime(task.dueAt)}`);
    return bits;
}

function noticeMeta(notice: Notice) {
    const bits = [operationalLabel(notice.category)];
    if (notice.priority !== 'normal') bits.push(operationalLabel(notice.priority));
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

function taskBadges(task: Task) {
    const badges = [];
    if (task.isOverdue) badges.push({ label: 'Overdue', tone: 'red' as const });
    else if (task.isDueSoon) badges.push({ label: 'Due soon', tone: 'amber' as const });
    if (!task.assigneeId) badges.push({ label: 'Unassigned', tone: 'slate' as const });
    if (task.workflowState === 'BLOCKED') badges.push({ label: 'Blocked', tone: 'red' as const });
    if (task.workflowState === 'WAITING') badges.push({ label: 'Waiting', tone: 'amber' as const });
    if (task.priority === 'high') badges.push({ label: 'High priority', tone: 'orange' as const });
    return badges.slice(0, 3);
}

export default function HomePage() {
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [assignedTasks, setAssignedTasks] = useState<Task[]>([]);
    const [mentionedTasks, setMentionedTasks] = useState<Task[]>([]);
    const [overdueTasks, setOverdueTasks] = useState<Task[]>([]);
    const [dueSoonTasks, setDueSoonTasks] = useState<Task[]>([]);
    const [highPriorityTasks, setHighPriorityTasks] = useState<Task[]>([]);
    const [unassignedTasks, setUnassignedTasks] = useState<Task[]>([]);
    const [taskCounts, setTaskCounts] = useState<TaskCounts>({
        assigned: 0,
        mentions: 0,
        overdue: 0,
        dueSoon: 0,
        highPriority: 0,
        unassigned: 0
    });
    const [notices, setNotices] = useState<Notice[]>([]);
    const [noticeTotal, setNoticeTotal] = useState(0);
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [myProjects, setMyProjects] = useState<Project[]>([]);
    const [targetedNotes, setTargetedNotes] = useState<OperationalRecord[]>([]);
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

                const [assigned, mentions, overdue, dueSoon, highPriority, unassigned, noticeData, calendarData, projectData, noteData] = await Promise.all([
                    fetchTaskPage({ status: 'PENDING', assigneeId: 'me', pageSize: 20 }),
                    fetchTaskPage({ status: 'all', mentionedMe: true, pageSize: 20 }),
                    fetchTaskPage({ deadlineState: 'OVERDUE', ...personalDeadlineFilter, pageSize: 20 }),
                    fetchTaskPage({ deadlineState: 'DUE_SOON', ...personalDeadlineFilter, pageSize: 20 }),
                    isManager ? fetchTaskPage({ status: 'PENDING', priority: 'high', pageSize: 20 }) : Promise.resolve(EMPTY_TASK_PAGE),
                    isManager ? fetchTaskPage({ status: 'PENDING', assigneeId: 'unassigned', pageSize: 20 }) : Promise.resolve(EMPTY_TASK_PAGE),
                    fetchNotices({ status: 'active', pageSize: 20 }),
                    getCalendarEvents(today, rangeEnd).catch(() => []),
                    fetchProjects({ status: 'open', involvement: 'me', sortBy: 'target_soonest', pageSize: 12 }),
                    fetchOperationalRecords({ directedToMe: true, pageSize: 6 })
                ]);

                if (!cancelled) {
                    setProfile(profileUser);
                    setAssignedTasks(assigned.tasks);
                    setMentionedTasks(mentions.tasks);
                    setOverdueTasks(overdue.tasks);
                    setDueSoonTasks(dueSoon.tasks);
                    setHighPriorityTasks(highPriority.tasks);
                    setUnassignedTasks(unassigned.tasks);
                    setTaskCounts({
                        assigned: assigned.pagination.total,
                        mentions: mentions.pagination.total,
                        overdue: overdue.pagination.total,
                        dueSoon: dueSoon.pagination.total,
                        highPriority: highPriority.pagination.total,
                        unassigned: unassigned.pagination.total
                    });
                    setNotices(noticeData.notices);
                    setNoticeTotal(noticeData.pagination.total);
                    setEvents(calendarData);
                    setMyProjects(projectData.projects);
                    setTargetedNotes(noteData.records);
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
    const currentProjects = useMemo(
        () => myProjects.filter(project => ['ACTIVE', 'ON_HOLD'].includes(project.status)).slice(0, 6),
        [myProjects]
    );
    const upcomingProjects = useMemo(
        () => myProjects.filter(project => project.status === 'PLANNED').slice(0, 6),
        [myProjects]
    );
    const displayName = profile?.displayName || profile?.email || 'there';
    const isManager = ['manager', 'admin'].includes(profile?.role || '');

    const stats = {
        overdue: taskCounts.overdue,
        dueSoon: taskCounts.dueSoon,
        highPriority: taskCounts.highPriority,
        unassigned: taskCounts.unassigned,
        mentions: taskCounts.mentions,
        notices: noticeTotal,
        events: events.length
    };

    return (
        <div className="page-shell">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Home</h1>
                    <p className="page-kicker">Welcome back, {displayName}. Here is the work that needs direct attention.</p>
                </div>
            </div>

            {error && (
                <div className="mb-5 rounded-md border border-red-200 bg-red-50 p-4">
                    <p className="text-sm font-medium text-red-800">{error}</p>
                </div>
            )}

            <div className={`mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 ${isManager ? 'xl:grid-cols-7' : 'xl:grid-cols-5'}`}>
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
            ) : (<>
                <div className="mb-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
                    <MyProjectsPanel current={currentProjects} upcoming={upcomingProjects} profile={profile} />
                    <HomeSection
                        title="Notes for me"
                        href="/notes"
                        empty="No Notes are currently directed to you or your department."
                    >
                        {targetedNotes.map(note => <NoteRow key={note.id} note={note} profile={profile} />)}
                    </HomeSection>
                </div>
                <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
                    <div className="space-y-5">
                        <HomeSection
                            title="Priority work"
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
                                <NoticeRow key={notice.id} notice={notice} profile={profile} />
                            ))}
                        </HomeSection>

                        <HomeSection
                            title="Upcoming"
                            href="/calendar"
                            empty="No calendar items in the next seven days."
                        >
                            {eventFocus.map(event => (
                                <EventRow key={event.id} event={event} profile={profile} />
                            ))}
                        </HomeSection>
                    </div>
                </div>
            </>)}
        </div>
    );
}

const PROJECT_ROLE_LABELS = {
    LEAD: 'Leading',
    OWNER: 'Accountable owner',
    PARTICIPANT: 'Participant',
    STAKEHOLDER: 'Stakeholder',
    DELEGATED_TASK_ASSIGNEE: 'Project work assigned'
} as const;

function projectRoleLabels(project: Project) {
    return (project.involvement?.roles || []).map(role => {
        if (role === 'DELEGATED_TASK_ASSIGNEE' && (project.involvement?.delegatedTaskCount || 0) > 1) {
            return `${project.involvement?.delegatedTaskCount} Project tasks assigned`;
        }
        return PROJECT_ROLE_LABELS[role];
    });
}

function projectTone(value?: string | null) {
    if (value === 'BLOCKED' || value === 'OVERDUE') return 'border-red-200 bg-red-50 text-red-800';
    if (value === 'AT_RISK' || value === 'ON_HOLD') return 'border-amber-200 bg-amber-50 text-amber-800';
    if (value === 'ON_TRACK' || value === 'ACTIVE') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    return 'border-slate-200 bg-slate-50 text-slate-700';
}

function MyProjectsPanel({ current, upcoming, profile }: { current: Project[]; upcoming: Project[]; profile?: UserProfile | null }) {
    const [view, setView] = useState<'current' | 'upcoming'>(current.length > 0 ? 'current' : 'upcoming');
    const projects = view === 'current' ? current : upcoming;
    const empty = view === 'current' ? 'No current Projects need your involvement.' : 'No planned Projects involve you yet.';

    return (
        <section className="surface-panel min-w-0 overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-[var(--border)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-sm font-bold uppercase tracking-wider text-[#344039]">My Projects</h2>
                    <p className="mt-0.5 text-xs text-[var(--muted)]">Projects you lead, own, participate in, or have delegated work within.</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    <div className="inline-flex rounded-md border border-[var(--border)] bg-white p-0.5" aria-label="Project timeframe">
                        <button type="button" onClick={() => setView('current')} className={`rounded px-2.5 py-1.5 text-xs font-semibold ${view === 'current' ? 'bg-[var(--brand-soft)] text-[var(--brand-strong)]' : 'text-[var(--muted)] hover:text-[#1c231f]'}`}>Current {current.length}</button>
                        <button type="button" onClick={() => setView('upcoming')} className={`rounded px-2.5 py-1.5 text-xs font-semibold ${view === 'upcoming' ? 'bg-[var(--brand-soft)] text-[var(--brand-strong)]' : 'text-[var(--muted)] hover:text-[#1c231f]'}`}>Upcoming {upcoming.length}</button>
                    </div>
                </div>
            </div>
            <ProjectHomeGroup title={view === 'current' ? 'Current' : 'Upcoming'} projects={projects} empty={empty} profile={profile} />
        </section>
    );
}

function ProjectHomeGroup({ title, projects, empty, profile }: { title: string; projects: Project[]; empty: string; profile?: UserProfile | null }) {
    return (
        <div className="min-w-0 p-4">
            <div className="mb-2 flex items-center justify-between px-1">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">{title}</h3>
                <span className="text-xs font-semibold text-slate-500">{projects.length}</span>
            </div>
            {projects.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-sm text-[var(--muted)]">{empty}</div>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                    {projects.map(project => <ProjectHomeCard key={project.id} project={project} profile={profile} />)}
                </div>
            )}
        </div>
    );
}

function NoteRow({ note, profile }: { note: OperationalRecord; profile?: UserProfile | null }) {
    const involvement = noteInvolvement(note, profile);
    const areas = (note.OperationalAreas || []).map(area => area.name).filter(Boolean);

    return (
        <Link href={`/notes?recordId=${note.id}`} className={`block px-4 py-3 hover:bg-[#f8faf6] ${involvementSurfaceClass(involvement)}`}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="break-words text-sm font-semibold text-[#1c231f]">{note.title}</div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
                        <span>{formatDateTime(note.occurredAt)}</span>
                        {areas.length > 0 && <span>{areas.join(', ')}</span>}
                    </div>
                    <div className="mt-2 line-clamp-2 text-sm leading-5 text-[#536158]">{note.body}</div>
                </div>
                <InvolvementBadge signal={involvement} />
            </div>
        </Link>
    );
}

function ProjectHomeCard({ project, profile }: { project: Project; profile?: UserProfile | null }) {
    const roles = projectRoleLabels(project);
    const dateLabel = project.status === 'PLANNED' && project.plannedStartAt ? 'Starts' : 'Target';
    const dateValue = project.status === 'PLANNED' && project.plannedStartAt ? project.plannedStartAt : project.targetEndAt;
    const areaLabel = project.areaScope === 'ORGANISATION'
        ? 'Whole organisation'
        : project.areas.map(area => area.name).filter(Boolean).join(', ');
    const involvement = projectInvolvement(project, profile);

    return (
        <Link href={`/projects?projectId=${project.id}`} className={`group block min-w-0 rounded-lg border border-slate-200 bg-white p-3.5 transition hover:bg-[#fbfcfa] hover:shadow-sm ${involvementSurfaceClass(involvement)}`}>
            <div className="flex flex-wrap items-center gap-1.5">
                <InvolvementBadge signal={involvement} compact />
                {(roles.length > 0 ? roles : ['Involved']).slice(0, 2).map(role => <span key={role} className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-800">{role}</span>)}
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${projectTone(project.summary.health || project.status)}`}>{operationalLabel(project.summary.health || project.status)}</span>
            </div>
            <h4 className="mt-2 line-clamp-2 text-sm font-bold text-[#1c231f] group-hover:text-[var(--brand-strong)]">{project.title}</h4>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#536158]">{project.intendedOutcome}</p>
            <div className="mt-3 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-[var(--brand)]" style={{ width: `${project.summary.progressPercent || 0}%` }} /></div>
                <span className="w-9 text-right text-[11px] font-bold text-slate-600">{project.summary.progressPercent === null ? '—' : `${project.summary.progressPercent}%`}</span>
            </div>
            <div className="mt-2 flex items-start justify-between gap-3 text-[11px] text-[var(--muted)]">
                <span className="min-w-0 truncate">{areaLabel || 'Area not set'}</span>
                <span className="shrink-0">{dateValue ? `${dateLabel} ${formatDate(dateValue)}` : 'No date set'}</span>
            </div>
            {project.summary.nextAction && <div className="mt-2 truncate border-t border-slate-100 pt-2 text-[11px] text-slate-600"><span className="font-bold">Next:</span> {project.summary.nextAction.title}</div>}
        </Link>
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

function TaskAttentionRow({ task, profile, compact = false }: { task: Task; profile?: UserProfile | null; compact?: boolean }) {
    const badges = taskBadges(task);
    const involvement = taskInvolvement(task, profile);

    return (
        <Link href={`/tasks?taskId=${task.id}`} className={`block px-4 py-3 hover:bg-[#f8faf6] ${compact ? 'py-3' : 'py-4'} ${involvementSurfaceClass(involvement)}`}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="break-words text-sm font-semibold text-[#1c231f]">{taskLabel(task)}</div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
                        {taskMeta(task).map(bit => <span key={bit}>{bit}</span>)}
                    </div>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1">
                    <InvolvementBadge signal={involvement} compact />
                    {badges.map(badge => <AttentionBadge key={badge.label} label={badge.label} tone={badge.tone} />)}
                </div>
            </div>
        </Link>
    );
}

function NoticeRow({ notice, profile }: { notice: Notice; profile?: UserProfile | null }) {
    const involvement = noticeInvolvement(notice, profile);
    return (
        <Link href={`/noticeboard?noticeId=${notice.id}`} className={`block px-4 py-3 hover:bg-[#f8faf6] ${involvementSurfaceClass(involvement)}`}>
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
                    <InvolvementBadge signal={involvement} compact />
                    {notice.isPinned && <AttentionBadge label="Pinned" tone="brand" />}
                    {notice.priority === 'urgent' && <AttentionBadge label="Urgent" tone="red" />}
                    {notice.priority === 'important' && <AttentionBadge label="Important" tone="amber" />}
                </div>
            </div>
        </Link>
    );
}

function EventRow({ event, profile }: { event: CalendarEvent; profile?: UserProfile | null }) {
    const start = formatDateTime(event.start);
    const linkedTask = event.LinkedTask ? `Task #${event.LinkedTask.id}` : null;
    const involvement = eventInvolvement(event, profile);

    return (
        <Link href={`/calendar?eventId=${event.id}`} className={`block px-4 py-3 hover:bg-[#f8faf6] ${involvementSurfaceClass(involvement)}`}>
            <div className="flex items-start justify-between gap-3"><div className="break-words text-sm font-semibold text-[#1c231f]">{event.title}</div><InvolvementBadge signal={involvement} compact /></div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
                {start && <span>{start}</span>}
                <span>{operationalLabel(event.type)}</span>
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
