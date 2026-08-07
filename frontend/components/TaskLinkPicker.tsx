'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { fetchTasks, type Task } from '../lib/api';
import { clientLogger } from '../lib/clientLogger';

type TaskLinkPickerProps = {
    linkedTaskIds: number[];
    onSelect: (taskId: number) => void | Promise<void>;
    disabled?: boolean;
    label?: string;
};

function formatLabel(value?: string | null) {
    if (!value) return '';
    return value
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, character => character.toUpperCase());
}

function taskTitle(task: Task) {
    const summary = typeof task.payload?.summary === 'string' ? task.payload.summary.trim() : '';
    return summary || formatLabel(task.subType || task.type || task.category) || `Task #${task.id}`;
}

function taskMeta(task: Task) {
    const customer = task.Member
        ? `${task.Member.firstName || ''} ${task.Member.lastName || ''}`.trim()
        : typeof task.payload?.manualIntake?.requesterName === 'string'
            ? task.payload.manualIntake.requesterName
            : '';
    return [customer, formatLabel(task.status)].filter(Boolean).join(' · ');
}

/**
 * Searches the existing task queue before creating a relationship. It keeps the
 * database identifier available through numeric search without making people
 * recognise or type IDs as the primary workflow.
 */
export default function TaskLinkPicker({
    linkedTaskIds,
    onSelect,
    disabled = false,
    label = 'Link a task'
}: TaskLinkPickerProps) {
    const [search, setSearch] = useState('');
    const [suggestions, setSuggestions] = useState<Task[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [loading, setLoading] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);
    const listboxId = useId();
    const linkedIdsKey = useMemo(() => linkedTaskIds.slice().sort((a, b) => a - b).join(','), [linkedTaskIds]);

    useEffect(() => {
        const query = search.trim();
        const isNumericId = /^\d+$/.test(query);

        if ((!isNumericId && query.length < 2) || !query) {
            setSuggestions([]);
            setSearchError(null);
            setLoading(false);
            return;
        }

        let active = true;
        const timer = window.setTimeout(async () => {
            setLoading(true);
            setSearchError(null);
            try {
                const linkedIds = new Set(linkedIdsKey.split(',').filter(Boolean).map(Number));
                const tasks = await fetchTasks({ status: 'all', search: query, pageSize: 8 });
                if (!active) return;
                setSuggestions(tasks.filter(task => !linkedIds.has(task.id)));
                setShowSuggestions(true);
            } catch (error) {
                if (!active) return;
                clientLogger.error('Failed to search tasks for notice link', error);
                setSuggestions([]);
                setSearchError('Could not search tasks. Please try again.');
                setShowSuggestions(true);
            } finally {
                if (active) setLoading(false);
            }
        }, 250);

        return () => {
            active = false;
            window.clearTimeout(timer);
        };
    }, [linkedIdsKey, search]);

    async function selectTask(task: Task) {
        await onSelect(task.id);
        setSearch('');
        setSuggestions([]);
        setShowSuggestions(false);
    }

    const hasQuery = search.trim().length > 0;

    return (
        <div className="relative">
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[var(--muted)]" htmlFor={listboxId}>
                {label}
            </label>
            <input
                id={listboxId}
                type="search"
                className="form-control"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onFocus={() => setShowSuggestions(true)}
                onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                        setShowSuggestions(false);
                        event.currentTarget.blur();
                    }
                }}
                placeholder="Search title, customer, or task ID"
                disabled={disabled}
                role="combobox"
                aria-autocomplete="list"
                aria-controls={`${listboxId}-results`}
                aria-expanded={showSuggestions && hasQuery}
                aria-describedby={`${listboxId}-hint`}
            />
            <p id={`${listboxId}-hint`} className="mt-1 text-xs text-[var(--muted)]">
                Search by task title, customer, or exact ID.
            </p>
            {showSuggestions && hasQuery && (
                <div id={`${listboxId}-results`} role="listbox" aria-label="Task search results" className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-[var(--border)] bg-[var(--surface)] shadow-lg">
                    {loading && <p className="px-3 py-2 text-sm text-[var(--muted)]">Searching tasks…</p>}
                    {!loading && searchError && <p role="alert" className="px-3 py-2 text-sm text-red-700">{searchError}</p>}
                    {!loading && !searchError && suggestions.length === 0 && (
                        <p className="px-3 py-2 text-sm text-[var(--muted)]">No unlinked tasks match this search.</p>
                    )}
                    {!loading && !searchError && suggestions.map(task => (
                        <button
                            key={task.id}
                            type="button"
                            role="option"
                            aria-selected="false"
                            disabled={disabled}
                            className="block w-full border-b border-[var(--border)] px-3 py-2.5 text-left last:border-b-0 hover:bg-[#f8faf6] focus:bg-[#f8faf6]"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => void selectTask(task)}
                        >
                            <span className="block truncate font-semibold text-[#1c231f]">{taskTitle(task)}</span>
                            <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">Task #{task.id}{taskMeta(task) ? ` · ${taskMeta(task)}` : ''}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
