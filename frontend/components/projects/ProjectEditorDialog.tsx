'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { OperationalArea, Project, ProjectInput, ProjectStatus, Staff } from '../../lib/api';

interface ProjectEditorDialogProps {
    open: boolean;
    project?: Project | null;
    areas: OperationalArea[];
    users: Staff[];
    canGovern?: boolean;
    onClose: () => void;
    onSave: (input: ProjectInput) => Promise<void>;
}

function localDate(value?: string | null) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const offset = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function initialState(project?: Project | null): ProjectInput {
    const linkedAreaIds = project?.areas?.map(area => area.id) || [];
    return {
        title: project?.title || '',
        intendedOutcome: project?.intendedOutcome || '',
        businessContext: project?.businessContext || '',
        status: project?.status || 'PLANNED',
        ownerUserId: project?.ownerUserId || null,
        leadUserId: project?.leadUserId || null,
        plannedStartAt: localDate(project?.plannedStartAt),
        targetEndAt: localDate(project?.targetEndAt),
        riskReason: project?.riskReason || '',
        riskReviewAt: localDate(project?.riskReviewAt),
        areaScope: project?.areaScope || 'ORGANISATION',
        primaryAreaId: project?.primaryAreaId || null,
        linkedAreaIds,
        participantUserIds: project?.Participants?.map(participant => participant.userId) || []
    };
}

function toIsoDate(value?: string | null) {
    return value ? new Date(`${value}T12:00:00`).toISOString() : null;
}

export default function ProjectEditorDialog({ open, project, areas, users, canGovern = true, onClose, onSave }: ProjectEditorDialogProps) {
    const [form, setForm] = useState<ProjectInput>(() => initialState(project));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const dialogRef = useRef<HTMLFormElement>(null);
    const activeUsers = useMemo(() => users.filter(user => user.isActive !== false), [users]);
    const eligibleOwners = useMemo(() => activeUsers.filter(user => {
        if (user.id === form.leadUserId) return false;
        if (['manager', 'admin'].includes(user.role || '')) return true;
        if (project?.ownerUserId === user.id) return true;
        if (form.areaScope !== 'AREAS' || !(form.linkedAreaIds || []).length) return false;
        const managedIds = new Set([
            ...(user.managedAreaIds || []),
            ...(user.areaMemberships || []).filter(membership => membership.membershipRole === 'MANAGER').map(membership => membership.areaId)
        ]);
        return (form.linkedAreaIds || []).every(areaId => managedIds.has(areaId));
    }), [activeUsers, form.areaScope, form.leadUserId, form.linkedAreaIds, project?.ownerUserId]);
    const eligibleLeads = useMemo(() => activeUsers.filter(user => {
        if (user.id === form.ownerUserId) return false;
        if (form.areaScope !== 'AREAS') return true;
        const selectedAreaIds = form.linkedAreaIds || [];
        return selectedAreaIds.some(areaId => (user.areaIds || []).includes(areaId));
    }), [activeUsers, form.areaScope, form.linkedAreaIds, form.ownerUserId]);

    useEffect(() => {
        if (!open) return;
        const closeOrTrapFocus = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
                return;
            }
            if (event.key !== 'Tab' || !dialogRef.current) return;
            const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        };
        document.addEventListener('keydown', closeOrTrapFocus);
        return () => document.removeEventListener('keydown', closeOrTrapFocus);
    }, [open, onClose]);

    if (!open) return null;

    function set<K extends keyof ProjectInput>(key: K, value: ProjectInput[K]) {
        setForm(current => ({ ...current, [key]: value }));
    }

    function toggleArea(areaId: number) {
        const ids = form.linkedAreaIds || [];
        const next = ids.includes(areaId) ? ids.filter(id => id !== areaId) : [...ids, areaId];
        setForm(current => ({
            ...current,
            linkedAreaIds: next,
            primaryAreaId: next.includes(Number(current.primaryAreaId)) ? current.primaryAreaId : next[0] || null
        }));
    }

    function toggleParticipant(userId: number) {
        const ids = form.participantUserIds || [];
        set('participantUserIds', ids.includes(userId) ? ids.filter(id => id !== userId) : [...ids, userId]);
    }

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        if (!form.title.trim() || !form.intendedOutcome.trim()) {
            setError('Add a title and intended outcome.');
            return;
        }
        if (form.areaScope === 'AREAS' && !(form.linkedAreaIds || []).length) {
            setError('Choose at least one participating area.');
            return;
        }
        if (form.status === 'ACTIVE' && (!form.ownerUserId || !form.targetEndAt)) {
            setError('Active Projects require an owner and target date.');
            return;
        }
        if (form.leadUserId && !form.ownerUserId) {
            setError('Assign an accountable owner before appointing a Project Lead.');
            return;
        }
        if (form.leadUserId && !eligibleLeads.some(user => user.id === form.leadUserId)) {
            setError('The Project Lead must belong to at least one participating area and be different from the accountable owner.');
            return;
        }
        setSaving(true);
        setError('');
        try {
            await onSave({
                ...form,
                title: form.title.trim(),
                intendedOutcome: form.intendedOutcome.trim(),
                businessContext: form.businessContext?.trim() || null,
                riskReason: form.riskReason?.trim() || null,
                plannedStartAt: toIsoDate(form.plannedStartAt),
                targetEndAt: toIsoDate(form.targetEndAt),
                riskReviewAt: toIsoDate(form.riskReviewAt),
                primaryAreaId: form.areaScope === 'AREAS' ? form.primaryAreaId : null,
                linkedAreaIds: form.areaScope === 'AREAS' ? form.linkedAreaIds : [],
                participantUserIds: (form.participantUserIds || []).filter(userId => userId !== form.ownerUserId && userId !== form.leadUserId)
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save Project');
        } finally {
            setSaving(false);
        }
    }

    const statuses: ProjectStatus[] = project
        ? ['PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED']
        : ['PLANNED', 'ACTIVE', 'ON_HOLD'];

    const sectionNavigation = [
        { id: 'project-section-outcome', label: 'Outcome' },
        { id: 'project-section-ownership', label: 'Ownership' },
        { id: 'project-section-timeline', label: 'Timeline & risk' },
        { id: 'project-section-areas', label: 'Areas' },
        ...(!project ? [{ id: 'project-section-people', label: 'People' }] : [])
    ];

    function scrollToSection(id: string) {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1c231f]/55 p-3" role="dialog" aria-modal="true" aria-labelledby="project-editor-title">
            <form ref={dialogRef} onSubmit={submit} className="project-editor-form max-h-[calc(100vh-1.5rem)] w-full max-w-5xl overflow-y-auto rounded-2xl border border-[var(--border)] bg-[#f6f8f4] shadow-2xl">
                <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-white/95 backdrop-blur">
                <div className="flex items-start justify-between gap-4 px-5 py-4 sm:px-6">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--brand-strong)]">Project setup</p>
                        <h2 id="project-editor-title" className="mt-0.5 text-xl font-bold text-[#1c231f] sm:text-2xl">{project ? 'Edit Project' : 'Create Project'}</h2>
                        <p className="mt-1 text-sm text-[var(--muted)]">Define the outcome, accountability, participating teams, and delivery horizon.</p>
                    </div>
                    <button type="button" className="icon-button shrink-0" onClick={onClose} aria-label="Close Project editor">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 6 12 12M18 6 6 18" /></svg>
                    </button>
                </div>

                <nav className="overflow-x-auto border-t border-slate-100 px-4 py-2 sm:px-5" aria-label="Project form sections">
                    <div className="flex min-w-max gap-1">
                        {sectionNavigation.map((section, index) => (
                            <button key={section.id} type="button" onClick={() => scrollToSection(section.id)} className="rounded-md px-3 py-2 text-xs font-semibold text-[#536158] transition hover:bg-[var(--brand-soft)] hover:text-[var(--brand-strong)]">
                                <span className="mr-1.5 text-[var(--brand-strong)]">{index + 1}.</span>{section.label}
                            </button>
                        ))}
                    </div>
                </nav>
                </header>

                <div className="space-y-5 p-4 sm:p-6">
                    {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800" role="alert">{error}</div>}
                    {project && !canGovern && <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">As Project Lead, you can coordinate delivery details. The accountable owner, Project Lead appointment, participating areas, and closure remain under management governance.</div>}

                    <ProjectFormSection id="project-section-outcome" number="1" title="Outcome" description="Describe what this Project exists to achieve and why it matters.">
                    <div className="grid gap-5 md:grid-cols-2">
                        <label className="md:col-span-2">
                            <span className="form-label">Project title</span>
                            <input className="input" value={form.title} onChange={event => set('title', event.target.value)} maxLength={255} placeholder="A short, recognisable Project name" autoFocus />
                        </label>
                        <label className="md:col-span-2">
                            <span className="form-label">Intended outcome / definition of success</span>
                            <textarea className="input min-h-28" value={form.intendedOutcome} onChange={event => set('intendedOutcome', event.target.value)} maxLength={10000} placeholder="What will be observably different when this Project succeeds?" />
                        </label>
                        <label className="md:col-span-2">
                            <span className="form-label">Business context</span>
                            <textarea className="input min-h-24" value={form.businessContext || ''} onChange={event => set('businessContext', event.target.value)} maxLength={10000} placeholder="Why now, and what should collaborators understand?" />
                        </label>
                        {!project && <label>
                            <span className="form-label">Status</span>
                            <select className="input" value={form.status} onChange={event => set('status', event.target.value as ProjectStatus)}>
                                {statuses.map(status => <option key={status} value={status}>{status.replaceAll('_', ' ').toLowerCase().replace(/^./, value => value.toUpperCase())}</option>)}
                            </select>
                        </label>}
                    </div>
                    </ProjectFormSection>

                    <ProjectFormSection id="project-section-ownership" number="2" title="Ownership and leadership" description="Separate accountable governance from day-to-day coordination.">
                    <div className="grid gap-5 md:grid-cols-2">
                        <label>
                            <span className="form-label">Accountable owner</span>
                            <select className="input" disabled={Boolean(project && !canGovern)} value={form.ownerUserId || ''} onChange={event => { const ownerUserId = event.target.value ? Number(event.target.value) : null; setForm(current => ({ ...current, ownerUserId, leadUserId: Number(current.leadUserId) === Number(ownerUserId) ? null : current.leadUserId })); }}>
                                <option value="">Unassigned while planning</option>
                                {eligibleOwners.map(user => <option key={user.id} value={user.id}>{user.displayName || user.email}</option>)}
                            </select>
                            <span className="mt-1 block text-xs text-[var(--muted)]">Eligible owners are winery managers or people who manage every selected area.</span>
                        </label>
                        <label>
                            <span className="form-label">Project Lead</span>
                            <select className="input" disabled={Boolean(project && !canGovern)} value={form.leadUserId || ''} onChange={event => set('leadUserId', event.target.value ? Number(event.target.value) : null)}>
                                <option value="">No delegated lead</option>
                                {eligibleLeads.map(user => <option key={user.id} value={user.id}>{user.displayName || user.email}</option>)}
                            </select>
                            <span className="mt-1 block text-xs text-[var(--muted)]">The lead coordinates this Project and reports to the accountable owner; their authority does not extend beyond this Project.</span>
                        </label>
                    </div>
                    </ProjectFormSection>

                    <ProjectFormSection id="project-section-timeline" number="3" title="Timeline and risk" description="Set the delivery horizon and make broader Project risks explicit.">
                    <div className="grid gap-5 md:grid-cols-2">
                        <label>
                            <span className="form-label">Planned start</span>
                            <input type="date" className="input" value={String(form.plannedStartAt || '')} onChange={event => set('plannedStartAt', event.target.value)} />
                        </label>
                        <label>
                            <span className="form-label">Target completion</span>
                            <input type="date" className="input" value={String(form.targetEndAt || '')} onChange={event => set('targetEndAt', event.target.value)} />
                            {form.status === 'ACTIVE' && <span className="mt-1 block text-xs text-[var(--muted)]">Required for an active Project.</span>}
                        </label>
                        <label className="md:col-span-2">
                            <span className="form-label">Current risk / blocker context</span>
                            <textarea className="input min-h-24" value={form.riskReason || ''} onChange={event => set('riskReason', event.target.value)} maxLength={5000} placeholder="Leave blank when no broader Project-level risk is known." />
                        </label>
                        <label>
                            <span className="form-label">Risk review date</span>
                            <input type="date" className="input" value={String(form.riskReviewAt || '')} onChange={event => set('riskReviewAt', event.target.value)} />
                        </label>
                    </div>
                    </ProjectFormSection>

                    <ProjectFormSection id="project-section-areas" number="4" title="Visibility and participating areas" description="Choose who needs Project context and which departments are contributing.">
                    <fieldset disabled={Boolean(project && !canGovern)}>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className={`rounded-lg border p-4 transition ${form.areaScope === 'ORGANISATION' ? 'border-[var(--brand)] bg-[var(--brand-soft)] ring-1 ring-[var(--brand)]' : 'border-[var(--border)] hover:bg-[#f8faf6]'}`}>
                                <span className="flex items-center gap-2"><input type="radio" checked={form.areaScope === 'ORGANISATION'} onChange={() => set('areaScope', 'ORGANISATION')} /><span className="font-semibold">Whole organisation</span></span>
                                <span className="mt-1.5 block pl-5 text-xs leading-5 text-[var(--muted)]">Shared winery-wide context without a departmental boundary.</span>
                            </label>
                            <label className={`rounded-lg border p-4 transition ${form.areaScope === 'AREAS' ? 'border-[var(--brand)] bg-[var(--brand-soft)] ring-1 ring-[var(--brand)]' : 'border-[var(--border)] hover:bg-[#f8faf6]'}`}>
                                <span className="flex items-center gap-2"><input type="radio" checked={form.areaScope === 'AREAS'} onChange={() => set('areaScope', 'AREAS')} /><span className="font-semibold">Selected areas</span></span>
                                <span className="mt-1.5 block pl-5 text-xs leading-5 text-[var(--muted)]">Coordinate only the departments participating in delivery.</span>
                            </label>
                        </div>
                        {form.areaScope === 'AREAS' && (
                            <div className="mt-4 rounded-lg border border-[var(--border)] bg-[#fbfcfa] p-3">
                                <div className="mb-2 flex items-center justify-between px-1 text-xs font-semibold text-[var(--muted)]"><span>Participating departments</span><span>{(form.linkedAreaIds || []).length} selected</span></div>
                                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                {areas.map(area => (
                                    <div key={area.id} className={`flex items-center justify-between rounded-md border bg-white px-3 py-2.5 ${(form.linkedAreaIds || []).includes(area.id) ? 'border-[var(--brand)]' : 'border-[var(--border)]'}`}>
                                        <label className="flex min-w-0 items-center gap-2 text-sm font-medium">
                                            <input type="checkbox" checked={(form.linkedAreaIds || []).includes(area.id)} onChange={() => toggleArea(area.id)} />
                                            <span className="truncate">{area.name}</span>
                                        </label>
                                        {(form.linkedAreaIds || []).includes(area.id) && (
                                            <label className="ml-2 text-xs text-[var(--muted)]">
                                                <input type="radio" name="primaryArea" className="mr-1" checked={Number(form.primaryAreaId) === area.id} onChange={() => set('primaryAreaId', area.id)} />Primary
                                            </label>
                                        )}
                                    </div>
                                ))}
                                </div>
                            </div>
                        )}
                    </fieldset>
                    </ProjectFormSection>

                    {!project && (
                        <ProjectFormSection id="project-section-people" number="5" title="Initial participants" description={`${(form.participantUserIds || []).length} selected. Participants can follow the Project without receiving lead or owner authority.`}>
                        <fieldset>
                            <div className="grid max-h-56 gap-2 overflow-y-auto rounded-lg border border-[var(--border)] bg-[#fbfcfa] p-3 sm:grid-cols-2 lg:grid-cols-3">
                                {activeUsers.filter(user => user.id !== form.ownerUserId && user.id !== form.leadUserId).map(user => (
                                    <label key={user.id} className={`flex items-center gap-2 rounded-md border bg-white px-3 py-2.5 text-sm transition hover:border-slate-300 ${(form.participantUserIds || []).includes(user.id) ? 'border-[var(--brand)] bg-[var(--brand-soft)]' : 'border-slate-200'}`}>
                                        <input type="checkbox" checked={(form.participantUserIds || []).includes(user.id)} onChange={() => toggleParticipant(user.id)} />
                                        <span className="min-w-0"><span className="block truncate font-medium">{user.displayName || user.email}</span><span className="block truncate text-[11px] text-[var(--muted)]">{user.role || 'Staff'}</span></span>
                                    </label>
                                ))}
                            </div>
                        </fieldset>
                        </ProjectFormSection>
                    )}
                </div>

                <div className="sticky bottom-0 z-20 flex items-center gap-2 border-t border-[var(--border)] bg-white/95 px-5 py-4 backdrop-blur sm:px-6">
                    <span className="hidden text-xs text-[var(--muted)] sm:block">Fields can be refined as delivery progresses.</span>
                    <button type="button" className="btn-secondary ml-auto" onClick={onClose} disabled={saving}>Cancel</button>
                    <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : project ? 'Save changes' : 'Create Project'}</button>
                </div>
            </form>
        </div>
    );
}

function ProjectFormSection({ id, number, title, description, children }: {
    id: string;
    number: string;
    title: string;
    description: string;
    children: React.ReactNode;
}) {
    return (
        <section id={id} className="scroll-mt-40 rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-5 flex items-start gap-3 border-b border-slate-100 pb-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)] text-xs font-bold text-[var(--brand-strong)]">{number}</span>
                <div>
                    <h3 className="font-bold text-[#1c231f]">{title}</h3>
                    <p className="mt-0.5 text-sm leading-5 text-[var(--muted)]">{description}</p>
                </div>
            </div>
            {children}
        </section>
    );
}
