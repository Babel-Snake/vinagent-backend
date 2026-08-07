import Link from 'next/link';
import type { AnalyticsResponse } from '../../lib/api';
import { formatHours, formatNumber, formatPercent } from './analyticsPresentation';
import type { AnalyticsDashboardController } from './useAnalyticsDashboard';

type IntelligenceData = NonNullable<NonNullable<AnalyticsResponse['operations']>['intelligence']>;

interface OperationalIntelligenceInsightsProps {
    dashboard: AnalyticsDashboardController;
    intelligence: IntelligenceData;
}

export function OperationalIntelligenceInsights({
    dashboard,
    intelligence
}: OperationalIntelligenceInsightsProps) {
    const {
        signals, signalLoading, signalError, signalBusyId, loadSignals,
        saveRecurrenceSignal, reviewSignal, materializeSuggestedSignals, actionSignal
    } = dashboard;
    const requestAging = intelligence.requestAging || {};
    const classification = intelligence.classification || {};
    const conversions = intelligence.conversions || {};
    const recurrence = intelligence.recurrence || {};
    const trends = intelligence.trends || {};
    const suggestedSignals = intelligence.suggestedSignals || [];

    return (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <div className="rounded-lg border border-gray-200 bg-white p-5 xl:col-span-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h3 className="text-sm font-semibold text-gray-900">Suggested Review Signals</h3>
                        <p className="mt-1 text-xs text-gray-500">Thresholded advisory findings from this period. Saving them places them into the manager review queue; it does not create tasks.</p>
                    </div>
                    <button
                        type="button"
                        onClick={materializeSuggestedSignals}
                        disabled={signalBusyId === 'materialize' || suggestedSignals.length === 0}
                        className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    >
                        {signalBusyId === 'materialize' ? 'Saving…' : `Save ${suggestedSignals.length} suggested`}
                    </button>
                </div>
                <div className="mt-4 grid gap-2 md:grid-cols-2">
                    {suggestedSignals.slice(0, 6).map(signal => (
                        <div key={signal.fingerprint || signal.title} className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-sm font-semibold text-slate-900">{signal.title}</span>
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${signal.severity === 'critical' ? 'bg-red-100 text-red-700' : signal.severity === 'warning' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>{signal.severity}</span>
                            </div>
                            <div className="mt-1 text-[11px] text-slate-500">{signal.signalType}</div>
                            {signal.summary && <div className="mt-1 text-xs text-slate-600">{signal.summary}</div>}
                        </div>
                    ))}
                    {suggestedSignals.length === 0 && <div className="text-sm text-gray-400">No non-recurrence signal met the review threshold for this period.</div>}
                </div>
            </div>
        
            <div className="rounded-lg border border-gray-200 bg-white p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-gray-900">Pending Request Aging</h3>
                    <span className="text-xs text-gray-500">{formatHours(requestAging.averageAgeHours)} average</span>
                </div>
                <div className="mb-4 grid grid-cols-4 gap-2 text-center">
                    {[
                        ['<24h', requestAging.buckets?.under24Hours],
                        ['1–3d', requestAging.buckets?.oneToThreeDays],
                        ['3–7d', requestAging.buckets?.threeToSevenDays],
                        ['7d+', requestAging.buckets?.overSevenDays]
                    ].map(([label, value]) => (
                        <div key={String(label)} className="rounded-md bg-slate-50 p-2">
                            <div className="text-lg font-bold text-slate-900">{formatNumber(value)}</div>
                            <div className="text-[10px] text-slate-500">{label}</div>
                        </div>
                    ))}
                </div>
                <div className="space-y-2">
                    {(requestAging.oldest || []).map(item => (
                        <Link key={item.id} href={item.href} className="flex items-center justify-between gap-3 rounded-md border border-slate-100 px-3 py-2 text-sm hover:bg-slate-50">
                            <span className="truncate font-medium text-slate-800">{item.title}</span>
                            <span className="shrink-0 text-xs text-slate-500">{formatHours(item.ageHours)}</span>
                        </Link>
                    ))}
                    {!requestAging.oldest?.length && <div className="text-sm text-gray-400">No pending Requests.</div>}
                </div>
            </div>
        
            <div className="rounded-lg border border-gray-200 bg-white p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-gray-900">Classification Corrections</h3>
                    <span className="text-xs text-gray-500">{formatPercent(classification.correctionRate)} corrected</span>
                </div>
                <div className="mb-4 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-md bg-slate-50 p-2"><div className="text-lg font-bold">{formatNumber(classification.evaluated)}</div><div className="text-[10px] text-slate-500">Evaluated</div></div>
                    <div className="rounded-md bg-emerald-50 p-2"><div className="text-lg font-bold text-emerald-700">{formatNumber(classification.accepted)}</div><div className="text-[10px] text-emerald-700">Accepted</div></div>
                    <div className="rounded-md bg-amber-50 p-2"><div className="text-lg font-bold text-amber-700">{formatNumber(classification.corrected)}</div><div className="text-[10px] text-amber-700">Corrected</div></div>
                </div>
                <div className="space-y-2 text-sm">
                    {(classification.byTransition || []).map(row => (
                        <div key={`${row.suggestedType}-${row.confirmedType}`} className="flex justify-between rounded-md bg-slate-50 px-3 py-2">
                            <span>{row.suggestedType} → {row.confirmedType}</span><strong>{row.count}</strong>
                        </div>
                    ))}
                    {!classification.byTransition?.length && <div className="text-gray-400">No confirmed AI classifications in this period.</div>}
                </div>
            </div>
        
            <div className="rounded-lg border border-gray-200 bg-white p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-gray-900">Conversion Outcomes</h3>
                    <span className="text-xs text-gray-500">{formatPercent(conversions.completionRate)} completed</span>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center">
                    {[
                        ['Created', conversions.total, 'text-slate-900'],
                        ['Pending', conversions.pending, 'text-amber-700'],
                        ['Completed', conversions.completed, 'text-emerald-700'],
                        ['Rejected', conversions.rejected, 'text-red-700']
                    ].map(([label, value, color]) => (
                        <div key={String(label)} className="rounded-md bg-slate-50 p-2">
                            <div className={`text-lg font-bold ${color}`}>{formatNumber(value)}</div><div className="text-[10px] text-slate-500">{label}</div>
                        </div>
                    ))}
                </div>
                <div className="mt-4 text-xs text-gray-500">Tracks Tasks generated from Requests and Notes; source records remain intact.</div>
            </div>
        
            <div className="rounded-lg border border-gray-200 bg-white p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-gray-900">Trend Comparison</h3>
                    <span className="text-xs text-gray-500">vs previous period</span>
                </div>
                <div className="space-y-2">
                    {(trends.byType || []).map(row => (
                        <div key={row.type} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm">
                            <span className="font-medium text-slate-800">{row.type}</span>
                            <span className="text-slate-500">{row.current} now / {row.previous} prior</span>
                            <span className={row.delta > 0 ? 'font-semibold text-amber-700' : row.delta < 0 ? 'font-semibold text-emerald-700' : 'font-semibold text-slate-500'}>
                                {row.delta > 0 ? '+' : ''}{row.delta} ({row.changePercent}%)
                            </span>
                        </div>
                    ))}
                    {!trends.byType?.length && <div className="text-sm text-gray-400">No trend data for this period.</div>}
                </div>
                <div className="mt-4 border-t border-slate-100 pt-3">
                    <div className="mb-2 text-xs font-semibold uppercase text-slate-500">Area movement</div>
                    <div className="space-y-2">
                        {(trends.byArea || []).slice(0, 5).map(row => (
                            <div key={row.areaKey} className="flex items-center justify-between text-xs">
                                <span className="truncate text-slate-700">{row.areaName}</span>
                                <span className="text-slate-500">{row.current} / {row.previous}</span>
                                <span className={row.delta > 0 ? 'text-amber-700' : row.delta < 0 ? 'text-emerald-700' : 'text-slate-500'}>
                                    {row.delta > 0 ? '+' : ''}{row.delta}
                                </span>
                            </div>
                        ))}
                        {!trends.byArea?.length && <div className="text-xs text-gray-400">No area movement yet.</div>}
                    </div>
                </div>
            </div>
        
            <div className="rounded-lg border border-gray-200 bg-white p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-gray-900">Possible Recurrence</h3>
                    <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold uppercase text-amber-800">Advisory</span>
                </div>
                <div className="space-y-3">
                    {(recurrence.clusters || []).map(cluster => (
                        <div key={cluster.key} className="rounded-md border border-amber-100 bg-amber-50/50 p-3">
                            <div className="flex justify-between gap-3"><strong className="text-sm text-slate-900">{cluster.keywords.join(' · ')}</strong><span className="text-xs text-slate-500">{cluster.count} items</span></div>
                            <div className="mt-2 flex flex-wrap gap-2">
                                {cluster.examples.map(example => <Link key={example.key} href={example.href} className="rounded bg-white px-2 py-1 text-xs text-[var(--brand-strong)] hover:underline">{example.title}</Link>)}
                            </div>
                            <button
                                type="button"
                                onClick={() => saveRecurrenceSignal(cluster)}
                                disabled={signalBusyId === `recurrence-${cluster.key}`}
                                className="mt-3 rounded-md border border-amber-200 bg-white px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                            >
                                {signalBusyId === `recurrence-${cluster.key}` ? 'Saving…' : 'Save signal'}
                            </button>
                        </div>
                    ))}
                    {!recurrence.clusters?.length && <div className="text-sm text-gray-400">No repeated themes met the evidence threshold.</div>}
                </div>
            </div>
        
            <div className="rounded-lg border border-gray-200 bg-white p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-gray-900">Saved Signal Review</h3>
                    <button type="button" onClick={loadSignals} className="text-xs font-semibold text-[var(--brand-strong)] hover:underline">Refresh</button>
                </div>
                {signalError && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{signalError}</div>}
                {signalLoading && <div className="text-sm text-gray-400">Loading saved signals…</div>}
                {!signalLoading && (
                    <div className="space-y-3">
                        {signals.map(signal => (
                            <div key={signal.id} className="rounded-md border border-slate-100 p-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="text-sm font-semibold text-slate-900">{signal.title}</div>
                                        <div className="mt-1 text-xs text-slate-500">{signal.signalType} · {signal.severity} · {signal.status}</div>
                                        {signal.summary && <div className="mt-1 text-xs text-slate-600">{signal.summary}</div>}
                                        {signal.Area && <div className="mt-1 text-[11px] text-slate-500">Area: {signal.Area.name}</div>}
                                        {signal.ReviewOwner && <div className="mt-1 text-[11px] text-slate-500">Owner: {signal.ReviewOwner.displayName || signal.ReviewOwner.email}</div>}
                                        {signal.reviewDueAt && <div className="mt-1 text-[11px] text-slate-500">Due: {new Date(signal.reviewDueAt).toLocaleDateString('en-AU')}</div>}
                                        {signal.suggestedAction && <div className="mt-2 rounded bg-slate-50 px-2 py-1 text-xs text-slate-600">{signal.suggestedAction}</div>}
                                    </div>
                                    {signal.actionTaskId && (
                                        <Link href={`/tasks?taskId=${signal.actionTaskId}`} className="shrink-0 rounded bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 hover:underline">
                                            Task #{signal.actionTaskId}
                                        </Link>
                                    )}
                                </div>
                                {signal.status !== 'ACTION_CREATED' && (
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <button type="button" onClick={() => actionSignal(signal.id)} disabled={signalBusyId === signal.id} className="rounded-md bg-[var(--brand)] px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50">
                                            Create task
                                        </button>
                                        <button type="button" onClick={() => reviewSignal(signal.id, 'ACKNOWLEDGED')} disabled={signalBusyId === signal.id} className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50">
                                            Acknowledge
                                        </button>
                                        <button type="button" onClick={() => reviewSignal(signal.id, 'DISMISSED')} disabled={signalBusyId === signal.id} className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50">
                                            Dismiss
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                        {signals.length === 0 && <div className="text-sm text-gray-400">No saved signals yet. Save a recurrence signal to put it into review.</div>}
                    </div>
                )}
            </div>
        </div>
    );
}
