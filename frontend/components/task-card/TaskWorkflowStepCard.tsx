'use client';

import { useState } from 'react';
import type { Staff, TaskStep, TaskStepInput } from '../../lib/api';
import AttachmentPanel from '../AttachmentPanel';
import Dialog from '../ui/Dialog';
import { formatDateTimeInput, humanize, stepStatusClasses } from './TaskCardSupport';
import { TaskStepSuggestionEditor } from './TaskStepSuggestionEditor';

interface TaskWorkflowStepCardProps {
    step: TaskStep;
    index: number;
    isOpen: boolean;
    users: Staff[];
    userRole?: string | null;
    currentUserId?: number | null;
    updating: boolean;
    lockReason: string;
    canOverrideOwnership: boolean;
    suggestionDraft: Partial<TaskStep>;
    activeSuggestionStepId: number | null;
    onToggle: (stepId: number) => void;
    onUpdate: (stepId: number, updates: Partial<TaskStepInput>) => void;
    onDelete: (stepId: number) => void;
    onHistoryChanged: () => void;
    onSuggestionDraftChange: (stepId: number, updates: Partial<TaskStep>) => void;
    onGenerateSuggestion: (stepId: number) => void;
    onSaveSuggestion: (step: TaskStep) => void;
    onActionSuggestion: (step: TaskStep) => void;
}

export function TaskWorkflowStepCard({
    step,
    index,
    isOpen,
    users,
    userRole,
    currentUserId,
    updating,
    lockReason,
    canOverrideOwnership,
    suggestionDraft,
    activeSuggestionStepId,
    onToggle,
    onUpdate,
    onDelete,
    onHistoryChanged,
    onSuggestionDraftChange,
    onGenerateSuggestion,
    onSaveSuggestion,
    onActionSuggestion
}: TaskWorkflowStepCardProps) {
    const ownerName = users.find(user => user.id === step.ownerUserId)?.displayName || 'Unassigned';
    const dueSummary = step.dueAt ? new Date(step.dueAt).toLocaleDateString() : 'No due date';
    const locked = Boolean(lockReason);
    const [completionDialogOpen, setCompletionDialogOpen] = useState(false);
    const [completionNotes, setCompletionNotes] = useState('');

    return (
        <>
        <div className={`overflow-hidden rounded-lg border bg-slate-50 ${isOpen ? 'border-blue-200 shadow-sm' : 'border-slate-200'}`}>
            <button
                type="button"
                onClick={() => onToggle(step.id)}
                className="flex w-full items-start justify-between gap-3 p-3 text-left hover:bg-slate-100"
                aria-expanded={isOpen}
            >
                <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Step {index + 1}</span>
                        <span className={`rounded-md border px-2 py-1 text-[11px] font-bold uppercase tracking-wider ${stepStatusClasses(step.status)}`}>
                            {humanize(step.status)}
                        </span>
                        <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-700">
                            {humanize(step.waitingOn)}
                        </span>
                        {step.suggestionStatus && (
                            <span className="rounded bg-blue-50 px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-blue-700">
                                Suggestion {step.suggestionStatus}
                            </span>
                        )}
                    </div>
                    <div className="text-sm font-semibold text-slate-900">{step.title}</div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span>Owner: {ownerName}</span>
                        <span>Due: {dueSummary}</span>
                    </div>
                </div>
                <span className="shrink-0 rounded border border-slate-200 bg-white px-2 py-1 text-xs font-bold uppercase text-slate-600">
                    {isOpen ? 'Collapse' : 'Open'}
                </span>
            </button>

            {isOpen && (
                <div className="border-t border-slate-200 p-3">
                    {step.description && (
                        <div className="mb-3 whitespace-pre-wrap text-sm text-slate-600">{step.description}</div>
                    )}
                    {lockReason && (
                        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                            {lockReason}
                        </div>
                    )}

                    <div className="mt-3 grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
                        <div>
                            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500">Owner</label>
                            <select
                                className="w-full rounded border border-slate-300 bg-white p-2 text-sm"
                                value={step.ownerUserId ?? ''}
                                disabled={updating || userRole === 'staff'}
                                onChange={(event) => onUpdate(step.id, { ownerUserId: event.target.value ? Number(event.target.value) : null })}
                            >
                                <option value="">Unassigned</option>
                                {users.map(user => (
                                    <option key={user.id} value={user.id}>{user.displayName}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500">Waiting On</label>
                            <select
                                className="w-full rounded border border-slate-300 bg-white p-2 text-sm"
                                value={step.waitingOn}
                                disabled={updating || locked}
                                onChange={(event) => onUpdate(step.id, { waitingOn: event.target.value })}
                            >
                                {['NONE', 'STAFF', 'CUSTOMER', 'MANAGER', 'EXTERNAL'].map(option => (
                                    <option key={option} value={option}>{option}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500">Due</label>
                            <input
                                type="datetime-local"
                                className="w-full rounded border border-slate-300 bg-white p-2 text-sm"
                                value={formatDateTimeInput(step.dueAt)}
                                disabled={updating || locked}
                                onChange={(event) => onUpdate(step.id, { dueAt: event.target.value ? new Date(event.target.value).toISOString() : null })}
                            />
                        </div>
                    </div>

                    {(step.blockedReason || step.completionNotes) && (
                        <div className="mt-3 space-y-1 text-sm">
                            {step.blockedReason && (
                                <div className="text-red-700"><span className="font-semibold">Blocked:</span> {step.blockedReason}</div>
                            )}
                            {step.completionNotes && (
                                <div className="text-green-700"><span className="font-semibold">Completion Note:</span> {step.completionNotes}</div>
                            )}
                        </div>
                    )}

                    <div className="mt-3">
                        <AttachmentPanel
                            entityType="TASK_STEP"
                            entityId={step.id}
                            title="Step Attachments"
                            canUpload={!locked}
                            canDeleteAll={canOverrideOwnership}
                            currentUserId={currentUserId}
                            disabledReason={lockReason}
                            compact
                            onChanged={onHistoryChanged}
                        />
                    </div>

                    <TaskStepSuggestionEditor
                        step={step}
                        draft={suggestionDraft}
                        updating={updating}
                        activeSuggestionStepId={activeSuggestionStepId}
                        lockReason={lockReason}
                        onDraftChange={onSuggestionDraftChange}
                        onGenerate={onGenerateSuggestion}
                        onSave={onSaveSuggestion}
                        onAction={onActionSuggestion}
                    />

                    <div className="mt-3 flex flex-wrap gap-2">
                        <button
                            type="button"
                            disabled={updating || locked}
                            onClick={() => {
                                setCompletionNotes(step.completionNotes || '');
                                setCompletionDialogOpen(true);
                            }}
                            className="rounded bg-green-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-green-700 disabled:opacity-50"
                        >
                            Complete
                        </button>
                        <button
                            type="button"
                            disabled={updating || locked}
                            onClick={() => onUpdate(step.id, { status: 'SKIPPED', blockedReason: null, completionNotes: null, waitingOn: 'NONE' })}
                            className="rounded bg-amber-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50"
                        >
                            Skip
                        </button>
                        <button
                            type="button"
                            disabled={updating || locked}
                            onClick={() => onUpdate(step.id, { status: 'PENDING', blockedReason: null, completionNotes: null })}
                            className="rounded bg-slate-700 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                        >
                            Reopen
                        </button>
                        <button
                            type="button"
                            disabled={updating || locked}
                            onClick={() => onDelete(step.id)}
                            className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                        >
                            Remove
                        </button>
                    </div>
                </div>
            )}
        </div>
        <Dialog
            open={completionDialogOpen}
            onClose={() => setCompletionDialogOpen(false)}
            title="Complete workflow step"
            description={step.title}
            closeOnBackdrop={!updating}
            closeOnEscape={!updating}
        >
            <div className="space-y-3 px-5 py-4">
                <label htmlFor={`completion-notes-${step.id}`} className="block text-sm font-semibold text-[#344039]">Completion note (optional)</label>
                <textarea id={`completion-notes-${step.id}`} value={completionNotes} onChange={event => setCompletionNotes(event.target.value)} rows={4} className="form-control" placeholder="Record what was completed or handed over." />
            </div>
            <div className="flex justify-end gap-3 border-t border-[var(--border)] px-5 py-4">
                <button type="button" className="btn-secondary" onClick={() => setCompletionDialogOpen(false)} disabled={updating}>Cancel</button>
                <button type="button" className="btn-primary" disabled={updating} onClick={() => {
                    onUpdate(step.id, { status: 'COMPLETED', completionNotes: completionNotes.trim(), blockedReason: null, waitingOn: 'NONE' });
                    setCompletionDialogOpen(false);
                }}>{updating ? 'Saving...' : 'Complete step'}</button>
            </div>
        </Dialog>
        </>
    );
}
