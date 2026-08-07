import type { Staff, TaskStepInput } from '../../lib/api';
import { toDateTimeLocalValue } from './taskAnalysis';

interface WorkflowPlanEditorProps {
    steps: TaskStepInput[];
    defaultOwnerId: number | '';
    staff: Staff[];
    labelOwnerAsMe: boolean;
    onChange: (steps: TaskStepInput[]) => void;
}

const STEP_TYPES = ['INTERNAL', 'CUSTOMER_MESSAGE', 'CUSTOMER_WAIT', 'APPROVAL', 'EXTERNAL', 'EXECUTION', 'FOLLOW_UP', 'OTHER'];
const WAITING_ON = ['NONE', 'STAFF', 'CUSTOMER', 'MANAGER', 'EXTERNAL'];

export function WorkflowPlanEditor({ steps, defaultOwnerId, staff, labelOwnerAsMe, onChange }: WorkflowPlanEditorProps) {
    const updateStep = (index: number, patch: Partial<TaskStepInput>) => {
        onChange(steps.map((step, currentIndex) => currentIndex === index
            ? { ...step, ...patch, sortOrder: index }
            : step));
    };

    const removeStep = (index: number) => {
        onChange(steps
            .filter((_, currentIndex) => currentIndex !== index)
            .map((step, currentIndex) => ({ ...step, sortOrder: currentIndex })));
    };

    const addStep = () => onChange([
        ...steps,
        {
            title: 'New workflow step',
            stepType: 'INTERNAL',
            waitingOn: 'STAFF',
            ownerUserId: defaultOwnerId === '' ? null : defaultOwnerId,
            sortOrder: steps.length
        }
    ]);

    return (
        <div className="mt-4 p-3 bg-white border border-gray-200 rounded">
            <div className="flex items-center justify-between mb-3">
                <label className="block text-xs font-bold text-gray-700 uppercase">Workflow Plan</label>
                <button type="button" onClick={addStep} className="text-xs font-medium text-blue-600 hover:text-blue-800">+ Add Step</button>
            </div>

            <div className="space-y-3">
                {steps.length === 0 && (
                    <div className="text-sm text-gray-500">No structured steps yet. Add at least one if this task needs staged work.</div>
                )}

                {steps.map((step, index) => (
                    <div key={`${step.title}-${index}`} className="border border-gray-200 rounded-lg p-3 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                            <div className="text-xs font-bold text-gray-500 uppercase">Step {index + 1}</div>
                            <button type="button" onClick={() => removeStep(index)} className="text-xs text-red-600 hover:text-red-800">Remove</button>
                        </div>

                        <input
                            type="text"
                            className="w-full text-sm p-2 border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                            value={step.title}
                            onChange={(event) => updateStep(index, { title: event.target.value })}
                            placeholder="Step title"
                        />
                        <textarea
                            className="w-full text-sm p-2 border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                            rows={2}
                            value={step.description || ''}
                            onChange={(event) => updateStep(index, { description: event.target.value })}
                            placeholder="What should happen in this step?"
                        />

                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                            <SelectField label="Type" value={step.stepType || 'INTERNAL'} options={STEP_TYPES} onChange={(value) => updateStep(index, { stepType: value })} />
                            <SelectField label="Waiting On" value={step.waitingOn || 'STAFF'} options={WAITING_ON} onChange={(value) => updateStep(index, { waitingOn: value })} />
                            <div>
                                <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Owner</label>
                                <select
                                    className="w-full text-sm p-2 border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                    value={step.ownerUserId ?? ''}
                                    onChange={(event) => updateStep(index, { ownerUserId: event.target.value ? Number(event.target.value) : null })}
                                >
                                    <option value="">Unassigned</option>
                                    {staff.map(user => <option key={user.id} value={user.id}>{labelOwnerAsMe ? 'Me' : user.displayName}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Due</label>
                                <input
                                    type="datetime-local"
                                    className="w-full text-sm p-2 border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                    value={toDateTimeLocalValue(step.dueAt)}
                                    onChange={(event) => updateStep(index, { dueAt: event.target.value ? new Date(event.target.value).toISOString() : null })}
                                />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function SelectField({ label, value, options, onChange }: {
    label: string;
    value: string;
    options: string[];
    onChange: (value: string) => void;
}) {
    return (
        <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">{label}</label>
            <select className="w-full text-sm p-2 border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500" value={value} onChange={(event) => onChange(event.target.value)}>
                {options.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
        </div>
    );
}
