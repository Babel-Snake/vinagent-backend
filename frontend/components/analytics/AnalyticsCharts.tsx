import type { OperationalIntelligenceConfigPreviewResponse } from '../../lib/api';

export type ChartDatum = Record<string, string | number | null | undefined>;

function numericValue(datum: ChartDatum, key: string) {
    const value = Number(datum[key]);
    return Number.isFinite(value) ? value : 0;
}

function labelValue(datum: ChartDatum, key: string) {
    return String(datum[key] ?? 'Unknown');
}

interface ChartProps {
    data: ChartDatum[];
    labelKey: string;
    valueKey: string;
    colorFn?: (label: string) => string;
    labelMap?: Record<string, string>;
}

export function BarChart({ data, labelKey, valueKey, colorFn, labelMap }: ChartProps) {
    const max = Math.max(...data.map(d => numericValue(d, valueKey)), 1);
    return (
        <div className="space-y-2">
            {data.map((d, i) => {
                const val = numericValue(d, valueKey);
                const pct = (val / max) * 100;
                const rawLabel = labelValue(d, labelKey);
                const label = labelMap?.[rawLabel] || rawLabel;
                const color = colorFn?.(rawLabel) || '#6366f1';
                return (
                    <div key={i} className="flex items-center gap-3">
                        <div className="w-24 truncate text-right text-xs text-gray-600" title={label}>{label}</div>
                        <div className="h-5 flex-1 overflow-hidden rounded-full bg-gray-100">
                            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
                        </div>
                        <div className="w-8 text-right text-xs font-medium text-gray-700">{val}</div>
                    </div>
                );
            })}
            {data.length === 0 && <p className="py-4 text-center text-sm text-gray-400">No data for this period</p>}
        </div>
    );
}

export function PreviewImpactChart({ windows }: {
    windows: NonNullable<OperationalIntelligenceConfigPreviewResponse['history']>['windows'];
}) {
    const max = Math.max(...windows.flatMap(window => [window.impact.currentSuggestedCount, window.impact.previewSuggestedCount]), 1);
    return (
        <div className="space-y-2">
            {windows.map(window => {
                const start = new Date(window.period.start);
                const end = new Date(new Date(window.period.end).getTime() - 1);
                const currentPct = Math.max(4, (window.impact.currentSuggestedCount / max) * 100);
                const previewPct = Math.max(4, (window.impact.previewSuggestedCount / max) * 100);
                const delta = window.impact.deltaSuggestedCount;
                return (
                    <div key={`${window.period.start}-${window.period.end}`} className="rounded bg-slate-50 px-2 py-2">
                        <div className="mb-1 flex justify-between gap-2 text-[11px] text-slate-600">
                            <span>{start.toLocaleDateString()} - {end.toLocaleDateString()}</span>
                            <span className={delta > 0 ? 'text-amber-700' : delta < 0 ? 'text-emerald-700' : 'text-slate-500'}>{delta >= 0 ? '+' : ''}{delta}</span>
                        </div>
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <span className="w-12 text-[10px] text-slate-500">Current</span>
                                <div className="h-2 flex-1 rounded bg-slate-100"><div className="h-2 rounded bg-slate-400" style={{ width: `${currentPct}%` }} /></div>
                                <span className="w-5 text-right text-[10px] text-slate-500">{window.impact.currentSuggestedCount}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-12 text-[10px] text-slate-500">Preview</span>
                                <div className="h-2 flex-1 rounded bg-blue-100"><div className="h-2 rounded bg-blue-500" style={{ width: `${previewPct}%` }} /></div>
                                <span className="w-5 text-right text-[10px] text-slate-500">{window.impact.previewSuggestedCount}</span>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export function DonutChart({ data, labelKey, valueKey, colorFn, labelMap }: ChartProps) {
    const total = data.reduce((sum, d) => sum + numericValue(d, valueKey), 0);
    if (total === 0) return <p className="py-8 text-center text-sm text-gray-400">No data for this period</p>;

    const segments = data.map((d, index) => {
        const val = numericValue(d, valueKey);
        const pct = (val / total) * 100;
        const start = data.slice(0, index).reduce((sum, item) => sum + (numericValue(item, valueKey) / total) * 100, 0);
        const rawLabel = labelValue(d, labelKey);
        return { label: labelMap?.[rawLabel] || rawLabel, val, pct, start, color: colorFn?.(rawLabel) || '#6366f1' };
    });
    const gradient = segments.map(s => `${s.color} ${s.start}% ${s.start + s.pct}%`).join(', ');

    return (
        <div className="flex items-center gap-6">
            <div className="relative h-32 w-32 flex-shrink-0">
                <div className="h-32 w-32 rounded-full" style={{ background: `conic-gradient(${gradient})` }} />
                <div className="absolute inset-0 flex items-center justify-center"><div className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-lg font-bold text-gray-700">{total}</div></div>
            </div>
            <div className="space-y-1 text-xs">
                {segments.filter(s => s.val > 0).map((s, i) => (
                    <div key={i} className="flex items-center gap-2">
                        <div className="h-3 w-3 flex-shrink-0 rounded-sm" style={{ backgroundColor: s.color }} />
                        <span className="text-gray-600">{s.label}</span>
                        <span className="font-medium text-gray-800">{s.val} ({Math.round(s.pct)}%)</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function SparkBars({ data, labelKey, valueKey }: Pick<ChartProps, 'data' | 'labelKey' | 'valueKey'>) {
    const max = Math.max(...data.map(d => numericValue(d, valueKey)), 1);
    return (
        <div className="flex h-20 items-end gap-px">
            {data.map((d, i) => {
                const val = numericValue(d, valueKey);
                const pct = Math.max((val / max) * 100, 3);
                return (
                    <div key={i} className="group relative flex-1">
                        <div className="w-full cursor-default rounded-t bg-indigo-400 transition-colors hover:bg-indigo-500" style={{ height: `${pct}%` }}>
                            <div className="absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-gray-800 px-1.5 py-0.5 text-[10px] text-white group-hover:block">{labelValue(d, labelKey)}: {val}</div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
