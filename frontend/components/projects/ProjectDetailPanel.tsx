'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
    addProjectDependency,
    addProjectItem,
    addProjectParticipant,
    createDelegatedProjectTask,
    createCalendarEvent,
    createNotice,
    createOperationalRecord,
    createOperationalRequest,
    fetchOperations,
    removeProjectDependency,
    removeProjectItem,
    removeProjectParticipant,
    searchCalendarEvents,
    updateProject,
    updateProjectItem,
    updateProjectParticipant
} from '../../lib/api';
import type {
    CalendarEvent,
    OperationalArea,
    Project,
    ProjectItem,
    ProjectItemSource,
    ProjectItemType,
    ProjectParticipationRole,
    ProjectStatus,
    Staff,
    UnifiedOperation,
    UserProfile
} from '../../lib/api';
import AttachmentPanel from '../AttachmentPanel';
import InvolvementBadge from '../InvolvementBadge';
import { involvementSurfaceClass, projectInvolvement, projectItemInvolvement } from '../../lib/involvement';

interface ProjectDetailPanelProps {
    project: Project;
    profile: UserProfile | null;
    users: Staff[];
    areas: OperationalArea[];
    canManage: boolean;
    canGovern: boolean;
    onEdit: () => void;
    onRefresh: () => Promise<void>;
}

const ITEM_LABELS: Record<ProjectItemType, string> = {
    TASK: 'Tasks', REQUEST: 'Requests', NOTICE: 'Notices', NOTE: 'Notes', CALENDAR_EVENT: 'Events'
};

function words(value?: string | null) {
    return String(value || '').replaceAll('_', ' ').toLowerCase().replace(/^./, match => match.toUpperCase());
}

function formatDate(value?: string | null, includeTime = false) {
    if (!value) return 'Not set';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Not set';
    return date.toLocaleString('en-AU', includeTime
        ? { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }
        : { day: 'numeric', month: 'short', year: 'numeric' });
}

function badgeClass(value?: string | null) {
    if (value === 'BLOCKED' || value === 'OVERDUE' || value === 'CANCELLED') return 'border-red-200 bg-red-50 text-red-800';
    if (value === 'AT_RISK' || value === 'ON_HOLD') return 'border-amber-200 bg-amber-50 text-amber-800';
    if (value === 'COMPLETED' || value === 'ON_TRACK') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    return 'border-slate-200 bg-slate-50 text-slate-700';
}

function sourceDate(source: ProjectItemSource) {
    return source.dueAt || source.start;
}

export default function ProjectDetailPanel({ project, profile, users, areas, canManage, canGovern, onEdit, onRefresh }: ProjectDetailPanelProps) {
    const [sectionError, setSectionError] = useState('');
    const [busy, setBusy] = useState(false);
    const groupedItems = useMemo(() => Object.fromEntries(
        (Object.keys(ITEM_LABELS) as ProjectItemType[]).map(type => [type, project.items.filter(item => item.itemType === type)])
    ) as Record<ProjectItemType, ProjectItem[]>, [project.items]);
    const involvement = projectInvolvement(project, profile);

    async function run(action: () => Promise<unknown>) {
        setBusy(true);
        setSectionError('');
        try {
            await action();
            await onRefresh();
            return true;
        } catch (err) {
            setSectionError(err instanceof Error ? err.message : 'Project update failed');
            return false;
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-5">
            <section className={`rounded-xl border border-[var(--border)] bg-white shadow-sm ${involvementSurfaceClass(involvement)}`}>
                <div className="border-b border-[var(--border)] p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                                <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${badgeClass(project.status)}`}>{words(project.status)}</span>
                                {project.summary.health && <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${badgeClass(project.summary.health)}`}>{words(project.summary.health)}</span>}
                                {project.permissions?.isLead && <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-800">You are Project Lead</span>}
                                <InvolvementBadge signal={involvement} />
                            </div>
                            <h2 className="text-2xl font-bold tracking-tight text-[#1c231f]">{project.title}</h2>
                            <p className="mt-2 max-w-4xl whitespace-pre-wrap text-sm leading-6 text-[#536158]">{project.intendedOutcome}</p>
                        </div>
                        {canManage && <button type="button" className="btn-secondary shrink-0" onClick={onEdit}>Edit Project</button>}
                    </div>
                </div>

                <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
                    <SummaryCard label="Progress" value={project.summary.progressPercent === null ? 'No required tasks' : `${project.summary.progressPercent}%`} detail={`${project.summary.completedRequiredTaskCount} of ${project.summary.requiredTaskCount} required tasks`}>
                        {project.summary.progressPercent !== null && <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-[var(--brand)]" style={{ width: `${project.summary.progressPercent}%` }} /></div>}
                    </SummaryCard>
                    <SummaryCard label="Project lead" value={project.Lead?.displayName || project.Lead?.email || 'Unassigned'} detail={project.Owner ? `Reports to ${project.Owner.displayName || project.Owner.email}` : 'Accountable owner not assigned'} />
                    <SummaryCard label="Target" value={formatDate(project.targetEndAt)} detail={project.plannedStartAt ? `Starts ${formatDate(project.plannedStartAt)}` : 'Start not set'} />
                    <SummaryCard label="Needs attention" value={String(project.summary.blockedTaskCount + project.summary.overdueTaskCount + project.summary.pendingDecisionCount)} detail={`${project.summary.blockedTaskCount} blocked · ${project.summary.overdueTaskCount} overdue · ${project.summary.pendingDecisionCount} decisions`} />
                </div>
            </section>

            {sectionError && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800" role="alert">{sectionError}</div>}

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
                <div className="space-y-5">
                    <AttentionPanel project={project} profile={profile} />
                    <section className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm">
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                            <div><h3 className="text-lg font-bold text-[#1c231f]">Coordinated work</h3><p className="text-sm text-[var(--muted)]">Teal marks work directly assigned or directed to you; burgundy marks work for your department or role.</p></div>
                            {canManage && <span className="text-xs font-semibold text-[var(--muted)]">{project.items.length} linked</span>}
                        </div>
                        <div className="space-y-5">
                            {(Object.keys(ITEM_LABELS) as ProjectItemType[]).map(type => (
                                <ItemGroup key={type} type={type} items={groupedItems[type]} profile={profile} canManage={canManage} busy={busy} onUpdate={(item, data) => run(() => updateProjectItem(project.id, item.id, data))} onRemove={item => run(() => removeProjectItem(project.id, item.id))} />
                            ))}
                        </div>
                        {project.restrictedItemCount > 0 && <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">{project.restrictedItemCount} linked item{project.restrictedItemCount === 1 ? '' : 's'} hidden by their own visibility rules.</div>}
                        {canManage && <ProjectItemControls project={project} users={users} areas={areas} busy={busy} canCreateCalendarEvents={Boolean(profile && ['manager', 'admin'].includes(profile.role))} onRun={run} />}
                    </section>

                    <DependencyPanel project={project} canManage={canManage} busy={busy} onRun={run} />

                    <AttachmentPanel entityType="PROJECT" entityId={project.id} title="Project files" canUpload={canManage} canDeleteAll={canManage} currentUserId={profile?.id} disabledReason="Only the Project Lead, accountable owner, or an authorised manager can add files." />

                    <ActivityPanel project={project} />
                </div>

                <aside className="space-y-5">
                    {canManage && <StatusPanel project={project} canGovern={canGovern} busy={busy} onRun={run} />}
                    <PeoplePanel project={project} users={users} canManage={canManage} busy={busy} onRun={run} />
                    <ContextPanel project={project} areas={areas} />
                </aside>
            </div>
        </div>
    );
}

function SummaryCard({ label, value, detail, children }: { label: string; value: string; detail: string; children?: React.ReactNode }) {
    return <div className="rounded-lg border border-slate-200 bg-slate-50 p-4"><div className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</div><div className="mt-1 text-lg font-bold text-slate-900">{value}</div><div className="mt-1 text-xs text-slate-600">{detail}</div>{children}</div>;
}

function AttentionPanel({ project, profile }: { project: Project; profile?: UserProfile | null }) {
    const summary = project.summary;
    const attentionCount = summary.blockedTaskCount + summary.overdueTaskCount + summary.pendingDecisionCount;
    const nextInvolvement = summary.nextAction ? projectItemInvolvement(summary.nextAction, profile) : null;
    return (
        <section className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold text-[#1c231f]">Operational focus</h3>
            {summary.nextAction ? (
                <Link href={summary.nextAction.href} className={`mt-3 block rounded-lg border border-[var(--brand)] bg-[var(--brand-soft)] p-4 hover:brightness-[0.98] ${involvementSurfaceClass(nextInvolvement)}`}>
                    <div className="text-xs font-bold uppercase tracking-wider text-[var(--brand-strong)]">Next action · {words(summary.nextAction.reason)}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 font-bold text-[#1c231f]">{summary.nextAction.title}<InvolvementBadge signal={nextInvolvement} compact /></div>
                    <div className="mt-1 text-xs text-[#536158]">{summary.nextAction.owner?.displayName || 'No individual owner'}{summary.nextAction.dueAt ? ` · ${formatDate(summary.nextAction.dueAt)}` : ''}</div>
                </Link>
            ) : <div className="mt-3 rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-600">No outstanding next action has been identified.</div>}
            {attentionCount > 0 && (
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <AttentionList title="Blocked" items={summary.attention.blockedTasks} profile={profile} />
                    <AttentionList title="Overdue" items={summary.attention.overdueTasks} profile={profile} />
                    <AttentionList title="Pending decisions" items={summary.attention.pendingDecisions} profile={profile} />
                </div>
            )}
            {project.riskReason && <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"><span className="font-bold">Project risk:</span> {project.riskReason}{project.riskReviewAt ? ` · review ${formatDate(project.riskReviewAt)}` : ''}</div>}
        </section>
    );
}

function AttentionList({ title, items, profile }: { title: string; items: ProjectItemSource[]; profile?: UserProfile | null }) {
    const sorted = [...items].sort((left, right) => Number(projectItemInvolvement(right, profile)?.kind === 'DIRECT') - Number(projectItemInvolvement(left, profile)?.kind === 'DIRECT'));
    return <div><h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">{title} ({items.length})</h4><div className="mt-2 space-y-1">{sorted.slice(0, 4).map(item => <Link key={item.href} href={item.href} className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-[var(--brand-strong)] hover:underline"><span className="truncate">{item.title}</span><InvolvementBadge signal={projectItemInvolvement(item, profile)} compact /></Link>)}{items.length === 0 && <span className="text-sm text-slate-500">None</span>}</div></div>;
}

function ItemGroup({ type, items, profile, canManage, busy, onUpdate, onRemove }: {
    type: ProjectItemType;
    items: ProjectItem[];
    profile?: UserProfile | null;
    canManage: boolean;
    busy: boolean;
    onUpdate: (item: ProjectItem, data: { isRequired?: boolean; isMilestone?: boolean }) => Promise<unknown>;
    onRemove: (item: ProjectItem) => Promise<unknown>;
}) {
    const sortedItems = [...items].sort((left, right) => Number(projectItemInvolvement(right.source, profile)?.kind === 'DIRECT') - Number(projectItemInvolvement(left.source, profile)?.kind === 'DIRECT'));
    return (
        <div>
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">{ITEM_LABELS[type]} ({items.length})</h4>
            {items.length === 0 ? <div className="rounded-md border border-dashed border-slate-200 px-3 py-3 text-sm text-slate-500">No {ITEM_LABELS[type].toLowerCase()} linked.</div> : (
                <div className="space-y-2">
                    {sortedItems.map(item => {
                        const involvement = projectItemInvolvement(item.source, profile);
                        return (
                        <div key={item.id} className={`flex flex-col gap-3 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between ${involvementSurfaceClass(involvement)}`}>
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2"><Link href={item.source.href} className="font-bold text-[#1c231f] hover:text-[var(--brand-strong)] hover:underline">{item.source.title}</Link><InvolvementBadge signal={involvement} compact /><span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${badgeClass(item.source.workflowState || item.source.status)}`}>{words(item.source.workflowState || item.source.status)}</span>{item.linkType === 'DELEGATED_WORK' && <span className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-800">Delegated work</span>}</div>
                                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500"><span>{item.source.owner?.displayName || 'No owner'}</span>{sourceDate(item.source) && <span>{formatDate(sourceDate(item.source))}</span>}{item.source.blockedReason && <span className="font-semibold text-red-700">{item.source.blockedReason}</span>}</div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                {canManage ? <><label className="text-xs font-semibold text-slate-600"><input type="checkbox" className="mr-1" checked={item.isRequired} disabled={busy || type !== 'TASK'} onChange={event => onUpdate(item, { isRequired: event.target.checked })} />Required</label><label className="text-xs font-semibold text-slate-600"><input type="checkbox" className="mr-1" checked={item.isMilestone} disabled={busy || !['TASK', 'CALENDAR_EVENT'].includes(type)} onChange={event => onUpdate(item, { isMilestone: event.target.checked })} />Milestone</label><button type="button" className="text-xs font-bold text-red-700 hover:underline" disabled={busy} onClick={() => onRemove(item)}>Unlink</button></> : <>{item.isRequired && <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold">Required</span>}{item.isMilestone && <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold">Milestone</span>}</>}
                            </div>
                        </div>
                    );})}
                </div>
            )}
        </div>
    );
}

function ProjectItemControls({ project, users, areas, busy, canCreateCalendarEvents, onRun }: { project: Project; users: Staff[]; areas: OperationalArea[]; busy: boolean; canCreateCalendarEvents: boolean; onRun: (action: () => Promise<unknown>) => Promise<boolean> }) {
    const [mode, setMode] = useState<'link' | 'create' | null>(null);
    const [itemType, setItemType] = useState<ProjectItemType>('TASK');
    const [search, setSearch] = useState('');
    const [searching, setSearching] = useState(false);
    const [results, setResults] = useState<Array<{ id: number; type: ProjectItemType; title: string; detail: string }>>([]);
    const [required, setRequired] = useState(false);
    const [milestone, setMilestone] = useState(false);
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [date, setDate] = useState('');
    const taskAreas = useMemo(
        () => project.areaScope === 'AREAS'
            ? areas.filter(area => project.areas.some(projectArea => projectArea.id === area.id))
            : areas.filter(area => area.isActive !== false),
        [areas, project.areaScope, project.areas]
    );
    const [taskAreaId, setTaskAreaId] = useState(String(project.primaryAreaId || taskAreas[0]?.id || ''));
    const taskAssignees = useMemo(
        () => users.filter(user => user.isActive !== false && (user.areaIds || []).includes(Number(taskAreaId))),
        [taskAreaId, users]
    );
    const [taskAssigneeId, setTaskAssigneeId] = useState('');
    const [pendingCreated, setPendingCreated] = useState<{ id: number; type: ProjectItemType; title: string } | null>(null);
    const [controlError, setControlError] = useState('');
    const linkedKeys = useMemo(() => new Set(project.items.map(item => `${item.itemType}:${item.itemId}`)), [project.items]);

    async function doSearch() {
        setSearching(true);
        setControlError('');
        try {
            if (itemType === 'CALENDAR_EVENT') {
                const events = await searchCalendarEvents(search, 20);
                setResults(events.filter(event => !linkedKeys.has(`CALENDAR_EVENT:${event.id}`)).map(event => ({ id: event.id, type: 'CALENDAR_EVENT', title: event.title, detail: formatDate(event.start, true) })));
            } else {
                const response = await fetchOperations({ types: [itemType], search, pageSize: 20 });
                setResults(response.operations.filter(item => !linkedKeys.has(`${item.type}:${item.id}`)).map((item: UnifiedOperation) => ({ id: item.id, type: item.type as ProjectItemType, title: item.title, detail: `${words(item.status)}${item.dueAt ? ` · ${formatDate(item.dueAt)}` : ''}` })));
            }
        } catch (error) {
            setResults([]);
            setControlError(error instanceof Error ? error.message : 'Failed to search existing records');
        } finally {
            setSearching(false);
        }
    }

    async function link(item: { id: number; type: ProjectItemType }) {
        const succeeded = await onRun(() => addProjectItem(project.id, { itemType: item.type, itemId: item.id, isRequired: item.type === 'TASK' && required, isMilestone: milestone }));
        if (succeeded) setResults(current => current.filter(result => !(result.id === item.id && result.type === item.type)));
    }

    async function createAndLink(event: React.FormEvent) {
        event.preventDefault();
        if (!title.trim()) return;
        const succeeded = await onRun(async () => {
            const dueAt = date ? new Date(`${date}T12:00:00`).toISOString() : undefined;
            if (itemType === 'TASK') {
                if (!taskAreaId || !taskAssigneeId) throw new Error('Choose the receiving area and assignee for this Project Task.');
                await createDelegatedProjectTask(project.id, {
                    title: title.trim(),
                    body: body.trim() || null,
                    dueAt: dueAt || null,
                    priority: 'normal',
                    areaId: Number(taskAreaId),
                    assigneeId: Number(taskAssigneeId),
                    isRequired: required,
                    isMilestone: milestone
                });
                setPendingCreated(null);
                return;
            }

            let created: { id: number };
            if (itemType === 'NOTICE') {
                created = await createNotice({ title: title.trim(), body: body.trim() || title.trim(), category: 'GENERAL', priority: 'normal', audienceType: 'all_staff', areaScope: project.areaScope, primaryAreaId: project.primaryAreaId, linkedAreaIds: project.areas.map(area => area.id), effectiveFrom: new Date().toISOString(), expiresAt: dueAt || null });
            } else if (itemType === 'CALENDAR_EVENT') {
                const start = dueAt || new Date().toISOString();
                created = await createCalendarEvent({ title: title.trim(), description: body.trim(), start, end: new Date(new Date(start).getTime() + 60 * 60 * 1000).toISOString(), allDay: Boolean(date), type: 'event' } as Partial<CalendarEvent>);
            } else if (itemType === 'REQUEST') {
                created = await createOperationalRequest({ title: title.trim(), body: body.trim() || title.trim(), priority: 'normal', dueAt: dueAt || null, areaScope: project.areaScope, primaryAreaId: project.primaryAreaId, linkedAreaIds: project.areas.map(area => area.id) });
            } else if (itemType === 'NOTE') {
                created = await createOperationalRecord({ title: title.trim(), body: body.trim() || title.trim(), occurredAt: dueAt || new Date().toISOString(), areaScope: project.areaScope, primaryAreaId: project.primaryAreaId, linkedAreaIds: project.areas.map(area => area.id) });
            } else {
                throw new Error('Unsupported Project item type.');
            }
            try {
                await addProjectItem(project.id, { itemType, itemId: created.id, isRequired: false, isMilestone: milestone });
                setPendingCreated(null);
            } catch (error) {
                setPendingCreated({ id: created.id, type: itemType, title: title.trim() });
                throw new Error(`The ${words(itemType)} was created, but linking failed. Use the retry action below. ${error instanceof Error ? error.message : ''}`.trim());
            }
        });
        if (!succeeded) return;
        setTitle(''); setBody(''); setDate(''); setTaskAssigneeId('');
    }

    return (
        <div className="mt-5 border-t border-[var(--border)] pt-5">
            <div className="flex flex-wrap gap-2"><button type="button" className="btn-secondary" onClick={() => setMode(mode === 'link' ? null : 'link')}>Link existing</button><button type="button" className="btn-primary" onClick={() => setMode(mode === 'create' ? null : 'create')}>Create in Project</button></div>
            {mode && <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                {controlError && <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{controlError}</div>}
                {pendingCreated && <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"><span><strong>{pendingCreated.title}</strong> was created as {words(pendingCreated.type)} #{pendingCreated.id} but is not linked.</span><button type="button" className="btn-secondary px-3 py-1.5 text-xs" disabled={busy} onClick={async () => { const succeeded = await onRun(() => addProjectItem(project.id, { itemType: pendingCreated.type, itemId: pendingCreated.id, isRequired: pendingCreated.type === 'TASK' && required, isMilestone: milestone })); if (succeeded) setPendingCreated(null); }}>Retry link</button></div>}
                <div className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
                    <label><span className="form-label">Item type</span><select className="input" value={itemType} onChange={event => { const nextType = event.target.value as ProjectItemType; setItemType(nextType); if (nextType !== 'TASK') setRequired(false); if (!['TASK', 'CALENDAR_EVENT'].includes(nextType)) setMilestone(false); setResults([]); }}><option value="TASK">Task</option><option value="CALENDAR_EVENT">Event</option><option value="NOTICE">Notice</option><option value="REQUEST">Request</option><option value="NOTE">Note</option></select></label>
                    <div className="flex items-end gap-4 pb-2"><label className="text-sm font-semibold"><input type="checkbox" className="mr-1" checked={required} disabled={itemType !== 'TASK'} onChange={event => setRequired(event.target.checked)} />Required for completion</label><label className="text-sm font-semibold"><input type="checkbox" className="mr-1" checked={milestone} disabled={!['TASK', 'CALENDAR_EVENT'].includes(itemType)} onChange={event => setMilestone(event.target.checked)} />Milestone</label></div>
                </div>
                {mode === 'link' ? <><div className="mt-3 flex gap-2"><input className="input" value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); doSearch(); } }} placeholder={`Search ${ITEM_LABELS[itemType].toLowerCase()}`} /><button type="button" className="btn-secondary" disabled={searching} onClick={doSearch}>{searching ? 'Searching…' : 'Search'}</button></div><div className="mt-3 space-y-2">{results.map(result => <div key={`${result.type}:${result.id}`} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2"><div className="min-w-0"><div className="truncate text-sm font-bold">{result.title}</div><div className="text-xs text-slate-500">{result.detail}</div></div><button type="button" className="btn-secondary shrink-0 px-3 py-1.5 text-xs" disabled={busy} onClick={() => link(result)}>Link</button></div>)}{results.length === 0 && search && !searching && <div className="text-sm text-slate-500">No unlinked matches.</div>}</div><div className="mt-3 text-xs text-slate-500">Linking an existing record does not change that record&apos;s permissions.</div></> : (
                    <form onSubmit={createAndLink} className="mt-3 grid gap-3">
                        <input className="input" value={title} onChange={event => setTitle(event.target.value)} placeholder="Title" maxLength={255} />
                        <textarea className="input min-h-20" value={body} onChange={event => setBody(event.target.value)} placeholder="Instructions or context" maxLength={2000} />
                        {itemType === 'TASK' && <div className="grid gap-3 sm:grid-cols-2">
                            <label><span className="form-label">Receiving area</span><select className="input" value={taskAreaId} onChange={event => { setTaskAreaId(event.target.value); setTaskAssigneeId(''); }}><option value="">Choose area</option>{taskAreas.map(area => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label>
                            <label><span className="form-label">Assignee</span><select className="input" value={taskAssigneeId} onChange={event => setTaskAssigneeId(event.target.value)}><option value="">Choose a member of this area</option>{taskAssignees.map(user => <option key={user.id} value={user.id}>{user.displayName || user.email}</option>)}</select></label>
                            <div className="sm:col-span-2 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">This creates delegated Project work in the selected department. The assignee and their area manager are notified, and the action is recorded in Project history.</div>
                        </div>}
                        <label><span className="form-label">{itemType === 'CALENDAR_EVENT' ? 'Event date' : itemType === 'NOTE' ? 'Reference date (optional)' : 'Due / expiry date'}</span><input type="date" className="input" value={date} onChange={event => setDate(event.target.value)} /></label>
                        {itemType === 'CALENDAR_EVENT' && !canCreateCalendarEvents && <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">Your Project authority allows linking existing Events, but the Calendar currently reserves Event creation for winery managers.</div>}
                        <div><button type="submit" className="btn-primary" disabled={busy || (itemType === 'TASK' && (!taskAreaId || !taskAssigneeId)) || (itemType === 'CALENDAR_EVENT' && !canCreateCalendarEvents)}>{busy ? 'Creating…' : itemType === 'TASK' ? 'Delegate Project Task' : `Create and link ${words(itemType)}`}</button></div>
                    </form>
                )}
            </div>}
        </div>
    );
}

function DependencyPanel({ project, canManage, busy, onRun }: { project: Project; canManage: boolean; busy: boolean; onRun: (action: () => Promise<unknown>) => Promise<boolean> }) {
    const tasks = project.items.filter(item => item.itemType === 'TASK');
    const [blocking, setBlocking] = useState('');
    const [blocked, setBlocked] = useState('');
    return <section className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm"><h3 className="text-lg font-bold text-[#1c231f]">Task dependencies</h3><p className="text-sm text-[var(--muted)]">A dependency makes the downstream required task visibly blocked until its prerequisite completes.</p><div className="mt-4 space-y-2">{project.dependencies.map(dependency => <div key={dependency.id} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 p-3 text-sm"><div><span className="font-semibold">{dependency.blockingTask?.title || `Task ${dependency.blockingTaskId}`}</span><span className="mx-2 text-slate-400">→ unlocks →</span><span className="font-semibold">{dependency.blockedTask?.title || `Task ${dependency.blockedTaskId}`}</span></div>{canManage && <button type="button" className="text-xs font-bold text-red-700 hover:underline" disabled={busy} onClick={() => onRun(() => removeProjectDependency(project.id, dependency.id))}>Remove</button>}</div>)}{project.dependencies.length === 0 && <div className="rounded-md border border-dashed border-slate-200 p-3 text-sm text-slate-500">No dependencies recorded.</div>}</div>{canManage && tasks.length >= 2 && <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><select className="input" value={blocking} onChange={event => setBlocking(event.target.value)}><option value="">Prerequisite task</option>{tasks.map(item => <option key={item.itemId} value={item.itemId}>{item.source.title}</option>)}</select><select className="input" value={blocked} onChange={event => setBlocked(event.target.value)}><option value="">Blocked task</option>{tasks.map(item => <option key={item.itemId} value={item.itemId}>{item.source.title}</option>)}</select><button type="button" className="btn-secondary" disabled={busy || !blocking || !blocked || blocking === blocked} onClick={async () => { const succeeded = await onRun(() => addProjectDependency(project.id, Number(blocking), Number(blocked))); if (succeeded) { setBlocking(''); setBlocked(''); } }}>Add dependency</button></div>}</section>;
}

function StatusPanel({ project, canGovern, busy, onRun }: { project: Project; canGovern: boolean; busy: boolean; onRun: (action: () => Promise<unknown>) => Promise<boolean> }) {
    const [status, setStatus] = useState<ProjectStatus>(project.status);
    const [override, setOverride] = useState(false);
    const [reason, setReason] = useState('');
    const incomplete = project.summary.incompleteRequiredTaskCount;
    return <section className="rounded-xl border border-[var(--border)] bg-white p-4 shadow-sm"><h3 className="font-bold text-[#1c231f]">Project state</h3><select className="input mt-3" value={status} onChange={event => setStatus(event.target.value as ProjectStatus)}><option value="PLANNED">Planned</option><option value="ACTIVE">Active</option><option value="ON_HOLD">On hold</option>{canGovern && <option value="COMPLETED">Completed</option>}{canGovern && <option value="CANCELLED">Cancelled</option>}</select>{!canGovern && <p className="mt-2 text-xs text-slate-500">Project Leads can coordinate active delivery states. Completion and cancellation require the accountable owner or an authorised manager.</p>}{canGovern && status === 'COMPLETED' && incomplete > 0 && <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><div className="font-bold">{incomplete} required task{incomplete === 1 ? '' : 's'} incomplete</div><label className="mt-2 block"><input type="checkbox" className="mr-2" checked={override} onChange={event => setOverride(event.target.checked)} />Authorise completion override</label>{override && <textarea className="input mt-2 min-h-20" value={reason} onChange={event => setReason(event.target.value)} placeholder="Explain why the Project can close with incomplete required work" />}</div>}<button type="button" className="btn-primary mt-3 w-full" disabled={busy || status === project.status || (status === 'COMPLETED' && incomplete > 0 && (!override || !reason.trim()))} onClick={async () => { const succeeded = await onRun(() => updateProject(project.id, { status, completionOverride: override, completionReason: reason.trim() || null, notifyParticipants: true })); if (succeeded) { setOverride(false); setReason(''); } }}>Update status</button></section>;
}

function PeoplePanel({ project, users, canManage, busy, onRun }: { project: Project; users: Staff[]; canManage: boolean; busy: boolean; onRun: (action: () => Promise<unknown>) => Promise<boolean> }) {
    const participants = project.Participants || [];
    const participantIds = new Set(participants.map(participant => participant.userId));
    const candidates = users.filter(user => user.isActive !== false && user.id !== project.ownerUserId && user.id !== project.leadUserId && !participantIds.has(user.id));
    const [userId, setUserId] = useState('');
    const [role, setRole] = useState<ProjectParticipationRole>('PARTICIPANT');
    return <section className="rounded-xl border border-[var(--border)] bg-white p-4 shadow-sm">
        <h3 className="font-bold text-[#1c231f]">People</h3>
        <div className="mt-3 rounded-md bg-slate-50 p-3">
            <div className="text-xs font-bold uppercase text-slate-500">Accountable owner</div>
            <div className="mt-1 text-sm font-semibold">{project.Owner?.displayName || project.Owner?.email || 'Unassigned'}</div>
        </div>
        <div className="mt-2 rounded-md border border-blue-100 bg-blue-50 p-3">
            <div className="text-xs font-bold uppercase text-blue-700">Project Lead</div>
            <div className="mt-1 text-sm font-semibold">{project.Lead?.displayName || project.Lead?.email || 'Unassigned'}</div>
            <div className="mt-1 text-xs text-blue-800">{project.Lead ? `Reports to ${project.Owner?.displayName || project.Owner?.email || 'the accountable owner'}` : 'A governing manager can appoint a scoped delivery lead.'}</div>
            {project.leadGrantedAt && <div className="mt-1 text-xs text-blue-700">Appointed {formatDate(project.leadGrantedAt)}{project.LeadGrantor ? ` by ${project.LeadGrantor.displayName || project.LeadGrantor.email}` : ''}</div>}
        </div>
        <div className="mt-3 space-y-2">
            {participants.map(participant => <div key={participant.userId} className="rounded-md border border-slate-200 p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-sm font-semibold">{participant.User?.displayName || participant.User?.email || `User ${participant.userId}`}</div>{canManage ? <select className="mt-1 rounded border border-slate-200 px-1.5 py-1 text-xs" value={participant.participationRole} disabled={busy} onChange={event => onRun(() => updateProjectParticipant(project.id, participant.userId, { participationRole: event.target.value as ProjectParticipationRole }))}><option value="PARTICIPANT">Participant</option><option value="STAKEHOLDER">Stakeholder</option></select> : <div className="text-xs text-slate-500">{words(participant.participationRole)}</div>}</div>{canManage && <button type="button" className="text-xs font-bold text-red-700" disabled={busy} onClick={() => onRun(() => removeProjectParticipant(project.id, participant.userId))}>Remove</button>}</div>{canManage && <label className="mt-2 block text-xs text-slate-600"><input type="checkbox" className="mr-1" checked={participant.notificationsEnabled} disabled={busy} onChange={event => onRun(() => updateProjectParticipant(project.id, participant.userId, { notificationsEnabled: event.target.checked }))} />Project notifications</label>}</div>)}
            {participants.length === 0 && <div className="text-sm text-slate-500">No additional participants.</div>}
        </div>
        {canManage && candidates.length > 0 && <div className="mt-3 space-y-2 border-t border-slate-200 pt-3"><select className="input" value={userId} onChange={event => setUserId(event.target.value)}><option value="">Add a person</option>{candidates.map(user => <option key={user.id} value={user.id}>{user.displayName || user.email}</option>)}</select><select className="input" value={role} onChange={event => setRole(event.target.value as ProjectParticipationRole)}><option value="PARTICIPANT">Participant</option><option value="STAKEHOLDER">Stakeholder</option></select><button type="button" className="btn-secondary w-full" disabled={busy || !userId} onClick={async () => { const succeeded = await onRun(() => addProjectParticipant(project.id, { userId: Number(userId), participationRole: role, notificationsEnabled: true })); if (succeeded) setUserId(''); }}>Add person</button></div>}
    </section>;
}

function ContextPanel({ project, areas }: { project: Project; areas: OperationalArea[] }) {
    const areaMap = new Map(areas.map(area => [area.id, area.name]));
    return <section className="rounded-xl border border-[var(--border)] bg-white p-4 shadow-sm"><h3 className="font-bold text-[#1c231f]">Project context</h3>{project.businessContext ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{project.businessContext}</p> : <p className="mt-3 text-sm text-slate-500">No additional business context recorded.</p>}<dl className="mt-4 space-y-3 text-sm"><div><dt className="text-xs font-bold uppercase text-slate-500">Areas</dt><dd className="mt-1">{project.areaScope === 'ORGANISATION' ? 'Whole organisation' : project.areas.map(area => area.name || areaMap.get(area.id)).join(', ')}</dd></div><div><dt className="text-xs font-bold uppercase text-slate-500">Created by</dt><dd className="mt-1">{project.Creator?.displayName || project.Creator?.email || 'Unknown'} · {formatDate(project.createdAt)}</dd></div>{project.actualCompletedAt && <div><dt className="text-xs font-bold uppercase text-slate-500">Completed</dt><dd className="mt-1">{formatDate(project.actualCompletedAt)}</dd></div>}{project.completionReason && <div><dt className="text-xs font-bold uppercase text-slate-500">Completion note</dt><dd className="mt-1">{project.completionReason}</dd></div>}</dl></section>;
}

function ActivityPanel({ project }: { project: Project }) {
    const activity = project.activity || [];
    return <section className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm"><h3 className="text-lg font-bold text-[#1c231f]">Activity history</h3><div className="mt-4 space-y-3">{activity.map(event => <div key={event.id} className="flex gap-3"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--brand)]" /><div><div className="text-sm font-semibold text-slate-800">{words(event.eventType)}</div><div className="text-xs text-slate-500">{event.Actor?.displayName || event.Actor?.email || 'System'} · {formatDate(event.createdAt, true)}</div>{event.metadata && <div className="mt-1 text-xs text-slate-600">{activityMetadata(event.metadata)}</div>}</div></div>)}{activity.length === 0 && <div className="text-sm text-slate-500">No activity recorded.</div>}</div></section>;
}

function activityMetadata(metadata: Record<string, unknown>) {
    if (metadata.taskId && metadata.assigneeId) return `Task #${metadata.taskId} delegated to user #${metadata.assigneeId}`;
    if (metadata.leadUserId && metadata.reportsToUserId) return `Lead user #${metadata.leadUserId} reports to user #${metadata.reportsToUserId}`;
    if (metadata.previousLeadUserId && !metadata.leadUserId) return `Lead appointment ended for user #${metadata.previousLeadUserId}`;
    if (metadata.itemType && metadata.itemId) return `${words(String(metadata.itemType))} #${metadata.itemId}`;
    if (metadata.participantUserId) return `User #${metadata.participantUserId}`;
    if (metadata.blockingTaskId && metadata.blockedTaskId) return `Task ${metadata.blockingTaskId} → Task ${metadata.blockedTaskId}`;
    return '';
}
