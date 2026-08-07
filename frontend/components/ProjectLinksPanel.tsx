'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fetchProjectsForItem } from '../lib/api';
import type { Project, ProjectItemType } from '../lib/api';
import InvolvementBadge from './InvolvementBadge';
import { involvementSurfaceClass, projectInvolvement } from '../lib/involvement';

function words(value?: string | null) {
    return String(value || '').replaceAll('_', ' ').toLowerCase().replace(/^./, match => match.toUpperCase());
}

function badgeClass(value?: string | null) {
    if (value === 'BLOCKED' || value === 'OVERDUE' || value === 'CANCELLED') return 'border-red-200 bg-red-50 text-red-800';
    if (value === 'AT_RISK' || value === 'ON_HOLD') return 'border-amber-200 bg-amber-50 text-amber-800';
    if (value === 'COMPLETED' || value === 'ON_TRACK') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    return 'border-slate-200 bg-slate-50 text-slate-700';
}

export default function ProjectLinksPanel({ itemType, itemId, compact = false }: { itemType: ProjectItemType; itemId: number; compact?: boolean }) {
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;
        fetchProjectsForItem(itemType, itemId)
            .then(rows => { if (!cancelled) { setProjects(rows); setError(''); } })
            .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load linked Projects'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [itemType, itemId]);

    return (
        <div className={`${compact ? 'rounded-md p-3' : 'rounded-lg p-4'} border border-slate-200 bg-slate-50`}>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-600">Projects</div>
            {loading ? <div className="mt-2 text-sm text-slate-500">Loading Project context…</div> : error ? <div className="mt-2 text-sm text-red-700">{error}</div> : projects.length === 0 ? <div className="mt-2 text-sm text-slate-500">Not linked to a Project.</div> : <div className="mt-2 space-y-2">{projects.map(project => {
                const involvement = projectInvolvement(project);
                return <Link key={project.id} href={`/projects?projectId=${project.id}`} className={`block rounded-md border border-slate-200 bg-white p-3 ${involvementSurfaceClass(involvement)}`}><div className="flex flex-wrap items-center justify-between gap-2"><span className="flex min-w-0 items-center gap-2 font-bold text-[#1c231f]"><span className="truncate">{project.title}</span><InvolvementBadge signal={involvement} compact /></span><span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${badgeClass(project.summary.health || project.status)}`}>{words(project.summary.health || project.status)}</span></div><div className="mt-1 text-xs text-slate-500">{project.Owner?.displayName || project.Owner?.email || 'Owner unassigned'}{project.summary.nextAction ? ` · Next: ${project.summary.nextAction.title}` : ''}</div></Link>;
            })}</div>}
        </div>
    );
}
