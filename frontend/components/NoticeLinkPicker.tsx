'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { fetchNotices, getNotice, type Notice } from '../lib/api';
import { clientLogger } from '../lib/clientLogger';
import { operationalLabel } from '../lib/operationalPresentation';

type NoticeLinkPickerProps = {
    linkedNoticeIds: number[];
    onSelect: (noticeId: number) => void | Promise<void>;
    disabled?: boolean;
    label?: string;
};

function noticeMeta(notice: Notice) {
    return [operationalLabel(notice.category), operationalLabel(notice.priority)]
        .filter(Boolean)
        .join(' · ');
}

/**
 * Searches the Noticeboard before creating a task relationship, so linking
 * work is based on recognisable notice context rather than a database ID.
 */
export default function NoticeLinkPicker({
    linkedNoticeIds,
    onSelect,
    disabled = false,
    label = 'Link a notice'
}: NoticeLinkPickerProps) {
    const [search, setSearch] = useState('');
    const [suggestions, setSuggestions] = useState<Notice[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [loading, setLoading] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);
    const inputId = useId();
    const linkedIdsKey = useMemo(() => linkedNoticeIds.slice().sort((a, b) => a - b).join(','), [linkedNoticeIds]);

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
                const result = await fetchNotices({ search: query, status: 'all', pageSize: 8 });
                let notices = result.notices;

                if (isNumericId && !notices.some(notice => notice.id === Number(query))) {
                    try {
                        notices = [await getNotice(Number(query)), ...notices];
                    } catch {
                        // A title search can still be useful when an entered ID is not accessible.
                    }
                }

                if (!active) return;
                setSuggestions(notices.filter(notice => !linkedIds.has(notice.id)).slice(0, 8));
                setShowSuggestions(true);
            } catch (error) {
                if (!active) return;
                clientLogger.error('Failed to search notices for task link', error);
                setSuggestions([]);
                setSearchError('Could not search notices. Please try again.');
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

    async function selectNotice(notice: Notice) {
        await onSelect(notice.id);
        setSearch('');
        setSuggestions([]);
        setShowSuggestions(false);
    }

    const hasQuery = search.trim().length > 0;

    return (
        <div className="relative">
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[var(--muted)]" htmlFor={inputId}>
                {label}
            </label>
            <input
                id={inputId}
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
                placeholder="Search notice title, category, or ID"
                disabled={disabled}
                role="combobox"
                aria-autocomplete="list"
                aria-controls={`${inputId}-results`}
                aria-expanded={showSuggestions && hasQuery}
                aria-describedby={`${inputId}-hint`}
            />
            <p id={`${inputId}-hint`} className="mt-1 text-xs text-[var(--muted)]">
                Search by notice title, category, or exact ID.
            </p>
            {showSuggestions && hasQuery && (
                <div id={`${inputId}-results`} role="listbox" aria-label="Notice search results" className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-[var(--border)] bg-[var(--surface)] shadow-lg">
                    {loading && <p className="px-3 py-2 text-sm text-[var(--muted)]">Searching notices...</p>}
                    {!loading && searchError && <p role="alert" className="px-3 py-2 text-sm text-red-700">{searchError}</p>}
                    {!loading && !searchError && suggestions.length === 0 && (
                        <p className="px-3 py-2 text-sm text-[var(--muted)]">No unlinked notices match this search.</p>
                    )}
                    {!loading && !searchError && suggestions.map(notice => (
                        <button
                            key={notice.id}
                            type="button"
                            role="option"
                            aria-selected="false"
                            disabled={disabled}
                            className="block w-full border-b border-[var(--border)] px-3 py-2.5 text-left last:border-b-0 hover:bg-[#f8faf6] focus:bg-[#f8faf6]"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => void selectNotice(notice)}
                        >
                            <span className="block truncate font-semibold text-[#1c231f]">{notice.title}</span>
                            <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">Notice #{notice.id}{noticeMeta(notice) ? ` · ${noticeMeta(notice)}` : ''}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
