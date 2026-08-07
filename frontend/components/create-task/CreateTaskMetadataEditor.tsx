import { useState } from 'react';
import type { Staff, TaskOrigin, TaskStepInput } from '../../lib/api';
import CalendarEventPicker, { type CalendarEventSelection } from '../CalendarEventPicker';
import {
    defaultSubTypeForCategory,
    TASK_CATEGORY_OPTIONS_BY_ORIGIN,
    TASK_CATEGORY_SUBTYPES
} from './taskOptions';
import { WorkflowPlanEditor } from './WorkflowPlanEditor';

interface CreateTaskMetadataEditorProps {
    taskOrigin: TaskOrigin;
    category: string;
    subType: string;
    priority: string;
    sentiment: string;
    taskDueAt: string;
    selectedCalendarEvents: CalendarEventSelection[];
    initialNote: string;
    workflowSteps: TaskStepInput[];
    assigneeId: number | '';
    assignableStaff: Staff[];
    labelOwnerAsMe: boolean;
    mentionableStaff: Staff[];
    onCategoryChange: (value: string) => void;
    onSubTypeChange: (value: string) => void;
    onPriorityChange: (value: string) => void;
    onSentimentChange: (value: string) => void;
    onTaskDueAtChange: (value: string) => void;
    onSelectedCalendarEventsChange: (value: CalendarEventSelection[]) => void;
    onInitialNoteChange: (value: string) => void;
    onWorkflowStepsChange: (value: TaskStepInput[]) => void;
}

export function CreateTaskMetadataEditor({
    taskOrigin, category, subType, priority, sentiment, taskDueAt,
    selectedCalendarEvents, initialNote, workflowSteps, assigneeId, assignableStaff,
    labelOwnerAsMe, mentionableStaff, onCategoryChange, onSubTypeChange,
    onPriorityChange, onSentimentChange, onTaskDueAtChange,
    onSelectedCalendarEventsChange, onInitialNoteChange, onWorkflowStepsChange
}: CreateTaskMetadataEditorProps) {
    const [mentionActive, setMentionActive] = useState(false);
    const [mentionQuery, setMentionQuery] = useState('');
    const categoryOptions = TASK_CATEGORY_OPTIONS_BY_ORIGIN[taskOrigin];
    const subTypeOptions = [...(TASK_CATEGORY_SUBTYPES[category] || [])];
    if (subType && !subTypeOptions.includes(subType)) {
        subTypeOptions.unshift(subType);
    }
    const matchingStaff = mentionableStaff.filter((user) =>
        user.displayName && user.displayName.toLowerCase().includes(mentionQuery.toLowerCase())
    );

    const handleCategoryChange = (nextCategory: string) => {
        onCategoryChange(nextCategory);
        onSubTypeChange(defaultSubTypeForCategory(nextCategory));
    };

    const handleInitialNoteChange = (value: string) => {
        onInitialNoteChange(value);
        const lastAt = value.lastIndexOf('@');
        if (lastAt < 0) {
            setMentionActive(false);
            return;
        }

        const afterAt = value.substring(lastAt + 1);
        if (!afterAt.includes(' ') && afterAt.length <= 30) {
            setMentionActive(true);
            setMentionQuery(afterAt);
        } else {
            setMentionActive(false);
        }
    };

    const selectMention = (displayName: string) => {
        const beforeAt = initialNote.lastIndexOf('@');
        onInitialNoteChange(`${initialNote.substring(0, beforeAt)}@${displayName} `);
        setMentionActive(false);
        setMentionQuery('');
    };

    return (
        <>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Category</label>
                    <select
                        className="w-full text-sm border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                        value={category}
                        onChange={(event) => handleCategoryChange(event.target.value)}
                    >
                        {categoryOptions.map((option) => (
                            <option key={option} value={option}>{option}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Type</label>
                    <select
                        className="w-full text-sm border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                        value={subType}
                        onChange={(event) => onSubTypeChange(event.target.value)}
                    >
                        {subTypeOptions.length > 0 ? subTypeOptions.map((option) => (
                            <option key={option} value={option}>{option}</option>
                        )) : (
                            <option value={subType}>{subType || 'None'}</option>
                        )}
                    </select>
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Priority</label>
                    <select
                        className="w-full text-sm border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                        value={priority}
                        onChange={(event) => onPriorityChange(event.target.value)}
                    >
                        <option value="low">Low</option>
                        <option value="normal">Normal</option>
                        <option value="high">High</option>
                    </select>
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Sentiment</label>
                    <select
                        className="w-full text-sm border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                        value={sentiment}
                        onChange={(event) => onSentimentChange(event.target.value)}
                    >
                        <option value="NEUTRAL">Neutral</option>
                        <option value="POSITIVE">Positive</option>
                        <option value="NEGATIVE">Negative</option>
                    </select>
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Task Deadline</label>
                    <input
                        type="datetime-local"
                        className="w-full text-sm border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                        value={taskDueAt}
                        onChange={(event) => onTaskDueAtChange(event.target.value)}
                    />
                </div>
            </div>

            <div className="mt-4">
                <CalendarEventPicker
                    label="Linked Events"
                    selected={selectedCalendarEvents}
                    onChange={onSelectedCalendarEventsChange}
                    placeholder="Search for an event to link this task..."
                />
            </div>

            <div className="mt-4">
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Initial Note (optional)</label>
                <div className="relative">
                    {mentionActive && matchingStaff.length > 0 && (
                        <div className="absolute bottom-full mb-1 left-0 w-64 max-h-48 overflow-y-auto bg-white border border-gray-200 shadow-lg rounded-md z-50 divide-y divide-gray-100">
                            <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 bg-gray-50 sticky top-0">Mention Staff</div>
                            {matchingStaff.map((user) => (
                                <button
                                    key={user.id}
                                    type="button"
                                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-blue-50"
                                    onClick={() => selectMention(user.displayName)}
                                >
                                    <div className="font-medium text-gray-900">{user.displayName}</div>
                                    <div className="text-xs text-gray-500">{user.role || 'Staff'}</div>
                                </button>
                            ))}
                        </div>
                    )}
                    <textarea
                        className="w-full text-sm p-2 border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                        rows={2}
                        placeholder="Add a note... (type @ to mention staff)"
                        value={initialNote}
                        onChange={(event) => handleInitialNoteChange(event.target.value)}
                    />
                </div>
            </div>

            <WorkflowPlanEditor
                steps={workflowSteps}
                defaultOwnerId={assigneeId}
                staff={assignableStaff}
                labelOwnerAsMe={labelOwnerAsMe}
                onChange={onWorkflowStepsChange}
            />
        </>
    );
}
