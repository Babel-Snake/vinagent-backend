'use client';

import { useEffect, useState } from 'react';
import { getUsageSummary, type UsageSummary } from '../../../lib/usageApi';

function formatNumber(value: number) {
    return new Intl.NumberFormat('en-AU').format(Math.round(value));
}

function formatBytes(bytes: number) {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function metricQuantity(usage: UsageSummary, key: string) {
    return usage.eventMetrics[key]?.quantity || 0;
}

export default function UsagePage() {
    const [usage, setUsage] = useState<UsageSummary | null>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        let active = true;
        getUsageSummary()
            .then(result => {
                if (active) setUsage(result);
            })
            .catch(() => {
                if (active) setError('Usage information could not be loaded. Please try again.');
            });
        return () => {
            active = false;
        };
    }, []);

    if (error) {
        return <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">{error}</div>;
    }

    if (!usage) {
        return <div className="flex min-h-64 items-center justify-center" aria-label="Loading usage"><div className="h-9 w-9 animate-spin rounded-full border-4 border-[#d9dfd2] border-t-[var(--brand)]" /></div>;
    }

    const apiRequests = usage.counterMetrics['api.requests']?.eventCount || 0;
    const totalMessages = usage.operations.inboundMessages + usage.operations.outboundMessages;
    const aiTokens = metricQuantity(usage, 'ai.total_tokens');
    const periodStart = new Date(usage.window.start).toLocaleDateString('en-AU');
    const periodEnd = new Date(usage.window.end).toLocaleDateString('en-AU');
    const cards = [
        ['Active seats', formatNumber(usage.current.activeSeats), 'Current enabled staff accounts'],
        ['Active users', formatNumber(usage.activity.activeUsers), 'Users with recorded engaged time'],
        ['Engaged time', `${(usage.activity.engagedSeconds / 3600).toFixed(1)} h`, 'Visible and recently active dashboard time'],
        ['API requests', formatNumber(apiRequests), 'Authenticated business API responses'],
        ['Messages', formatNumber(totalMessages), `${formatNumber(usage.operations.outboundMessages)} outbound`],
        ['Tasks created', formatNumber(usage.operations.tasksCreated), 'Tasks created in this period'],
        ['AI tokens', formatNumber(aiTokens), 'Provider-reported input and output total'],
        ['Attachment storage', formatBytes(usage.current.storageBytes), 'Current retained attachment data']
    ];

    return (
        <div className="space-y-6">
            <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                <div>
                    <p className="text-sm font-semibold text-[var(--brand-strong)]">Pilot metering</p>
                    <h1 className="text-3xl font-bold text-[#1c231f]">Winery usage</h1>
                    <p className="mt-1 text-sm text-[var(--muted)]">Aggregate operational usage from {periodStart} to {periodEnd}. No customer content is collected here.</p>
                </div>
                <div className="rounded-md border border-[var(--border)] bg-white px-4 py-2 text-sm">
                    <span className="font-semibold">{usage.commercial?.planCode || 'Unconfigured'}</span>
                    <span className="ml-2 text-[var(--muted)]">{usage.commercial?.lifecycleStatus || 'No commercial profile'}</span>
                </div>
            </header>

            <section aria-label="Usage summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {cards.map(([label, value, description]) => (
                    <article key={label} className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm">
                        <p className="text-sm font-semibold text-[var(--muted)]">{label}</p>
                        <p className="mt-2 text-3xl font-bold text-[#1c231f]">{value}</p>
                        <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{description}</p>
                    </article>
                ))}
            </section>

            <section className="rounded-xl border border-[var(--border)] bg-white p-5">
                <h2 className="text-lg font-bold text-[#1c231f]">Measurement contract</h2>
                <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--muted)]">
                    Seats and storage are authoritative current values. Messages and tasks come from durable business records.
                    Engaged time excludes hidden, unfocused and idle browser time. API requests are operational measurements and are not currently charged.
                </p>
            </section>
        </div>
    );
}
