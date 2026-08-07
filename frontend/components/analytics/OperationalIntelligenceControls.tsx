import type { OperationalIntelligenceConfig } from '../../lib/api';
import { operationalLabel } from '../../lib/operationalPresentation';
import { PreviewImpactChart } from './AnalyticsCharts';
import type { AnalyticsDashboardController } from './useAnalyticsDashboard';

interface OperationalIntelligenceControlsProps {
    dashboard: AnalyticsDashboardController;
}

export function OperationalIntelligenceControls({ dashboard }: OperationalIntelligenceControlsProps) {
    const {
        intelligenceConfig, configPresets, configFieldMetadata, configAuditEvents,
        configPreview, configPreviewPreset, configPreviewTitle, configPreviewLoading,
        configStatus, configSaving, period, updateConfigSection, saveIntelligenceConfig,
        previewConfigPreset, previewCurrentConfig, applyConfigPreset
    } = dashboard;

    return (
        <>
    {intelligenceConfig && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="text-sm font-semibold text-gray-900">Intelligence Controls</h3>
                    <p className="mt-1 text-xs text-gray-500">Tune scheduled materialization, due reminders, and the thresholds used for suggested review signals.</p>
                </div>
                <button
                    type="button"
                    onClick={previewCurrentConfig}
                    disabled={configPreviewLoading || configSaving}
                    className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-[var(--brand)] disabled:opacity-50"
                >
                    {configPreviewLoading && !configPreviewPreset ? 'Previewing...' : 'Preview current edits'}
                </button>
                <button
                    type="button"
                    onClick={saveIntelligenceConfig}
                    disabled={configSaving}
                    className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                    {configSaving ? 'Saving…' : 'Save controls'}
                </button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
                {configPresets.length > 0 && (
                    <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-600 md:col-span-3">
                        <span className="mb-2 block font-semibold text-slate-900">Recommended presets</span>
                        <div className="grid gap-2 md:grid-cols-3">
                            {configPresets.map(preset => (
                                <div
                                    key={preset.key}
                                    className={`rounded-md border bg-white p-3 ${configPreviewPreset === preset.key ? 'border-[var(--brand)]' : 'border-slate-200'}`}
                                >
                                    <span className="block font-semibold text-slate-900">{preset.label}</span>
                                    <span className="mt-1 block text-[11px] text-slate-500">{preset.description}</span>
                                    <div className="mt-3 flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => previewConfigPreset(preset.key)}
                                            disabled={configPreviewLoading || configSaving}
                                            className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:border-[var(--brand)] disabled:opacity-50"
                                        >
                                            {configPreviewLoading && configPreviewPreset === preset.key ? 'Previewing...' : 'Preview impact'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => applyConfigPreset(preset.key)}
                                            disabled={configSaving}
                                            className="rounded-md bg-[var(--brand)] px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                                        >
                                            Apply
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                {configPreview && (
                    <div className="rounded-md border border-blue-100 bg-blue-50 p-3 text-xs text-blue-900 md:col-span-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <span className="block font-semibold">{configPreviewTitle}</span>
                                <span className="mt-1 block text-[11px] text-blue-700">
                                    Suggested signals would move from {configPreview.impact.currentSuggestedCount} to {configPreview.impact.previewSuggestedCount}
                                    {' '}({configPreview.impact.deltaSuggestedCount >= 0 ? '+' : ''}{configPreview.impact.deltaSuggestedCount}) for the selected {period}.
                                </span>
                                {configPreview.history && configPreview.history.periodCount > 1 && (
                                    <span className="mt-1 block text-[11px] text-blue-700">
                                        Across {configPreview.history.periodCount} recent {period} windows: {configPreview.history.totals.currentSuggestedCount} -&gt; {configPreview.history.totals.previewSuggestedCount}
                                        {' '}({configPreview.history.totals.deltaSuggestedCount >= 0 ? '+' : ''}{configPreview.history.totals.deltaSuggestedCount} total).
                                    </span>
                                )}
                            </div>
                            <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-blue-700">
                                {configPreview.changedKeys.length} control change{configPreview.changedKeys.length === 1 ? '' : 's'}
                            </span>
                        </div>
                        <div className="mt-3 grid gap-2 md:grid-cols-3">
                            <div className="rounded-md bg-white p-2">
                                <span className="block font-semibold text-slate-900">By signal type</span>
                                <div className="mt-1 space-y-1 text-[11px] text-slate-600">
                                    {Object.entries(configPreview.impact.previewByType).length === 0 && <div>No suggested signals.</div>}
                                    {Object.entries(configPreview.impact.previewByType).map(([type, count]) => (
                                        <div key={type} className="flex justify-between gap-2">
                                            <span>{operationalLabel(type)}</span>
                                            <span>{configPreview.impact.currentByType[type as keyof typeof configPreview.impact.currentByType] || 0} -&gt; {count}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="rounded-md bg-white p-2">
                                <span className="block font-semibold text-slate-900">Newly included</span>
                                <div className="mt-1 space-y-1 text-[11px] text-slate-600">
                                    {configPreview.impact.addedSignals.length === 0 && <div>No additional signals.</div>}
                                    {configPreview.impact.addedSignals.slice(0, 3).map(signal => (
                                        <div key={signal.fingerprint || signal.title}>{signal.title}</div>
                                    ))}
                                </div>
                            </div>
                            <div className="rounded-md bg-white p-2">
                                <span className="block font-semibold text-slate-900">No longer included</span>
                                <div className="mt-1 space-y-1 text-[11px] text-slate-600">
                                    {configPreview.impact.removedSignals.length === 0 && <div>No signals removed.</div>}
                                    {configPreview.impact.removedSignals.slice(0, 3).map(signal => (
                                        <div key={signal.fingerprint || signal.title}>{signal.title}</div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        {configPreview.impact.changedSignals.length > 0 && (
                            <div className="mt-2 rounded-md bg-white p-2 text-[11px] text-slate-600">
                                <span className="font-semibold text-slate-900">Severity changes: </span>
                                {configPreview.impact.changedSignals.slice(0, 3).map(signal => `${signal.title} (${signal.previousSeverity} -> ${signal.severity})`).join('; ')}
                            </div>
                        )}
                        {configPreview.changedFields && configPreview.changedFields.length > 0 && (
                            <div className="mt-3 rounded-md bg-white p-2">
                                <div className="text-[11px] font-semibold text-slate-900">Control changes</div>
                                <div className="mt-2 grid gap-2 md:grid-cols-2">
                                    {configPreview.changedFields.slice(0, 6).map(field => (
                                        <div key={field.path} className="rounded bg-slate-50 px-2 py-1 text-[11px] text-slate-600">
                                            <div className="font-semibold text-slate-800">{field.path}</div>
                                            <div>{String(field.beforeValue)} -&gt; {String(field.afterValue)}</div>
                                            <div className="mt-1 text-slate-500">{field.description}</div>
                                        </div>
                                    ))}
                                </div>
                                {configPreview.changedFields.length > 6 && (
                                    <div className="mt-2 text-[11px] text-slate-500">
                                        +{configPreview.changedFields.length - 6} more control change{configPreview.changedFields.length - 6 === 1 ? '' : 's'}.
                                    </div>
                                )}
                            </div>
                        )}
                        {configPreview.history && configPreview.history.periodCount > 1 && (
                            <div className="mt-3 rounded-md bg-white p-2">
                                <div className="text-[11px] font-semibold text-slate-900">Historical impact chart</div>
                                <div className="mt-2">
                                    <PreviewImpactChart windows={configPreview.history.windows} />
                                </div>
                                <div className="mt-3 text-[11px] font-semibold text-slate-900">Recent window comparison</div>
                                <div className="mt-2 grid gap-1 text-[11px] text-slate-600 md:grid-cols-2">
                                    {configPreview.history.windows.map(window => (
                                        <div key={`${window.period.start}-${window.period.end}`} className="flex justify-between gap-2 rounded bg-slate-50 px-2 py-1">
                                            <span>{new Date(window.period.start).toLocaleDateString()} - {new Date(new Date(window.period.end).getTime() - 1).toLocaleDateString()}</span>
                                            <span className="font-medium text-slate-800">
                                                {window.impact.currentSuggestedCount} -&gt; {window.impact.previewSuggestedCount}
                                                {' '}({window.impact.deltaSuggestedCount >= 0 ? '+' : ''}{window.impact.deltaSuggestedCount})
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
                <label className="rounded-md bg-slate-50 p-3 text-xs text-slate-600">
                    <span className="mb-1 block font-semibold text-slate-900">Scheduled run</span>
                    <select
                        value={intelligenceConfig.scheduler.enabled ? 'enabled' : 'disabled'}
                        onChange={event => updateConfigSection('scheduler', { enabled: event.target.value === 'enabled' })}
                        className="w-full rounded-md border border-slate-200 bg-white px-2 py-1"
                    >
                        <option value="disabled">Disabled</option>
                        <option value="enabled">Enabled</option>
                    </select>
                </label>
                <label className="rounded-md bg-slate-50 p-3 text-xs text-slate-600">
                    <span className="mb-1 block font-semibold text-slate-900">Scheduler period</span>
                    <select
                        value={intelligenceConfig.scheduler.period}
                        onChange={event => updateConfigSection('scheduler', { period: event.target.value as OperationalIntelligenceConfig['scheduler']['period'] })}
                        className="w-full rounded-md border border-slate-200 bg-white px-2 py-1"
                    >
                        <option value="day">Day</option>
                        <option value="week">Week</option>
                        <option value="month">Month</option>
                        <option value="year">Year</option>
                    </select>
                </label>
                <label className="rounded-md bg-slate-50 p-3 text-xs text-slate-600">
                    <span className="mb-1 block font-semibold text-slate-900">Scheduler offset</span>
                    <input
                        type="number"
                        min={0}
                        max={52}
                        value={intelligenceConfig.scheduler.offset}
                        onChange={event => updateConfigSection('scheduler', { offset: Number(event.target.value) || 0 })}
                        className="w-full rounded-md border border-slate-200 bg-white px-2 py-1"
                    />
                </label>
                <label className="rounded-md bg-slate-50 p-3 text-xs text-slate-600">
                    <span className="mb-1 block font-semibold text-slate-900">Trend minimum delta</span>
                    {configFieldMetadata['thresholds.trendMinimumDelta'] && <span className="mb-2 block text-[11px] text-slate-500">{configFieldMetadata['thresholds.trendMinimumDelta']}</span>}
                    <input
                        type="number"
                        min={1}
                        value={intelligenceConfig.thresholds.trendMinimumDelta}
                        onChange={event => updateConfigSection('thresholds', { trendMinimumDelta: Number(event.target.value) || 1 })}
                        className="w-full rounded-md border border-slate-200 bg-white px-2 py-1"
                    />
                </label>
                <label className="rounded-md bg-slate-50 p-3 text-xs text-slate-600">
                    <span className="mb-1 block font-semibold text-slate-900">Classification correction %</span>
                    {configFieldMetadata['thresholds.classificationCorrectionRate'] && <span className="mb-2 block text-[11px] text-slate-500">{configFieldMetadata['thresholds.classificationCorrectionRate']}</span>}
                    <input
                        type="number"
                        min={1}
                        max={100}
                        value={intelligenceConfig.thresholds.classificationCorrectionRate}
                        onChange={event => updateConfigSection('thresholds', { classificationCorrectionRate: Number(event.target.value) || 1 })}
                        className="w-full rounded-md border border-slate-200 bg-white px-2 py-1"
                    />
                </label>
                <label className="rounded-md bg-slate-50 p-3 text-xs text-slate-600">
                    <span className="mb-1 block font-semibold text-slate-900">Review due soon hours</span>
                    <input
                        type="number"
                        min={1}
                        value={intelligenceConfig.reminders.dueSoonHours}
                        onChange={event => updateConfigSection('reminders', { dueSoonHours: Number(event.target.value) || 1 })}
                        className="w-full rounded-md border border-slate-200 bg-white px-2 py-1"
                    />
                </label>
            </div>
            {configStatus && <p className="mt-3 text-xs text-slate-500">{configStatus}</p>}
            {configAuditEvents.length > 0 && (
                <div className="mt-4 rounded-md border border-slate-100 bg-slate-50 p-3">
                    <div className="text-xs font-semibold text-slate-900">Recent control changes</div>
                    <div className="mt-2 space-y-2">
                        {configAuditEvents.slice(0, 3).map(event => (
                            <div key={event.id} className="text-[11px] text-slate-600">
                                <span className="font-medium text-slate-800">{event.Actor?.displayName || event.Actor?.email || 'Manager'}</span>
                                {' changed '}
                                <span>{(event.changedKeys || []).slice(0, 3).join(', ') || 'controls'}</span>
                                {event.preset && <span>{` using ${event.preset} preset`}</span>}
                                <span className="text-slate-400"> · {new Date(event.createdAt).toLocaleString()}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )}
        </>
    );
}
