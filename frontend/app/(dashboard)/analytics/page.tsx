'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { BarChart, DonutChart, SparkBars } from '../../../components/analytics/AnalyticsCharts';
import {
    AUTOMATION_LABELS,
    CATEGORY_LABELS,
    CUSTOMER_OUTCOME_LABELS,
    DAY_ORDER,
    formatHours,
    formatMinutes,
    formatNumber,
    formatPercent,
    IDENTITY_LABELS,
    LOYALTY_COLORS,
    LOYALTY_LABELS,
    RESOLVED_AS_COLORS,
    RESOLVED_AS_LABELS,
    SENTIMENT_COLORS,
    SOURCE_LABELS,
    STATUS_COLORS,
    STATUS_LABELS,
    WAITING_LABELS,
    WORKFLOW_COLORS,
    WORKFLOW_LABELS
} from '../../../components/analytics/analyticsPresentation';
import { OperationalIntelligenceSection } from '../../../components/analytics/OperationalIntelligenceSection';
import { useAnalyticsDashboard } from '../../../components/analytics/useAnalyticsDashboard';

const INSIGHT_VIEWS = [
    { id: 'overview', label: 'Overview' },
    { id: 'operations', label: 'Operations' },
    { id: 'customers', label: 'Customers & revenue' },
    { id: 'team', label: 'Team' },
    { id: 'intelligence', label: 'Intelligence' }
] as const;

type InsightView = typeof INSIGHT_VIEWS[number]['id'];

export default function AnalyticsPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const dashboard = useAnalyticsDashboard();
    const {
        data, loading, error, period, offset, setPeriod, setOffset,
        goBack, goForward, goToday, periodLabel
    } = dashboard;
    const requestedView = searchParams.get('view');
    const activeView: InsightView = INSIGHT_VIEWS.some(view => view.id === requestedView)
        ? requestedView as InsightView
        : 'overview';

    function selectView(nextView: InsightView) {
        const params = new URLSearchParams(searchParams.toString());
        if (nextView === 'overview') params.delete('view');
        else params.set('view', nextView);
        const query = params.toString();
        router.replace(query ? `/analytics?${query}` : '/analytics', { scroll: false });
    }

    return (
        <div className="page-shell space-y-7">
            {/* Header + Period Selector */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">Insights</h1>
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

            <nav className="flex gap-1 overflow-x-auto rounded-lg border border-[var(--border)] bg-[#f8faf6] p-1" aria-label="Insights views">
                {INSIGHT_VIEWS.map(view => (
                    <button
                        key={view.id}
                        type="button"
                        onClick={() => selectView(view.id)}
                        aria-current={activeView === view.id ? 'page' : undefined}
                        className={`whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold ${activeView === view.id
                            ? 'bg-[var(--surface)] text-[var(--brand-strong)] shadow-sm'
                            : 'text-[var(--muted)] hover:bg-white hover:text-[#1c231f]'}`}
                    >
                        {view.label}
                    </button>
                ))}
            </nav>

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
                const acknowledgements = operations.acknowledgements || {};
                const intelligence = operations.intelligence || {};
                return (
                    <>
                        {/* KPI Cards */}
                        {activeView === 'overview' && (
                        <>
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                            {[
                                { label: 'Open Tasks', value: kpis.openTasks, dot: 'bg-amber-500', color: 'text-amber-700' },
                                { label: 'Overdue', value: formatNumber(workflow.overdueTasks), dot: 'bg-red-500', color: 'text-red-700' },
                                { label: 'Waiting', value: formatNumber(workflow.currentWaiting), dot: 'bg-amber-500', color: 'text-amber-700' },
                                { label: 'First Response', value: formatMinutes(response.avgFirstResponseMinutes), dot: 'bg-teal-600', color: 'text-teal-800' },
                                { label: 'Resolution', value: formatHours(timing.avgResolutionHours), dot: 'bg-emerald-500', color: 'text-emerald-700' },
                                { label: 'Revenue Tracked', value: `$${(kpis.revenueTracked || 0).toLocaleString('en-AU', { minimumFractionDigits: 0 })}`, dot: 'bg-[var(--brand)]', color: 'text-[var(--brand-strong)]' }
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
                        <p className="text-sm text-[var(--muted)]">Use the view selector above to investigate operations, customers, team capacity, or intelligence signals.</p>
                        </>
                        )}

                        {/* Operational Flow */}
                        {activeView === 'operations' && (
                        <>
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h2 className="text-lg font-semibold text-gray-900">Operational Flow</h2>
                                    <p className="text-sm text-gray-500">Where work is waiting, blocked, delayed, or moving through handoffs.</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
                                {[
                                    { label: 'Avg Resolution', value: formatHours(timing.avgResolutionHours), sub: 'closed cases' },
                                    { label: 'First Response', value: formatMinutes(response.avgFirstResponseMinutes), sub: `${formatPercent(response.responseCoverageRate)} coverage` },
                                    { label: 'Waiting Now', value: formatNumber(workflow.currentWaiting), sub: `${formatHours(timing.avgWaitingAgeHours)} avg age` },
                                    { label: 'Blocked Now', value: formatNumber(workflow.currentBlocked), sub: `${formatHours(timing.avgBlockedAgeHours)} avg age` },
                                    { label: 'Overdue', value: formatNumber(workflow.overdueTasks), sub: `${formatNumber(workflow.dueSoonTasks)} due soon` },
                                    { label: 'Handoffs', value: formatNumber(handoffs.total), sub: `${formatNumber(handoffs.tasksWithHandoffs)} tasks touched` },
                                    { label: 'Notice Read Rate', value: formatPercent(acknowledgements.completionRate), sub: `${formatNumber(acknowledgements.completedAcknowledgements)} confirmations` },
                                    { label: 'Unread Notices', value: formatNumber(acknowledgements.outstandingAcknowledgements), sub: `${formatNumber(acknowledgements.overdueNotices)} notices overdue` }
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

                        </>
                        )}

                        {/* Cross-object intelligence */}
                        {activeView === 'intelligence' && <OperationalIntelligenceSection dashboard={dashboard} intelligence={intelligence} />}


                        {/* Bookings */}
                        {activeView === 'customers' && (
                        <>
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
                                            data={DAY_ORDER.map(d => bookings.byDay.find(b => b.dayName === d) || { dayName: d, count: 0 })}
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
                                                    {customers.topBySpend.map((c, i: number) => (
                                                        <tr key={c.id} className="hover:bg-gray-50">
                                                            <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                                                            <td className="px-3 py-2 font-medium text-gray-900">{c.firstName} {c.lastName}</td>
                                                            <td className="px-3 py-2 text-gray-500">{c.email || 'â€”'}</td>
                                                            <td className="px-3 py-2">
                                                                <span className="px-2 py-0.5 text-xs rounded-full font-semibold"
                                                                    style={{ backgroundColor: `${LOYALTY_COLORS[c.loyaltyTier] || '#9ca3af'}20`, color: LOYALTY_COLORS[c.loyaltyTier] || '#9ca3af' }}>
                                                                    {LOYALTY_LABELS[c.loyaltyTier] || 'None'}
                                                                </span>
                                                            </td>
                                                            <td className="px-3 py-2 text-right text-gray-600">{c.totalOrders || 0}</td>
                                                            <td className="px-3 py-2 text-right font-semibold text-emerald-600">${Number(c.lifetimeSpend || 0).toLocaleString('en-AU')}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : <p className="text-sm text-gray-400 text-center py-8">No customer data</p>}
                                </div>
                            </div>
                        </div>

                        </>
                        )}

                        {/* Team */}
                        {activeView === 'team' && (
                            <div className="bg-white rounded-lg border border-gray-200 p-5">
                                <h3 className="text-sm font-semibold text-gray-900 mb-3">Staff Workload</h3>
                                {staff.length > 0 ? (
                                    <div className="space-y-3">
                                        {staff.map((s, i: number) => (
                                            <div key={i} className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-[var(--brand-soft)] flex items-center justify-center text-[var(--brand-strong)] font-bold text-sm flex-shrink-0">
                                                    {(s.name || '?').charAt(0).toUpperCase()}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between text-sm">
                                                        <span className="font-medium text-gray-900 truncate">{s.name}</span>
                                                        <span className="text-gray-500">{s.resolved}/{s.total}</span>
                                                    </div>
                                                    <div className="bg-gray-100 rounded-full h-2 mt-1">
                                                        <div className="h-full rounded-full bg-[var(--brand)] transition-all" style={{ width: `${s.rate}%` }}></div>
                                                    </div>
                                                    <div className="text-[10px] text-gray-400 mt-0.5">{s.rate}% resolution rate</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : <p className="text-sm text-gray-400 text-center py-8">No assigned tasks in this period</p>}
                            </div>
                        )}

                        {activeView === 'customers' && (
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
                        )}
                    </>
                );
            })()}
        </div>
    );
}
