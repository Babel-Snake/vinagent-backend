'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    createIntegrationEvent,
    fetchIntegrationEvents,
    IntegrationEvent,
    IntegrationEventItem,
    IntegrationEventCreateInput,
    IntegrationEventStatus,
    IntegrationEventType,
    NoticeCategory,
    NoticePriority,
    reviewIntegrationEvent,
    fetchOperationalAreas,
    OperationalArea
} from '../../../lib/api';
import WorkSubnav from '../../../components/WorkSubnav';
import TaskLinkPicker from '../../../components/TaskLinkPicker';

const EVENT_TYPES: Array<{ value: IntegrationEventType | 'all'; label: string }> = [
    { value: 'all', label: 'All Types' },
    { value: 'call.intake', label: 'Call Intake' },
    { value: 'notice.imported', label: 'Imported Notice' },
    { value: 'task.suggested', label: 'Suggested Task' },
    { value: 'message.imported', label: 'Imported Message' },
    { value: 'file.imported', label: 'Imported File' },
    { value: 'unknown.received', label: 'Unknown' }
];

const STATUSES: Array<{ value: IntegrationEventStatus | 'all'; label: string }> = [
    { value: 'PENDING_REVIEW', label: 'Pending Review' },
    { value: 'all', label: 'All Statuses' },
    { value: 'RECEIVED', label: 'Received' },
    { value: 'PROCESSED', label: 'Processed' },
    { value: 'IGNORED', label: 'Ignored' },
    { value: 'ARCHIVED', label: 'Archived' },
    { value: 'FAILED', label: 'Failed' }
];

const NOTICE_CATEGORIES = ['GENERAL', 'WINE', 'VINTAGE_CHANGE', 'PRICING', 'STOCK', 'CUSTOMERS', 'MAINTENANCE', 'EVENTS', 'STAFF', 'WINE_CLUB', 'URGENT'];
const TASK_CATEGORIES = ['BOOKING', 'ORDER', 'ACCOUNT', 'GENERAL', 'OPERATIONS', 'INTERNAL', 'SYSTEM'];
const DEFAULT_NOTICE_PAYLOAD = `{
  "title": "Saturday roster changed",
  "message": "Please check your updated shift before Friday afternoon.",
  "posted_by": "Ops Manager",
  "created_at": "2026-06-11T09:00:00.000Z"
}`;
const DEFAULT_CALL_PAYLOAD = `{
  "callerName": "Sarah Booker",
  "callerPhone": "+61400111222",
  "summary": "Sarah wants to book a tasting for six people this Saturday.",
  "intent": "booking enquiry",
  "urgency": "normal",
  "recommendedAction": "Call Sarah back to confirm availability."
}`;

type BatchItemType = 'TASK' | 'NOTICE' | 'REQUEST' | 'NOTE';
type BatchItemDraft = { key: string; type: BatchItemType; title: string; body: string };

function newBatchItem(event: IntegrationEvent, type: BatchItemType = 'TASK'): BatchItemDraft {
    return {
        key: `review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type,
        title: normalizedDefault(event, 'title', eventTitle(event)),
        body: normalizedDefault(event, 'body', normalizedDefault(event, 'summary'))
    };
}

function formatDateTime(value?: string | null) {
    if (!value) return 'Not set';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Not set';
    return date.toLocaleString('en-AU', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit'
    });
}

function labelFromValue(value?: string | null) {
    if (!value) return 'Unknown';
    return value.replace(/[._-]/g, ' ').toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
}

function payloadString(payload: Record<string, unknown> | undefined, ...fields: string[]) {
    for (const field of fields) {
        const value = payload?.[field];
        if (typeof value === 'string' && value.trim()) return value;
        if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    }
    return '';
}

function eventTitle(event: IntegrationEvent) {
    return payloadString(event.normalizedPayload, 'title', 'summary', 'callerName')
        || event.externalEventId
        || `Event #${event.id}`;
}

function eventPreview(event: IntegrationEvent) {
    const text = payloadString(event.normalizedPayload, 'body', 'summary', 'transcript') || event.processingError || '';
    const compact = String(text || '').replace(/\s+/g, ' ').trim();
    return compact.length > 150 ? `${compact.slice(0, 147)}...` : compact;
}

function statusTone(status: IntegrationEventStatus) {
    if (status === 'PENDING_REVIEW') return 'bg-amber-100 text-amber-800 border-amber-200';
    if (status === 'PROCESSED') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    if (status === 'FAILED') return 'bg-red-100 text-red-800 border-red-200';
    if (status === 'IGNORED' || status === 'ARCHIVED') return 'bg-slate-100 text-slate-700 border-slate-200';
    return 'bg-teal-100 text-teal-800 border-teal-200';
}

type JsonParseResult =
    | { data: Record<string, unknown>; error: '' }
    | { data: null; error: string };

function safeJsonParse(value: string): JsonParseResult {
    try {
        const parsed = JSON.parse(value) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return { data: null, error: 'Payload must be a JSON object' };
        }
        return { data: parsed as Record<string, unknown>, error: '' };
    } catch (err) {
        return { data: null, error: err instanceof Error ? err.message : 'Invalid JSON payload' };
    }
}

function normalizedDefault(event: IntegrationEvent, field: string, fallback = '') {
    const value = event.normalizedPayload?.[field];
    return value === undefined || value === null ? fallback : String(value);
}

export default function IntegrationEventsPage() {
    const [events, setEvents] = useState<IntegrationEvent[]>([]);
    const [areas, setAreas] = useState<OperationalArea[]>([]);
    const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [filters, setFilters] = useState({
        status: 'PENDING_REVIEW',
        eventType: 'all',
        provider: 'all',
        areaId: 'all',
        search: ''
    });
    const [showCreate, setShowCreate] = useState(false);
    const [actionMessage, setActionMessage] = useState('');

    const loadEvents = useCallback(async () => {
        try {
            setLoading(true);
            const result = await fetchIntegrationEvents({ ...filters, pageSize: 100 });
            setEvents(result.events);
            setSelectedEventId(current => {
                if (current && result.events.some(event => event.id === current)) return current;
                return result.events[0]?.id || null;
            });
            setError('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load integration events');
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        fetchOperationalAreas().then(setAreas).catch(() => setAreas([]));
    }, []);

    useEffect(() => {
        const timer = setTimeout(loadEvents, 250);
        return () => clearTimeout(timer);
    }, [loadEvents]);

    const selectedEvent = useMemo(
        () => events.find(event => event.id === selectedEventId) || null,
        [events, selectedEventId]
    );

    const stats = useMemo(() => ({
        loaded: events.length,
        pending: events.filter(event => event.status === 'PENDING_REVIEW').length,
        failed: events.filter(event => event.status === 'FAILED').length,
        processed: events.filter(event => event.status === 'PROCESSED').length
    }), [events]);

    const providers = useMemo(() => {
        const unique = Array.from(new Set(events.map(event => event.provider).filter(Boolean)));
        return ['all', ...unique.sort()];
    }, [events]);

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Intake review</h1>
                    <p className="page-kicker">Review imported notices, call summaries, and provider events before they become operational records.</p>
                </div>
                <div className="flex shrink-0 gap-3">
                    <button type="button" onClick={() => setShowCreate(true)} className="btn-primary">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14m7-7H5" />
                        </svg>
                        Add Intake
                    </button>
                </div>
            </div>

            <WorkSubnav />

            {error && (
                <div className="mb-5 rounded-md border border-red-200 bg-red-50 p-4">
                    <p className="text-sm font-medium text-red-800">{error}</p>
                </div>
            )}

            {actionMessage && (
                <div className="mb-5 rounded-md border border-emerald-200 bg-emerald-50 p-4">
                    <p className="text-sm font-medium text-emerald-800">{actionMessage}</p>
                </div>
            )}

            <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                <IntakeMetric label="Loaded" value={stats.loaded} tone="slate" />
                <IntakeMetric label="Pending" value={stats.pending} tone="amber" />
                <IntakeMetric label="Processed" value={stats.processed} tone="green" />
                <IntakeMetric label="Failed" value={stats.failed} tone="red" />
            </div>

            <div className="surface-panel mb-5 p-4">
                <div className="grid gap-3 md:grid-cols-5">
                    <div>
                        <label className="mb-1.5 block text-xs font-bold uppercase text-[var(--muted)]">Search</label>
                        <input
                            value={filters.search}
                            onChange={(event) => setFilters(prev => ({ ...prev, search: event.target.value }))}
                            className="form-control"
                            placeholder="Provider, external ID, or event type"
                        />
                    </div>
                    <div>
                        <label className="mb-1.5 block text-xs font-bold uppercase text-[var(--muted)]">Status</label>
                        <select
                            value={filters.status}
                            onChange={(event) => setFilters(prev => ({ ...prev, status: event.target.value }))}
                            className="form-control"
                        >
                            {STATUSES.map(status => <option key={status.value} value={status.value}>{status.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="mb-1.5 block text-xs font-bold uppercase text-[var(--muted)]">Type</label>
                        <select
                            value={filters.eventType}
                            onChange={(event) => setFilters(prev => ({ ...prev, eventType: event.target.value }))}
                            className="form-control"
                        >
                            {EVENT_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="mb-1.5 block text-xs font-bold uppercase text-[var(--muted)]">Provider</label>
                        <select
                            value={filters.provider}
                            onChange={(event) => setFilters(prev => ({ ...prev, provider: event.target.value }))}
                            className="form-control"
                        >
                            {providers.map(provider => <option key={provider} value={provider}>{provider === 'all' ? 'All Providers' : provider}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="mb-1.5 block text-xs font-bold uppercase text-[var(--muted)]">Area</label>
                        <select
                            value={filters.areaId}
                            onChange={(event) => setFilters(prev => ({ ...prev, areaId: event.target.value }))}
                            className="form-control"
                        >
                            <option value="all">All Areas</option>
                            {areas.map(area => <option key={area.id} value={area.id}>{area.name}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(320px,0.95fr)_minmax(0,1.35fr)]">
                <div className="surface-panel overflow-hidden">
                    <div className="border-b border-[var(--border)] px-4 py-3">
                        <h2 className="text-sm font-bold uppercase text-[var(--muted)]">Queue</h2>
                    </div>
                    {loading ? (
                        <div className="py-14 text-center">
                            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-[#d9dfd2] border-t-[var(--brand)]"></div>
                            <p className="mt-3 text-sm font-medium text-[var(--muted)]">Loading intake...</p>
                        </div>
                    ) : events.length === 0 ? (
                        <div className="empty-state m-4">
                            <div>
                                <div className="text-sm font-semibold text-[#344039]">No integration events match this view.</div>
                                <div className="mt-1 text-sm">Change filters or add a manual intake event.</div>
                            </div>
                        </div>
                    ) : (
                        <div className="max-h-[760px] overflow-y-auto">
                            {events.map(event => (
                                <button
                                    key={event.id}
                                    type="button"
                                    onClick={() => {
                                        setSelectedEventId(event.id);
                                        setActionMessage('');
                                    }}
                                    className={`block w-full border-b border-[var(--border)] px-4 py-3 text-left transition-colors hover:bg-[#f8faf6] ${selectedEventId === event.id ? 'bg-[var(--brand-soft)]' : 'bg-white'}`}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="truncate text-sm font-semibold text-[#1c231f]">{eventTitle(event)}</div>
                                            <div className="mt-1 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
                                                <span>{labelFromValue(event.eventType)}</span>
                                                <span>{event.provider}</span>
                                                <span>{formatDateTime(event.receivedAt)}</span>
                                            </div>
                                        </div>
                                        <StatusBadge status={event.status} />
                                    </div>
                                    {eventPreview(event) && (
                                        <div className="mt-2 line-clamp-2 text-sm leading-5 text-[#536158]">{eventPreview(event)}</div>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="surface-panel min-h-[520px] overflow-hidden">
                    {selectedEvent ? (
                        <EventDetail
                            event={selectedEvent}
                            areas={areas}
                            onReviewed={async (message) => {
                                setActionMessage(message);
                                await loadEvents();
                            }}
                        />
                    ) : (
                        <div className="empty-state m-4 min-h-[480px]">
                            <div>
                                <div className="text-sm font-semibold text-[#344039]">Select an event to review.</div>
                                <div className="mt-1 text-sm">Pending events can be converted into notices or tasks.</div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {showCreate && (
                <CreateIntegrationEventModal
                    areas={areas}
                    onClose={() => setShowCreate(false)}
                    onCreated={async (event, duplicate) => {
                        setShowCreate(false);
                        setActionMessage(duplicate ? `Existing event #${event.id} was loaded from the duplicate external ID.` : `Created event #${event.id}.`);
                        await loadEvents();
                        setSelectedEventId(event.id);
                    }}
                />
            )}
        </div>
    );
}

function EventDetail({
    event,
    areas,
    onReviewed
}: {
    event: IntegrationEvent;
    areas: OperationalArea[];
    onReviewed: (message: string) => Promise<void>;
}) {
    const [mode, setMode] = useState<'publish_notice' | 'create_task' | 'link_task' | 'create_items' | 'ignore' | 'archive'>(
        event.eventType === 'notice.imported' ? 'publish_notice' : event.eventType === 'call.intake' ? 'create_task' : 'link_task'
    );
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [noticeTitle, setNoticeTitle] = useState(normalizedDefault(event, 'title'));
    const [noticeBody, setNoticeBody] = useState(normalizedDefault(event, 'body'));
    const [noticeCategory, setNoticeCategory] = useState(normalizedDefault(event, 'category', 'GENERAL'));
    const [noticePriority, setNoticePriority] = useState(normalizedDefault(event, 'priority', 'normal'));
    const [noticePinned, setNoticePinned] = useState(false);
    const [linkedTaskIds, setLinkedTaskIds] = useState<number[]>([]);
    const [taskCategory, setTaskCategory] = useState(event.eventType === 'call.intake' ? 'BOOKING' : 'INTERNAL');
    const [taskSubType, setTaskSubType] = useState(event.eventType === 'call.intake' ? 'BOOKING_NEW' : 'INTEGRATION_REVIEW');
    const [taskPriority, setTaskPriority] = useState(event.normalizedPayload?.urgency === 'urgent' ? 'high' : 'normal');
    const [requesterName, setRequesterName] = useState(normalizedDefault(event, 'callerName'));
    const [requesterPhone, setRequesterPhone] = useState(normalizedDefault(event, 'callerPhone'));
    const [suggestedAction, setSuggestedAction] = useState(normalizedDefault(event, 'recommendedAction'));
    const [linkTaskId, setLinkTaskId] = useState<number | null>(null);
    const [reason, setReason] = useState('');
    const [confirmedAreaId, setConfirmedAreaId] = useState<number | ''>(event.confirmedAreaId || event.suggestedAreaId || '');
    const [linkedAreaIds, setLinkedAreaIds] = useState<number[]>([]);
    const [batchItems, setBatchItems] = useState<BatchItemDraft[]>(() => [newBatchItem(event)]);

    useEffect(() => {
        setMode(event.eventType === 'notice.imported' ? 'publish_notice' : event.eventType === 'call.intake' ? 'create_task' : 'link_task');
        setError('');
        setNoticeTitle(normalizedDefault(event, 'title'));
        setNoticeBody(normalizedDefault(event, 'body'));
        setNoticeCategory(normalizedDefault(event, 'category', 'GENERAL'));
        setNoticePriority(normalizedDefault(event, 'priority', 'normal'));
        setNoticePinned(false);
        setLinkedTaskIds([]);
        setTaskCategory(event.eventType === 'call.intake' ? 'BOOKING' : 'INTERNAL');
        setTaskSubType(event.eventType === 'call.intake' ? 'BOOKING_NEW' : 'INTEGRATION_REVIEW');
        setTaskPriority(event.normalizedPayload?.urgency === 'urgent' ? 'high' : 'normal');
        setRequesterName(normalizedDefault(event, 'callerName'));
        setRequesterPhone(normalizedDefault(event, 'callerPhone'));
        setSuggestedAction(normalizedDefault(event, 'recommendedAction'));
        setLinkTaskId(null);
        setReason('');
        setConfirmedAreaId(event.confirmedAreaId || event.suggestedAreaId || '');
        setLinkedAreaIds([]);
        setBatchItems([newBatchItem(event)]);
    }, [event]);

    async function submitReview() {
        if (mode === 'link_task' && !linkTaskId) {
            setError('Choose the existing task that this intake should link to.');
            return;
        }

        setBusy(true);
        setError('');
        try {
            const result = await reviewIntegrationEvent(event.id, {
                action: mode,
                reason: reason || undefined,
                taskId: mode === 'link_task' ? linkTaskId ?? undefined : undefined,
                taskIds: mode === 'publish_notice' ? linkedTaskIds : undefined,
                confirmedAreaId: confirmedAreaId === '' ? null : confirmedAreaId,
                items: mode === 'create_items'
                    ? batchItems.map(item => ({
                        key: item.key,
                        type: item.type,
                        data: {
                            title: item.title,
                            body: item.body,
                            areaScope: confirmedAreaId === '' ? 'ORGANISATION' : 'AREAS',
                            primaryAreaId: confirmedAreaId === '' ? null : confirmedAreaId,
                            linkedAreaIds,
                            ...(item.type === 'REQUEST' ? { subtype: 'INTEGRATION_REVIEW' } : {}),
                            ...(item.type === 'NOTE' ? { recordType: 'INTEGRATION_CONTEXT' } : {})
                        }
                    }))
                    : undefined,
                notice: mode === 'publish_notice'
                    ? {
                        title: noticeTitle,
                        body: noticeBody,
                        category: noticeCategory as NoticeCategory,
                        priority: noticePriority as NoticePriority,
                        isPinned: noticePinned,
                        areaScope: confirmedAreaId === '' ? 'ORGANISATION' : 'AREAS',
                        primaryAreaId: confirmedAreaId === '' ? null : confirmedAreaId,
                        linkedAreaIds
                    }
                    : undefined,
                task: mode === 'create_task'
                    ? {
                        requesterName,
                        requesterPhone,
                        category: taskCategory,
                        subType: taskSubType,
                        priority: taskPriority,
                        suggestedAction,
                        areaScope: confirmedAreaId === '' ? 'ORGANISATION' : 'AREAS',
                        primaryAreaId: confirmedAreaId === '' ? null : confirmedAreaId,
                        linkedAreaIds
                    }
                    : undefined
            });

            const target = result.items?.length
                ? `${result.items.length} linked items`
                : result.noticeId
                ? `notice #${result.noticeId}`
                : result.taskId
                    ? `task #${result.taskId}`
                    : labelFromValue(result.event.status);
            await onReviewed(`Event #${event.id} reviewed: ${target}.`);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to review event');
        } finally {
            setBusy(false);
        }
    }

    const canAct = event.status === 'PENDING_REVIEW' || event.status === 'RECEIVED' || event.status === 'NORMALIZED' || event.status === 'FAILED';

    return (
        <div className="flex h-full flex-col">
            <div className="border-b border-[var(--border)] px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="mb-2 flex flex-wrap gap-2">
                            <StatusBadge status={event.status} />
                            <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-bold uppercase text-slate-600">{labelFromValue(event.eventType)}</span>
                            <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-bold uppercase text-slate-600">{event.provider}</span>
                        </div>
                        <h2 className="break-words text-xl font-semibold text-[#1c231f]">{eventTitle(event)}</h2>
                        <p className="mt-1 text-sm text-[var(--muted)]">Received {formatDateTime(event.receivedAt)}</p>
                    </div>
                    {(event.linkedItems?.length || event.LinkedItems?.length) ? (
                        <RelatedItemLinks items={event.linkedItems || event.LinkedItems || []} />
                    ) : event.relatedRecordType && event.relatedRecordId && (
                        <RelatedRecordLink event={event} />
                    )}
                </div>
            </div>

            <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
                <div className="space-y-4">
                    <InfoSection title="Normalized Payload" data={event.normalizedPayload} />
                    <InfoSection title="Raw Payload" data={event.rawPayload} />
                    {event.processingError && (
                        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                            <div className="font-semibold">Processing Error</div>
                            <div className="mt-1">{event.processingError}</div>
                        </div>
                    )}
                </div>

                <div className="space-y-4">
                    <div className="rounded-md border border-slate-200 bg-white p-4">
                        <div className="mb-3 text-xs font-bold uppercase text-[var(--muted)]">Review Action</div>
                        {!canAct ? (
                            <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                                This event has already been reviewed.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)} className="form-control">
                                    <option value="publish_notice">Publish Notice</option>
                                    <option value="create_task">Create Task</option>
                                    <option value="create_items">Create Multiple Items</option>
                                    <option value="link_task">Link Existing Task</option>
                                    <option value="ignore">Ignore</option>
                                    <option value="archive">Archive</option>
                                </select>

                                {(mode === 'publish_notice' || mode === 'create_task' || mode === 'create_items') && (
                                    <div className="rounded-md border border-teal-100 bg-teal-50 p-3">
                                        <label className="mb-1.5 block text-xs font-bold uppercase text-teal-800">Confirmed Operational Area</label>
                                        <select
                                            value={confirmedAreaId}
                                            onChange={(event) => setConfirmedAreaId(event.target.value ? Number(event.target.value) : '')}
                                            className="form-control"
                                        >
                                            <option value="">Organisation-wide</option>
                                            {areas.map(area => <option key={area.id} value={area.id}>{area.name}</option>)}
                                        </select>
                                        {confirmedAreaId !== '' && areas.length > 1 && (
                                            <div className="mt-2 flex flex-wrap gap-2">
                                                {areas.filter(area => area.id !== Number(confirmedAreaId)).map(area => (
                                                    <label key={area.id} className="flex items-center gap-1.5 text-xs text-teal-900">
                                                        <input
                                                            type="checkbox"
                                                            checked={linkedAreaIds.includes(area.id)}
                                                            onChange={(event) => setLinkedAreaIds(current => event.target.checked
                                                                ? [...current, area.id]
                                                                : current.filter(id => id !== area.id))}
                                                        />
                                                        {area.name}
                                                    </label>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {mode === 'publish_notice' && (
                                    <div className="space-y-3">
                                        <Field label="Title" value={noticeTitle} onChange={setNoticeTitle} />
                                        <div>
                                            <label className="mb-1.5 block text-xs font-bold uppercase text-[var(--muted)]">Body</label>
                                            <textarea value={noticeBody} onChange={(event) => setNoticeBody(event.target.value)} className="form-control min-h-32" />
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <SelectField label="Category" value={noticeCategory} onChange={setNoticeCategory} options={NOTICE_CATEGORIES} />
                                            <SelectField label="Priority" value={noticePriority} onChange={setNoticePriority} options={['normal', 'important', 'urgent']} />
                                        </div>
                                        <label className="flex items-center gap-2 text-sm font-semibold text-[#344039]">
                                            <input type="checkbox" checked={noticePinned} onChange={(event) => setNoticePinned(event.target.checked)} />
                                            Pin notice
                                        </label>
                                        <TaskLinkPicker
                                            label="Link existing tasks"
                                            linkedTaskIds={linkedTaskIds}
                                            disabled={busy}
                                            onSelect={(taskId) => setLinkedTaskIds(current => [...current, taskId])}
                                        />
                                        {linkedTaskIds.length > 0 && (
                                            <div className="flex flex-wrap gap-2" aria-label="Tasks linked to this notice">
                                                {linkedTaskIds.map(taskId => (
                                                    <button
                                                        key={taskId}
                                                        type="button"
                                                        className="rounded-md border border-teal-200 bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-900 hover:bg-teal-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]"
                                                        onClick={() => setLinkedTaskIds(current => current.filter(id => id !== taskId))}
                                                        disabled={busy}
                                                        aria-label={`Remove task ${taskId} from this notice`}
                                                    >
                                                        Task #{taskId} <span aria-hidden="true">×</span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {mode === 'create_task' && (
                                    <div className="space-y-3">
                                        <div className="grid grid-cols-2 gap-3">
                                            <SelectField label="Category" value={taskCategory} onChange={setTaskCategory} options={TASK_CATEGORIES} />
                                            <SelectField label="Priority" value={taskPriority} onChange={setTaskPriority} options={['low', 'normal', 'high']} />
                                        </div>
                                        <Field label="Subtype" value={taskSubType} onChange={setTaskSubType} />
                                        <Field label="Requester Name" value={requesterName} onChange={setRequesterName} />
                                        <Field label="Requester Phone" value={requesterPhone} onChange={setRequesterPhone} />
                                        <div>
                                            <label className="mb-1.5 block text-xs font-bold uppercase text-[var(--muted)]">Suggested Action</label>
                                            <textarea value={suggestedAction} onChange={(event) => setSuggestedAction(event.target.value)} className="form-control min-h-24" />
                                        </div>
                                    </div>
                                )}

                                {mode === 'create_items' && (
                                    <div className="space-y-3">
                                        <p className="text-xs text-slate-600">Create up to 10 operational items in one atomic review. If any item fails, none are saved.</p>
                                        {batchItems.map((item, index) => (
                                            <div key={item.key} className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
                                                <div className="flex items-center gap-2">
                                                    <select
                                                        value={item.type}
                                                        onChange={(event) => setBatchItems(current => current.map(entry => entry.key === item.key ? { ...entry, type: event.target.value as BatchItemType } : entry))}
                                                        className="form-control"
                                                    >
                                                        {(['TASK', 'NOTICE', 'REQUEST', 'NOTE'] as BatchItemType[]).map(type => <option key={type} value={type}>{labelFromValue(type)}</option>)}
                                                    </select>
                                                    {batchItems.length > 1 && (
                                                        <button type="button" className="btn-secondary shrink-0" onClick={() => setBatchItems(current => current.filter(entry => entry.key !== item.key))}>Remove</button>
                                                    )}
                                                </div>
                                                <Field label={`Item ${index + 1} title`} value={item.title} onChange={(title) => setBatchItems(current => current.map(entry => entry.key === item.key ? { ...entry, title } : entry))} />
                                                <div>
                                                    <label className="mb-1.5 block text-xs font-bold uppercase text-[var(--muted)]">Body</label>
                                                    <textarea value={item.body} onChange={(event) => setBatchItems(current => current.map(entry => entry.key === item.key ? { ...entry, body: event.target.value } : entry))} className="form-control min-h-20" />
                                                </div>
                                            </div>
                                        ))}
                                        <button
                                            type="button"
                                            className="btn-secondary w-full justify-center"
                                            disabled={batchItems.length >= 10}
                                            onClick={() => setBatchItems(current => [...current, newBatchItem(event, 'NOTE')])}
                                        >
                                            Add Item
                                        </button>
                                    </div>
                                )}

                                {mode === 'link_task' && (
                                    <div className="space-y-2">
                                        <TaskLinkPicker
                                            label="Task to link"
                                            linkedTaskIds={linkTaskId ? [linkTaskId] : []}
                                            disabled={busy}
                                            onSelect={setLinkTaskId}
                                        />
                                        {linkTaskId && (
                                            <button
                                                type="button"
                                                className="rounded-md border border-teal-200 bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-900 hover:bg-teal-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]"
                                                onClick={() => setLinkTaskId(null)}
                                                disabled={busy}
                                            >
                                                Task #{linkTaskId} <span aria-hidden="true">×</span>
                                                <span className="sr-only"> Remove selected task</span>
                                            </button>
                                        )}
                                    </div>
                                )}

                                {(mode === 'ignore' || mode === 'archive') && (
                                    <div>
                                        <label className="mb-1.5 block text-xs font-bold uppercase text-[var(--muted)]">Reason</label>
                                        <textarea value={reason} onChange={(event) => setReason(event.target.value)} className="form-control min-h-24" />
                                    </div>
                                )}

                                {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

                                <button type="button" disabled={busy} onClick={submitReview} className="btn-primary w-full justify-center disabled:opacity-60">
                                    {busy ? 'Reviewing...' : 'Submit Review'}
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-600">
                        <div className="mb-2 text-xs font-bold uppercase text-[var(--muted)]">Event Metadata</div>
                        <dl className="space-y-2">
                            <MetaRow label="External ID" value={event.externalEventId || 'None'} />
                            <MetaRow label="Method" value={labelFromValue(event.intakeMethod)} />
                            <MetaRow label="Created By" value={event.Creator?.displayName || event.Creator?.email || 'System'} />
                            <MetaRow label="Reviewed By" value={event.Reviewer?.displayName || event.Reviewer?.email || 'Not reviewed'} />
                            <MetaRow label="Processed" value={formatDateTime(event.processedAt)} />
                        </dl>
                    </div>
                </div>
            </div>
        </div>
    );
}

function CreateIntegrationEventModal({
    areas,
    onClose,
    onCreated
}: {
    areas: OperationalArea[];
    onClose: () => void;
    onCreated: (event: IntegrationEvent, duplicate: boolean) => Promise<void>;
}) {
    const [provider, setProvider] = useState('manual');
    const [intakeMethod, setIntakeMethod] = useState<'manual' | 'webhook' | 'automation' | 'email' | 'import'>('manual');
    const [eventType, setEventType] = useState<IntegrationEventType>('notice.imported');
    const [externalEventId, setExternalEventId] = useState('');
    const [suggestedAreaId, setSuggestedAreaId] = useState<number | ''>('');
    const [payloadText, setPayloadText] = useState(DEFAULT_NOTICE_PAYLOAD);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setPayloadText(eventType === 'call.intake' ? DEFAULT_CALL_PAYLOAD : DEFAULT_NOTICE_PAYLOAD);
    }, [eventType]);

    async function submit() {
        const parsed = safeJsonParse(payloadText);
        if (parsed.error) {
            setError(parsed.error);
            return;
        }
        if (!parsed.data) {
            setError('Payload must be a JSON object');
            return;
        }

        setSaving(true);
        setError('');
        try {
            const input: IntegrationEventCreateInput = {
                provider,
                intakeMethod,
                eventType,
                externalEventId: externalEventId || null,
                suggestedAreaId: suggestedAreaId === '' ? null : suggestedAreaId,
                areaMappingSource: suggestedAreaId === '' ? null : 'MANUAL',
                rawPayload: parsed.data
            };
            const result = await createIntegrationEvent(input);
            await onCreated(result.event, result.duplicate);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create integration event');
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true">
            <div className="fixed inset-0 bg-[#1c231f]/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true"></div>
            <div className="relative z-10 flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-[var(--surface)] shadow-2xl">
                <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
                    <div>
                        <h2 className="text-xl font-semibold text-[#1c231f]">Add Intake Event</h2>
                        <p className="text-sm text-[var(--muted)]">Create a reviewable event from a manual import or automation payload.</p>
                    </div>
                    <button type="button" onClick={onClose} className="icon-button text-[var(--muted)] hover:bg-slate-100" aria-label="Close intake form">
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-5">
                    <div className="grid gap-4 md:grid-cols-2">
                        <Field label="Provider" value={provider} onChange={setProvider} placeholder="deputy, retell, vapi, zapier" />
                        <SelectField label="Intake Method" value={intakeMethod} onChange={(value) => setIntakeMethod(value as typeof intakeMethod)} options={['manual', 'webhook', 'automation', 'email', 'import']} />
                        <SelectField
                            label="Event Type"
                            value={eventType}
                            onChange={(value) => setEventType(value as IntegrationEventType)}
                            options={EVENT_TYPES.filter(type => type.value !== 'all').map(type => type.value)}
                            optionLabel={labelFromValue}
                        />
                        <Field label="External ID" value={externalEventId} onChange={setExternalEventId} placeholder="Optional provider ID" />
                        <div>
                            <label className="mb-1.5 block text-xs font-bold uppercase text-[var(--muted)]">Suggested Area</label>
                            <select
                                className="form-control"
                                value={suggestedAreaId}
                                onChange={(event) => setSuggestedAreaId(event.target.value ? Number(event.target.value) : '')}
                            >
                                <option value="">No suggestion</option>
                                {areas.map(area => <option key={area.id} value={area.id}>{area.name}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="mt-4">
                        <label className="mb-1.5 block text-xs font-bold uppercase text-[var(--muted)]">Raw Payload JSON</label>
                        <textarea
                            value={payloadText}
                            onChange={(event) => setPayloadText(event.target.value)}
                            className="form-control min-h-72 font-mono text-xs"
                            spellCheck={false}
                        />
                    </div>

                    {error && <div className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
                </div>

                <div className="flex justify-end gap-3 border-t border-[var(--border)] px-5 py-4">
                    <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
                    <button type="button" onClick={submit} disabled={saving} className="btn-primary disabled:opacity-60">
                        {saving ? 'Creating...' : 'Create Event'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function IntakeMetric({
    label,
    value,
    tone
}: {
    label: string;
    value: number;
    tone: 'slate' | 'amber' | 'green' | 'red';
}) {
    const toneClasses = {
        slate: 'bg-slate-500',
        amber: 'bg-amber-500',
        green: 'bg-emerald-500',
        red: 'bg-red-500'
    };

    return (
        <div className="metric-tile">
            <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[11px] font-bold uppercase text-[var(--muted)]">{label}</span>
                <span className={`status-dot ${toneClasses[tone]}`}></span>
            </div>
            <div className="mt-2 text-2xl font-semibold text-[#1c231f]">{value}</div>
        </div>
    );
}

function StatusBadge({ status }: { status: IntegrationEventStatus }) {
    return (
        <span className={`shrink-0 rounded-md border px-2 py-1 text-[11px] font-bold uppercase ${statusTone(status)}`}>
            {labelFromValue(status)}
        </span>
    );
}

function InfoSection({ title, data }: { title: string; data: unknown }) {
    return (
        <div className="rounded-md border border-slate-200 bg-white p-4">
            <div className="mb-2 text-xs font-bold uppercase text-[var(--muted)]">{title}</div>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-950 p-3 text-xs leading-5 text-slate-100">
                {JSON.stringify(data || {}, null, 2)}
            </pre>
        </div>
    );
}

function Field({
    label,
    value,
    onChange,
    placeholder = ''
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
}) {
    return (
        <div>
            <label className="mb-1.5 block text-xs font-bold uppercase text-[var(--muted)]">{label}</label>
            <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="form-control" />
        </div>
    );
}

function SelectField({
    label,
    value,
    onChange,
    options,
    optionLabel = labelFromValue
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: string[];
    optionLabel?: (value: string) => string;
}) {
    return (
        <div>
            <label className="mb-1.5 block text-xs font-bold uppercase text-[var(--muted)]">{label}</label>
            <select value={value} onChange={(event) => onChange(event.target.value)} className="form-control">
                {options.map(option => <option key={option} value={option}>{optionLabel(option)}</option>)}
            </select>
        </div>
    );
}

function MetaRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between gap-3 border-b border-slate-100 pb-2 last:border-b-0 last:pb-0">
            <dt className="font-semibold text-slate-700">{label}</dt>
            <dd className="min-w-0 text-right text-slate-600">{value}</dd>
        </div>
    );
}

function RelatedRecordLink({ event }: { event: IntegrationEvent }) {
    const href = event.relatedRecordType === 'NOTICE'
        ? `/noticeboard?noticeId=${event.relatedRecordId}`
        : event.relatedRecordType === 'TASK'
            ? `/tasks?taskId=${event.relatedRecordId}`
            : null;

    if (!href) {
        return (
            <span className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-600">
                {event.relatedRecordType} #{event.relatedRecordId}
            </span>
        );
    }

    return (
        <Link href={href} className="btn-secondary">
            Open {event.relatedRecordType === 'NOTICE' ? 'Notice' : 'Task'} #{event.relatedRecordId}
        </Link>
    );
}

function operationalItemHref(item: IntegrationEventItem) {
    if (item.itemType === 'TASK') return `/tasks?taskId=${item.itemId}`;
    if (item.itemType === 'NOTICE') return `/noticeboard?noticeId=${item.itemId}`;
    if (item.itemType === 'REQUEST') return `/requests?requestId=${item.itemId}`;
    return `/notes?recordId=${item.itemId}`;
}

function RelatedItemLinks({ items }: { items: IntegrationEventItem[] }) {
    return (
        <div className="flex max-w-md flex-wrap justify-end gap-2">
            {items.map(item => (
                <Link key={item.id} href={operationalItemHref(item)} className="btn-secondary">
                    {labelFromValue(item.itemType)} #{item.itemId}
                </Link>
            ))}
        </div>
    );
}
