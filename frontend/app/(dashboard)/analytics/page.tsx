'use client';

import { useState, useEffect, useCallback } from 'react';
import { getAnalytics } from '../../../lib/api';

const STATUS_LABELS: Record<string, string> = {
    PENDING: 'Pending', ACTIONED: 'Actioned', REJECTED: 'Rejected'
};
const STATUS_COLORS: Record<string, string> = {
    PENDING: '#f59e0b', ACTIONED: '#10b981', REJECTED: '#ef4444'
};
const RESOLVED_AS_LABELS: Record<string, string> = {
    COMPLETED: 'Completed',
    WORKAROUND: 'Workaround',
    ESCALATED: 'Escalated',
    DECLINED: 'Declined',
    DUPLICATE: 'Duplicate',
    NO_ACTION: 'No Action'
};
const RESOLVED_AS_COLORS: Record<string, string> = {
    COMPLETED: '#10b981',
    WORKAROUND: '#f59e0b',
    ESCALATED: '#6366f1',
    DECLINED: '#ef4444',
    DUPLICATE: '#6b7280',
    NO_ACTION: '#94a3b8'
};
const CATEGORY_LABELS: Record<string, string> = {
    BOOKING: 'Booking', ORDER: 'Order', ACCOUNT: 'Account', GENERAL: 'General',
    INTERNAL: 'Internal', SYSTEM: 'System', OPERATIONS: 'Operations'
};
const CUSTOMER_OUTCOME_LABELS: Record<string, string> = {
    BOOKING_CONFIRMED: 'Booking Confirmed',
    ORDER_UPDATED: 'Order Updated',
    ACCOUNT_UPDATED: 'Account Updated',
    INFO_PROVIDED: 'Info Provided',
    ISSUE_RESOLVED: 'Issue Resolved',
    REQUEST_DECLINED: 'Request Declined',
    REFERRED: 'Referred',
    NO_CHANGE: 'No Change',
    UNKNOWN: 'Unknown'
};
const SOURCE_LABELS: Record<string, string> = {
    manual: 'Manual', sms: 'SMS', email: 'Email', booking: 'Booking',
    wine_club: 'Wine Club', pos: 'POS', import: 'Import', website: 'Website',
    referral: 'Referral', walk_in: 'Walk-in'
};
const LOYALTY_LABELS: Record<string, string> = { none: 'None', bronze: 'Bronze', silver: 'Silver', gold: 'Gold', platinum: 'Platinum' };
const LOYALTY_COLORS: Record<string, string> = { none: '#9ca3af', bronze: '#d97706', silver: '#6b7280', gold: '#eab308', platinum: '#6366f1' };
const SENTIMENT_COLORS: Record<string, string> = { POSITIVE: '#10b981', NEUTRAL: '#6b7280', NEGATIVE: '#ef4444' };
const WORKFLOW_LABELS: Record<string, string> = {
    NOT_STARTED: 'Not Started',
    IN_PROGRESS: 'In Progress',
    WAITING: 'Waiting',
    BLOCKED: 'Blocked',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled'
};
const WORKFLOW_COLORS: Record<string, string> = {
    NOT_STARTED: '#94a3b8',
    IN_PROGRESS: '#3b82f6',
    WAITING: '#f59e0b',
    BLOCKED: '#ef4444',
    COMPLETED: '#10b981',
    CANCELLED: '#6b7280'
};
const WAITING_LABELS: Record<string, string> = {
    NONE: 'None',
    STAFF: 'Staff',
    CUSTOMER: 'Customer',
    MANAGER: 'Manager',
    EXTERNAL: 'External'
};
const IDENTITY_LABELS: Record<string, string> = {
    AUTO_LINKED: 'Auto Linked',
    AUTO_CREATED: 'Auto Created',
    REVIEW_REQUIRED: 'Review Required',
    REVIEW_CONFIRMED: 'Review Confirmed',
    MANUALLY_LINKED: 'Manually Linked',
    UNRESOLVED: 'Unresolved',
    UNLINKED: 'Unlinked',
    SELECTED_MEMBER: 'Selected Member',
    UNRECORDED: 'Unrecorded'
};
const AUTOMATION_LABELS: Record<string, string> = {
    EXPLICIT_FOLLOW_UP: 'Explicit Follow-up',
    CUSTOMER_NO_RESPONSE_CALLBACK: 'No-response Callback',
    ESCALATION_REVIEW: 'Escalation Review'
};
const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// --- Chart Components ---

function BarChart({ data, labelKey, valueKey, colorFn, labelMap }: {
    data: any[], labelKey: string, valueKey: string,
    colorFn?: (l: string) => string, labelMap?: Record<string, string>
}) {
    const max = Math.max(...data.map(d => parseInt(d[valueKey]) || 0), 1);
    return (
        <div className="space-y-2">
            {data.map((d, i) => {
                const val = parseInt(d[valueKey]) || 0;
                const pct = (val / max) * 100;
                const label = labelMap?.[d[labelKey]] || d[labelKey] || 'Unknown';
                const color = colorFn?.(d[labelKey]) || '#6366f1';
                return (
                    <div key={i} className="flex items-center gap-3">
                        <div className="w-24 text-xs text-gray-600 text-right truncate" title={label}>{label}</div>
                        <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }}></div>
                        </div>
                        <div className="w-8 text-xs font-medium text-gray-700 text-right">{val}</div>
                    </div>
                );
            })}
            {data.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No data for this period</p>}
        </div>
    );
}

function DonutChart({ data, labelKey, valueKey, colorFn, labelMap }: {
    data: any[], labelKey: string, valueKey: string,
    colorFn?: (l: string) => string, labelMap?: Record<string, string>
}) {
    const total = data.reduce((sum, d) => sum + (parseInt(d[valueKey]) || 0), 0);
    if (total === 0) return <p className="text-sm text-gray-400 text-center py-8">No data for this period</p>;

    const segments = data.map((d, index) => {
        const val = parseInt(d[valueKey]) || 0;
        const pct = (val / total) * 100;
        const start = data
            .slice(0, index)
            .reduce((sum, item) => sum + ((parseInt(item[valueKey]) || 0) / total) * 100, 0);
        return { label: labelMap?.[d[labelKey]] || d[labelKey], val, pct, start, color: colorFn?.(d[labelKey]) || '#6366f1' };
    });

    const gradient = segments.map(s => `${s.color} ${s.start}% ${s.start + s.pct}%`).join(', ');

    return (
        <div className="flex items-center gap-6">
            <div className="relative w-32 h-32 flex-shrink-0">
                <div className="w-32 h-32 rounded-full" style={{ background: `conic-gradient(${gradient})` }}></div>
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center text-lg font-bold text-gray-700">{total}</div>
                </div>
            </div>
            <div className="space-y-1 text-xs">
                {segments.filter(s => s.val > 0).map((s, i) => (
                    <div key={i} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: s.color }}></div>
                        <span className="text-gray-600">{s.label}</span>
                        <span className="font-medium text-gray-800">{s.val} ({Math.round(s.pct)}%)</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function SparkBars({ data, labelKey, valueKey }: { data: any[], labelKey: string, valueKey: string }) {
    const max = Math.max(...data.map(d => parseInt(d[valueKey]) || 0), 1);
    return (
        <div className="flex items-end gap-px h-20">
            {data.map((d, i) => {
                const val = parseInt(d[valueKey]) || 0;
                const pct = Math.max((val / max) * 100, 3);
                return (
                    <div key={i} className="flex-1 group relative">
                        <div className="w-full bg-indigo-400 hover:bg-indigo-500 rounded-t transition-colors cursor-default" style={{ height: `${pct}%` }}>
                            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block bg-gray-800 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap z-10">
                                {d[labelKey]}: {val}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function formatNumber(value: any) {
    return (Number(value) || 0).toLocaleString('en-AU');
}

function formatHours(value: any) {
    const numeric = Number(value) || 0;
    if (numeric === 0) return '0h';
    if (numeric < 1) return `${Math.round(numeric * 60)}m`;
    if (numeric >= 48) return `${(numeric / 24).toFixed(1)}d`;
    return `${numeric.toFixed(1)}h`;
}

function formatMinutes(value: any) {
    const numeric = Number(value) || 0;
    if (numeric === 0) return '0m';
    if (numeric >= 60) return `${(numeric / 60).toFixed(1)}h`;
    return `${numeric.toFixed(0)}m`;
}

function formatPercent(value: any) {
    return `${Math.round(Number(value) || 0)}%`;
}

// --- Page ---

export default function AnalyticsPage() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [period, setPeriod] = useState('month');
    const [offset, setOffset] = useState(0);

    const load = useCallback(() => {
        setLoading(true);
        setError('');
        getAnalytics(period, offset)
            .then(setData)
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    }, [period, offset]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            load();
        }, 0);
        return () => window.clearTimeout(timer);
    }, [load]);

    const goBack = () => setOffset(o => o + 1);
    const goForward = () => setOffset(o => Math.max(0, o - 1));
    const goToday = () => setOffset(0);

    const periodLabel = data?.period?.label || '';

    return (
        <div className="page-shell space-y-7">
            {/* Header + Period Selector */}
            <div className="page-header">
                <div>
                    <h1 className="text-2xl font-bold text-[#1c231f]">Analytics</h1>
                    <p className="page-kicker">Operations, customer engagement, workflow quality, and follow-up signals.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {/* Period granularity buttons */}
                    <div className="flex rounded-md bg-[#eef1e8] p-0.5">
                        {(['day', 'week', 'month', 'year'] as const).map(p => (
                            <button key={p} onClick={() => { setPeriod(p); setOffset(0); }}
                                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${period === p ? 'bg-white text-[#1c231f] shadow-sm' : 'text-[#536158] hover:text-[#1c231f]'}`}>
                                {p.charAt(0).toUpperCase() + p.slice(1)}
                            </button>
                        ))}
                    </div>

                    {/* Navigation arrows */}
                    <div className="flex items-center gap-1 ml-2">
                        <button onClick={goBack} className="icon-button text-[var(--muted)] hover:bg-[#eef1e8] hover:text-[#1c231f]" title="Previous">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                        </button>
                        <button onClick={goToday} disabled={offset === 0}
                            className="btn-secondary px-2.5 py-1 text-xs disabled:opacity-40">
                            Today
                        </button>
                        <button onClick={goForward} disabled={offset === 0}
                            className="icon-button text-[var(--muted)] hover:bg-[#eef1e8] hover:text-[#1c231f] disabled:opacity-40" title="Next">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        </button>
                    </div>
                </div>
            </div>

            {/* Period Label */}
            {periodLabel && (
                <div className="text-center">
                    <span className="inline-flex items-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-sm font-medium text-[#344039]">
                        {periodLabel}
                    </span>
                </div>
            )}

            {loading && (
                <div className="flex items-center justify-center py-16">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#d9dfd2] border-t-[var(--brand)]"></div>
                </div>
            )}

            {error && (
                <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded-md">
                    <p className="text-sm text-red-700">{error}</p>
                </div>
            )}

            {data && !loading && (() => {
                const { kpis, tasks, customers, staff, communication, bookings, operations = {} } = data;
                const workflow = operations.workflow || {};
                const timing = operations.timing || {};
                const response = operations.response || {};
                const handoffs = operations.handoffs || {};
                const identity = operations.identity || {};
                const followUps = operations.followUps || {};
                return (
                    <>
                        {/* KPI Cards */}
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
                            {[
                                { label: 'Open Tasks', value: kpis.openTasks, dot: 'bg-amber-500', color: 'text-amber-700' },
                                { label: 'Resolved', value: kpis.resolvedInPeriod, dot: 'bg-emerald-500', color: 'text-emerald-700' },
                                { label: 'Follow-up Marked', value: kpis.followUpsMarked, dot: 'bg-orange-500', color: 'text-orange-700' },
                                { label: 'New Customers', value: kpis.newCustomers, dot: 'bg-sky-500', color: 'text-sky-700' },
                                { label: 'Total Customers', value: kpis.totalCustomers, dot: 'bg-teal-600', color: 'text-teal-800' },
                                { label: 'Wine Club', value: kpis.wineClubMembers, dot: 'bg-violet-500', color: 'text-violet-700' },
                                { label: 'Revenue Tracked', value: `$${(kpis.revenueTracked || 0).toLocaleString('en-AU', { minimumFractionDigits: 0 })}`, dot: 'bg-emerald-600', color: 'text-emerald-800' },
                                { label: 'Inbound Msgs', value: kpis.inboundMessages, dot: 'bg-blue-500', color: 'text-blue-700' }
                            ].map((kpi, i) => (
                                <div key={i} className="metric-tile">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="truncate text-[10px] font-bold uppercase text-[var(--muted)]">{kpi.label}</span>
                                        <span className={`status-dot ${kpi.dot}`}></span>
                                    </div>
                                    <div className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</div>
                                </div>
                            ))}
                        </div>

                        {/* Operational Flow */}
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h2 className="text-lg font-semibold text-gray-900">Operational Flow</h2>
                                    <p className="text-sm text-gray-500">Where work is waiting, blocked, delayed, or moving through handoffs.</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
                                {[
                                    { label: 'Avg Resolution', value: formatHours(timing.avgResolutionHours), sub: 'closed cases' },
                                    { label: 'First Response', value: formatMinutes(response.avgFirstResponseMinutes), sub: `${formatPercent(response.responseCoverageRate)} coverage` },
                                    { label: 'Waiting Now', value: formatNumber(workflow.currentWaiting), sub: `${formatHours(timing.avgWaitingAgeHours)} avg age` },
                                    { label: 'Blocked Now', value: formatNumber(workflow.currentBlocked), sub: `${formatHours(timing.avgBlockedAgeHours)} avg age` },
                                    { label: 'Overdue', value: formatNumber(workflow.overdueTasks), sub: `${formatNumber(workflow.dueSoonTasks)} due soon` },
                                    { label: 'Handoffs', value: formatNumber(handoffs.total), sub: `${formatNumber(handoffs.tasksWithHandoffs)} tasks touched` }
                                ].map((metric, i) => (
                                    <div key={i} className="bg-white rounded-lg border border-gray-200 p-4">
                                        <div className="text-2xl font-bold text-gray-900">{metric.value}</div>
                                        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mt-1">{metric.label}</div>
                                        <div className="text-[11px] text-gray-400 mt-1">{metric.sub}</div>
                                    </div>
                                ))}
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                <div className="bg-white rounded-lg border border-gray-200 p-5">
                                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Current Workflow State</h3>
                                    <BarChart
                                        data={workflow.currentByState || []}
                                        labelKey="workflowState"
                                        valueKey="count"
                                        colorFn={value => WORKFLOW_COLORS[value] || '#6b7280'}
                                        labelMap={WORKFLOW_LABELS}
                                    />
                                </div>
                                <div className="bg-white rounded-lg border border-gray-200 p-5">
                                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Waiting On</h3>
                                    <BarChart
                                        data={workflow.currentByWaitingOn || []}
                                        labelKey="waitingOn"
                                        valueKey="count"
                                        colorFn={() => '#f59e0b'}
                                        labelMap={WAITING_LABELS}
                                    />
                                </div>
                                <div className="bg-white rounded-lg border border-gray-200 p-5">
                                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Step Status This Period</h3>
                                    <BarChart
                                        data={workflow.stepStatus || []}
                                        labelKey="status"
                                        valueKey="count"
                                        colorFn={value => WORKFLOW_COLORS[value] || '#64748b'}
                                        labelMap={{ PENDING: 'Pending', IN_PROGRESS: 'In Progress', BLOCKED: 'Blocked', COMPLETED: 'Completed', SKIPPED: 'Skipped', CANCELLED: 'Cancelled' }}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Task Analytics */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="bg-white rounded-lg border border-gray-200 p-5">
                                <h3 className="text-sm font-semibold text-gray-900 mb-3">Tasks by Status</h3>
                                <DonutChart data={tasks.byStatus} labelKey="status" valueKey="count"
                                    colorFn={s => STATUS_COLORS[s] || '#6b7280'} labelMap={STATUS_LABELS} />
                            </div>
                            <div className="bg-white rounded-lg border border-gray-200 p-5">
                                <h3 className="text-sm font-semibold text-gray-900 mb-3">Tasks by Category</h3>
                                <BarChart data={tasks.byCategory} labelKey="category" valueKey="count"
                                    colorFn={() => '#6366f1'} labelMap={CATEGORY_LABELS} />
                            </div>
                            <div className="bg-white rounded-lg border border-gray-200 p-5">
                                <h3 className="text-sm font-semibold text-gray-900 mb-3">Sentiment Analysis</h3>
                                <DonutChart data={tasks.bySentiment} labelKey="sentiment" valueKey="count"
                                    colorFn={s => SENTIMENT_COLORS[s] || '#6b7280'}
                                    labelMap={{ POSITIVE: 'Positive', NEUTRAL: 'Neutral', NEGATIVE: 'Negative' }} />
                            </div>
                            <div className="bg-white rounded-lg border border-gray-200 p-5">
                                <h3 className="text-sm font-semibold text-gray-900 mb-3">Task Volume Over Period</h3>
                                {tasks.overTime.length > 0 ? (
                                    <SparkBars data={tasks.overTime} labelKey="date" valueKey="count" />
                                ) : <p className="text-sm text-gray-400 text-center py-8">No tasks in this period</p>}
                            </div>
                            <div className="bg-white rounded-lg border border-gray-200 p-5">
                                <h3 className="text-sm font-semibold text-gray-900 mb-3">Resolution Outcomes</h3>
                                <DonutChart
                                    data={tasks.outcomes?.byResolvedAs || []}
                                    labelKey="resolvedAs"
                                    valueKey="count"
                                    colorFn={value => RESOLVED_AS_COLORS[value] || '#6b7280'}
                                    labelMap={RESOLVED_AS_LABELS}
                                />
                            </div>
                            <div className="bg-white rounded-lg border border-gray-200 p-5">
                                <h3 className="text-sm font-semibold text-gray-900 mb-3">Customer Outcomes</h3>
                                <BarChart
                                    data={tasks.outcomes?.byCustomerOutcome || []}
                                    labelKey="customerOutcome"
                                    valueKey="count"
                                    colorFn={() => '#0f766e'}
                                    labelMap={CUSTOMER_OUTCOME_LABELS}
                                />
                            </div>
                        </div>

                        {/* Identity, Follow-up, and Handoffs */}
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900 mb-4">Operational Quality Signals</h2>
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                <div className="bg-white rounded-lg border border-gray-200 p-5">
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="text-sm font-semibold text-gray-900">Identity Resolution</h3>
                                        <span className="text-xs text-gray-500">{formatPercent(identity.reviewRate)} review rate</span>
                                    </div>
                                    <BarChart
                                        data={identity.byStatus || []}
                                        labelKey="status"
                                        valueKey="count"
                                        colorFn={value => value === 'REVIEW_REQUIRED' ? '#f59e0b' : value === 'AUTO_LINKED' || value === 'AUTO_CREATED' ? '#10b981' : '#64748b'}
                                        labelMap={IDENTITY_LABELS}
                                    />
                                </div>
                                <div className="bg-white rounded-lg border border-gray-200 p-5">
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="text-sm font-semibold text-gray-900">Follow-up Automation</h3>
                                        <span className="text-xs text-gray-500">{formatNumber(followUps.generated)} generated</span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 mb-4">
                                        <div className="rounded-md bg-amber-50 p-2 text-center">
                                            <div className="text-lg font-bold text-amber-700">{formatNumber(followUps.pending)}</div>
                                            <div className="text-[10px] text-amber-700">Pending</div>
                                        </div>
                                        <div className="rounded-md bg-green-50 p-2 text-center">
                                            <div className="text-lg font-bold text-green-700">{formatNumber(followUps.completed)}</div>
                                            <div className="text-[10px] text-green-700">Done</div>
                                        </div>
                                        <div className="rounded-md bg-gray-50 p-2 text-center">
                                            <div className="text-lg font-bold text-gray-700">{formatNumber(followUps.cancelled)}</div>
                                            <div className="text-[10px] text-gray-700">Cancelled</div>
                                        </div>
                                    </div>
                                    <BarChart
                                        data={followUps.byAutomationType || []}
                                        labelKey="automationType"
                                        valueKey="count"
                                        colorFn={() => '#0891b2'}
                                        labelMap={AUTOMATION_LABELS}
                                    />
                                </div>
                                <div className="bg-white rounded-lg border border-gray-200 p-5">
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="text-sm font-semibold text-gray-900">Handoffs</h3>
                                        <span className="text-xs text-gray-500">{handoffs.averagePerCreatedTask || 0} per task</span>
                                    </div>
                                    <BarChart
                                        data={handoffs.byRecipient || []}
                                        labelKey="name"
                                        valueKey="count"
                                        colorFn={() => '#6366f1'}
                                    />
                                    <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                                        <div className="rounded-md bg-slate-50 p-2">
                                            <div className="font-semibold text-slate-900">{formatNumber(timing.reopenedTasks)}</div>
                                            <div className="text-slate-500">Reopened cases</div>
                                        </div>
                                        <div className="rounded-md bg-slate-50 p-2">
                                            <div className="font-semibold text-slate-900">{formatNumber(response.awaitingResponseThreads)}</div>
                                            <div className="text-slate-500">Awaiting replies</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Bookings */}
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900 mb-4">Bookings & Events</h2>
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                <div className="bg-white rounded-lg border border-gray-200 p-5 flex flex-col items-center justify-center">
                                    <div className="text-3xl font-bold text-indigo-600">{bookings.taskCount}</div>
                                    <div className="text-sm text-gray-500 mt-1">Booking Enquiries</div>
                                    <div className="text-xs text-gray-400 mt-0.5">Tasks with category BOOKING</div>
                                </div>
                                <div className="bg-white rounded-lg border border-gray-200 p-5 flex flex-col items-center justify-center">
                                    <div className="text-3xl font-bold text-purple-600">{bookings.eventCount}</div>
                                    <div className="text-sm text-gray-500 mt-1">Calendar Events</div>
                                    <div className="text-xs text-gray-400 mt-0.5">Scheduled in this period</div>
                                </div>
                                <div className="bg-white rounded-lg border border-gray-200 p-5">
                                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Bookings by Day of Week</h3>
                                    {bookings.byDay.length > 0 ? (
                                        <BarChart
                                            data={DAY_ORDER.map(d => bookings.byDay.find((b: any) => b.dayName === d) || { dayName: d, count: 0 })}
                                            labelKey="dayName" valueKey="count"
                                            colorFn={() => '#8b5cf6'}
                                            labelMap={{ Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun' }}
                                        />
                                    ) : <p className="text-sm text-gray-400 text-center py-4">No booking data</p>}
                                </div>
                            </div>
                        </div>

                        {/* Customer Insights */}
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900 mb-4">Customer Insights</h2>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <div className="bg-white rounded-lg border border-gray-200 p-5">
                                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Acquisition Source</h3>
                                    <BarChart data={customers.bySource} labelKey="source" valueKey="count"
                                        colorFn={() => '#8b5cf6'} labelMap={SOURCE_LABELS} />
                                </div>
                                <div className="bg-white rounded-lg border border-gray-200 p-5">
                                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Loyalty Tier</h3>
                                    <DonutChart data={customers.byLoyalty} labelKey="loyaltyTier" valueKey="count"
                                        colorFn={t => LOYALTY_COLORS[t] || '#6b7280'} labelMap={LOYALTY_LABELS} />
                                </div>
                                <div className="bg-white rounded-lg border border-gray-200 p-5 lg:col-span-2">
                                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Top 10 by Spend</h3>
                                    {customers.topBySpend.length > 0 ? (
                                        <div className="overflow-x-auto">
                                            <table className="min-w-full divide-y divide-gray-200 text-sm">
                                                <thead className="bg-gray-50">
                                                    <tr>
                                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tier</th>
                                                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Orders</th>
                                                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Spend</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100">
                                                    {customers.topBySpend.map((c: any, i: number) => (
                                                        <tr key={c.id} className="hover:bg-gray-50">
                                                            <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                                                            <td className="px-3 py-2 font-medium text-gray-900">{c.firstName} {c.lastName}</td>
                                                            <td className="px-3 py-2 text-gray-500">{c.email || '—'}</td>
                                                            <td className="px-3 py-2">
                                                                <span className="px-2 py-0.5 text-xs rounded-full font-semibold"
                                                                    style={{ backgroundColor: `${LOYALTY_COLORS[c.loyaltyTier] || '#9ca3af'}20`, color: LOYALTY_COLORS[c.loyaltyTier] || '#9ca3af' }}>
                                                                    {LOYALTY_LABELS[c.loyaltyTier] || 'None'}
                                                                </span>
                                                            </td>
                                                            <td className="px-3 py-2 text-right text-gray-600">{c.totalOrders || 0}</td>
                                                            <td className="px-3 py-2 text-right font-semibold text-emerald-600">${parseFloat(c.lifetimeSpend || 0).toLocaleString('en-AU')}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : <p className="text-sm text-gray-400 text-center py-8">No customer data</p>}
                                </div>
                            </div>
                        </div>

                        {/* Staff & Communication */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="bg-white rounded-lg border border-gray-200 p-5">
                                <h3 className="text-sm font-semibold text-gray-900 mb-3">Staff Workload</h3>
                                {staff.length > 0 ? (
                                    <div className="space-y-3">
                                        {staff.map((s: any, i: number) => (
                                            <div key={i} className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-sm flex-shrink-0">
                                                    {(s.name || '?').charAt(0).toUpperCase()}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between text-sm">
                                                        <span className="font-medium text-gray-900 truncate">{s.name}</span>
                                                        <span className="text-gray-500">{s.resolved}/{s.total}</span>
                                                    </div>
                                                    <div className="bg-gray-100 rounded-full h-2 mt-1">
                                                        <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${s.rate}%` }}></div>
                                                    </div>
                                                    <div className="text-[10px] text-gray-400 mt-0.5">{s.rate}% resolution rate</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : <p className="text-sm text-gray-400 text-center py-8">No assigned tasks in this period</p>}
                            </div>

                            <div className="bg-white rounded-lg border border-gray-200 p-5">
                                <h3 className="text-sm font-semibold text-gray-900 mb-3">Communication Channels</h3>
                                <div className="space-y-5">
                                    <div>
                                        <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">By Channel</h4>
                                        <BarChart data={communication.byChannel} labelKey="source" valueKey="count"
                                            colorFn={s => s === 'sms' ? '#3b82f6' : s === 'email' ? '#8b5cf6' : '#f59e0b'}
                                            labelMap={{ sms: 'SMS', email: 'Email', voice: 'Voice' }} />
                                    </div>
                                    <div>
                                        <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Direction</h4>
                                        <BarChart data={communication.byDirection} labelKey="direction" valueKey="count"
                                            colorFn={d => d === 'inbound' ? '#10b981' : '#6366f1'}
                                            labelMap={{ inbound: 'Inbound', outbound: 'Outbound' }} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                );
            })()}
        </div>
    );
}
