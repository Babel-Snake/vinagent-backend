import type { ReactNode } from 'react';
import type { Staff, Task } from '../../lib/api';
import AttachmentPanel from '../AttachmentPanel';
import { humanize, TaskSection } from './TaskCardSupport';

interface TaskOutcomeEditorProps {
    task: Task;
    assigneeName: string;
    userRole?: string | null;
    canAssign: boolean;
    isStaffAssignmentReview: boolean;
    assignmentUsers: Staff[];
    updating: boolean;
    resolvedAs: string;
    resolutionType: string;
    customerOutcome: string;
    resolutionSummary: string;
    followUpRequired: boolean;
    followUpDueAt: string;
    followUpSummary: string;
    attachmentLockReason?: string | null;
    canDeleteAllAttachments: boolean;
    currentUserId?: number | null;
    onStatusChange: (status: string) => void;
    onAssignment: (assigneeId: string) => void;
    onResolvedAsChange: (value: string) => void;
    onResolutionTypeChange: (value: string) => void;
    onCustomerOutcomeChange: (value: string) => void;
    onResolutionSummaryChange: (value: string) => void;
    onFollowUpRequiredChange: (value: boolean) => void;
    onFollowUpDueAtChange: (value: string) => void;
    onFollowUpSummaryChange: (value: string) => void;
    onSave: () => void;
    onHistoryChanged: () => void;
}

const RESOLVED_AS_OPTIONS = ['COMPLETED', 'WORKAROUND', 'ESCALATED', 'DECLINED', 'DUPLICATE', 'NO_ACTION'];
const RESOLUTION_TYPE_OPTIONS = [
    'EXECUTED', 'REPLIED', 'MANUAL_WORKAROUND', 'POLICY_DECLINE', 'CUSTOMER_NO_RESPONSE',
    'NO_ACTION_NEEDED', 'SPAM_OR_INVALID', 'EXTERNAL_ESCALATION', 'INTERNAL_ESCALATION',
    'MERGED_DUPLICATE', 'ALREADY_RESOLVED', 'INFO_ONLY'
];
const CUSTOMER_OUTCOME_OPTIONS = [
    'BOOKING_CONFIRMED', 'ORDER_UPDATED', 'ACCOUNT_UPDATED', 'INFO_PROVIDED',
    'ISSUE_RESOLVED', 'REQUEST_DECLINED', 'REFERRED', 'NO_CHANGE', 'UNKNOWN'
];

function formatEnum(value?: string | null) {
    return value ? value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, char => char.toUpperCase()) : 'Not recorded';
}

export function TaskOutcomeEditor({
    task, assigneeName, userRole, canAssign, isStaffAssignmentReview, assignmentUsers,
    updating, resolvedAs, resolutionType, customerOutcome, resolutionSummary,
    followUpRequired, followUpDueAt, followUpSummary, attachmentLockReason,
    canDeleteAllAttachments, currentUserId, onStatusChange, onAssignment,
    onResolvedAsChange, onResolutionTypeChange, onCustomerOutcomeChange,
    onResolutionSummaryChange, onFollowUpRequiredChange, onFollowUpDueAtChange,
    onFollowUpSummaryChange, onSave, onHistoryChanged
}: TaskOutcomeEditorProps) {
    const disabled = updating || task.status === 'PENDING';
    return (
        <>
            <TaskSection title="Case Controls" summary={`${humanize(task.status)} / ${assigneeName}`}>
                <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
                    <div>
                        <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">Status</label>
                        <div className={`relative w-full rounded-md border px-2 py-2 text-sm font-medium ${statusClasses(task.status)}`}>
                            <select className="w-full border-none bg-transparent p-0 text-sm font-medium" value={task.status} onChange={(event) => onStatusChange(event.target.value)} disabled={updating}>
                                <option value="PENDING">Pending</option>
                                <option value="ACTIONED">Actioned</option>
                                {userRole !== 'staff' && <option value="REJECTED">Rejected</option>}
                            </select>
                        </div>
                    </div>
                    {canAssign && (
                        <div>
                            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">{isStaffAssignmentReview ? 'Assign to staff' : 'Assignee'}</label>
                            <select className="form-control" value={task.assigneeId || ''} onChange={(event) => onAssignment(event.target.value)} disabled={updating}>
                                <option value="">Unassigned</option>
                                {assignmentUsers.map(user => <option key={user.id} value={user.id}>{user.displayName}</option>)}
                            </select>
                        </div>
                    )}
                </div>
            </TaskSection>

            <TaskSection
                title="Outcome & Follow-up"
                summary={task.status === 'PENDING' ? 'Available after task closure' : `${formatEnum(task.resolvedAs || 'Outcome pending')}${task.followUpRequired ? ' / Follow-up required' : ''}`}
            >
                <div className="flex items-center justify-between gap-3 mb-4">
                    <div>
                        <div className="text-xs font-bold uppercase tracking-wider text-teal-700">Outcome & Follow-up</div>
                        <div className="text-sm text-teal-900">
                            {task.status === 'PENDING'
                                ? 'Close or reject the task first to record the final operational outcome.'
                                : 'Record what actually happened so reporting, AI, and follow-up stay grounded in the real case result.'}
                        </div>
                    </div>
                    {task.resolvedAt && <div className="text-xs text-teal-800 font-medium">Resolved {new Date(task.resolvedAt).toLocaleString()}</div>}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                    <OutcomeSelect label="Resolved As" value={resolvedAs} options={RESOLVED_AS_OPTIONS} placeholder="Select outcome" disabled={disabled} onChange={onResolvedAsChange} />
                    <OutcomeSelect label="Resolution Type" value={resolutionType} options={RESOLUTION_TYPE_OPTIONS} placeholder="Select resolution type" disabled={disabled} onChange={onResolutionTypeChange} />
                    <OutcomeSelect label="Customer Outcome" value={customerOutcome} options={CUSTOMER_OUTCOME_OPTIONS} placeholder="Select customer outcome" disabled={disabled} onChange={onCustomerOutcomeChange} />
                </div>

                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div>
                        <OutcomeLabel>Resolution Summary</OutcomeLabel>
                        <textarea className="w-full rounded border border-teal-200 bg-white p-3 text-sm disabled:bg-teal-100" rows={3} value={resolutionSummary} onChange={(event) => onResolutionSummaryChange(event.target.value)} disabled={disabled} placeholder="Summarize the actual outcome of this case." />
                    </div>
                    <div className="space-y-3">
                        <label className="flex items-center gap-2 text-sm font-medium text-teal-900">
                            <input type="checkbox" checked={followUpRequired} onChange={(event) => onFollowUpRequiredChange(event.target.checked)} disabled={disabled} />
                            Follow-up still required after closure
                        </label>
                        <div>
                            <OutcomeLabel>Follow-up Due</OutcomeLabel>
                            <input type="datetime-local" className="w-full rounded border border-teal-200 bg-white p-2 text-sm disabled:bg-teal-100" value={followUpDueAt} onChange={(event) => onFollowUpDueAtChange(event.target.value)} disabled={disabled || !followUpRequired} />
                        </div>
                        <div>
                            <OutcomeLabel>Follow-up Summary</OutcomeLabel>
                            <textarea className="w-full rounded border border-teal-200 bg-white p-3 text-sm disabled:bg-teal-100" rows={2} value={followUpSummary} onChange={(event) => onFollowUpSummaryChange(event.target.value)} disabled={disabled || !followUpRequired} placeholder="Describe the callback, reminder, or next contact needed." />
                        </div>
                    </div>
                </div>

                {task.status !== 'PENDING' && (
                    <div className="mt-4 flex justify-end">
                        <button type="button" onClick={onSave} disabled={updating} className="px-4 py-2 rounded bg-teal-700 text-white text-sm font-bold hover:bg-teal-800 disabled:opacity-50">Save Outcome</button>
                    </div>
                )}

                {task.status !== 'PENDING' && (
                    <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                        {(['TASK_OUTCOME', 'TASK_FOLLOW_UP'] as const).map(entityType => (
                            <AttachmentPanel
                                key={entityType}
                                entityType={entityType}
                                entityId={task.id}
                                title={entityType === 'TASK_OUTCOME' ? 'Outcome Attachments' : 'Follow-up Attachments'}
                                canUpload={!attachmentLockReason}
                                canDeleteAll={canDeleteAllAttachments}
                                currentUserId={currentUserId}
                                disabledReason={attachmentLockReason || undefined}
                                compact
                                onChanged={onHistoryChanged}
                            />
                        ))}
                    </div>
                )}
            </TaskSection>
        </>
    );
}

function OutcomeSelect({ label, value, options, placeholder, disabled, onChange }: {
    label: string; value: string; options: string[]; placeholder: string; disabled: boolean; onChange: (value: string) => void;
}) {
    return (
        <div>
            <OutcomeLabel>{label}</OutcomeLabel>
            <select className="w-full rounded border border-teal-200 bg-white p-2 text-sm disabled:bg-teal-100" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
                <option value="">{placeholder}</option>
                {options.map(option => <option key={option} value={option}>{formatEnum(option)}</option>)}
            </select>
        </div>
    );
}

function OutcomeLabel({ children }: { children: ReactNode }) {
    return <label className="block text-[11px] font-bold uppercase tracking-wider text-teal-700 mb-1">{children}</label>;
}

function statusClasses(status: Task['status']) {
    if (status === 'ACTIONED') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (status === 'PENDING') return 'bg-amber-50 text-amber-700 border-amber-200';
    if (status === 'REJECTED') return 'bg-red-50 text-red-700 border-red-200';
    return '';
}
