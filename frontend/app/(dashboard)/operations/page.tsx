'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
    OperationalArea,
    OperationalItemType,
    OperationsFeedResponse,
    fetchOperationalAreas,
    fetchOperations,
    getMyProfile,
    UserProfile
} from '../../../lib/api';
import { operationalLabel } from '../../../lib/operationalPresentation';
import WorkSubnav from '../../../components/WorkSubnav';
import InvolvementBadge from '../../../components/InvolvementBadge';
import { involvementSurfaceClass, operationInvolvement } from '../../../lib/involvement';

const TYPE_ORDER: OperationalItemType[] = ['TASK', 'NOTICE', 'REQUEST', 'NOTE'];
const TYPE_LABELS: Record<OperationalItemType, string> = {
    TASK: 'Tasks', NOTICE: 'Notices', REQUEST: 'Requests', NOTE: 'Notes'
};

export default function OperationsPage() {
    const [data, setData] = useState<OperationsFeedResponse | null>(null);
    const [areas, setAreas] = useState<OperationalArea[]>([]);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [types, setTypes] = useState<OperationalItemType[]>(TYPE_ORDER);
    const [search, setSearch] = useState('');
    const [areaId, setAreaId] = useState<string>('all');
    const [status, setStatus] = useState('ALL');
    const [sortBy, setSortBy] = useState<'newest' | 'oldest'>('newest');
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        Promise.all([fetchOperationalAreas(), getMyProfile()])
            .then(([areaData, profileData]) => { setAreas(areaData); setProfile(profileData.user); })
            .catch(() => setAreas([]));
    }, []);

    useEffect(() => {
        const timer = setTimeout(async () => {
            setLoading(true);
            try {
                setData(await fetchOperations({ types, search, areaId, status, sortBy, page, pageSize: 25 }));
                setError('');
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load operations');
            } finally {
                setLoading(false);
            }
        }, 250);
        return () => clearTimeout(timer);
    }, [types, search, areaId, status, sortBy, page]);

    function toggleType(type: OperationalItemType) {
        setPage(1);
        setTypes(current => {
            if (current.includes(type)) {
                return current.length === 1 ? current : current.filter(value => value !== type);
            }
            return TYPE_ORDER.filter(value => current.includes(value) || value === type);
        });
    }

    return (
        <div className="space-y-5">
            <header>
                <h1 className="page-title">Search all work</h1>
                <p className="page-kicker">Find Tasks, Notices, Requests, and Notes together while each record remains in its authoritative workspace.</p>
            </header>

            <WorkSubnav />

            <section className="rounded-xl border border-[var(--border)] bg-white p-4 shadow-sm">
                <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_180px_170px_130px]">
                    <input
                        value={search}
                        onChange={event => { setSearch(event.target.value); setPage(1); }}
                        placeholder="Search titles, details, comments, customers or file names"
                        className="rounded-md border border-[var(--border)] px-3 py-2 text-sm"
                    />
                    <select value={areaId} onChange={event => { setAreaId(event.target.value); setPage(1); }} className="rounded-md border border-[var(--border)] px-3 py-2 text-sm">
                        <option value="all">All areas</option>
                        <option value="organisation">Whole winery</option>
                        {areas.map(area => <option key={area.id} value={area.id}>{area.name}</option>)}
                    </select>
                    <select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }} className="rounded-md border border-[var(--border)] px-3 py-2 text-sm">
                        <option value="ALL">All statuses</option>
                        <option value="PENDING">Pending</option>
                        <option value="ACTIONED">Actioned tasks</option>
                        <option value="APPROVED">Approved requests</option>
                        <option value="REJECTED">Rejected</option>
                        <option value="ACTIVE">Active notices</option>
                        <option value="ARCHIVED">Archived notices</option>
                        <option value="RECORDED">Recorded notes</option>
                    </select>
                    <select value={sortBy} onChange={event => { setSortBy(event.target.value as 'newest' | 'oldest'); setPage(1); }} className="rounded-md border border-[var(--border)] px-3 py-2 text-sm">
                        <option value="newest">Newest</option><option value="oldest">Oldest</option>
                    </select>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                    {TYPE_ORDER.map(type => {
                        const active = types.includes(type);
                        return (
                            <button key={type} type="button" onClick={() => toggleType(type)} className={`rounded-full border px-3 py-1.5 text-sm font-bold ${active ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-strong)]' : 'border-[var(--border)] text-[var(--muted)]'}`}>
                                {TYPE_LABELS[type]} <span className="ml-1 text-xs">{data?.counts[type] ?? 0}</span>
                            </button>
                        );
                    })}
                </div>
            </section>

            {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

            <section className="space-y-3">
                {loading ? <div className="py-14 text-center text-[var(--muted)]">Searching operations…</div> : !data?.operations.length ? (
                    <div className="rounded-xl border border-dashed border-[var(--border)] bg-white py-14 text-center text-[var(--muted)]">No matching operational records.</div>
                ) : data.operations.map(item => {
                    const involvement = operationInvolvement(item, profile);
                    return (
                    <Link key={item.key} href={item.href} className={`block rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm transition hover:shadow-md ${involvementSurfaceClass(involvement)}`}>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded bg-[#e9eee5] px-2 py-1 text-[11px] font-bold text-[#40503f]">{operationalLabel(item.type)}</span>
                                    <InvolvementBadge signal={involvement} />
                                    <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-xs font-semibold">{operationalLabel(item.status)}</span>
                                    {item.priority && <span className="text-xs font-semibold text-[var(--muted)]">{operationalLabel(item.priority)}</span>}
                                </div>
                                <h2 className="mt-2 truncate text-lg font-bold text-[#1c231f]">{item.title}</h2>
                                {item.bodyPreview && <p className="mt-1 text-sm text-[#536158]">{item.bodyPreview}</p>}
                                <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
                                    {item.areas.length > 0 ? item.areas.map(area => <span key={area.id} className="rounded-full border border-[var(--border)] px-2 py-0.5">{area.name}</span>) : <span>Whole winery</span>}
                                    {item.owner?.displayName && <span>Owner: {item.owner.displayName}</span>}
                                </div>
                            </div>
                            <time className="shrink-0 text-xs text-[var(--muted)]">{new Date(item.eventAt).toLocaleString()}</time>
                        </div>
                    </Link>
                );})}
            </section>

            {data && data.pagination.totalPages > 1 && (
                <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-white p-3">
                    <button disabled={page <= 1} onClick={() => setPage(value => value - 1)} className="rounded border border-[var(--border)] px-3 py-2 text-sm font-bold disabled:opacity-40">Previous</button>
                    <span className="text-sm text-[var(--muted)]">Page {page} of {data.pagination.totalPages} · {data.pagination.total} records</span>
                    <button disabled={page >= data.pagination.totalPages} onClick={() => setPage(value => value + 1)} className="rounded border border-[var(--border)] px-3 py-2 text-sm font-bold disabled:opacity-40">Next</button>
                </div>
            )}
        </div>
    );
}
