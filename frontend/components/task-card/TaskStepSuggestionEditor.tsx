'use client';

import type { TaskStep } from '../../lib/api';

interface TaskStepSuggestionEditorProps {
    step: TaskStep;
    draft: Partial<TaskStep>;
    updating: boolean;
    activeSuggestionStepId: number | null;
    lockReason: string;
    onDraftChange: (stepId: number, updates: Partial<TaskStep>) => void;
    onGenerate: (stepId: number) => void;
    onSave: (step: TaskStep) => void;
    onAction: (step: TaskStep) => void;
}

export function TaskStepSuggestionEditor({
    step,
    draft,
    updating,
    activeSuggestionStepId,
    lockReason,
    onDraftChange,
    onGenerate,
    onSave,
    onAction
}: TaskStepSuggestionEditorProps) {
    const draftChannel = String(draft.suggestedChannel || 'none');
    const hasSuggestion = Boolean(
        draft.suggestedReplyBody
        || draft.suggestedAction
        || step.suggestionStatus
        || step.suggestionGeneratedAt
    );
    const suggestionBusy = updating && activeSuggestionStepId === step.id;
    const locked = Boolean(lockReason);

    return (
        <div className="mt-3 rounded-md border border-blue-100 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-blue-700">Step Suggestion</span>
                    {step.suggestionStatus && (
                        <span className="rounded bg-blue-50 px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-blue-700">
                            {step.suggestionStatus}
                        </span>
                    )}
                </div>
                <button
                    type="button"
                    disabled={updating || locked}
                    onClick={() => onGenerate(step.id)}
                    className="rounded border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                >
                    {suggestionBusy ? 'Generating...' : hasSuggestion ? 'Regenerate' : 'Generate'}
                </button>
            </div>

            {hasSuggestion && (
                <div className="mt-3 space-y-3">
                    <div>
                        <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500">Action</label>
                        <textarea
                            className="w-full rounded border border-slate-300 p-2 text-sm"
                            rows={2}
                            value={String(draft.suggestedAction || '')}
                            disabled={locked}
                            onChange={(event) => onDraftChange(step.id, { suggestedAction: event.target.value })}
                        />
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <div>
                            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500">Channel</label>
                            <select
                                className="w-full rounded border border-slate-300 bg-white p-2 text-sm"
                                value={draftChannel}
                                disabled={locked}
                                onChange={(event) => onDraftChange(step.id, { suggestedChannel: event.target.value })}
                            >
                                <option value="email">Email</option>
                                <option value="sms">SMS</option>
                                <option value="voice">Voice</option>
                                <option value="none">None</option>
                            </select>
                        </div>

                        {draftChannel === 'email' && (
                            <>
                                <div>
                                    <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500">To</label>
                                    <input
                                        type="email"
                                        className="w-full rounded border border-slate-300 p-2 text-sm"
                                        value={String(draft.suggestedRecipientEmail || '')}
                                        disabled={locked}
                                        onChange={(event) => onDraftChange(step.id, { suggestedRecipientEmail: event.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500">CC</label>
                                    <input
                                        type="text"
                                        className="w-full rounded border border-slate-300 p-2 text-sm"
                                        value={String(draft.suggestedCc || '')}
                                        disabled={locked}
                                        onChange={(event) => onDraftChange(step.id, { suggestedCc: event.target.value })}
                                    />
                                </div>
                            </>
                        )}
                    </div>

                    {draftChannel === 'email' && (
                        <div>
                            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500">Subject</label>
                            <input
                                type="text"
                                className="w-full rounded border border-slate-300 p-2 text-sm"
                                value={String(draft.suggestedReplySubject || '')}
                                disabled={locked}
                                onChange={(event) => onDraftChange(step.id, { suggestedReplySubject: event.target.value })}
                            />
                        </div>
                    )}

                    <div>
                        <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            {draftChannel === 'none' ? 'Internal Note' : 'Message'}
                        </label>
                        <textarea
                            className="w-full rounded border border-slate-300 p-2 text-sm"
                            rows={4}
                            value={String(draft.suggestedReplyBody || '')}
                            disabled={locked}
                            onChange={(event) => onDraftChange(step.id, { suggestedReplyBody: event.target.value })}
                        />
                    </div>

                    {step.suggestionError && (
                        <div className="text-xs font-semibold text-red-700">{step.suggestionError}</div>
                    )}

                    <div className="flex flex-wrap justify-end gap-2">
                        <button
                            type="button"
                            disabled={updating || locked}
                            onClick={() => onSave(step)}
                            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                        >
                            Save Draft
                        </button>
                        <button
                            type="button"
                            disabled={updating || locked || draftChannel === 'voice' || (draftChannel !== 'none' && !draft.suggestedReplyBody)}
                            onClick={() => onAction(step)}
                            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                            {draftChannel === 'none' ? 'Action Step' : 'Send & Complete'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
