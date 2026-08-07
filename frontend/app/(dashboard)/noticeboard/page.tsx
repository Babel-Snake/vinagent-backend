'use client';

import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
    acknowledgeNotice,
    archiveNotice,
    createNoticeComment,
    createNotice,
    deleteNoticeComment,
    fetchNoticeComments,
    fetchNotices,
    getNotice,
    getMyProfile,
    getUsers,
    linkNoticeTask,
    Notice,
    NoticeAudienceType,
    NoticeCategory,
    NoticeComment,
    NoticeInput,
    NoticePriority,
    OperationalArea,
    Pagination as PaginationMeta,
    fetchOperationalAreas,
    Staff,
    UserProfile,
    unlinkNoticeTask,
    updateNotice
} from '../../../lib/api';
import CalendarEventPicker, { CalendarEventSelection } from '../../../components/CalendarEventPicker';
import AttachmentPanel from '../../../components/AttachmentPanel';
import ProjectLinksPanel from '../../../components/ProjectLinksPanel';
import Pagination from '../../../components/Pagination';
import TaskLinkPicker from '../../../components/TaskLinkPicker';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import { clientLogger } from '../../../lib/clientLogger';
import { operationalLabel } from '../../../lib/operationalPresentation';
import InvolvementBadge from '../../../components/InvolvementBadge';
import { involvementSurfaceClass, noticeInvolvement, taskInvolvement } from '../../../lib/involvement';

const NOTICE_CATEGORIES: NoticeCategory[] = [
    'GENERAL',
    'WINE',
    'VINTAGE_CHANGE',
    'PRICING',
    'STOCK',
    'CUSTOMERS',
    'MAINTENANCE',
    'EVENTS',
    'STAFF',
    'WINE_CLUB',
    'URGENT'
];

const NOTICE_PRIORITIES: NoticePriority[] = ['normal', 'important', 'urgent'];
const NOTICE_AUDIENCE_ROLES = ['staff', 'manager', 'admin'];

function categoryLabel(category: string) {
    return category
        .toLowerCase()
        .split('_')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function priorityLabel(priority: string) {
    return priority.charAt(0).toUpperCase() + priority.slice(1);
}

function roleLabel(role: string) {
    return role.charAt(0).toUpperCase() + role.slice(1);
}

function audienceLabel(notice: Pick<Notice, 'audienceType' | 'audienceRoles' | 'audienceUserIds'>, users: Staff[] = []) {
    if (!notice.audienceType || notice.audienceType === 'all_staff') return 'All staff';

    if (notice.audienceType === 'roles') {
        const roles = notice.audienceRoles || [];
        return roles.length > 0 ? roles.map(roleLabel).join(', ') : 'Selected roles';
    }

    const userIds = new Set((notice.audienceUserIds || []).map(Number));
    const names = users
        .filter(user => userIds.has(user.id))
        .map(user => user.displayName || user.email || `User #${user.id}`);

    if (names.length > 0) return names.join(', ');
    return userIds.size === 1 ? 'Selected staff member' : 'Selected staff';
}

function formatDate(value?: string | null) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString('en-AU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
}

function formatDateTime(value?: string | null) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleString('en-AU', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit'
    });
}

function countNoticeComments(comments: NoticeComment[]): number {
    return comments.reduce((total, comment) => total + 1 + countNoticeComments(comment.Replies || []), 0);
}

function toDateInputValue(value?: string | null) {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
}

function fromStartDateValue(value: string) {
    return value ? new Date(`${value}T00:00:00`).toISOString() : null;
}

function fromEndDateValue(value: string) {
    return value ? new Date(`${value}T23:59:59.999`).toISOString() : null;
}

export default function NoticeBoardPage() {
    const searchParams = useSearchParams();
    const [notices, setNotices] = useState<Notice[]>([]);
    const [users, setUsers] = useState<Staff[]>([]);
    const [areas, setAreas] = useState<OperationalArea[]>([]);
    const [userRole, setUserRole] = useState<string | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editingNotice, setEditingNotice] = useState<Notice | null>(null);
    const [viewingNotice, setViewingNotice] = useState<Notice | null>(null);
    const [noticePendingArchive, setNoticePendingArchive] = useState<Notice | null>(null);
    const [archivingId, setArchivingId] = useState<number | null>(null);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);
    const [pagination, setPagination] = useState<PaginationMeta>({ total: 0, page: 1, pageSize: 50, totalPages: 1 });
    const [filters, setFilters] = useState({
        search: '',
        category: 'all',
        priority: 'all',
        status: 'active',
        pinned: 'all',
        authorId: 'all',
        areaId: 'all',
        sortBy: 'default',
        dateFrom: '',
        dateTo: '',
        effectiveFrom: '',
        effectiveTo: ''
    });

    const canManage = userRole === 'manager' || userRole === 'admin'
        || areas.some(area => area.myMembership?.membershipRole === 'MANAGER');

    useEffect(() => {
        let cancelled = false;

        async function loadUserContext() {
            try {
                const [profile, staff, operationalAreas] = await Promise.all([
                    getMyProfile(),
                    getUsers().catch(() => []),
                    fetchOperationalAreas().catch(() => [])
                ]);

                if (!cancelled) {
                    setUserRole(profile?.user?.role || null);
                    setProfile(profile?.user || null);
                    setUsers(staff);
                    setAreas(operationalAreas);
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Failed to load user profile');
                }
            }
        }

        loadUserContext();
        return () => {
            cancelled = true;
        };
    }, []);

    async function loadNotices() {
        try {
            setLoading(true);
            const data = await fetchNotices({ ...filters, page, pageSize });
            setNotices(data.notices);
            setPagination(data.pagination);
            setError('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load notices');
        } finally {
            setLoading(false);
        }
    }

    const loadNoticesFromEffect = useEffectEvent(() => {
        void loadNotices();
    });

    useEffect(() => {
        const timer = setTimeout(() => {
            loadNoticesFromEffect();
        }, 300);

        return () => clearTimeout(timer);
    }, [filters, page, pageSize]);

    useEffect(() => {
        const noticeId = searchParams.get('noticeId');
        if (!noticeId) return;

        let cancelled = false;

        async function loadDeepLinkedNotice() {
            try {
                const notice = await getNotice(Number(noticeId));
                if (!cancelled) setViewingNotice(notice);
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Failed to open notice');
                }
            }
        }

        loadDeepLinkedNotice();
        return () => {
            cancelled = true;
        };
    }, [searchParams]);

    const stats = useMemo(() => ({
        matching: pagination.total,
        pinned: notices.filter(notice => notice.isPinned).length,
        urgent: notices.filter(notice => notice.priority === 'urgent').length,
        important: notices.filter(notice => notice.priority === 'important').length,
        expired: notices.filter(notice => notice.isExpired).length,
        archived: notices.filter(notice => notice.isArchived).length
    }), [notices, pagination.total]);

    function handleFilterChange(field: string, value: string) {
        setFilters(prev => ({ ...prev, [field]: value }));
        setPage(1);
    }

    function handlePageChange(nextPage: number) {
        const boundedPage = Math.min(Math.max(nextPage, 1), Math.max(pagination.totalPages, 1));
        if (boundedPage !== page) setPage(boundedPage);
    }

    function handlePageSizeChange(nextPageSize: number) {
        setPageSize(nextPageSize);
        setPage(1);
    }

    async function archivePendingNotice() {
        const notice = noticePendingArchive;
        if (!notice) return;
        setArchivingId(notice.id);
        try {
            await archiveNotice(notice.id);
            await loadNotices();
        } finally {
            setArchivingId(null);
        }
    }

    return (
        <div className="page-shell">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Noticeboard</h1>
                    <p className="page-kicker">
                        Shared internal notices, operational updates, and time-aware context for the winery team.
                    </p>
                </div>
                {canManage && (
                    <button
                        type="button"
                        onClick={() => setShowCreateModal(true)}
                        className="btn-primary shrink-0"
                    >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14m7-7H5" />
                        </svg>
                        New Notice
                    </button>
                )}
            </div>

            {error && (
                <div className="mb-5 rounded-md border border-red-200 bg-red-50 p-4">
                    <p className="text-sm font-medium text-red-800">{error}</p>
                </div>
            )}

            <section className="mb-5" aria-labelledby="notice-signals-heading">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                    <h2 id="notice-signals-heading" className="text-sm font-bold uppercase tracking-wider text-[#344039]">Current page signals</h2>
                    <p className="text-xs text-[var(--muted)]">The matching total is exact; the remaining signals describe this page.</p>
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                <NoticeMetric label="Matching" value={stats.matching} tone="slate" />
                <NoticeMetric label="Pinned" value={stats.pinned} tone="brand" />
                <NoticeMetric label="Urgent" value={stats.urgent} tone="red" />
                <NoticeMetric label="Important" value={stats.important} tone="amber" />
                <NoticeMetric label="Expired" value={stats.expired} tone="orange" />
                <NoticeMetric label="Archived" value={stats.archived} tone="teal" />
                </div>
            </section>

            <div className="surface-panel mb-5 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
                    <div className="flex-1">
                        <label className="mb-1.5 block text-xs font-bold uppercase text-[var(--muted)]">Search Notices</label>
                        <input
                            type="text"
                            className="form-control"
                            value={filters.search}
                            onChange={(e) => handleFilterChange('search', e.target.value)}
                            placeholder="Search notices by title or content..."
                        />
                    </div>
                    <div className="w-full md:w-48">
                        <label className="mb-1.5 block text-xs font-bold uppercase text-[var(--muted)]">Status</label>
                        <select
                            className="form-control font-medium"
                            value={filters.status}
                            onChange={(e) => handleFilterChange('status', e.target.value)}
                        >
                            <option value="active">Active</option>
                            <option value="expired">Expired</option>
                            <option value="archived">Archived</option>
                            <option value="all">All Notices</option>
                        </select>
                    </div>
                    <div className="w-full md:w-48">
                        <label className="mb-1.5 block text-xs font-bold uppercase text-[var(--muted)]">Priority</label>
                        <select
                            className="form-control"
                            value={filters.priority}
                            onChange={(e) => handleFilterChange('priority', e.target.value)}
                        >
                            <option value="all">All Priorities</option>
                            {NOTICE_PRIORITIES.map(priority => (
                                <option key={priority} value={priority}>{priorityLabel(priority)}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => handleFilterChange('pinned', filters.pinned === 'true' ? 'all' : 'true')}
                            className={`btn-secondary ${filters.pinned === 'true' ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-strong)]' : ''}`}
                        >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m12 3 3 6 6 .9-4.5 4.4 1.1 6.2L12 17.6 6.4 20.5l1.1-6.2L3 9.9 9 9l3-6Z" />
                            </svg>
                            Pinned
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowAdvanced(prev => !prev)}
                            className={`btn-secondary ${showAdvanced ? 'border-teal-200 bg-teal-50 text-teal-800' : ''}`}
                        >
                            <svg className={`h-4 w-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m19 9-7 7-7-7" />
                            </svg>
                            {showAdvanced ? 'Less Filters' : 'More Filters'}
                        </button>
                    </div>
                </div>

                {showAdvanced && (
                    <div className="mt-5 border-t border-[var(--border)] pt-5">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                            <div>
                                <label className="mb-1.5 block text-xs font-semibold uppercase text-[var(--muted)]">Category</label>
                                <select
                                    className="form-control"
                                    value={filters.category}
                                    onChange={(e) => handleFilterChange('category', e.target.value)}
                                >
                                    <option value="all">All Categories</option>
                                    {NOTICE_CATEGORIES.map(category => (
                                        <option key={category} value={category}>{categoryLabel(category)}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="mb-1.5 block text-xs font-semibold uppercase text-[var(--muted)]">Operational Area</label>
                                <select
                                    className="form-control"
                                    value={filters.areaId}
                                    onChange={(e) => handleFilterChange('areaId', e.target.value)}
                                >
                                    <option value="all">All visible areas</option>
                                    <option value="organisation">Organisation-wide</option>
                                    {areas.map(area => <option key={area.id} value={area.id}>{area.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="mb-1.5 block text-xs font-semibold uppercase text-[var(--muted)]">Author</label>
                                <select
                                    className="form-control"
                                    value={filters.authorId}
                                    onChange={(e) => handleFilterChange('authorId', e.target.value)}
                                >
                                    <option value="all">All Authors</option>
                                    {users.map(user => (
                                        <option key={user.id} value={user.id}>{user.displayName || user.email}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="mb-1.5 block text-xs font-semibold uppercase text-[var(--muted)]">Sort By</label>
                                <select
                                    className="form-control"
                                    value={filters.sortBy}
                                    onChange={(e) => handleFilterChange('sortBy', e.target.value)}
                                >
                                    <option value="default">Default Priority</option>
                                    <option value="effective">Effective Date</option>
                                    <option value="oldest">Oldest First</option>
                                </select>
                            </div>
                            <div>
                                <label className="mb-1.5 block text-xs font-semibold uppercase text-[var(--muted)]">Pinned</label>
                                <select
                                    className="form-control"
                                    value={filters.pinned}
                                    onChange={(e) => handleFilterChange('pinned', e.target.value)}
                                >
                                    <option value="all">Any</option>
                                    <option value="true">Pinned Only</option>
                                    <option value="false">Not Pinned</option>
                                </select>
                            </div>
                            <div>
                                <label className="mb-1.5 block text-xs font-semibold uppercase text-[var(--muted)]">Created From</label>
                                <input
                                    type="date"
                                    className="form-control"
                                    value={filters.dateFrom}
                                    onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="mb-1.5 block text-xs font-semibold uppercase text-[var(--muted)]">Created To</label>
                                <input
                                    type="date"
                                    className="form-control"
                                    value={filters.dateTo}
                                    onChange={(e) => handleFilterChange('dateTo', e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="mb-1.5 block text-xs font-semibold uppercase text-[var(--muted)]">Start From</label>
                                <input
                                    type="date"
                                    className="form-control"
                                    value={filters.effectiveFrom}
                                    onChange={(e) => handleFilterChange('effectiveFrom', e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="mb-1.5 block text-xs font-semibold uppercase text-[var(--muted)]">Start To</label>
                                <input
                                    type="date"
                                    className="form-control"
                                    value={filters.effectiveTo}
                                    onChange={(e) => handleFilterChange('effectiveTo', e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {loading ? (
                <div className="surface-panel py-14 text-center">
                    <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-[#d9dfd2] border-t-[var(--brand)]"></div>
                    <p className="mt-3 text-sm font-medium text-[var(--muted)]">Loading notices...</p>
                </div>
            ) : notices.length === 0 ? (
                <div className="empty-state">
                    <div>
                        <div className="text-sm font-semibold text-[#344039]">No notices match this view.</div>
                        <div className="mt-1 text-sm">Try clearing filters or checking archived notices.</div>
                    </div>
                </div>
            ) : (
                <div className="space-y-3">
                    {notices.map(notice => (
                        <NoticeCard
                            key={notice.id}
                            notice={notice}
                            profile={profile}
                            users={users}
                            canManage={canManage}
                            archiving={archivingId === notice.id}
                            onOpen={() => setViewingNotice(notice)}
                            onEdit={() => setEditingNotice(notice)}
                            onArchive={() => setNoticePendingArchive(notice)}
                            onRefresh={loadNotices}
                        />
                    ))}
                </div>
            )}

            {!loading && (
                <Pagination
                    pagination={pagination}
                    itemLabel="notice"
                    onPageChange={handlePageChange}
                    onPageSizeChange={handlePageSizeChange}
                    pageSizeOptions={[20, 50, 100]}
                />
            )}

            {showCreateModal && (
                <NoticeFormModal
                    mode="create"
                    users={users}
                    areas={areas}
                    canManageOrganisation={userRole === 'manager' || userRole === 'admin'}
                    onClose={() => setShowCreateModal(false)}
                    onSaved={async () => {
                        setShowCreateModal(false);
                        await loadNotices();
                    }}
                />
            )}

            {viewingNotice && (
                <NoticeDetailModal
                    notice={viewingNotice}
                    profile={profile}
                    users={users}
                    canManage={canManage}
                    onClose={() => setViewingNotice(null)}
                    onEdit={() => {
                        setEditingNotice(viewingNotice);
                        setViewingNotice(null);
                    }}
                />
            )}

            {editingNotice && (
                <NoticeFormModal
                    mode="edit"
                    notice={editingNotice}
                    users={users}
                    areas={areas}
                    canManageOrganisation={userRole === 'manager' || userRole === 'admin'}
                    onClose={() => setEditingNotice(null)}
                    onSaved={async () => {
                        setEditingNotice(null);
                        await loadNotices();
                    }}
                />
            )}

            <ConfirmDialog
                open={Boolean(noticePendingArchive)}
                onClose={() => setNoticePendingArchive(null)}
                onConfirm={archivePendingNotice}
                title="Archive notice?"
                description={noticePendingArchive ? `“${noticePendingArchive.title}” will be removed from active noticeboard views.` : ''}
                confirmLabel="Archive notice"
                destructive
            />
        </div>
    );
}

function NoticeCard({
    notice,
    profile,
    users,
    canManage,
    archiving,
    onOpen,
    onEdit,
    onArchive,
    onRefresh
}: {
    notice: Notice;
    profile?: UserProfile | null;
    users: Staff[];
    canManage: boolean;
    archiving: boolean;
    onOpen: () => void;
    onEdit: () => void;
    onArchive: () => void;
    onRefresh: () => void | Promise<void>;
}) {
    const [linking, setLinking] = useState(false);
    const [linkError, setLinkError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [acknowledging, setAcknowledging] = useState(false);
    const author = notice.Author?.displayName || notice.Author?.email || 'Unknown author';
    const created = formatDate(notice.createdAt);
    const effective = formatDate(notice.effectiveFrom);
    const expires = formatDate(notice.expiresAt);
    const archived = formatDateTime(notice.archivedAt);
    const linkedTasks = notice.LinkedTasks || [];
    const audience = audienceLabel(notice, users);
    const involvement = noticeInvolvement(notice, profile);

    async function handleLinkTask(taskId: number) {
        setLinking(true);
        setLinkError(null);
        setActionError(null);
        try {
            await linkNoticeTask(notice.id, taskId);
            await onRefresh();
        } catch (err) {
            setLinkError(err instanceof Error ? err.message : 'Failed to link task');
        } finally {
            setLinking(false);
        }
    }

    async function handleUnlinkTask(taskId: number) {
        setLinking(true);
        setActionError(null);
        try {
            await unlinkNoticeTask(notice.id, taskId);
            await onRefresh();
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Failed to unlink task');
        } finally {
            setLinking(false);
        }
    }

    async function handleAcknowledge() {
        setAcknowledging(true);
        setActionError(null);
        try {
            await acknowledgeNotice(notice.id);
            await onRefresh();
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Failed to acknowledge notice');
        } finally {
            setAcknowledging(false);
        }
    }

    const cardTone = notice.isArchived
        ? 'border-slate-200 bg-slate-50'
        : notice.priority === 'urgent'
            ? 'border-red-300 bg-white'
            : notice.isPinned
                ? 'border-[var(--brand)] bg-white'
                : 'border-[var(--border)] bg-[var(--surface)]';

    return (
        <article className={`rounded-lg border p-4 shadow-sm ${cardTone} ${involvementSurfaceClass(involvement)}`}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                        <InvolvementBadge signal={involvement} />
                        {notice.isPinned && <NoticeBadge tone="brand" label="Pinned" />}
                        <NoticeBadge tone={notice.priority === 'urgent' ? 'red' : notice.priority === 'important' ? 'amber' : 'slate'} label={priorityLabel(notice.priority)} />
                        <NoticeBadge tone="teal" label={categoryLabel(notice.category)} />
                        {notice.isExpired && <NoticeBadge tone="orange" label="Expired" />}
                        {notice.isArchived && <NoticeBadge tone="slate" label="Archived" />}
                        {notice.requiresAcknowledgement && <NoticeBadge tone={notice.acknowledgement?.isOverdue ? 'red' : 'brand'} label="Acknowledgement required" />}
                    </div>
                    <button
                        type="button"
                        onClick={onOpen}
                        className="block max-w-full text-left"
                    >
                        <h2 className="break-words text-lg font-semibold text-[#1c231f] hover:text-[var(--brand-strong)]">{notice.title}</h2>
                    </button>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[#344039]">
                        {notice.bodyPreview || notice.body}
                    </p>
                    <button
                        type="button"
                        onClick={onOpen}
                        className="mt-2 text-sm font-semibold text-[var(--brand-strong)] hover:underline"
                    >
                        View full notice
                    </button>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-[var(--muted)]">
                        <span>By {author}</span>
                        <span>To {audience}</span>
                        <span>{notice.areaScope === 'AREAS' && notice.OperationalAreas?.length
                            ? notice.OperationalAreas.map(area => area.name).join(' + ')
                            : 'Organisation-wide'}</span>
                        {created && <span>Created {created}</span>}
                        {effective && <span>Starts {effective}</span>}
                        {expires && <span>Ends {expires}</span>}
                        {archived && <span>Archived {archived}</span>}
                    </div>
                    {actionError && <p role="alert" className="mt-3 text-sm text-red-700">{actionError}</p>}
                    {notice.requiresAcknowledgement && (
                        <div className={`mt-4 rounded-lg border p-3 ${notice.acknowledgement?.isOverdue ? 'border-red-200 bg-red-50' : 'border-lime-200 bg-lime-50'}`}>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <div className="text-sm font-semibold text-[#344039]">
                                        {notice.acknowledgement?.acknowledgedCount || 0} of {notice.acknowledgement?.expectedCount || 0} acknowledged
                                    </div>
                                    <div className="mt-0.5 text-xs text-[var(--muted)]">
                                        {notice.acknowledgementDueAt ? `Due ${formatDate(notice.acknowledgementDueAt)}` : 'No acknowledgement deadline'}
                                    </div>
                                </div>
                                {notice.acknowledgement?.currentUserExpected && !notice.acknowledgement.currentUserAcknowledgedAt && !notice.isArchived && (
                                    <button type="button" onClick={handleAcknowledge} disabled={acknowledging} className="btn-primary">
                                        {acknowledging ? 'Acknowledging...' : 'I have read this'}
                                    </button>
                                )}
                                {notice.acknowledgement?.currentUserAcknowledgedAt && (
                                    <span className="text-sm font-semibold text-emerald-700">Acknowledged</span>
                                )}
                            </div>
                        </div>
                    )}
                    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                Linked Tasks
                            </div>
                            <div className="text-xs font-medium text-slate-500">
                                {linkedTasks.length} linked
                            </div>
                        </div>
                        {linkedTasks.length === 0 ? (
                            <div className="text-sm text-slate-600">No tasks linked to this notice yet.</div>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {linkedTasks.map(task => {
                                    const taskSignal = taskInvolvement(task, profile);
                                    return (
                                    <div key={task.id} className={`flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 ${involvementSurfaceClass(taskSignal)}`}>
                                        <span className="font-semibold">Task #{task.id}</span>
                                        <InvolvementBadge signal={taskSignal} compact />
                                        <span>{operationalLabel(task.subType || task.category)}</span>
                                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold uppercase">{task.status}</span>
                                        {canManage && (
                                            <button
                                                type="button"
                                                onClick={() => handleUnlinkTask(task.id)}
                                                disabled={linking}
                                                className="text-red-600 hover:text-red-800"
                                                aria-label={`Unlink task ${task.id}`}
                                            >
                                                Unlink
                                            </button>
                                        )}
                                    </div>
                                );})}
                            </div>
                        )}
                        {canManage && (
                            <div className="mt-3 max-w-xl">
                                <TaskLinkPicker
                                    linkedTaskIds={linkedTasks.map(task => task.id)}
                                    onSelect={handleLinkTask}
                                    disabled={linking}
                                />
                                {linkError && <p role="alert" className="mt-2 text-sm text-red-700">{linkError}</p>}
                            </div>
                        )}
                    </div>
                </div>
                {canManage && (
                    <div className="flex shrink-0 gap-2">
                        <button type="button" onClick={onOpen} className="btn-secondary">
                            Open
                        </button>
                        <button type="button" onClick={onEdit} className="btn-secondary">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z" />
                            </svg>
                            Edit
                        </button>
                        {!notice.isArchived && (
                            <button type="button" onClick={onArchive} disabled={archiving} className="btn-secondary text-red-700">
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M9 11v6m6-6v6M6 7l1 14h10l1-14M9 7V4h6v3" />
                                </svg>
                                {archiving ? 'Archiving' : 'Archive'}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </article>
    );
}

function NoticeDetailModal({
    notice,
    profile,
    users,
    canManage,
    onClose,
    onEdit
}: {
    notice: Notice;
    profile?: UserProfile | null;
    users: Staff[];
    canManage: boolean;
    onClose: () => void;
    onEdit: () => void;
}) {
    const [comments, setComments] = useState<NoticeComment[]>([]);
    const [commentBody, setCommentBody] = useState('');
    const [commentsLoading, setCommentsLoading] = useState(true);
    const [commentSaving, setCommentSaving] = useState(false);
    const [commentError, setCommentError] = useState('');
    const [commentsUnavailable, setCommentsUnavailable] = useState(false);
    const [deletingCommentId, setDeletingCommentId] = useState<number | null>(null);
    const [commentPendingDeletion, setCommentPendingDeletion] = useState<number | null>(null);
    const [replyingToCommentId, setReplyingToCommentId] = useState<number | null>(null);
    const [replyBody, setReplyBody] = useState('');
    const [replySavingCommentId, setReplySavingCommentId] = useState<number | null>(null);
    const author = notice.Author?.displayName || notice.Author?.email || 'Unknown author';
    const created = formatDateTime(notice.createdAt);
    const effective = formatDate(notice.effectiveFrom);
    const expires = formatDate(notice.expiresAt);
    const linkedTasks = notice.LinkedTasks || [];
    const linkedEvents = notice.CalendarEvents || [];
    const commentCount = useMemo(() => countNoticeComments(comments), [comments]);
    const audience = audienceLabel(notice, users);
    const involvement = noticeInvolvement(notice, profile);

    useEffect(() => {
        let cancelled = false;

        async function loadComments() {
            setCommentsLoading(true);
            try {
                const data = await fetchNoticeComments(notice.id);
                if (!cancelled) {
                    setComments(data);
                    setCommentError('');
                }
            } catch (err) {
                if (!cancelled) {
                    clientLogger.error('Failed to load notice comments', err);
                    setComments([]);
                    setCommentsUnavailable(true);
                    setCommentError('');
                }
            } finally {
                if (!cancelled) setCommentsLoading(false);
            }
        }

        loadComments();
        return () => {
            cancelled = true;
        };
    }, [notice.id]);

    async function handlePostComment(event: React.FormEvent) {
        event.preventDefault();
        if (!commentBody.trim()) return;

        setCommentSaving(true);
        try {
            const comment = await createNoticeComment(notice.id, commentBody.trim());
            setComments(prev => [...prev, { ...comment, Replies: comment.Replies || [] }]);
            setCommentBody('');
            setCommentsUnavailable(false);
            setCommentError('');
        } catch (err) {
            setCommentError(err instanceof Error ? err.message : 'Failed to post comment');
        } finally {
            setCommentSaving(false);
        }
    }

    async function handlePostReply(event: React.FormEvent, parentCommentId: number) {
        event.preventDefault();
        if (!replyBody.trim()) return;

        setReplySavingCommentId(parentCommentId);
        try {
            const reply = await createNoticeComment(notice.id, replyBody.trim(), parentCommentId);
            setComments(prev => prev.map(comment => (
                comment.id === parentCommentId
                    ? { ...comment, Replies: [...(comment.Replies || []), { ...reply, Replies: [] }] }
                    : comment
            )));
            setReplyBody('');
            setReplyingToCommentId(null);
            setCommentsUnavailable(false);
            setCommentError('');
        } catch (err) {
            setCommentError(err instanceof Error ? err.message : 'Failed to post reply');
        } finally {
            setReplySavingCommentId(null);
        }
    }

    async function deletePendingComment() {
        const commentId = commentPendingDeletion;
        if (!commentId) return;
        setDeletingCommentId(commentId);
        try {
            await deleteNoticeComment(notice.id, commentId);
            setComments(prev => prev
                .filter(comment => comment.id !== commentId)
                .map(comment => ({
                    ...comment,
                    Replies: (comment.Replies || []).filter(reply => reply.id !== commentId)
                })));
            setCommentError('');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to delete comment';
            setCommentError(message);
            throw new Error(message);
        } finally {
            setDeletingCommentId(null);
        }
    }

    function renderReply(reply: NoticeComment) {
        const replyAuthor = reply.Author?.displayName || reply.Author?.email || 'Unknown staff member';
        const replyCreated = formatDateTime(reply.createdAt);

        return (
            <div
                key={reply.id}
                className="relative ml-6 rounded-md border border-teal-200 bg-teal-50/60 p-3 shadow-sm before:absolute before:-left-6 before:top-5 before:h-px before:w-6 before:bg-teal-300"
            >
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded bg-teal-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-teal-700">Reply</span>
                            <div className="text-sm font-semibold text-[#1c231f]">{replyAuthor}</div>
                        </div>
                        {replyCreated && (
                            <div className="mt-0.5 text-xs text-[var(--muted)]">{replyCreated}</div>
                        )}
                    </div>
                    {canManage && (
                        <button
                            type="button"
                            onClick={() => setCommentPendingDeletion(reply.id)}
                            disabled={deletingCommentId === reply.id}
                            className="rounded px-2 py-1 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                            {deletingCommentId === reply.id ? 'Deleting' : 'Delete'}
                        </button>
                    )}
                </div>
                <div className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[#344039]">
                    {reply.body}
                </div>
            </div>
        );
    }

    function renderComment(comment: NoticeComment) {
        const commentAuthor = comment.Author?.displayName || comment.Author?.email || 'Unknown staff member';
        const commentCreated = formatDateTime(comment.createdAt);
        const replies = comment.Replies || [];
        const isReplying = replyingToCommentId === comment.id;
        const isReplySaving = replySavingCommentId === comment.id;

        return (
            <div key={comment.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="text-sm font-semibold text-[#1c231f]">{commentAuthor}</div>
                        {commentCreated && (
                            <div className="mt-0.5 text-xs text-[var(--muted)]">{commentCreated}</div>
                        )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                        <button
                            type="button"
                            onClick={() => {
                                setReplyingToCommentId(comment.id);
                                setReplyBody('');
                            }}
                            disabled={commentsUnavailable}
                            className="rounded px-2 py-1 text-xs font-bold text-[var(--brand-strong)] hover:bg-white disabled:opacity-50"
                        >
                            Reply
                        </button>
                        {canManage && (
                            <button
                                type="button"
                                onClick={() => setCommentPendingDeletion(comment.id)}
                                disabled={deletingCommentId === comment.id}
                                className="rounded px-2 py-1 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-50"
                            >
                                {deletingCommentId === comment.id ? 'Deleting' : 'Delete'}
                            </button>
                        )}
                    </div>
                </div>
                <div className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[#344039]">
                    {comment.body}
                </div>

                {isReplying && (
                    <form
                        onSubmit={(event) => handlePostReply(event, comment.id)}
                        className="relative mt-4 ml-6 rounded-md border border-teal-200 bg-teal-50/40 p-3 before:absolute before:-left-6 before:top-5 before:h-px before:w-6 before:bg-teal-300"
                    >
                        <label className="mb-1.5 block text-xs font-bold uppercase text-[var(--muted)]">Reply</label>
                        <textarea
                            className="form-control min-h-20"
                            value={replyBody}
                            onChange={(event) => setReplyBody(event.target.value)}
                            maxLength={4000}
                            disabled={isReplySaving}
                            placeholder="Add a direct answer or follow-up..."
                        />
                        <div className="mt-2 flex items-center justify-between gap-3">
                            <div className="text-xs text-[var(--muted)]">{replyBody.length}/4000</div>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setReplyingToCommentId(null);
                                        setReplyBody('');
                                    }}
                                    className="btn-secondary"
                                >
                                    Cancel
                                </button>
                                <button type="submit" disabled={isReplySaving || !replyBody.trim()} className="btn-primary">
                                    {isReplySaving ? 'Posting...' : 'Post Reply'}
                                </button>
                            </div>
                        </div>
                    </form>
                )}

                {replies.length > 0 && (
                    <div className="mt-4 space-y-3 border-l-2 border-teal-300 pl-3">
                        {replies.map(renderReply)}
                    </div>
                )}
            </div>
        );
    }

    return (
        <>
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
            <div className={`flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-white shadow-xl ${involvementSurfaceClass(involvement)}`}>
                <div className="border-b border-[var(--border)] px-6 py-5">
                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                                <InvolvementBadge signal={involvement} />
                                {notice.isPinned && <NoticeBadge tone="brand" label="Pinned" />}
                                <NoticeBadge tone={notice.priority === 'urgent' ? 'red' : notice.priority === 'important' ? 'amber' : 'slate'} label={priorityLabel(notice.priority)} />
                                <NoticeBadge tone="teal" label={categoryLabel(notice.category)} />
                                {notice.isExpired && <NoticeBadge tone="orange" label="Expired" />}
                                {notice.isArchived && <NoticeBadge tone="slate" label="Archived" />}
                                {notice.requiresAcknowledgement && <NoticeBadge tone={notice.acknowledgement?.isOverdue ? 'red' : 'brand'} label={`${notice.acknowledgement?.completionRate || 0}% acknowledged`} />}
                            </div>
                            <h2 className="break-words text-xl font-semibold text-[#1c231f]">{notice.title}</h2>
                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-[var(--muted)]">
                                <span>By {author}</span>
                                <span>To {audience}</span>
                                <span>{notice.areaScope === 'AREAS' && notice.OperationalAreas?.length
                                    ? notice.OperationalAreas.map(area => area.name).join(' + ')
                                    : 'Organisation-wide'}</span>
                                {created && <span>Created {created}</span>}
                                {effective && <span>Starts {effective}</span>}
                                {expires && <span>Ends {expires}</span>}
                            </div>
                        </div>
                        <button type="button" onClick={onClose} className="icon-button text-[var(--muted)] hover:bg-slate-100" aria-label="Close full notice">
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 6l12 12M18 6 6 18" />
                            </svg>
                        </button>
                    </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                    <div className="whitespace-pre-wrap break-words text-sm leading-7 text-[#344039]">
                        {notice.body}
                    </div>

                    <div className="mt-6">
                        <AttachmentPanel
                            entityType="NOTICE"
                            entityId={notice.id}
                            title="Notice Attachments"
                            canUpload={canManage}
                            canDeleteAll={canManage}
                            compact
                        />
                    </div>

                    <div className="mt-6">
                        <ProjectLinksPanel itemType="NOTICE" itemId={notice.id} compact />
                    </div>

                    {linkedTasks.length > 0 && (
                        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-3">
                            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Linked Tasks</div>
                            <div className="flex flex-wrap gap-2">
                                {linkedTasks.map(task => (
                                    <div key={task.id} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700">
                                        <span className="font-semibold">Task #{task.id}</span>
                                        <span className="ml-2">{operationalLabel(task.subType || task.category)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {linkedEvents.length > 0 && (
                        <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-3">
                            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-blue-700">Linked Events</div>
                            <div className="flex flex-wrap gap-2">
                                {linkedEvents.map(event => (
                                    <div key={event.id} className="rounded-md border border-blue-200 bg-white px-2 py-1 text-xs text-blue-800">
                                        <span className="font-semibold">{event.title}</span>
                                        {formatDateTime(event.start) && <span className="ml-2">{formatDateTime(event.start)}</span>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="mt-6 rounded-lg border border-slate-200 bg-white">
                        <div className="border-b border-slate-200 px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Comments</div>
                                    <div className="mt-0.5 text-sm text-slate-600">Clarifications and extra detail for the team.</div>
                                </div>
                                <div className="rounded bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">
                                    {commentCount}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3 px-4 py-4">
                            {commentError && (
                                <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                    {commentError}
                                </div>
                            )}
                            {commentsUnavailable && (
                                <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                                    Comments are not available from the server yet. Apply the latest database migration and restart the backend.
                                </div>
                            )}

                            {commentsLoading ? (
                                <div className="text-sm text-slate-500">Loading comments...</div>
                            ) : comments.length === 0 ? (
                                <div className="rounded border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-600">
                                    No comments yet.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {comments.map(renderComment)}
                                </div>
                            )}

                            <form onSubmit={handlePostComment} className="border-t border-slate-200 pt-3">
                                <label className="mb-1.5 block text-xs font-bold uppercase text-[var(--muted)]">Add Comment</label>
                                <textarea
                                    className="form-control min-h-24"
                                    value={commentBody}
                                    onChange={(event) => setCommentBody(event.target.value)}
                                    maxLength={4000}
                                    disabled={commentsUnavailable}
                                    placeholder="Add clarification or extra context for the team..."
                                />
                                <div className="mt-2 flex items-center justify-between gap-3">
                                    <div className="text-xs text-[var(--muted)]">{commentBody.length}/4000</div>
                                    <button type="submit" disabled={commentsUnavailable || commentSaving || !commentBody.trim()} className="btn-primary">
                                        {commentSaving ? 'Posting...' : 'Post Comment'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-3 border-t border-[var(--border)] px-6 py-4">
                    <button type="button" onClick={onClose} className="btn-secondary">Close</button>
                    {canManage && (
                        <button type="button" onClick={onEdit} className="btn-primary">Edit Notice</button>
                    )}
                </div>
            </div>
        </div>
        <ConfirmDialog
            open={commentPendingDeletion !== null}
            onClose={() => setCommentPendingDeletion(null)}
            onConfirm={deletePendingComment}
            title="Delete comment?"
            description="This comment will be permanently removed from the notice discussion."
            confirmLabel="Delete comment"
            destructive
        />
        </>
    );
}

function NoticeFormModal({
    mode,
    notice,
    users,
    areas,
    canManageOrganisation,
    onClose,
    onSaved
}: {
    mode: 'create' | 'edit';
    notice?: Notice;
    users: Staff[];
    areas: OperationalArea[];
    canManageOrganisation: boolean;
    onClose: () => void;
    onSaved: () => void | Promise<void>;
}) {
    const [title, setTitle] = useState(notice?.title || '');
    const [body, setBody] = useState(notice?.body || '');
    const [category, setCategory] = useState<NoticeCategory>(notice?.category || 'GENERAL');
    const [priority, setPriority] = useState<NoticePriority>(notice?.priority || 'normal');
    const [isPinned, setIsPinned] = useState(Boolean(notice?.isPinned));
    const [requiresAcknowledgement, setRequiresAcknowledgement] = useState(Boolean(notice?.requiresAcknowledgement));
    const [acknowledgementDueAt, setAcknowledgementDueAt] = useState(toDateInputValue(notice?.acknowledgementDueAt));
    const [effectiveFrom, setEffectiveFrom] = useState(toDateInputValue(notice?.effectiveFrom));
    const [expiresAt, setExpiresAt] = useState(toDateInputValue(notice?.expiresAt));
    const [isArchived, setIsArchived] = useState(Boolean(notice?.isArchived));
    const [audienceType, setAudienceType] = useState<NoticeAudienceType>(notice?.audienceType || 'all_staff');
    const [audienceRoles, setAudienceRoles] = useState<string[]>(notice?.audienceRoles || ['staff']);
    const [audienceUserIds, setAudienceUserIds] = useState<string[]>((notice?.audienceUserIds || []).map(String));
    const selectableAreas = canManageOrganisation
        ? areas
        : areas.filter(area => area.myMembership?.membershipRole === 'MANAGER');
    const existingAreaIds = (notice?.OperationalAreas || []).map(area => area.id);
    const [areaScope, setAreaScope] = useState<'ORGANISATION' | 'AREAS'>(
        notice?.areaScope || (canManageOrganisation ? 'ORGANISATION' : 'AREAS')
    );
    const [primaryAreaId, setPrimaryAreaId] = useState<number | ''>(existingAreaIds[0] || selectableAreas[0]?.id || '');
    const [linkedAreaIds, setLinkedAreaIds] = useState<number[]>(existingAreaIds.slice(1));
    const [selectedCalendarEvents, setSelectedCalendarEvents] = useState<CalendarEventSelection[]>(
        (notice?.CalendarEvents || []).map(event => ({
            id: event.id,
            title: event.title,
            meta: new Date(event.start).toLocaleString('en-AU', {
                day: 'numeric',
                month: 'short',
                hour: 'numeric',
                minute: '2-digit'
            })
        }))
    );
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    function toggleAudienceRole(role: string) {
        setAudienceRoles(prev => prev.includes(role) ? prev.filter(value => value !== role) : [...prev, role]);
    }

    function toggleAudienceUser(userId: number) {
        const value = String(userId);
        setAudienceUserIds(prev => prev.includes(value) ? prev.filter(id => id !== value) : [...prev, value]);
    }

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        setFormError(null);

        if (!title.trim() || !body.trim()) {
            setFormError('Title and body are required.');
            return;
        }
        if (audienceType === 'roles' && audienceRoles.length === 0) {
            setFormError('Choose at least one role for this notice.');
            return;
        }
        if (audienceType === 'users' && audienceUserIds.length === 0) {
            setFormError('Choose at least one staff member for this notice.');
            return;
        }
        if (areaScope === 'AREAS' && primaryAreaId === '') {
            setFormError('Choose at least one operational area.');
            return;
        }

        setSaving(true);
        try {
            const payload: NoticeInput = {
                title: title.trim(),
                body: body.trim(),
                category,
                priority,
                isPinned,
                requiresAcknowledgement,
                acknowledgementDueAt: requiresAcknowledgement ? fromEndDateValue(acknowledgementDueAt) : null,
                audienceType,
                audienceRoles: audienceType === 'roles' ? audienceRoles : [],
                audienceUserIds: audienceType === 'users' ? audienceUserIds.map(id => Number(id)) : [],
                areaScope,
                primaryAreaId: areaScope === 'AREAS' && primaryAreaId !== '' ? primaryAreaId : null,
                linkedAreaIds: areaScope === 'AREAS' ? linkedAreaIds : [],
                calendarEventIds: selectedCalendarEvents.map(event => event.id),
                effectiveFrom: fromStartDateValue(effectiveFrom),
                expiresAt: fromEndDateValue(expiresAt)
            };

            if (mode === 'edit' && notice) {
                await updateNotice(notice.id, {
                    ...payload,
                    isArchived
                });
            } else {
                await createNotice(payload);
            }

            await onSaved();
        } catch (err) {
            setFormError(err instanceof Error ? err.message : 'Failed to save notice');
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
                <div className="mb-5 flex items-start justify-between gap-4">
                    <div>
                        <h2 className="text-xl font-semibold text-[#1c231f]">{mode === 'edit' ? 'Edit Notice' : 'Create Notice'}</h2>
                        <p className="mt-1 text-sm text-[var(--muted)]">Post internal operational information for staff to know.</p>
                    </div>
                    <button type="button" onClick={onClose} className="icon-button text-[var(--muted)] hover:bg-slate-100" aria-label="Close notice form">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 6l12 12M18 6 6 18" />
                        </svg>
                    </button>
                </div>

                {formError && <p role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{formError}</p>}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="mb-1.5 block text-xs font-bold uppercase text-[var(--muted)]">Title</label>
                        <input
                            type="text"
                            className="form-control"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            maxLength={200}
                            required
                            placeholder="Cleaner arriving tomorrow at 8am"
                        />
                    </div>

                    <div>
                        <label className="mb-1.5 block text-xs font-bold uppercase text-[var(--muted)]">Notice</label>
                        <textarea
                            className="form-control min-h-36"
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            required
                            placeholder="Add the operational detail staff need to know..."
                        />
                    </div>

                    <div className="rounded-lg border border-[var(--border)] bg-[#f8faf6] p-3">
                        <label className="mb-1.5 block text-xs font-bold uppercase text-[var(--muted)]">Directed To</label>
                        <select
                            className="form-control"
                            value={audienceType}
                            onChange={(e) => setAudienceType(e.target.value as NoticeAudienceType)}
                        >
                            <option value="all_staff">All staff</option>
                            <option value="roles">Role subset</option>
                            <option value="users">Specific staff</option>
                        </select>

                        {audienceType === 'roles' && (
                            <div className="mt-3 flex flex-wrap gap-3">
                                {NOTICE_AUDIENCE_ROLES.map(role => (
                                    <label key={role} className="flex items-center gap-2 text-sm font-medium text-[#344039]">
                                        <input
                                            type="checkbox"
                                            checked={audienceRoles.includes(role)}
                                            onChange={() => toggleAudienceRole(role)}
                                            className="h-4 w-4 rounded border-gray-300"
                                        />
                                        {roleLabel(role)}
                                    </label>
                                ))}
                            </div>
                        )}

                        {audienceType === 'users' && (
                            <div className="mt-3 max-h-44 space-y-2 overflow-y-auto rounded-md border border-slate-200 bg-white p-2">
                                {users.length === 0 ? (
                                    <div className="text-sm text-[var(--muted)]">No staff found.</div>
                                ) : users.map(user => (
                                    <label key={user.id} className="flex items-center justify-between gap-3 rounded px-2 py-1.5 text-sm hover:bg-slate-50">
                                        <span className="min-w-0">
                                            <span className="block truncate font-medium text-[#344039]">{user.displayName || user.email}</span>
                                            <span className="block text-xs text-[var(--muted)]">{roleLabel(user.role || 'staff')}</span>
                                        </span>
                                        <input
                                            type="checkbox"
                                            checked={audienceUserIds.includes(String(user.id))}
                                            onChange={() => toggleAudienceUser(user.id)}
                                            className="h-4 w-4 rounded border-gray-300"
                                        />
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="rounded-lg border border-[var(--border)] bg-[#f8faf6] p-3">
                        <label className="mb-1.5 block text-xs font-bold uppercase text-[var(--muted)]">Operational Placement</label>
                        <select
                            className="form-control"
                            value={areaScope}
                            onChange={(e) => setAreaScope(e.target.value as 'ORGANISATION' | 'AREAS')}
                        >
                            {canManageOrganisation && <option value="ORGANISATION">Organisation-wide</option>}
                            <option value="AREAS" disabled={selectableAreas.length === 0}>Selected areas</option>
                        </select>
                        {areaScope === 'AREAS' && (
                            <div className="mt-3 space-y-3">
                                <select
                                    className="form-control"
                                    value={primaryAreaId}
                                    onChange={(e) => setPrimaryAreaId(e.target.value ? Number(e.target.value) : '')}
                                >
                                    <option value="">Choose primary area</option>
                                    {selectableAreas.map(area => <option key={area.id} value={area.id}>{area.name}</option>)}
                                </select>
                                <div className="flex flex-wrap gap-3">
                                    {selectableAreas.filter(area => area.id !== Number(primaryAreaId)).map(area => (
                                        <label key={area.id} className="flex items-center gap-2 text-sm text-[#344039]">
                                            <input
                                                type="checkbox"
                                                checked={linkedAreaIds.includes(area.id)}
                                                onChange={(e) => setLinkedAreaIds(current => e.target.checked
                                                    ? [...current, area.id]
                                                    : current.filter(id => id !== area.id))}
                                            />
                                            {area.name}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <CalendarEventPicker
                        label="Linked Events"
                        selected={selectedCalendarEvents}
                        onChange={setSelectedCalendarEvents}
                        placeholder="Search for an event to link this notice..."
                    />

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                            <label className="mb-1.5 block text-xs font-bold uppercase text-[var(--muted)]">Category</label>
                            <select
                                className="form-control"
                                value={category}
                                onChange={(e) => setCategory(e.target.value as NoticeCategory)}
                            >
                                {NOTICE_CATEGORIES.map(option => (
                                    <option key={option} value={option}>{categoryLabel(option)}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="mb-1.5 block text-xs font-bold uppercase text-[var(--muted)]">Priority</label>
                            <select
                                className="form-control"
                                value={priority}
                                onChange={(e) => setPriority(e.target.value as NoticePriority)}
                            >
                                {NOTICE_PRIORITIES.map(option => (
                                    <option key={option} value={option}>{priorityLabel(option)}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="mb-1.5 block text-xs font-bold uppercase text-[var(--muted)]">Start Date</label>
                            <input
                                type="date"
                                className="form-control"
                                value={effectiveFrom}
                                onChange={(e) => setEffectiveFrom(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="mb-1.5 block text-xs font-bold uppercase text-[var(--muted)]">End Date</label>
                            <input
                                type="date"
                                className="form-control"
                                value={expiresAt}
                                onChange={(e) => setExpiresAt(e.target.value)}
                            />
                        </div>
                        {requiresAcknowledgement && (
                            <div>
                                <label className="mb-1.5 block text-xs font-bold uppercase text-[var(--muted)]">Acknowledgement Due</label>
                                <input
                                    type="date"
                                    className="form-control"
                                    value={acknowledgementDueAt}
                                    onChange={(e) => setAcknowledgementDueAt(e.target.value)}
                                />
                            </div>
                        )}
                    </div>

                    <div className="flex flex-wrap gap-4 rounded-lg border border-[var(--border)] bg-[#f8faf6] p-3">
                        <label className="flex items-center gap-2 text-sm font-medium text-[#344039]">
                            <input
                                type="checkbox"
                                checked={isPinned}
                                onChange={(e) => setIsPinned(e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300"
                            />
                            Pin notice
                        </label>
                        <label className="flex items-center gap-2 text-sm font-medium text-[#344039]">
                            <input
                                type="checkbox"
                                checked={priority === 'urgent'}
                                onChange={(e) => setPriority(e.target.checked ? 'urgent' : 'normal')}
                                className="h-4 w-4 rounded border-gray-300"
                            />
                            Mark urgent
                        </label>
                        <label className="flex items-center gap-2 text-sm font-medium text-[#344039]">
                            <input
                                type="checkbox"
                                checked={requiresAcknowledgement}
                                onChange={(e) => setRequiresAcknowledgement(e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300"
                            />
                            Require acknowledgement
                        </label>
                        {mode === 'edit' && (
                            <label className="flex items-center gap-2 text-sm font-medium text-[#344039]">
                                <input
                                    type="checkbox"
                                    checked={isArchived}
                                    onChange={(e) => setIsArchived(e.target.checked)}
                                    className="h-4 w-4 rounded border-gray-300"
                                />
                                Archived
                            </label>
                        )}
                    </div>

                    <div className="flex justify-end gap-3 border-t border-[var(--border)] pt-4">
                        <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
                        <button type="submit" disabled={saving} className="btn-primary">
                            {saving ? 'Saving...' : mode === 'edit' ? 'Save Notice' : 'Post Notice'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function NoticeBadge({
    tone,
    label
}: {
    tone: 'brand' | 'red' | 'amber' | 'orange' | 'teal' | 'slate';
    label: string;
}) {
    const toneClasses: Record<typeof tone, string> = {
        brand: 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-strong)]',
        red: 'border-red-200 bg-red-50 text-red-700',
        amber: 'border-amber-200 bg-amber-50 text-amber-800',
        orange: 'border-orange-200 bg-orange-50 text-orange-800',
        teal: 'border-teal-200 bg-teal-50 text-teal-800',
        slate: 'border-slate-200 bg-slate-50 text-slate-700'
    };

    return (
        <span className={`rounded-md border px-2 py-1 text-[11px] font-bold uppercase ${toneClasses[tone]}`}>
            {label}
        </span>
    );
}

function NoticeMetric({
    label,
    value,
    tone
}: {
    label: string;
    value: number;
    tone: 'slate' | 'brand' | 'red' | 'amber' | 'orange' | 'teal';
}) {
    const toneClasses: Record<typeof tone, string> = {
        slate: 'bg-slate-500',
        brand: 'bg-[var(--brand)]',
        red: 'bg-red-500',
        amber: 'bg-amber-500',
        orange: 'bg-orange-500',
        teal: 'bg-teal-600'
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
