'use client';

import { Task, Staff } from '../lib/api';

interface TaskSummaryCardProps {
    task: Task;
    users: Staff[];
    isFlagged: boolean;
    onToggleFlag?: (taskId: number) => void;
    onClick: () => void;
}

export default function TaskSummaryCard({
    task,
    users,
    isFlagged,
    onToggleFlag,
    onClick
}: TaskSummaryCardProps) {
    const formatLabel = (value?: string | null) => {
        if (!value) return '';
        return value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
    };

    const formatDate = (dateString?: string | null) => {
        if (!dateString) return 'Not set';
        const date = new Date(dateString);
        if (Number.isNaN(date.getTime())) return 'Not set';
        return new Intl.DateTimeFormat('en-AU', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).format(date);
    };

    const getAssigneeName = () => {
        if (!task.assigneeId) return 'Unassigned';
        const user = users.find(u => u.id === task.assigneeId);
        return user ? user.displayName : 'Unknown';
    };

    const getPayload = () => {
        let raw = task.payload;
        if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { } }
        return raw && typeof raw === 'object' ? raw : {};
    };

    const getSummary = () => {
        const raw = getPayload();
        if (typeof raw.summary === 'string') return raw.summary;
        if (task.Message?.body) return task.Message.body;
        return null;
    };

    const payload = getPayload();
    const manualIntake = payload.manualIntake;
    const identityNeedsReview = manualIntake?.identityResolutionStatus === 'REVIEW_REQUIRED';
    const followUpAutomation = payload.followUpAutomation;
    const summaryText = getSummary();
    const workflowText = task.nextStepSummary || task.blockedReason || null;
    const title = formatLabel(task.subType || task.type || task.category || 'Task');
    const customerName = task.Member
        ? `${task.Member.firstName || ''} ${task.Member.lastName || ''}`.trim()
        : manualIntake?.requesterName || 'No customer linked';
    const priorityLabel = formatLabel(task.priority || 'normal');
    const deadlineLabel = task.isOverdue ? 'Overdue' : task.isDueSoon ? 'Due soon' : null;
    const dueTone = task.isOverdue ? 'danger' : task.isDueSoon || task.dueAt ? 'warning' : 'normal';
    const isCleanlyActioned = task.status === 'ACTIONED' && task.workflowState === 'COMPLETED';
    const showWorkflowPill = Boolean(task.workflowState && task.workflowState !== 'NOT_STARTED' && !isCleanlyActioned);
    const showResolvedAsPill = Boolean(task.resolvedAs && !(task.status === 'ACTIONED' && task.resolvedAs === 'COMPLETED'));

    return (
        <article
            onClick={onClick}
            className={`group cursor-pointer rounded-lg border bg-[var(--surface)] p-4 shadow-sm transition hover:border-[#c6d1c1] hover:shadow-md
                ${task.priority === 'high' ? 'border-l-4 border-l-red-500' : ''}
                ${task.priority === 'normal' || !task.priority ? 'border-l-4 border-l-amber-500' : ''}
                ${task.priority === 'low' ? 'border-l-4 border-l-teal-500' : ''}
                ${task.isOverdue ? 'ring-1 ring-red-200 bg-red-50/30' : ''}
            `}
        >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-3">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                if (onToggleFlag) onToggleFlag(task.id);
                            }}
                            className={`icon-button -ml-1 -mt-1 ${isFlagged ? 'text-amber-500' : 'text-[#a4aea0] hover:text-amber-500'}`}
                            title={isFlagged ? 'Unflag' : 'Flag for follow-up'}
                            aria-label={isFlagged ? 'Unflag task' : 'Flag task'}
                        >
                            <svg className="h-5 w-5" fill={isFlagged ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 16.9 6.6 19.8l1-6.1-4.4-4.3 6.1-.9L12 3Z" />
                            </svg>
                        </button>

                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="min-w-0 truncate text-base font-semibold text-[#1c231f] sm:text-lg">
                                    {title}
                                </h2>
                                <span className="rounded-md bg-[#eef1e8] px-2 py-0.5 text-xs font-semibold text-[#536158]">
                                    #{task.id}
                                </span>
                                {identityNeedsReview && (
                                    <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
                                        Identity review
                                    </span>
                                )}
                                {(task.followUpRequired || followUpAutomation || task.parentTaskId) && (
                                    <span className="rounded-md border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-800">
                                        Follow-up
                                    </span>
                                )}
                                {deadlineLabel && (
                                    <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${task.isOverdue ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                                        {deadlineLabel}
                                    </span>
                                )}
                            </div>

                            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--muted)]">
                                <span className="font-medium text-[#344039]">{customerName}</span>
                                {task.Member?.email && <span>{task.Member.email}</span>}
                                {manualIntake?.inboundMethod && <span>{formatLabel(manualIntake.inboundMethod)}</span>}
                            </div>

                            {summaryText && (
                                <p className="mt-3 line-clamp-2 text-sm leading-6 text-[#536158]">
                                    {summaryText}
                                </p>
                            )}
                        </div>
                    </div>

                    {workflowText && (
                        <div className={`mt-4 rounded-md border px-3 py-2 text-sm ${task.workflowState === 'BLOCKED' ? 'border-red-200 bg-red-50 text-red-800' : 'border-[#dce4d7] bg-[#f8faf6] text-[#344039]'}`}>
                            <span className="mr-2 text-xs font-bold uppercase text-[var(--muted)]">
                                {task.blockedReason ? 'Blocked' : 'Next'}
                            </span>
                            {workflowText}
                        </div>
                    )}

                    <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-[#e2e8dd] pt-4 text-sm md:grid-cols-4">
                        <MetaItem label="Assignee" value={getAssigneeName()} tone={!task.assigneeId ? 'danger' : 'normal'} />
                        <MetaItem label="Created" value={formatDate(task.createdAt)} />
                        <MetaItem label={task.isOverdue ? 'Overdue' : task.isDueSoon ? 'Due Soon' : 'Due'} value={formatDate(task.dueAt)} tone={dueTone} />
                        <MetaItem label="Waiting On" value={formatLabel(task.waitingOn || 'NONE')} tone={task.waitingOn && task.waitingOn !== 'NONE' ? 'warning' : 'normal'} />
                    </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-start gap-2 lg:max-w-[280px] lg:justify-end">
                    <Pill label={formatLabel(task.status)} tone={task.status === 'PENDING' ? 'warning' : task.status === 'ACTIONED' ? 'success' : 'danger'} />
                    {showWorkflowPill && (
                        <Pill
                            label={formatLabel(task.workflowState)}
                            tone={task.workflowState === 'BLOCKED' ? 'danger' : task.workflowState === 'WAITING' ? 'warning' : task.workflowState === 'COMPLETED' ? 'success' : 'info'}
                        />
                    )}
                    <Pill label={formatLabel(task.category || 'GENERAL')} tone="neutral" />
                    <Pill label={`${priorityLabel} priority`} tone={task.priority === 'high' ? 'danger' : task.priority === 'low' ? 'info' : 'warning'} />
                    {deadlineLabel && <Pill label={deadlineLabel} tone={task.isOverdue ? 'danger' : 'warning'} />}
                    {showResolvedAsPill && <Pill label={formatLabel(task.resolvedAs)} tone="neutral" />}
                </div>
            </div>
        </article>
    );
}

function MetaItem({ label, value, tone = 'normal' }: { label: string; value: string; tone?: 'normal' | 'warning' | 'danger' }) {
    const valueClass = tone === 'danger'
        ? 'text-red-700'
        : tone === 'warning'
            ? 'text-amber-700'
            : 'text-[#344039]';
    return (
        <div className="min-w-0">
            <div className="text-xs font-semibold uppercase text-[var(--muted)]">{label}</div>
            <div className={`mt-0.5 truncate font-medium ${valueClass}`}>{value}</div>
        </div>
    );
}

function Pill({ label, tone }: { label: string; tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }) {
    const classes = {
        success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
        warning: 'border-amber-200 bg-amber-50 text-amber-800',
        danger: 'border-red-200 bg-red-50 text-red-800',
        info: 'border-teal-200 bg-teal-50 text-teal-800',
        neutral: 'border-[#dce4d7] bg-[#f8faf6] text-[#536158]'
    };
    return (
        <span className={`rounded-md border px-2.5 py-1 text-xs font-bold uppercase ${classes[tone]}`}>
            {label}
        </span>
    );
}
