'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import {
    OperationalItemComment,
    OperationalItemRelation,
    OperationalItemType,
    convertOperationalItemToTask,
    createOperationalItemComment,
    createOperationalItemRelation,
    fetchOperationalItemComments,
    fetchOperationalItemRelations
} from '../lib/api';
import AttachmentPanel from './AttachmentPanel';
import ProjectLinksPanel from './ProjectLinksPanel';
import { operationalLabel } from '../lib/operationalPresentation';

export default function OperationalCollaborationPanel({
    itemType,
    itemId,
    requestStatus,
    currentUserId
}: {
    itemType: 'REQUEST' | 'NOTE';
    itemId: number;
    requestStatus?: string;
    currentUserId?: number | null;
}) {
    const [open, setOpen] = useState(false);
    const [comments, setComments] = useState<OperationalItemComment[]>([]);
    const [relations, setRelations] = useState<OperationalItemRelation[]>([]);
    const [comment, setComment] = useState('');
    const [targetType, setTargetType] = useState<OperationalItemType>('TASK');
    const [targetId, setTargetId] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    async function load() {
        try {
            const [commentRows, relationRows] = await Promise.all([
                fetchOperationalItemComments(itemType, itemId),
                fetchOperationalItemRelations(itemType, itemId)
            ]);
            setComments(commentRows);
            setRelations(relationRows);
            setError('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load collaboration details');
        }
    }

    useEffect(() => {
        if (open) load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, itemType, itemId]);

    async function addComment(event: FormEvent) {
        event.preventDefault();
        if (!comment.trim()) return;
        setBusy(true);
        try {
            await createOperationalItemComment(itemType, itemId, comment.trim());
            setComment('');
            await load();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to add comment');
        } finally {
            setBusy(false);
        }
    }

    async function addRelation(event: FormEvent) {
        event.preventDefault();
        if (!targetId) return;
        setBusy(true);
        try {
            await createOperationalItemRelation(itemType, itemId, {
                targetType,
                targetId: Number(targetId),
                relationType: 'RELATES_TO'
            });
            setTargetId('');
            await load();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to add relationship');
        } finally {
            setBusy(false);
        }
    }

    async function convertToTask() {
        setBusy(true);
        try {
            await convertOperationalItemToTask(itemType, itemId);
            await load();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create task');
        } finally {
            setBusy(false);
        }
    }

    const canConvert = itemType === 'NOTE' || requestStatus === 'APPROVED';

    return (
        <div className="mt-4 border-t border-[var(--border)] pt-3">
            <button type="button" onClick={() => setOpen(value => !value)} className="text-sm font-bold text-[var(--brand-strong)]">
                {open ? 'Hide collaboration' : 'Comments, files and relationships'}
            </button>
            {open && (
                <div className="mt-3 grid gap-4 lg:grid-cols-2">
                    {error && <div className="lg:col-span-2 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</div>}
                    <div className="space-y-3">
                        <ProjectLinksPanel itemType={itemType} itemId={itemId} compact />
                        <div className="rounded-md border border-slate-200 p-3">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">Comments</h4>
                            <div className="mt-2 space-y-2">
                                {comments.length === 0 && <p className="text-sm text-slate-500">No comments yet.</p>}
                                {comments.map(row => (
                                    <div key={row.id} className="rounded bg-slate-50 p-2 text-sm">
                                        <div className="font-semibold">{row.Author?.displayName || row.Author?.email || 'Staff'}</div>
                                        <div className="whitespace-pre-wrap">{row.body}</div>
                                        {(row.Replies || []).map(reply => (
                                            <div key={reply.id} className="ml-4 mt-2 border-l-2 border-slate-200 pl-3">
                                                <strong>{reply.Author?.displayName || 'Staff'}:</strong> {reply.body}
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                            <form onSubmit={addComment} className="mt-3 flex gap-2">
                                <input value={comment} onChange={event => setComment(event.target.value)} placeholder="Add a comment" className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-2 text-sm" />
                                <button disabled={busy || !comment.trim()} className="rounded bg-[var(--brand)] px-3 py-2 text-sm font-bold text-white disabled:opacity-50">Add</button>
                            </form>
                        </div>

                        <AttachmentPanel entityType={itemType} entityId={itemId} canUpload currentUserId={currentUserId} compact />
                    </div>

                    <div className="space-y-3">
                        <div className="rounded-md border border-slate-200 p-3">
                            <div className="flex items-center justify-between gap-2">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">Relationships</h4>
                                {canConvert && <button type="button" onClick={convertToTask} disabled={busy} className="rounded bg-slate-800 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">Create linked task</button>}
                            </div>
                            <div className="mt-2 space-y-2">
                                {relations.length === 0 && <p className="text-sm text-slate-500">No linked items yet.</p>}
                                {relations.map(relation => {
                                    const sourceIsCurrent = relation.sourceType === itemType && relation.sourceId === itemId;
                                    const otherType = sourceIsCurrent ? relation.targetType : relation.sourceType;
                                    const otherId = sourceIsCurrent ? relation.targetId : relation.sourceId;
                                    const href = otherType === 'TASK' ? `/tasks?taskId=${otherId}` : otherType === 'NOTICE' ? `/noticeboard?noticeId=${otherId}` : otherType === 'REQUEST' ? '/requests' : '/notes';
                                    return <div key={relation.id} className="text-sm"><span className="font-semibold">{operationalLabel(relation.relationType)}</span> · <Link href={href} className="text-[var(--brand-strong)] underline">{otherType} #{otherId}</Link></div>;
                                })}
                            </div>
                            <form onSubmit={addRelation} className="mt-3 flex flex-wrap gap-2">
                                <select value={targetType} onChange={event => setTargetType(event.target.value as OperationalItemType)} className="rounded border border-slate-300 px-2 py-2 text-sm">
                                    <option value="TASK">Task</option><option value="NOTICE">Notice</option><option value="REQUEST">Request</option><option value="NOTE">Note</option>
                                </select>
                                <input type="number" min="1" value={targetId} onChange={event => setTargetId(event.target.value)} placeholder="Item ID" className="w-28 rounded border border-slate-300 px-2 py-2 text-sm" />
                                <button disabled={busy || !targetId} className="rounded border border-slate-300 px-3 py-2 text-sm font-bold disabled:opacity-50">Link</button>
                            </form>
                            {itemType === 'REQUEST' && requestStatus !== 'APPROVED' && <p className="mt-2 text-xs text-amber-700">Approve the request before creating its task.</p>}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
