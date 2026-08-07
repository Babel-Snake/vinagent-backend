'use client';

import { Component, type ReactNode } from 'react';
import type { TaskAction, TaskStep } from '../../lib/api';

interface TaskActivityErrorBoundaryProps {
    children: ReactNode;
}

interface TaskActivityErrorBoundaryState {
    hasError: boolean;
}

export class TaskActivityErrorBoundary extends Component<TaskActivityErrorBoundaryProps, TaskActivityErrorBoundaryState> {
    state = { hasError: false };

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    Some activity details could not be displayed, but the task itself is still available.
                </div>
            );
        }

        return this.props.children;
    }
}

interface TaskActivityDetailsProps {
    action: TaskAction;
    showAdvancedActivity: boolean;
    renderBasicDetails: (action: TaskAction) => ReactNode;
    renderAdvancedDetails: (action: TaskAction) => ReactNode;
}

export function TaskActivityDetails({
    action,
    showAdvancedActivity,
    renderBasicDetails,
    renderAdvancedDetails
}: TaskActivityDetailsProps) {
    return <>{showAdvancedActivity ? renderAdvancedDetails(action) : renderBasicDetails(action)}</>;
}

interface TaskSectionProps {
    title: string;
    summary?: string;
    count?: number;
    children: ReactNode;
}

export function TaskSection({ title, summary, count, children }: TaskSectionProps) {
    return (
        <section className="overflow-hidden rounded-lg border border-[#dfe6da] bg-white">
            <div className="px-4 py-3">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-[#344039]">{title}</span>
                        {typeof count === 'number' && (
                            <span className="rounded bg-white px-2 py-0.5 text-[11px] font-bold text-slate-500 ring-1 ring-slate-200">
                                {count}
                            </span>
                        )}
                    </div>
                    {summary && <div className="mt-1 truncate text-sm text-slate-600">{summary}</div>}
                </div>
            </div>
            <div className="border-t border-slate-200 p-4">{children}</div>
        </section>
    );
}

export function sortedTaskSteps(steps: TaskStep[]) {
    return [...steps].sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.id - b.id;
    });
}

export function defaultOpenStepId(steps: TaskStep[]) {
    const sorted = sortedTaskSteps(steps);
    return sorted.find(step => step.status === 'IN_PROGRESS')?.id
        ?? sorted.find(step => step.status === 'BLOCKED')?.id
        ?? sorted.find(step => step.status === 'PENDING')?.id
        ?? sorted[0]?.id
        ?? null;
}

export function humanize(value?: string | null, fallback = 'Not recorded') {
    if (!value) return fallback;
    return String(value)
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[._-]+/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, char => char.toUpperCase());
}

export function formatEnumLabel(value?: string | null) {
    if (!value) return 'Not recorded';
    return humanize(value);
}

export function formatShortDate(value?: string | null) {
    if (!value) return 'Not set';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Not set';
    return new Intl.DateTimeFormat('en-AU', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit'
    }).format(date);
}

export function formatDateTimeInput(value?: string | null) {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    const local = new Date(parsed.getTime() - (parsed.getTimezoneOffset() * 60000));
    return local.toISOString().slice(0, 16);
}

export function stepStatusClasses(status?: string | null) {
    if (status === 'COMPLETED') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    if (status === 'BLOCKED') return 'border-red-200 bg-red-50 text-red-800';
    if (status === 'IN_PROGRESS') return 'border-blue-200 bg-blue-50 text-blue-800';
    if (status === 'PENDING') return 'border-amber-200 bg-amber-50 text-amber-800';
    return 'border-slate-200 bg-slate-50 text-slate-700';
}

export function workflowStateClasses(state?: string | null) {
    if (state === 'COMPLETED') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    if (state === 'BLOCKED') return 'border-red-200 bg-red-50 text-red-800';
    if (state === 'WAITING') return 'border-amber-200 bg-amber-50 text-amber-800';
    if (state === 'IN_PROGRESS') return 'border-blue-200 bg-blue-50 text-blue-800';
    return 'border-slate-200 bg-slate-50 text-slate-700';
}

export function CaseSidebarItem({
    label,
    value,
    tone = 'normal'
}: {
    label: string;
    value: string;
    tone?: 'normal' | 'warning' | 'danger';
}) {
    const valueClass = tone === 'danger'
        ? 'text-red-700'
        : tone === 'warning'
            ? 'text-amber-700'
            : 'text-[#1c231f]';

    return (
        <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">{label}</div>
            <div className={`mt-0.5 break-words font-medium ${valueClass}`}>{value}</div>
        </div>
    );
}
