
'use client';

import { useState, useEffect, useRef } from 'react';
import { CalendarEvent, createCalendarEvent, updateCalendarEvent, deleteCalendarEvent, fetchTasks, Task } from '../../lib/api';

import { format } from 'date-fns';


interface EventModalProps {
    isOpen: boolean;
    onClose: () => void;
    onRefresh: () => void;
    initialSlot: { start: Date; end: Date } | null;
    existingEvent: CalendarEvent | null;
    canEdit: boolean;
    onViewTask: (taskId: number) => void;
}

export default function EventModal({
    isOpen,
    onClose,
    onRefresh,
    initialSlot,
    existingEvent,
    canEdit,
    onViewTask
}: EventModalProps) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [type, setType] = useState('other');
    const [start, setStart] = useState('');
    const [end, setEnd] = useState('');
    const [taskId, setTaskId] = useState('');
    const [loading, setLoading] = useState(false);

    // Task Search States
    const [taskSearch, setTaskSearch] = useState('');
    const [taskSuggestions, setTaskSuggestions] = useState<Task[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [selectedTaskDisplay, setSelectedTaskDisplay] = useState<{ id: number; title: string } | null>(null);
    const searchTimeout = useRef<NodeJS.Timeout | null>(null);

    // Initialize form
    useEffect(() => {
        if (existingEvent) {
            setTitle(existingEvent.title);
            setDescription(existingEvent.description || '');
            setType(existingEvent.type);
            // Format for datetime-local input: YYYY-MM-DDTHH:mm
            setStart(format(new Date(existingEvent.start), "yyyy-MM-dd'T'HH:mm"));
            setEnd(format(new Date(existingEvent.end), "yyyy-MM-dd'T'HH:mm"));
            setTaskId(existingEvent.taskId ? existingEvent.taskId.toString() : '');

            if (existingEvent.LinkedTask) {
                setSelectedTaskDisplay({
                    id: existingEvent.LinkedTask.id,
                    title: existingEvent.LinkedTask.title || `${existingEvent.LinkedTask.category} - ${existingEvent.LinkedTask.subType}`
                });
            }

        } else if (initialSlot) {
            setTitle('');
            setDescription('');
            setType('other');
            setStart(format(initialSlot.start, "yyyy-MM-dd'T'HH:mm"));
            // Default 1 hour duration if end is same as start (click on day view often gives 0 duration slot)
            let endDate = initialSlot.end;
            if (endDate.getTime() === initialSlot.start.getTime()) {
                endDate = new Date(initialSlot.start.getTime() + 60 * 60 * 1000);
            }
            setEnd(format(endDate, "yyyy-MM-dd'T'HH:mm"));
            setTaskId('');
            setSelectedTaskDisplay(null);
        }
    }, [existingEvent, initialSlot]);

    // Search tasks when input changes
    useEffect(() => {
        if (searchTimeout.current) clearTimeout(searchTimeout.current);

        if (taskSearch.length < 2) {
            setTaskSuggestions([]);
            return;
        }

        searchTimeout.current = setTimeout(async () => {
            try {
                const tasks = await fetchTasks({ search: taskSearch });
                setTaskSuggestions(tasks.slice(0, 5)); // Limit to 5 suggestions
                setShowSuggestions(true);
            } catch (err) {
                console.error("Failed to search tasks", err);
            }
        }, 300);
    }, [taskSearch]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const payload = {
                title,
                description,
                type: type as any,
                start: new Date(start).toISOString(),
                end: new Date(end).toISOString(),

                taskId: taskId ? parseInt(taskId) : undefined

            };

            if (existingEvent) {
                await updateCalendarEvent(existingEvent.id, payload);
            } else {
                await createCalendarEvent(payload);
            }
            onRefresh();
            onClose();
        } catch (error) {
            alert('Failed to save event');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!existingEvent || !confirm('Are you sure you want to delete this event?')) return;
        setLoading(true);
        try {
            await deleteCalendarEvent(existingEvent.id);
            onRefresh();
            onClose();
        } catch (error) {
            alert('Failed to delete event');
        } finally {
            setLoading(false);
        }
    };

    const selectTask = (task: Task) => {
        setTaskId(task.id.toString());
        setSelectedTaskDisplay({ id: task.id, title: task.category }); // Using category as title if payload title invalid, but likely task.payload.description/title? 
        // Our Task interface has category, subType etc. It doesn't strictly have a root 'title' but often 'payload' has it.
        // Actually looking at getTasks return, it returns Task[] which has `category`, `subType`, etc.
        // The display logic in other places: TaskDetailModal uses generic info.
        // Let's use `Category - Subtype` or ID for now. 
        // Wait, the API response for `LinkedTask` has `title`.
        // Let's use `Task #{id}: {category}` as display.
        setSelectedTaskDisplay({ id: task.id, title: `${task.category} - ${task.subType}` });
        setTaskSearch('');
        setShowSuggestions(false);
    };

    const clearTask = () => {
        setTaskId('');
        setSelectedTaskDisplay(null);
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
                <div className="px-6 py-4 border-b flex justify-between items-center shrink-0">
                    <h3 className="text-lg font-bold text-gray-900">
                        {existingEvent ? (canEdit ? 'Edit Event' : 'Event Details') : 'New Event'}
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="p-6 overflow-y-auto">
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {!canEdit && existingEvent ? (
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Title</label>
                                    <p className="mt-1 text-gray-900">{existingEvent.title}</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Type</label>
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize 
                                    ${existingEvent.type === 'reminder' ? 'bg-yellow-100 text-yellow-800' :
                                            existingEvent.type === 'meeting' ? 'bg-green-100 text-green-800' :
                                                existingEvent.type === 'task_deadline' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>
                                        {existingEvent.type}
                                    </span>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Time</label>
                                    <p className="mt-1 text-sm text-gray-500">
                                        {format(new Date(existingEvent.start), 'PP p')} - {format(new Date(existingEvent.end), 'p')}
                                    </p>
                                </div>
                                {existingEvent.description && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Description</label>
                                        <p className="mt-1 text-sm text-gray-600 whitespace-pre-wrap">{existingEvent.description}</p>
                                    </div>
                                )}
                                {existingEvent.LinkedTask && (

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Linked Task</label>
                                        <button
                                            type="button"
                                            onClick={() => onViewTask(existingEvent.LinkedTask!.id)}
                                            className="mt-1 text-sm text-blue-600 hover:underline flex items-center"
                                        >
                                            Task #{existingEvent.LinkedTask.id}: {existingEvent.LinkedTask.title || `${existingEvent.LinkedTask.category} - ${existingEvent.LinkedTask.subType}`}
                                        </button>
                                    </div>

                                )}
                            </div>
                        ) : (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Title</label>
                                    <input
                                        type="text"
                                        required
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                                        value={title}
                                        onChange={e => setTitle(e.target.value)}
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Start</label>
                                        <input
                                            type="datetime-local"
                                            required
                                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                                            value={start}
                                            onChange={e => setStart(e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">End</label>
                                        <input
                                            type="datetime-local"
                                            required
                                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                                            value={end}
                                            onChange={e => setEnd(e.target.value)}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Type</label>
                                    <select
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                                        value={type}
                                        onChange={e => setType(e.target.value)}
                                    >
                                        <option value="other">Other</option>
                                        <option value="reminder">Reminder</option>
                                        <option value="meeting">Meeting</option>
                                        <option value="task_deadline">Task Deadline</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Description</label>
                                    <textarea
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                                        rows={3}
                                        value={description}
                                        onChange={e => setDescription(e.target.value)}
                                    />
                                </div>

                                <div className="relative">
                                    <label className="block text-sm font-medium text-gray-700">Linked Task (Optional)</label>
                                    {selectedTaskDisplay ? (
                                        <div className="mt-1 flex items-center justify-between p-2 bg-blue-50 border border-blue-200 rounded-md">
                                            <span className="text-sm text-blue-800">
                                                #{selectedTaskDisplay.id} - {selectedTaskDisplay.title}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={clearTask}
                                                className="text-gray-400 hover:text-red-500"
                                            >
                                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            <input
                                                type="text"
                                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                                                placeholder="Search for a task..."
                                                value={taskSearch}
                                                onChange={e => setTaskSearch(e.target.value)}
                                                onFocus={() => setShowSuggestions(true)}
                                                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                                            />
                                            {showSuggestions && taskSuggestions.length > 0 && (
                                                <div className="absolute z-10 w-full mt-1 bg-white shadow-lg max-h-48 rounded-md border border-gray-200 overflow-auto">
                                                    {taskSuggestions.map(task => (
                                                        <div
                                                            key={task.id}
                                                            className="px-4 py-2 hover:bg-gray-100 cursor-pointer text-sm"
                                                            onClick={() => selectTask(task)}
                                                        >
                                                            <span className="font-medium">#{task.id}</span> - {task.category} <span className="text-gray-500 text-xs">({task.status})</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            </>
                        )}

                        <div className="flex justify-end gap-3 pt-4 border-t">
                            {canEdit && existingEvent && (
                                <button
                                    type="button"
                                    onClick={handleDelete}
                                    className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-md text-sm font-medium"
                                >
                                    Delete
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 text-gray-700 hover:bg-gray-50 rounded-md text-sm font-medium border border-gray-300"
                            >
                                {canEdit ? 'Cancel' : 'Close'}
                            </button>
                            {canEdit && (
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-md text-sm font-medium disabled:opacity-50"
                                >
                                    {loading ? 'Saving...' : 'Save Event'}
                                </button>
                            )}
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}

