'use client';

import type { Staff, TaskStep, TaskStepInput } from '../../lib/api';
import { humanize, TaskSection } from './TaskCardSupport';
import { TaskWorkflowStepCard } from './TaskWorkflowStepCard';

export interface NewWorkflowStepDraft {
    title: string;
    description: string;
    stepType: string;
    waitingOn: string;
    ownerUserId: number | '';
    dueAt: string;
    insertPosition: string;
}

interface TaskWorkflowPanelProps {
    summary?: string | null;
    steps: TaskStep[];
    users: Staff[];
    userRole?: string | null;
    currentUserId?: number | null;
    updating: boolean;
    openStepId: number | null;
    canReorder: boolean;
    canOverrideOwnership: boolean;
    reorderMode: boolean;
    reorderDraft: TaskStep[];
    draggedStepId: number | null;
    activeSuggestionStepId: number | null;
    isAddStepOpen: boolean;
    createStepLockReason: string;
    newStep: NewWorkflowStepDraft;
    getStepLockReason: (step: TaskStep) => string;
    getSuggestionDraft: (step: TaskStep) => Partial<TaskStep>;
    onToggleStep: (stepId: number) => void;
    onUpdateStep: (stepId: number, updates: Partial<TaskStepInput>) => void;
    onDeleteStep: (stepId: number) => void;
    onHistoryChanged: () => void;
    onSuggestionDraftChange: (stepId: number, updates: Partial<TaskStep>) => void;
    onGenerateSuggestion: (stepId: number) => void;
    onSaveSuggestion: (step: TaskStep) => void;
    onActionSuggestion: (step: TaskStep) => void;
    onBeginReorder: () => void;
    onCancelReorder: () => void;
    onSaveReorder: () => void;
    onMoveReorderStep: (fromIndex: number, toIndex: number) => void;
    onDraggedStepChange: (stepId: number | null) => void;
    onToggleAddStep: () => void;
    onNewStepChange: (updates: Partial<NewWorkflowStepDraft>) => void;
    onCreateStep: () => void;
}

function WorkflowReorderList({
    steps,
    users,
    updating,
    draggedStepId,
    onMove,
    onDraggedStepChange
}: {
    steps: TaskStep[];
    users: Staff[];
    updating: boolean;
    draggedStepId: number | null;
    onMove: (fromIndex: number, toIndex: number) => void;
    onDraggedStepChange: (stepId: number | null) => void;
}) {
    return (
        <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3">
            <div className="mb-3">
                <div className="text-xs font-bold uppercase tracking-wider text-blue-700">Reorder Workflow</div>
                <div className="text-sm text-slate-600">Drag a step into position, or use the arrow controls.</div>
            </div>
            <div className="space-y-2">
                {steps.map((step, index) => {
                    const ownerName = users.find(user => user.id === step.ownerUserId)?.displayName || 'Unassigned';
                    const isDragging = draggedStepId === step.id;

                    return (
                        <div
                            key={step.id}
                            draggable={!updating}
                            onDragStart={(event) => {
                                onDraggedStepChange(step.id);
                                event.dataTransfer.effectAllowed = 'move';
                                event.dataTransfer.setData('text/plain', String(step.id));
                            }}
                            onDragOver={(event) => {
                                event.preventDefault();
                                const activeStepId = draggedStepId ?? Number(event.dataTransfer.getData('text/plain'));
                                const fromIndex = steps.findIndex(candidate => candidate.id === activeStepId);
                                if (fromIndex >= 0 && fromIndex !== index) onMove(fromIndex, index);
                            }}
                            onDragEnd={() => onDraggedStepChange(null)}
                            className={`flex items-center gap-3 rounded-lg border bg-white p-3 shadow-sm transition ${isDragging ? 'border-blue-400 opacity-70' : 'border-slate-200'}`}
                        >
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
                                {index + 1}
                            </div>
                            <div className="flex min-w-0 flex-1 items-center gap-3">
                                <div className="cursor-grab select-none rounded border border-slate-200 bg-slate-50 px-2 py-1 text-sm font-bold text-slate-500 active:cursor-grabbing" aria-hidden="true">
                                    ::
                                </div>
                                <div className="min-w-0">
                                    <div className="truncate text-sm font-semibold text-slate-900">{step.title}</div>
                                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                                        <span>{humanize(step.status)}</span>
                                        <span>{humanize(step.waitingOn)}</span>
                                        <span>{ownerName}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                                <button
                                    type="button"
                                    disabled={updating || index === 0}
                                    onClick={() => onMove(index, index - 1)}
                                    className="h-8 rounded border border-slate-300 bg-white px-2 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                                    aria-label={`Move ${step.title} up`}
                                >
                                    Up
                                </button>
                                <button
                                    type="button"
                                    disabled={updating || index === steps.length - 1}
                                    onClick={() => onMove(index, index + 1)}
                                    className="h-8 rounded border border-slate-300 bg-white px-2 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                                    aria-label={`Move ${step.title} down`}
                                >
                                    Down
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function AddWorkflowStep({
    steps,
    users,
    updating,
    isOpen,
    lockReason,
    draft,
    onToggle,
    onChange,
    onCreate
}: {
    steps: TaskStep[];
    users: Staff[];
    updating: boolean;
    isOpen: boolean;
    lockReason: string;
    draft: NewWorkflowStepDraft;
    onToggle: () => void;
    onChange: (updates: Partial<NewWorkflowStepDraft>) => void;
    onCreate: () => void;
}) {
    const locked = Boolean(lockReason);

    return (
        <div className="mt-4 rounded-lg border border-dashed border-slate-300">
            <button
                type="button"
                onClick={onToggle}
                className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-slate-50"
                aria-expanded={isOpen}
            >
                <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Add Step</div>
                    <div className="mt-1 text-sm text-slate-600">Create another workflow step only when the task needs one.</div>
                </div>
                <span className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700">
                    {isOpen ? 'Close' : '+ Add'}
                </span>
            </button>
            {isOpen && (
                <div className="border-t border-dashed border-slate-300 p-3">
                    {lockReason && (
                        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                            {lockReason}
                        </div>
                    )}
                    <div className="space-y-3">
                        <input
                            type="text"
                            className="w-full rounded border border-slate-300 p-2 text-sm"
                            placeholder="Step title"
                            value={draft.title}
                            disabled={locked}
                            onChange={(event) => onChange({ title: event.target.value })}
                        />
                        <textarea
                            className="w-full rounded border border-slate-300 p-2 text-sm"
                            rows={2}
                            placeholder="What needs to happen in this step?"
                            value={draft.description}
                            disabled={locked}
                            onChange={(event) => onChange({ description: event.target.value })}
                        />
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                            <select className="rounded border border-slate-300 p-2 text-sm" value={draft.insertPosition} disabled={locked} onChange={(event) => onChange({ insertPosition: event.target.value })}>
                                <option value="end">End of workflow</option>
                                {steps.length > 0 && <option value="0">Before step 1</option>}
                                {steps.map((step, index) => (
                                    <option key={step.id} value={index + 1}>
                                        {index === steps.length - 1
                                            ? `After step ${index + 1}`
                                            : `After step ${index + 1} / before step ${index + 2}`}
                                    </option>
                                ))}
                            </select>
                            <select className="rounded border border-slate-300 p-2 text-sm" value={draft.stepType} disabled={locked} onChange={(event) => onChange({ stepType: event.target.value })}>
                                {['INTERNAL', 'CUSTOMER_MESSAGE', 'CUSTOMER_WAIT', 'APPROVAL', 'EXTERNAL', 'EXECUTION', 'FOLLOW_UP', 'OTHER'].map(option => (
                                    <option key={option} value={option}>{option}</option>
                                ))}
                            </select>
                            <select className="rounded border border-slate-300 p-2 text-sm" value={draft.waitingOn} disabled={locked} onChange={(event) => onChange({ waitingOn: event.target.value })}>
                                {['NONE', 'STAFF', 'CUSTOMER', 'MANAGER', 'EXTERNAL'].map(option => (
                                    <option key={option} value={option}>{option}</option>
                                ))}
                            </select>
                            <select className="rounded border border-slate-300 p-2 text-sm" value={draft.ownerUserId} disabled={locked} onChange={(event) => onChange({ ownerUserId: event.target.value ? Number(event.target.value) : '' })}>
                                <option value="">Unassigned</option>
                                {users.map(user => (
                                    <option key={user.id} value={user.id}>{user.displayName}</option>
                                ))}
                            </select>
                            <input
                                type="datetime-local"
                                className="rounded border border-slate-300 p-2 text-sm"
                                value={draft.dueAt}
                                disabled={locked}
                                onChange={(event) => onChange({ dueAt: event.target.value })}
                            />
                        </div>
                        <div className="flex justify-end">
                            <button
                                type="button"
                                onClick={onCreate}
                                disabled={updating || locked || !draft.title.trim()}
                                className="rounded bg-slate-900 px-3 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                            >
                                Add Workflow Step
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export function TaskWorkflowPanel({
    summary,
    steps,
    users,
    userRole,
    currentUserId,
    updating,
    openStepId,
    canReorder,
    canOverrideOwnership,
    reorderMode,
    reorderDraft,
    draggedStepId,
    activeSuggestionStepId,
    isAddStepOpen,
    createStepLockReason,
    newStep,
    getStepLockReason,
    getSuggestionDraft,
    onToggleStep,
    onUpdateStep,
    onDeleteStep,
    onHistoryChanged,
    onSuggestionDraftChange,
    onGenerateSuggestion,
    onSaveSuggestion,
    onActionSuggestion,
    onBeginReorder,
    onCancelReorder,
    onSaveReorder,
    onMoveReorderStep,
    onDraggedStepChange,
    onToggleAddStep,
    onNewStepChange,
    onCreateStep
}: TaskWorkflowPanelProps) {
    return (
        <TaskSection title="Workflow Steps" summary={summary || 'No active step recorded'} count={steps.length}>
            <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Workflow Steps</div>
                    <div className="text-sm text-slate-600">Use structured steps for handoffs, blockers, and staged completion.</div>
                </div>
                {canReorder && steps.length > 1 && (
                    <div className="flex shrink-0 items-center gap-2">
                        {reorderMode ? (
                            <>
                                <button type="button" disabled={updating} onClick={onCancelReorder} className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50">
                                    Cancel
                                </button>
                                <button type="button" disabled={updating} onClick={onSaveReorder} className="rounded bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50">
                                    Save Order
                                </button>
                            </>
                        ) : (
                            <button type="button" disabled={updating} onClick={onBeginReorder} className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50">
                                Reorder
                            </button>
                        )}
                    </div>
                )}
            </div>

            {reorderMode ? (
                <WorkflowReorderList
                    steps={reorderDraft}
                    users={users}
                    updating={updating}
                    draggedStepId={draggedStepId}
                    onMove={onMoveReorderStep}
                    onDraggedStepChange={onDraggedStepChange}
                />
            ) : (
                <div className="space-y-3">
                    {steps.map((step, index) => (
                        <TaskWorkflowStepCard
                            key={step.id}
                            step={step}
                            index={index}
                            isOpen={openStepId === step.id}
                            users={users}
                            userRole={userRole}
                            currentUserId={currentUserId}
                            updating={updating}
                            lockReason={getStepLockReason(step)}
                            canOverrideOwnership={canOverrideOwnership}
                            suggestionDraft={getSuggestionDraft(step)}
                            activeSuggestionStepId={activeSuggestionStepId}
                            onToggle={onToggleStep}
                            onUpdate={onUpdateStep}
                            onDelete={onDeleteStep}
                            onHistoryChanged={onHistoryChanged}
                            onSuggestionDraftChange={onSuggestionDraftChange}
                            onGenerateSuggestion={onGenerateSuggestion}
                            onSaveSuggestion={onSaveSuggestion}
                            onActionSuggestion={onActionSuggestion}
                        />
                    ))}
                </div>
            )}

            <AddWorkflowStep
                steps={steps}
                users={users}
                updating={updating}
                isOpen={isAddStepOpen}
                lockReason={createStepLockReason}
                draft={newStep}
                onToggle={onToggleAddStep}
                onChange={onNewStepChange}
                onCreate={onCreateStep}
            />
        </TaskSection>
    );
}
