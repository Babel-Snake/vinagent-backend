'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
    AreaScope,
    OperationalArea,
    OperationalClassificationSuggestion,
    OperationalRecord,
    OperationalRequest,
    Staff,
    classifyOperationalInput,
    createOperationalRecord,
    createOperationalRequest,
    decideOperationalRequest,
    fetchOperationalAreas,
    fetchOperationalRecords,
    fetchOperationalRequests,
    getUsers,
    getMyProfile,
    getOperationalRecord,
    getOperationalRequest
} from '../lib/api';
import OperationalCollaborationPanel from './OperationalCollaborationPanel';
import WorkSubnav from './WorkSubnav';
import Dialog from './ui/Dialog';
import { errorMessage } from '../lib/errors';
import { operationalLabel, subtypeOptionsFor } from '../lib/operationalPresentation';
import InvolvementBadge from './InvolvementBadge';
import { involvementSurfaceClass, noteInvolvement, requestInvolvement, type InvolvementViewer } from '../lib/involvement';

type Mode = 'request' | 'note';

export default function OperationalItemPage({ mode }: { mode: Mode }) {
    const searchParams = useSearchParams();
    const [items, setItems] = useState<Array<OperationalRequest | OperationalRecord>>([]);
    const [areas, setAreas] = useState<OperationalArea[]>([]);
    const [users, setUsers] = useState<Staff[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [areaFilter, setAreaFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('PENDING');
    const [captureText, setCaptureText] = useState('');
    const [suggestion, setSuggestion] = useState<OperationalClassificationSuggestion | null>(null);
    const [isManualEntry, setIsManualEntry] = useState(false);
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [subtype, setSubtype] = useState('');
    const [priority, setPriority] = useState<'low' | 'normal' | 'high'>('normal');
    const [requestedFromUserId, setRequestedFromUserId] = useState('');
    const [recipientUserIds, setRecipientUserIds] = useState<number[]>([]);
    const [areaScope, setAreaScope] = useState<AreaScope>('ORGANISATION');
    const [primaryAreaId, setPrimaryAreaId] = useState('');
    const [currentUserId, setCurrentUserId] = useState<number | null>(null);
    const [decisionTarget, setDecisionTarget] = useState<{ item: OperationalRequest; status: 'APPROVED' | 'REJECTED' | 'CANCELLED' } | null>(null);
    const [decisionResponse, setDecisionResponse] = useState('');
    const [decisionSaving, setDecisionSaving] = useState(false);
    const [decisionError, setDecisionError] = useState('');
    const reviewHeadingRef = useRef<HTMLHeadingElement>(null);

    const expectedType = mode === 'request' ? 'REQUEST' : 'NOTE';
    const noun = mode === 'request' ? 'Request' : 'Note';
    const selectedId = Number(searchParams.get(mode === 'request' ? 'requestId' : 'recordId')) || null;
    const viewer: InvolvementViewer | null = currentUserId ? {
        id: currentUserId,
        role: '',
        areaIds: areas.filter(area => area.myMembership).map(area => area.id)
    } : null;

    async function load() {
        setLoading(true);
        try {
            const itemsPromise: Promise<Array<OperationalRequest | OperationalRecord>> = mode === 'request'
                ? fetchOperationalRequests({ search, areaId: areaFilter, status: statusFilter }).then(result => result.requests)
                : fetchOperationalRecords({ search, areaId: areaFilter }).then(result => result.records);
            const [areaData, userData, itemData] = await Promise.all([
                fetchOperationalAreas(),
                getUsers().catch(() => []),
                itemsPromise
            ]);
            if (!currentUserId) {
                const profile = await getMyProfile().catch(() => null);
                setCurrentUserId(profile?.user?.id || null);
            }
            setAreas(areaData);
            setUsers(userData);
            let loadedItems = itemData;
            if (selectedId && !loadedItems.some((item: OperationalRequest | OperationalRecord) => item.id === selectedId)) {
                const selected = mode === 'request'
                    ? await getOperationalRequest(selectedId).catch(() => null)
                    : await getOperationalRecord(selectedId).catch(() => null);
                if (selected) loadedItems = [selected, ...loadedItems];
            }
            setItems(loadedItems);
            if (!primaryAreaId) {
                const primary = areaData.find(area => area.myMembership?.isPrimary);
                if (primary) {
                    setAreaScope('AREAS');
                    setPrimaryAreaId(String(primary.id));
                }
            }
            setError('');
        } catch (err: unknown) {
            setError(errorMessage(err, `Failed to load ${noun.toLowerCase()}s`));
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        const timer = setTimeout(load, 250);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, search, areaFilter, statusFilter, selectedId]);

    useEffect(() => {
        if (!selectedId || loading) return;
        document.getElementById(`${mode}-${selectedId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, [selectedId, loading, mode]);

    async function analyze() {
        if (!captureText.trim()) return;
        setSaving(true);
        try {
            const result = await classifyOperationalInput(captureText.trim());
            setSuggestion(result);
            setTitle(result.suggestedTitle || captureText.trim().slice(0, 120));
            setBody(result.suggestedBody || captureText.trim());
            setSubtype(result.suggestedSubtype || '');
            setIsManualEntry(true);
            setError('');
            requestAnimationFrame(() => reviewHeadingRef.current?.focus());
        } catch (err: unknown) {
            setError(errorMessage(err, 'Classification failed'));
        } finally {
            setSaving(false);
        }
    }

    function resetForm() {
        setCaptureText('');
        setSuggestion(null);
        setIsManualEntry(false);
        setTitle('');
        setBody('');
        setSubtype('');
        setPriority('normal');
        setRequestedFromUserId('');
        setRecipientUserIds([]);
    }

    async function createItem(event: FormEvent) {
        event.preventDefault();
        if (!title.trim() || !body.trim()) return;
        if (areaScope === 'AREAS' && !primaryAreaId) {
            setError('Choose a primary operational area.');
            return;
        }
        setSaving(true);
        try {
            const common = {
                title: title.trim(),
                body: body.trim(),
                originalText: captureText.trim() || body.trim(),
                areaScope,
                primaryAreaId: areaScope === 'AREAS' ? Number(primaryAreaId) : null,
                linkedAreaIds: [],
                aiSuggestedType: suggestion?.suggestedType || null,
                aiConfidence: suggestion?.confidence ?? null,
                aiSuggestion: suggestion || null
            };
            if (mode === 'request') {
                await createOperationalRequest({
                    ...common,
                    subtype: subtype || null,
                    priority,
                    requestedFromUserId: requestedFromUserId ? Number(requestedFromUserId) : null
                });
            } else {
                await createOperationalRecord({
                    ...common,
                    recordType: subtype || null,
                    occurredAt: new Date().toISOString(),
                    recipientUserIds
                });
            }
            resetForm();
            await load();
        } catch (err: unknown) {
            setError(errorMessage(err, `Failed to create ${noun.toLowerCase()}`));
        } finally {
            setSaving(false);
        }
    }

    function openDecision(item: OperationalRequest, status: 'APPROVED' | 'REJECTED' | 'CANCELLED') {
        setDecisionTarget({ item, status });
        setDecisionResponse('');
        setDecisionError('');
    }

    async function decide() {
        if (!decisionTarget) return;
        if (decisionTarget.status === 'REJECTED' && !decisionResponse.trim()) {
            setDecisionError('Add a reason before rejecting this request.');
            return;
        }

        setDecisionSaving(true);
        try {
            await decideOperationalRequest(decisionTarget.item.id, decisionTarget.status, decisionResponse.trim());
            setDecisionTarget(null);
            await load();
        } catch (err: unknown) {
            setError(errorMessage(err, 'Decision failed'));
        } finally {
            setDecisionSaving(false);
        }
    }

    function enterManually() {
        setSuggestion(null);
        setIsManualEntry(true);
        setTitle(current => current || captureText.trim().slice(0, 120));
        setBody(current => current || captureText.trim());
        requestAnimationFrame(() => reviewHeadingRef.current?.focus());
    }

    const areaNames = useMemo(() => new Map(areas.map(area => [area.id, area.name])), [areas]);
    const eligibleRecipientUsers = useMemo(() => users.filter(user => {
        if (user.isActive === false) return false;
        if (areaScope === 'ORGANISATION') return true;
        if (['manager', 'admin'].includes(user.role || '')) return true;
        return Boolean(primaryAreaId) && (user.areaIds || []).includes(Number(primaryAreaId));
    }), [areaScope, primaryAreaId, users]);

    useEffect(() => {
        if (mode !== 'note') return;
        const eligibleIds = new Set(eligibleRecipientUsers.map(user => user.id));
        setRecipientUserIds(current => {
            const next = current.filter(userId => eligibleIds.has(userId));
            return next.length === current.length ? current : next;
        });
    }, [eligibleRecipientUsers, mode]);

    function toggleRecipient(userId: number) {
        setRecipientUserIds(current => current.includes(userId)
            ? current.filter(id => id !== userId)
            : [...current, userId]);
    }

    return (
        <div className="space-y-5">
            <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="page-title">{mode === 'request' ? 'Requests' : 'Notes'}</h1>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                        {mode === 'request' ? 'Approval, decisions, help, information and resources.' : 'Searchable operational memory and handover context.'}
                    </p>
                </div>
            </header>

            <WorkSubnav />

            {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

            <section className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm">
                <h2 className="text-lg font-bold">Quick capture</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">Describe the situation in your own words. VinAgent will prepare a reviewable {noun.toLowerCase()}.</p>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <textarea
                        value={captureText}
                        onChange={event => setCaptureText(event.target.value)}
                        rows={3}
                        className="min-h-24 flex-1 rounded-md border border-[var(--border)] px-3 py-2 text-sm"
                        placeholder={mode === 'request' ? 'We need more takeaway bags.' : 'POS froze twice during lunch.'}
                    />
                    <div className="flex shrink-0 flex-wrap gap-2">
                        <button type="button" onClick={analyze} disabled={saving || !captureText.trim()} className="btn-primary disabled:opacity-50">{saving ? 'Analysing...' : 'Analyse'}</button>
                        <button type="button" onClick={enterManually} disabled={saving} className="btn-secondary">Enter manually</button>
                    </div>
                </div>

                {suggestion && (
                    <div className={`mt-4 rounded-md border p-3 text-sm ${suggestion.suggestedType === expectedType ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                        VinAgent suggests <strong>{suggestion.suggestedType}</strong> · {Math.round(suggestion.confidence * 100)}% confidence.
                        {suggestion.suggestedType !== expectedType && ` You are confirming this as a ${expectedType.toLowerCase()}.`}
                    </div>
                )}

                {isManualEntry && <form onSubmit={createItem} className="mt-4 grid gap-4 border-t border-[var(--border)] pt-4 md:grid-cols-2">
                    <div className="md:col-span-2">
                        <h3 ref={reviewHeadingRef} tabIndex={-1} className="text-base font-bold text-[#1c231f]">Review and confirm</h3>
                        <p className="mt-1 text-sm text-[var(--muted)]">Make any changes below before creating the {noun.toLowerCase()}.</p>
                    </div>
                    <label className="text-sm font-semibold">Title
                        <input value={title} onChange={event => setTitle(event.target.value)} maxLength={255} required className="mt-1 w-full rounded-md border border-[var(--border)] px-3 py-2 font-normal" />
                    </label>
                    <label className="text-sm font-semibold">{mode === 'request' ? 'Request type' : 'Record type'}
                        <select value={subtype} onChange={event => setSubtype(event.target.value)} className="mt-1 w-full rounded-md border border-[var(--border)] px-3 py-2 font-normal">
                            <option value="">Choose a type</option>
                            {subtype && !subtypeOptionsFor(expectedType).some(option => option.value === subtype) && <option value={subtype}>{operationalLabel(subtype)}</option>}
                            {subtypeOptionsFor(expectedType).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                    </label>
                    <label className="text-sm font-semibold md:col-span-2">Details
                        <textarea value={body} onChange={event => setBody(event.target.value)} rows={4} required className="mt-1 w-full rounded-md border border-[var(--border)] px-3 py-2 font-normal" />
                    </label>
                    <label className="text-sm font-semibold">Scope
                        <select value={areaScope} onChange={event => setAreaScope(event.target.value as AreaScope)} className="mt-1 w-full rounded-md border border-[var(--border)] px-3 py-2 font-normal">
                            <option value="ORGANISATION">Whole winery</option>
                            <option value="AREAS">Operational area</option>
                        </select>
                    </label>
                    {areaScope === 'AREAS' && (
                        <label className="text-sm font-semibold">Primary area
                            <select value={primaryAreaId} onChange={event => setPrimaryAreaId(event.target.value)} required className="mt-1 w-full rounded-md border border-[var(--border)] px-3 py-2 font-normal">
                                <option value="">Select area</option>
                                {areas.map(area => <option key={area.id} value={area.id}>{area.name}</option>)}
                            </select>
                        </label>
                    )}
                    {mode === 'request' && (
                        <>
                            <label className="text-sm font-semibold">Priority
                                <select value={priority} onChange={event => setPriority(event.target.value as 'low' | 'normal' | 'high')} className="mt-1 w-full rounded-md border border-[var(--border)] px-3 py-2 font-normal">
                                    <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option>
                                </select>
                            </label>
                            <label className="text-sm font-semibold">Requested from
                                <select value={requestedFromUserId} onChange={event => setRequestedFromUserId(event.target.value)} className="mt-1 w-full rounded-md border border-[var(--border)] px-3 py-2 font-normal">
                                    <option value="">Area/team manager</option>
                                    {users.filter(user => user.isActive !== false).map(user => <option key={user.id} value={user.id}>{user.displayName}</option>)}
                                </select>
                            </label>
                        </>
                    )}
                    {mode === 'note' && (
                        <fieldset className="md:col-span-2 rounded-lg border border-[var(--border)] bg-[#fbfcfa] p-4">
                            <legend className="px-1 text-sm font-semibold text-[#344039]">Direct to people (optional)</legend>
                            <p className="mb-3 text-xs leading-5 text-[var(--muted)]">Choose one or more people who should see this Note in their Home view. Area-scoped Notes also appear for members of that department.</p>
                            {eligibleRecipientUsers.length === 0 ? (
                                <p className="text-sm text-[var(--muted)]">Choose an operational area to see eligible recipients.</p>
                            ) : (
                                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                    {eligibleRecipientUsers.map(user => (
                                        <label key={user.id} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${recipientUserIds.includes(user.id) ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-strong)]' : 'border-[var(--border)] bg-white text-[#344039]'}`}>
                                            <input type="checkbox" checked={recipientUserIds.includes(user.id)} onChange={() => toggleRecipient(user.id)} />
                                            <span className="min-w-0 truncate">{user.displayName || user.email}</span>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </fieldset>
                    )}
                    <div className="md:col-span-2 flex justify-end">
                        <button disabled={saving || !title.trim() || !body.trim()} className="btn-primary disabled:opacity-50">
                            {saving ? 'Creating...' : `Confirm and create ${noun.toLowerCase()}`}
                        </button>
                    </div>
                </form>}
            </section>

            <section className="space-y-3">
                <div className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-white p-4 sm:flex-row">
                    <input value={search} onChange={event => setSearch(event.target.value)} placeholder={`Search ${noun.toLowerCase()}s`} className="flex-1 rounded-md border border-[var(--border)] px-3 py-2 text-sm" />
                    <select value={areaFilter} onChange={event => setAreaFilter(event.target.value)} className="rounded-md border border-[var(--border)] px-3 py-2 text-sm">
                        <option value="all">All areas</option><option value="organisation">Whole winery</option>
                        {areas.map(area => <option key={area.id} value={area.id}>{area.name}</option>)}
                    </select>
                    {mode === 'request' && (
                        <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="rounded-md border border-[var(--border)] px-3 py-2 text-sm">
                            <option value="all">All states</option><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="CANCELLED">Cancelled</option>
                        </select>
                    )}
                </div>

                {loading ? <div className="py-12 text-center text-[var(--muted)]">Loading…</div> : items.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[var(--border)] bg-white py-12 text-center text-[var(--muted)]">No {noun.toLowerCase()}s found.</div>
                ) : [...items].sort((left, right) => {
                    const signalFor = (value: OperationalRequest | OperationalRecord) => mode === 'request'
                        ? requestInvolvement(value as OperationalRequest, viewer)
                        : noteInvolvement(value as OperationalRecord, viewer);
                    return Number(signalFor(right)?.kind === 'DIRECT') - Number(signalFor(left)?.kind === 'DIRECT');
                }).map(item => {
                    const requestItem = mode === 'request' ? item as OperationalRequest : null;
                    const involvement = requestItem
                        ? requestInvolvement(requestItem, viewer)
                        : noteInvolvement(item as OperationalRecord, viewer);
                    return (
                        <article id={`${mode}-${item.id}`} key={item.id} className={`rounded-xl border bg-white p-5 shadow-sm ${selectedId === item.id ? 'ring-2 ring-[var(--brand-soft)]' : ''} ${involvementSurfaceClass(involvement) || 'border-[var(--border)]'}`}>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h3 className="text-lg font-bold">{item.title}</h3>
                                        <InvolvementBadge signal={involvement} />
                                        {requestItem && <span className="rounded-full bg-[#eef1e8] px-2.5 py-1 text-xs font-bold">{operationalLabel(requestItem.status)}</span>}
                                    </div>
                                    <p className="mt-2 whitespace-pre-wrap text-sm text-[#465149]">{item.body}</p>
                                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
                                        <span>{new Date(mode === 'note' ? (item as OperationalRecord).occurredAt : item.createdAt).toLocaleString()}</span>
                                        {(item.OperationalAreas || []).map(area => <span key={area.id} className="rounded-full border border-[var(--border)] px-2 py-0.5">{areaNames.get(area.id) || area.name}</span>)}
                                        {mode === 'note' && (item as OperationalRecord).Recipients?.map(recipient => <span key={recipient.id} className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-blue-800">To {recipient.displayName || recipient.email}</span>)}
                                        {item.aiSuggestedType && <span>AI suggested {operationalLabel(item.aiSuggestedType)}{item.aiConfidence != null ? ` (${Math.round(item.aiConfidence * 100)}%)` : ''}</span>}
                                    </div>
                                </div>
                                {requestItem?.status === 'PENDING' && (
                                    <div className="flex shrink-0 gap-2">
                                        <button onClick={() => openDecision(requestItem, 'APPROVED')} className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-semibold text-white">Approve</button>
                                        <button onClick={() => openDecision(requestItem, 'REJECTED')} className="rounded-md border border-red-300 px-3 py-2 text-sm font-semibold text-red-700">Reject</button>
                                    </div>
                                )}
                            </div>
                            {requestItem?.response && <div className="mt-4 rounded-md bg-[#f5f6f1] p-3 text-sm"><strong>Response:</strong> {requestItem.response}</div>}
                            <OperationalCollaborationPanel
                                itemType={mode === 'request' ? 'REQUEST' : 'NOTE'}
                                itemId={item.id}
                                requestStatus={requestItem?.status}
                                currentUserId={currentUserId}
                            />
                        </article>
                    );
                })}
            </section>

            <Dialog
                open={Boolean(decisionTarget)}
                onClose={() => setDecisionTarget(null)}
                title={decisionTarget?.status === 'APPROVED' ? 'Approve request' : 'Reject request'}
                description={decisionTarget?.item.title}
                closeOnBackdrop={!decisionSaving}
                closeOnEscape={!decisionSaving}
            >
                {decisionTarget && <>
                        <div className="space-y-3 px-5 py-4">
                            <label className="block text-sm font-semibold text-[#344039]" htmlFor="request-decision-response">
                                {decisionTarget.status === 'APPROVED' ? 'Response (optional)' : 'Reason for rejection'}
                            </label>
                            <textarea id="request-decision-response" value={decisionResponse} onChange={event => setDecisionResponse(event.target.value)} rows={4} className="form-control" required={decisionTarget.status === 'REJECTED'} autoFocus />
                            {decisionError && <p className="text-sm font-medium text-red-700">{decisionError}</p>}
                        </div>
                        <div className="flex justify-end gap-3 border-t border-[var(--border)] px-5 py-4">
                            <button type="button" onClick={() => setDecisionTarget(null)} className="btn-secondary" disabled={decisionSaving}>Cancel</button>
                            <button type="button" onClick={decide} className={decisionTarget.status === 'APPROVED' ? 'btn-primary' : 'rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800'} disabled={decisionSaving}>
                                {decisionSaving ? 'Saving...' : decisionTarget.status === 'APPROVED' ? 'Approve request' : 'Reject request'}
                            </button>
                        </div>
                </>}
            </Dialog>
        </div>
    );
}
