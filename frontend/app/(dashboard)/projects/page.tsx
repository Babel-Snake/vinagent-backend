'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    assignProjectLead,
    createProject,
    fetchOperationalAreas,
    fetchProjects,
    getMyProfile,
    getProject,
    getUsers,
    revokeProjectLead,
    updateProject
} from '../../../lib/api';
import type { OperationalArea, Project, ProjectHealth, ProjectInput, ProjectStatus, Staff, UserProfile } from '../../../lib/api';
import WorkSubnav from '../../../components/WorkSubnav';
import ProjectEditorDialog from '../../../components/projects/ProjectEditorDialog';
import ProjectDetailPanel from '../../../components/projects/ProjectDetailPanel';
import InvolvementBadge from '../../../components/InvolvementBadge';
import { involvementSurfaceClass, projectInvolvement } from '../../../lib/involvement';

function words(value?: string | null) {
    return String(value || '').replaceAll('_', ' ').toLowerCase().replace(/^./, match => match.toUpperCase());
}

function formatDate(value?: string | null) {
    if (!value) return 'No target';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'No target' : date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function badgeClass(value?: string | null) {
    if (value === 'BLOCKED' || value === 'OVERDUE' || value === 'CANCELLED') return 'border-red-200 bg-red-50 text-red-800';
    if (value === 'AT_RISK' || value === 'ON_HOLD') return 'border-amber-200 bg-amber-50 text-amber-800';
    if (value === 'COMPLETED' || value === 'ON_TRACK') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    return 'border-slate-200 bg-slate-50 text-slate-700';
}

export default function ProjectsPage() {
    return <Suspense fallback={<main className="mx-auto max-w-[1440px] p-6"><div className="text-sm text-slate-500">Loading Projects…</div></main>}><ProjectsWorkspace /></Suspense>;
}

function ProjectsWorkspace() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const selectedId = Number(searchParams.get('projectId')) || null;
    const [projects, setProjects] = useState<Project[]>([]);
    const [selected, setSelected] = useState<Project | null>(null);
    const [areas, setAreas] = useState<OperationalArea[]>([]);
    const [users, setUsers] = useState<Staff[]>([]);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [profileLoaded, setProfileLoaded] = useState(false);
    const [loading, setLoading] = useState(true);
    const [detailLoading, setDetailLoading] = useState(false);
    const [error, setError] = useState('');
    const [editor, setEditor] = useState<'create' | 'edit' | null>(null);
    const [search, setSearch] = useState('');
    const [involvement, setInvolvement] = useState<'all' | 'me'>('all');
    const [status, setStatus] = useState<'all' | ProjectStatus>('all');
    const [health, setHealth] = useState<'all' | ProjectHealth>('all');
    const [areaId, setAreaId] = useState<string>('all');
    const [sortBy, setSortBy] = useState('updated');
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState({ page: 1, pageSize: 25, total: 0, totalPages: 1 });

    const loadList = useCallback(async () => {
        const result = await fetchProjects({ search, involvement, status, health, areaId, sortBy, page, pageSize: 25 });
        setProjects(result.projects);
        setPagination(result.pagination);
    }, [search, involvement, status, health, areaId, sortBy, page]);

    const loadDetail = useCallback(async (projectId: number) => {
        setDetailLoading(true);
        try {
            setSelected(await getProject(projectId));
            setError('');
        } catch (err) {
            setSelected(null);
            setError(err instanceof Error ? err.message : 'Failed to load Project');
        } finally {
            setDetailLoading(false);
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        Promise.all([getMyProfile(), getUsers(), fetchOperationalAreas()])
            .then(([profileResult, userResult, areaResult]) => {
                if (cancelled) return;
                setProfile(profileResult.user);
                setInvolvement(profileResult.user.role === 'staff' ? 'me' : 'all');
                setUsers(userResult);
                setAreas(areaResult);
            })
            .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load Project options'); })
            .finally(() => { if (!cancelled) setProfileLoaded(true); });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        if (!profileLoaded) return;
        let cancelled = false;
        setLoading(true);
        loadList().catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load Projects'); }).finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [loadList, profileLoaded]);

    useEffect(() => {
        if (selectedId) loadDetail(selectedId);
        else setSelected(null);
    }, [selectedId, loadDetail]);

    const managedAreaIds = useMemo(() => new Set([
        ...(profile?.managedAreaIds || []),
        ...(profile?.areaMemberships || []).filter(membership => membership.membershipRole === 'MANAGER').map(membership => membership.areaId)
    ]), [profile]);
    const isGlobalManager = Boolean(profile && ['manager', 'admin'].includes(profile.role));
    const canCreate = isGlobalManager || managedAreaIds.size > 0;
    const canManageSelected = Boolean(selected?.permissions?.canManage);
    const canGovernSelected = Boolean(selected?.permissions?.canGovern);
    const permissionMetadataMissing = Boolean(selected && !selected.permissions);

    function selectProject(projectId: number) {
        const params = new URLSearchParams(searchParams.toString());
        params.set('projectId', String(projectId));
        router.replace(`/projects?${params.toString()}`);
    }

    async function refresh() {
        await Promise.all([loadList(), selectedId ? loadDetail(selectedId) : Promise.resolve()]);
    }

    async function saveNew(input: ProjectInput) {
        const created = await createProject(input);
        setEditor(null);
        await loadList();
        selectProject(created.id);
    }

    async function saveEdit(input: ProjectInput) {
        if (!selected) return;
        const updates: Partial<ProjectInput> = { ...input };
        delete updates.participantUserIds;
        const desiredLeadUserId = updates.leadUserId || null;
        delete updates.leadUserId;
        if (!selected.permissions?.canGovern) {
            delete updates.ownerUserId;
            delete updates.areaScope;
            delete updates.primaryAreaId;
            delete updates.linkedAreaIds;
        }
        await updateProject(selected.id, updates);
        if (selected.permissions?.canGovern && Number(desiredLeadUserId || 0) !== Number(selected.leadUserId || 0)) {
            if (desiredLeadUserId) await assignProjectLead(selected.id, desiredLeadUserId);
            else await revokeProjectLead(selected.id);
        }
        setEditor(null);
        await refresh();
    }

    return (
        <div>
            <div className="page-header">
                <div><h1 className="page-title">Projects</h1><p className="page-kicker max-w-3xl">Capture larger multi step goals across different users and departments.</p></div>
                {canCreate && <button type="button" className="btn-primary shrink-0" onClick={() => setEditor('create')}>Create Project</button>}
            </div>

            <WorkSubnav />

            {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800" role="alert">{error}</div>}
            {permissionMetadataMissing && <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900" role="status">This Project was loaded without the current permission metadata. It is shown read-only for safety; restart the backend development server to load the latest Project API.</div>}

            <section className="mb-5 rounded-xl border border-[var(--border)] bg-white p-4 shadow-sm" aria-label="Project filters">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(14rem,1fr)_10rem_11rem_11rem_12rem_12rem]">
                    <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold text-[#344039]">Search:</span>
                        <input className="form-control" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Title, outcome, context or risk" />
                    </label>
                    <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold text-[#344039]">People:</span>
                        <select className="form-control" value={involvement} onChange={event => { setInvolvement(event.target.value as 'all' | 'me'); setPage(1); }}><option value="all">All visible Projects</option><option value="me">Involving me</option></select>
                    </label>
                    <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold text-[#344039]">Status:</span>
                        <select className="form-control" value={status} onChange={event => { setStatus(event.target.value as 'all' | ProjectStatus); setPage(1); }}><option value="all">All statuses</option><option value="PLANNED">Planned</option><option value="ACTIVE">Active</option><option value="ON_HOLD">On hold</option><option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option></select>
                    </label>
                    <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold text-[#344039]">Health:</span>
                        <select className="form-control" value={health} onChange={event => { setHealth(event.target.value as 'all' | ProjectHealth); setPage(1); }}><option value="all">All health</option><option value="ON_TRACK">On track</option><option value="AT_RISK">At risk</option><option value="BLOCKED">Blocked</option><option value="OVERDUE">Overdue</option></select>
                    </label>
                    <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold text-[#344039]">Area:</span>
                        <select className="form-control" value={areaId} onChange={event => { setAreaId(event.target.value); setPage(1); }}><option value="all">All visible areas</option><option value="organisation">Organisation-wide</option>{areas.map(area => <option key={area.id} value={area.id}>{area.name}</option>)}</select>
                    </label>
                    <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold text-[#344039]">Sort:</span>
                        <select className="form-control" value={sortBy} onChange={event => { setSortBy(event.target.value); setPage(1); }}><option value="updated">Recently updated</option><option value="target_soonest">Target soonest</option><option value="target_latest">Target latest</option><option value="created_newest">Newest</option><option value="created_oldest">Oldest</option></select>
                    </label>
                </div>
            </section>

            <div className="grid gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
                <section className="min-w-0 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto" aria-label="Project list">
                    <div className="mb-2 flex items-center justify-between px-1"><h2 className="text-sm font-bold text-[#344039]">Visible Projects</h2><span className="text-xs text-[var(--muted)]">{pagination.total}</span></div>
                    {loading ? <div className="rounded-xl border border-[var(--border)] bg-white p-5 text-sm text-slate-500">Loading Projects…</div> : projects.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center"><div className="font-bold text-slate-800">No Projects match</div><p className="mt-1 text-sm text-slate-500">Adjust the filters or create the first coordinated outcome.</p></div> : <div className="space-y-2">{projects.map(project => <ProjectListCard key={project.id} project={project} profile={profile} selected={project.id === selectedId} onSelect={() => selectProject(project.id)} />)}</div>}
                    {pagination.totalPages > 1 && <div className="mt-3 flex items-center justify-between rounded-lg border border-[var(--border)] bg-white p-2"><button type="button" className="btn-secondary px-3 py-1.5 text-xs" disabled={page <= 1} onClick={() => setPage(current => Math.max(1, current - 1))}>Previous</button><span className="text-xs font-semibold text-slate-600">Page {pagination.page} of {pagination.totalPages}</span><button type="button" className="btn-secondary px-3 py-1.5 text-xs" disabled={page >= pagination.totalPages} onClick={() => setPage(current => current + 1)}>Next</button></div>}
                </section>

                <section className="min-w-0">
                    {detailLoading ? <div className="rounded-xl border border-[var(--border)] bg-white p-8 text-sm text-slate-500">Loading Project detail…</div> : selected ? <ProjectDetailPanel project={selected} profile={profile} users={users} areas={areas} canManage={canManageSelected} canGovern={canGovernSelected} onEdit={() => setEditor('edit')} onRefresh={refresh} /> : <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center"><div className="text-lg font-bold text-slate-800">Choose a Project</div><p className="mt-2 text-sm text-slate-500">Select a Project to see its outcome, next action, blockers, linked work, people, files, and history.</p></div>}
                </section>
            </div>

            {editor === 'create' && <ProjectEditorDialog key="new-project" open areas={areas} users={users} onClose={() => setEditor(null)} onSave={saveNew} />}
            {editor === 'edit' && selected && <ProjectEditorDialog key={`edit-project-${selected.id}-${selected.updatedAt}`} open project={selected} areas={areas} users={users} canGovern={canGovernSelected} onClose={() => setEditor(null)} onSave={saveEdit} />}
        </div>
    );
}

function ProjectListCard({ project, profile, selected, onSelect }: { project: Project; profile?: UserProfile | null; selected: boolean; onSelect: () => void }) {
    const involvement = projectInvolvement(project, profile);
    return (
        <button type="button" onClick={onSelect} className={`min-w-0 w-full rounded-xl border p-4 text-left shadow-sm transition ${selected ? 'bg-[var(--brand-soft)] ring-2 ring-[var(--brand)]/15' : 'bg-white hover:bg-[#fbfcfa]'} ${involvementSurfaceClass(involvement) || 'border-[var(--border)]'}`} aria-pressed={selected}>
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="mb-1"><InvolvementBadge signal={involvement} compact /></div><h3 className="truncate font-bold text-[#1c231f]">{project.title}</h3><div className="mt-1 truncate text-xs text-slate-500">{project.Lead?.displayName || project.Lead?.email || 'Lead unassigned'}{project.Owner && ` · reports to ${project.Owner.displayName || project.Owner.email}`}</div></div>{project.summary.health && <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${badgeClass(project.summary.health)}`}>{words(project.summary.health)}</span>}</div>
            <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600">{project.intendedOutcome}</p>
            <div className="mt-3 flex items-center gap-3"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-[var(--brand)]" style={{ width: `${project.summary.progressPercent || 0}%` }} /></div><span className="w-9 text-right text-xs font-bold text-slate-600">{project.summary.progressPercent === null ? '—' : `${project.summary.progressPercent}%`}</span></div>
            <div className="mt-3 flex items-center justify-between gap-3 text-xs"><span className={`rounded border px-2 py-0.5 font-semibold ${badgeClass(project.status)}`}>{words(project.status)}</span><span className={project.summary.isPastTarget ? 'font-bold text-red-700' : 'text-slate-500'}>{formatDate(project.targetEndAt)}</span></div>
            <div className="mt-2 truncate text-xs text-slate-500">{project.areaScope === 'ORGANISATION' ? 'Whole organisation' : project.areas.map(area => area.name).filter(Boolean).join(', ')}{project.summary.nextAction ? ` · Next: ${project.summary.nextAction.title}` : ''}</div>
        </button>
    );
}
