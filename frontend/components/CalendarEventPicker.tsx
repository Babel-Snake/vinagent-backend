'use client';

import { useEffect, useState } from 'react';
import { CalendarEvent, searchCalendarEvents } from '../lib/api';
import { clientLogger } from '../lib/clientLogger';
import { operationalLabel } from '../lib/operationalPresentation';

export type CalendarEventSelection = {
    id: number;
    title: string;
    meta?: string;
};

function formatEventMeta(event: CalendarEvent) {
    const date = new Date(event.start);
    const dateText = Number.isNaN(date.getTime())
        ? null
        : date.toLocaleString('en-AU', {
            day: 'numeric',
            month: 'short',
            hour: 'numeric',
            minute: '2-digit'
        });

    return [dateText, event.type ? operationalLabel(event.type) : null]
        .filter(Boolean)
        .join(' - ');
}

function toSelection(event: CalendarEvent): CalendarEventSelection {
    return {
        id: event.id,
        title: event.title,
        meta: formatEventMeta(event)
    };
}

export default function CalendarEventPicker({
    label = 'Linked Events',
    selected,
    onChange,
    placeholder = 'Search for an event...'
}: {
    label?: string;
    selected: CalendarEventSelection[];
    onChange: (events: CalendarEventSelection[]) => void;
    placeholder?: string;
}) {
    const [search, setSearch] = useState('');
    const [suggestions, setSuggestions] = useState<CalendarEvent[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    useEffect(() => {
        const query = search.trim();

        if (query.length < 2) {
            const timer = window.setTimeout(() => {
                setSuggestions([]);
                setShowSuggestions(false);
            }, 0);
            return () => window.clearTimeout(timer);
        }

        const timer = window.setTimeout(async () => {
            try {
                const selectedIds = new Set(selected.map(event => event.id));
                const events = await searchCalendarEvents(query, 8);
                setSuggestions(events.filter(event => !selectedIds.has(event.id)));
                setShowSuggestions(true);
            } catch (err) {
                clientLogger.error('Failed to search calendar events', err);
            }
        }, 300);

        return () => window.clearTimeout(timer);
    }, [search, selected]);

    function addEvent(event: CalendarEvent) {
        onChange([...selected, toSelection(event)]);
        setSearch('');
        setShowSuggestions(false);
    }

    function removeEvent(eventId: number) {
        onChange(selected.filter(event => event.id !== eventId));
    }

    return (
        <div className="relative rounded-lg border border-[var(--border)] bg-[#f8faf6] p-3">
            <label className="mb-1.5 block text-xs font-bold uppercase text-[var(--muted)]">{label}</label>
            {selected.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                    {selected.map(event => (
                        <span key={event.id} className="inline-flex max-w-full items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-sm text-blue-800">
                            <span className="min-w-0">
                                <span className="block truncate font-medium">{event.title}</span>
                                {event.meta && <span className="block truncate text-xs opacity-80">{event.meta}</span>}
                            </span>
                            <button
                                type="button"
                                onClick={() => removeEvent(event.id)}
                                className="shrink-0 text-gray-500 hover:text-red-600"
                                aria-label={`Remove ${event.title}`}
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
                className="form-control"
                placeholder={placeholder}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            />
            {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-20 mt-1 max-h-56 w-[calc(100%-1.5rem)] overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
                    {suggestions.map(event => {
                        const selection = toSelection(event);
                        return (
                            <button
                                key={event.id}
                                type="button"
                                className="block w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
                                onClick={() => addEvent(event)}
                            >
                                <span className="block font-medium text-gray-900">{selection.title}</span>
                                <span className="block text-xs text-gray-500">{selection.meta || `Event #${event.id}`}</span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
