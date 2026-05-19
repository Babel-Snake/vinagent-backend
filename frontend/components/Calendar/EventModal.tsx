'use client';

import { useEffect, useRef, useState } from 'react';
import {
    CalendarEvent,
    createCalendarEvent,
    deleteCalendarEvent,
    fetchNotices,
    fetchTasks,
    Notice,
    Task,
    updateCalendarEvent
} from '../../lib/api';
import { format } from 'date-fns';

interface EventModalProps {
    isOpen: boolean;
    onClose: () => void;
    onRefresh: () => void;
    initialSlot: { start: Date; end: Date } | null;
    existingEvent: CalendarEvent | null;
    canEdit: boolean;
    onViewTask: (taskId: number) => void;
    onViewNotice: (noticeId: number) => void;
}

type LinkChip = {
    id: number;
    title: string;
    meta?: string;
};

function taskTitle(task: Partial<Task> & { title?: string }) {
    const payload = task.payload && typeof task.payload === 'object' ? task.payload : {};
    const summary = payload.summary || payload.title || payload.originalText;
    if (typeof summary === 'string' && summary.trim()) return summary.trim();
    if (task.title) return task.title;
    const subtype = task.subType ? task.subType.replace(/_/g, ' ') : '';
    return subtype || task.category || `Task #${task.id}`;
}

function taskMeta(task: Partial<Task>) {
    const parts = [`Task #${task.id}`];
    if (task.category) parts.push(task.category);
    if (task.status) parts.push(task.status);
    if (task.Assignee?.displayName) parts.push(task.Assignee.displayName);
    return parts.join(' - ');
}

function noticeMeta(notice: Partial<Notice>) {
    const parts = [`Notice #${notice.id}`];
    if (notice.category) parts.push(notice.category.replace(/_/g, ' '));
    if (notice.priority) parts.push(notice.priority);
    return parts.join(' - ');
}

function eventTaskChips(event: CalendarEvent): LinkChip[] {
    const linked = event.LinkedTasks && event.LinkedTasks.length > 0
        ? event.LinkedTasks
        : event.LinkedTask
            ? [event.LinkedTask as Task]
            : [];

    if (linked.length > 0) {
        return linked.map(task => ({
            id: task.id,
            title: taskTitle(task),
            meta: taskMeta(task)
        }));
    }

    return event.taskId ? [{ id: event.taskId, title: `Task #${event.taskId}` }] : [];
}

function eventNoticeChips(event: CalendarEvent): LinkChip[] {
    const linked = event.LinkedNotices && event.LinkedNotices.length > 0
        ? event.LinkedNotices
        : event.LinkedNotice
            ? [event.LinkedNotice as Notice]
            : [];

    if (linked.length > 0) {
        return linked.map(notice => ({
            id: notice.id,
            title: notice.title,
            meta: noticeMeta(notice)
        }));
    }

    return event.noticeId ? [{ id: event.noticeId, title: `Notice #${event.noticeId}` }] : [];
}

export default function EventModal({
    isOpen,
    onClose,
    onRefresh,
    initialSlot,
    existingEvent,
    canEdit,
    onViewTask,
    onViewNotice
}: EventModalProps) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [type, setType] = useState('other');
    const [start, setStart] = useState('');
    const [end, setEnd] = useState('');
    const [loading, setLoading] = useState(false);

    const [taskSearch, setTaskSearch] = useState('');
    const [taskSuggestions, setTaskSuggestions] = useState<Task[]>([]);
    const [showTaskSuggestions, setShowTaskSuggestions] = useState(false);
    const [selectedTasks, setSelectedTasks] = useState<LinkChip[]>([]);
    const taskSearchTimeout = useRef<NodeJS.Timeout | null>(null);

    const [noticeSearch, setNoticeSearch] = useState('');
    const [noticeSuggestions, setNoticeSuggestions] = useState<Notice[]>([]);
    const [showNoticeSuggestions, setShowNoticeSuggestions] = useState(false);
    const [selectedNotices, setSelectedNotices] = useState<LinkChip[]>([]);
    const noticeSearchTimeout = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (existingEvent) {
            setTitle(existingEvent.title);
            setDescription(existingEvent.description || '');
            setType(existingEvent.type);
            setStart(format(new Date(existingEvent.start), "yyyy-MM-dd'T'HH:mm"));
            setEnd(format(new Date(existingEvent.end), "yyyy-MM-dd'T'HH:mm"));
            setSelectedTasks(eventTaskChips(existingEvent));
            setSelectedNotices(eventNoticeChips(existingEvent));
            setTaskSearch('');
            setNoticeSearch('');
            return;
        }

        if (initialSlot) {
            setTitle('');
            setDescription('');
            setType('other');
            setStart(format(initialSlot.start, "yyyy-MM-dd'T'HH:mm"));
            let endDate = initialSlot.end;
            if (endDate.getTime() === initialSlot.start.getTime()) {
                endDate = new Date(initialSlot.start.getTime() + 60 * 60 * 1000);
            }
            setEnd(format(endDate, "yyyy-MM-dd'T'HH:mm"));
            setSelectedTasks([]);
            setSelectedNotices([]);
            setTaskSearch('');
            setNoticeSearch('');
        }
    }, [existingEvent, initialSlot]);

    useEffect(() => {
        if (taskSearchTimeout.current) clearTimeout(taskSearchTimeout.current);

        if (taskSearch.trim().length < 2) {
            setTaskSuggestions([]);
            return;
        }

        taskSearchTimeout.current = setTimeout(async () => {
            try {
                const selectedIds = new Set(selectedTasks.map(task => task.id));
                const tasks = await fetchTasks({ search: taskSearch, status: 'all', pageSize: 8 });
                setTaskSuggestions(tasks.filter(task => !selectedIds.has(task.id)).slice(0, 8));
                setShowTaskSuggestions(true);
            } catch (err) {
                console.error('Failed to search tasks', err);
            }
        }, 300);
    }, [taskSearch, selectedTasks]);

    useEffect(() => {
        if (noticeSearchTimeout.current) clearTimeout(noticeSearchTimeout.current);

        if (noticeSearch.trim().length < 2) {
            setNoticeSuggestions([]);
            return;
        }

        noticeSearchTimeout.current = setTimeout(async () => {
            try {
                const selectedIds = new Set(selectedNotices.map(notice => notice.id));
                const result = await fetchNotices({ search: noticeSearch, status: 'active', pageSize: 8 });
                setNoticeSuggestions(result.notices.filter(notice => !selectedIds.has(notice.id)).slice(0, 8));
                setShowNoticeSuggestions(true);
            } catch (err) {
                console.error('Failed to search notices', err);
            }
        }, 300);
    }, [noticeSearch, selectedNotices]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const taskIds = selectedTasks.map(task => task.id);
            const noticeIds = selectedNotices.map(notice => notice.id);
            const payload = {
                title,
                description,
                type: type as CalendarEvent['type'],
                start: new Date(start).toISOString(),
                end: new Date(end).toISOString(),
                taskIds,
                noticeIds,
                taskId: taskIds[0] || null,
                noticeId: noticeIds[0] || null
            };

            if (existingEvent) {
                await updateCalendarEvent(existingEvent.id, payload);
            } else {
                await createCalendarEvent(payload);
            }
            onRefresh();
            onClose();
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Failed to save event');
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
        setSelectedTasks(prev => [
            ...prev,
            { id: task.id, title: taskTitle(task), meta: taskMeta(task) }
        ]);
        setTaskSearch('');
        setShowTaskSuggestions(false);
    };

    const selectNotice = (notice: Notice) => {
        setSelectedNotices(prev => [
            ...prev,
            { id: notice.id, title: notice.title, meta: noticeMeta(notice) }
        ]);
        setNoticeSearch('');
        setShowNoticeSuggestions(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
                <div className="flex shrink-0 items-center justify-between border-b px-6 py-4">
                    <h3 className="text-lg font-bold text-gray-900">
                        {existingEvent ? (canEdit ? 'Edit Event' : 'Event Details') : 'New Event'}
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="overflow-y-auto p-6">
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {!canEdit && existingEvent ? (
                            <div className="space-y-4">
                                <ReadOnlyField label="Title">{existingEvent.title}</ReadOnlyField>
                                <ReadOnlyField label="Type">
                                    <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium capitalize text-blue-800">
                                        {existingEvent.type.replace(/_/g, ' ')}
                                    </span>
                                </ReadOnlyField>
                                <ReadOnlyField label="Time">
                                    {format(new Date(existingEvent.start), 'PP p')} - {format(new Date(existingEvent.end), 'p')}
                                </ReadOnlyField>
                                {existingEvent.description && (
                                    <ReadOnlyField label="Description">
                                        <span className="whitespace-pre-wrap">{existingEvent.description}</span>
                                    </ReadOnlyField>
                                )}
                                <ReadOnlyLinks title="Linked Tasks" items={selectedTasks} onOpen={onViewTask} />
                                <ReadOnlyLinks title="Linked Notices" items={selectedNotices} onOpen={onViewNotice} />
                            </div>
                        ) : (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Title</label>
                                    <input
                                        type="text"
                                        required
                                        className="mt-1 block w-full rounded-md border border-gray-300 p-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                        value={title}
                                        onChange={e => setTitle(e.target.value)}
                                    />
                                </div>

                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Start</label>
                                        <input
                                            type="datetime-local"
                                            required
                                            className="mt-1 block w-full rounded-md border border-gray-300 p-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                            value={start}
                                            onChange={e => setStart(e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">End</label>
                                        <input
                                            type="datetime-local"
                                            required
                                            className="mt-1 block w-full rounded-md border border-gray-300 p-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                            value={end}
                                            onChange={e => setEnd(e.target.value)}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Type</label>
                                    <select
                                        className="mt-1 block w-full rounded-md border border-gray-300 p-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                        value={type}
                                        onChange={e => setType(e.target.value)}
                                    >
                                        <option value="other">Other</option>
                                        <option value="reminder">Reminder</option>
                                        <option value="meeting">Meeting</option>
                                        <option value="event">Event</option>
                                        <option value="task_deadline">Task Deadline</option>
                                        <option value="notice">Notice</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Description</label>
                                    <textarea
                                        className="mt-1 block w-full rounded-md border border-gray-300 p-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                        rows={3}
                                        value={description}
                                        onChange={e => setDescription(e.target.value)}
                                    />
                                </div>

                                <LinkPicker
                                    title="Linked Tasks"
                                    placeholder="Search for a task..."
                                    selected={selectedTasks}
                                    search={taskSearch}
                                    onSearch={setTaskSearch}
                                    showSuggestions={showTaskSuggestions}
                                    onFocus={() => setShowTaskSuggestions(true)}
                                    onBlur={() => setTimeout(() => setShowTaskSuggestions(false), 200)}
                                    suggestions={taskSuggestions.map(task => ({
                                        id: task.id,
                                        title: taskTitle(task),
                                        meta: taskMeta(task),
                                        item: task
                                    }))}
                                    onSelect={selectTask}
                                    onRemove={(id) => setSelectedTasks(prev => prev.filter(task => task.id !== id))}
                                />

                                <LinkPicker
                                    title="Linked Notices"
                                    placeholder="Search for a notice..."
                                    selected={selectedNotices}
                                    search={noticeSearch}
                                    onSearch={setNoticeSearch}
                                    showSuggestions={showNoticeSuggestions}
                                    onFocus={() => setShowNoticeSuggestions(true)}
                                    onBlur={() => setTimeout(() => setShowNoticeSuggestions(false), 200)}
                                    suggestions={noticeSuggestions.map(notice => ({
                                        id: notice.id,
                                        title: notice.title,
                                        meta: noticeMeta(notice),
                                        item: notice
                                    }))}
                                    onSelect={selectNotice}
                                    onRemove={(id) => setSelectedNotices(prev => prev.filter(notice => notice.id !== id))}
                                    tone="teal"
                                />
                            </>
                        )}

                        <div className="flex justify-end gap-3 border-t pt-4">
                            {canEdit && existingEvent && (
                                <button
                                    type="button"
                                    onClick={handleDelete}
                                    className="rounded-md px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                                >
                                    Delete
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={onClose}
                                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                            >
                                {canEdit ? 'Cancel' : 'Close'}
                            </button>
                            {canEdit && (
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
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

function ReadOnlyField({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="block text-sm font-medium text-gray-700">{label}</label>
            <div className="mt-1 text-sm text-gray-900">{children}</div>
        </div>
    );
}

function ReadOnlyLinks({ title, items, onOpen }: { title: string; items: LinkChip[]; onOpen: (id: number) => void }) {
    if (items.length === 0) return null;

    return (
        <div>
            <label className="block text-sm font-medium text-gray-700">{title}</label>
            <div className="mt-1 space-y-1">
                {items.map(item => (
                    <button
                        key={item.id}
                        type="button"
                        onClick={() => onOpen(item.id)}
                        className="block text-left text-sm text-blue-600 hover:underline"
                    >
                        {item.title}
                        <span className="ml-2 text-xs text-gray-500">{item.meta}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}

function LinkPicker<T>({
    title,
    placeholder,
    selected,
    search,
    onSearch,
    showSuggestions,
    onFocus,
    onBlur,
    suggestions,
    onSelect,
    onRemove,
    tone = 'blue'
}: {
    title: string;
    placeholder: string;
    selected: LinkChip[];
    search: string;
    onSearch: (value: string) => void;
    showSuggestions: boolean;
    onFocus: () => void;
    onBlur: () => void;
    suggestions: Array<LinkChip & { item: T }>;
    onSelect: (item: T) => void;
    onRemove: (id: number) => void;
    tone?: 'blue' | 'teal';
}) {
    const chipClasses = tone === 'teal'
        ? 'border-teal-200 bg-teal-50 text-teal-800'
        : 'border-blue-200 bg-blue-50 text-blue-800';

    return (
        <div className="relative rounded-md border border-gray-200 p-3">
            <label className="block text-sm font-medium text-gray-700">{title}</label>
            {selected.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                    {selected.map(item => (
                        <span key={item.id} className={`inline-flex max-w-full items-center gap-2 rounded-md border px-2 py-1 text-sm ${chipClasses}`}>
                            <span className="min-w-0">
                                <span className="block truncate font-medium">{item.title}</span>
                                {item.meta && <span className="block truncate text-xs opacity-80">{item.meta}</span>}
                            </span>
                            <button
                                type="button"
                                onClick={() => onRemove(item.id)}
                                className="shrink-0 text-gray-500 hover:text-red-600"
                                aria-label={`Remove ${item.title}`}
                            >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </span>
                    ))}
                </div>
            )}
            <input
                type="text"
                className="mt-2 block w-full rounded-md border border-gray-300 p-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder={placeholder}
                value={search}
                onChange={e => onSearch(e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
            />
            {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-10 mt-1 max-h-56 w-[calc(100%-1.5rem)] overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
                    {suggestions.map(suggestion => (
                        <button
                            key={suggestion.id}
                            type="button"
                            className="block w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
                            onClick={() => onSelect(suggestion.item)}
                        >
                            <span className="block font-medium text-gray-900">{suggestion.title}</span>
                            {suggestion.meta && <span className="block text-xs text-gray-500">{suggestion.meta}</span>}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
