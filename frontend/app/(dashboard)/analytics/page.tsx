'use client';

import { useState, useEffect, useCallback } from 'react';
import { getAnalytics } from '../../../lib/api';

const STATUS_LABELS: Record<string, string> = {
    PENDING: 'Pending', ACTIONED: 'Actioned', REJECTED: 'Rejected'
};
const STATUS_COLORS: Record<string, string> = {
    PENDING: '#f59e0b', ACTIONED: '#10b981', REJECTED: '#ef4444'
};
const CATEGORY_LABELS: Record<string, string> = {
    BOOKING: 'Booking', ORDER: 'Order', ACCOUNT: 'Account', GENERAL: 'General',
    INTERNAL: 'Internal', SYSTEM: 'System', OPERATIONS: 'Operations'
};
const SOURCE_LABELS: Record<string, string> = {
    manual: 'Manual', sms: 'SMS', email: 'Email', booking: 'Booking',
    wine_club: 'Wine Club', pos: 'POS', import: 'Import', website: 'Website',
    referral: 'Referral', walk_in: 'Walk-in'
};
const LOYALTY_LABELS: Record<string, string> = { none: 'None', bronze: 'Bronze', silver: 'Silver', gold: 'Gold', platinum: 'Platinum' };
const LOYALTY_COLORS: Record<string, string> = { none: '#9ca3af', bronze: '#d97706', silver: '#6b7280', gold: '#eab308', platinum: '#6366f1' };
const SENTIMENT_COLORS: Record<string, string> = { POSITIVE: '#10b981', NEUTRAL: '#6b7280', NEGATIVE: '#ef4444' };
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

    let cumulative = 0;
    const segments = data.map(d => {
        const val = parseInt(d[valueKey]) || 0;
        const pct = (val / total) * 100;
        const start = cumulative;
        cumulative += pct;
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

    useEffect(() => { load(); }, [load]);

    const goBack = () => setOffset(o => o + 1);
    const goForward = () => setOffset(o => Math.max(0, o - 1));
    const goToday = () => setOffset(0);

    const periodLabel = data?.period?.label || '';

    return (
        <div className="px-4 py-6 sm:px-0 space-y-8">
            {/* Header + Period Selector */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
                    <p className="text-sm text-gray-500 mt-1">Operations and customer engagement insights.</p>
                </div>
                <div className="flex items-center gap-2">
                    {/* Period granularity buttons */}
                    <div className="flex bg-gray-100 rounded-lg p-0.5">
                        {(['day', 'week', 'month', 'year'] as const).map(p => (
                            <button key={p} onClick={() => { setPeriod(p); setOffset(0); }}
                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${period === p ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                                {p.charAt(0).toUpperCase() + p.slice(1)}
                            </button>
                        ))}
                    </div>

                    {/* Navigation arrows */}
                    <div className="flex items-center gap-1 ml-2">
                        <button onClick={goBack} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors" title="Previous">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                        </button>
                        <button onClick={goToday} disabled={offset === 0}
                            className="px-2.5 py-1 text-xs font-medium rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-default transition-colors">
                            Today
                        </button>
                        <button onClick={goForward} disabled={offset === 0}
                            className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700 disabled:opacity-40 transition-colors" title="Next">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        </button>
                    </div>
                </div>
            </div>

            {/* Period Label */}
            {periodLabel && (
                <div className="text-center">
                    <span className="inline-flex items-center px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-sm font-medium">
                        📅 {periodLabel}
                    </span>
                </div>
            )}

            {loading && (
                <div className="flex items-center justify-center py-16">
                    <div className="animate-spin rounded-full h-8 w-8 border-4 border-gray-300 border-t-indigo-600"></div>
                </div>
            )}

            {error && (
                <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded-md">
                    <p className="text-sm text-red-700">{error}</p>
                </div>
            )}

            {data && !loading && (() => {
                const { kpis, tasks, customers, staff, communication, bookings } = data;
                return (
                    <>
                        {/* KPI Cards */}
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                            {[
                                { label: 'Open Tasks', value: kpis.openTasks, icon: '📋', bg: 'bg-amber-50', color: 'text-amber-600' },
                                { label: 'Resolved', value: kpis.resolvedInPeriod, icon: '✅', bg: 'bg-green-50', color: 'text-green-600' },
                                { label: 'New Customers', value: kpis.newCustomers, icon: '🆕', bg: 'bg-sky-50', color: 'text-sky-600' },
                                { label: 'Total Customers', value: kpis.totalCustomers, icon: '👥', bg: 'bg-indigo-50', color: 'text-indigo-600' },
                                { label: 'Wine Club', value: kpis.wineClubMembers, icon: '🍷', bg: 'bg-purple-50', color: 'text-purple-600' },
                                { label: 'Revenue Tracked', value: `$${(kpis.revenueTracked || 0).toLocaleString('en-AU', { minimumFractionDigits: 0 })}`, icon: '💰', bg: 'bg-emerald-50', color: 'text-emerald-600' },
                                { label: 'Inbound Msgs', value: kpis.inboundMessages, icon: '📨', bg: 'bg-blue-50', color: 'text-blue-600' }
                            ].map((kpi, i) => (
                                <div key={i} className={`${kpi.bg} rounded-lg p-3 border border-opacity-20`}>
                                    <div className="text-sm mb-0.5">{kpi.icon}</div>
                                    <div className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</div>
                                    <div className="text-[10px] text-gray-500 mt-0.5 leading-tight">{kpi.label}</div>
                                </div>
                            ))}
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
