'use client';

import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import {
    Attachment,
    AttachmentEntityType,
    deleteAttachment,
    fetchAttachments,
    openAttachment,
    uploadAttachment
} from '../lib/api';
import ConfirmDialog from './ui/ConfirmDialog';

const ACCEPTED_ATTACHMENT_TYPES = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/pdf',
    'text/plain',
    'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
].join(',');

function formatBytes(value: number) {
    if (!Number.isFinite(value) || value <= 0) return '0 KB';
    if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatUploadedAt(value?: string | null) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-AU', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit'
    });
}

function attachmentKindLabel(attachment: Attachment) {
    if (attachment.mimeType.startsWith('image/')) return 'Image';
    if (attachment.mimeType === 'application/pdf') return 'PDF';
    if (attachment.mimeType.includes('spreadsheet') || attachment.mimeType.includes('excel') || attachment.mimeType === 'text/csv') return 'Sheet';
    if (attachment.mimeType.includes('word')) return 'Doc';
    return 'File';
}

interface AttachmentPanelProps {
    entityType: AttachmentEntityType;
    entityId: number;
    title?: string;
    canUpload?: boolean;
    canDeleteAll?: boolean;
    currentUserId?: number | null;
    disabledReason?: string;
    compact?: boolean;
    onChanged?: () => void | Promise<void>;
}

export default function AttachmentPanel({
    entityType,
    entityId,
    title = 'Attachments',
    canUpload = false,
    canDeleteAll = false,
    currentUserId = null,
    disabledReason = '',
    compact = false,
    onChanged
}: AttachmentPanelProps) {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<number | null>(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const [attachmentPendingDeletion, setAttachmentPendingDeletion] = useState<Attachment | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            if (!entityId) return;
            try {
                setLoading(true);
                const data = await fetchAttachments(entityType, entityId);
                if (!cancelled) {
                    setAttachments(data);
                    setError('');
                }
            } catch (err) {
                if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load attachments');
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        load();
        return () => {
            cancelled = true;
        };
    }, [entityType, entityId]);

    async function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        setUploading(true);
        try {
            const attachment = await uploadAttachment(entityType, entityId, file);
            setAttachments(prev => [...prev, attachment]);
            setError('');
            await onChanged?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to upload attachment');
        } finally {
            setUploading(false);
        }
    }

    async function handleOpenAttachment(attachment: Attachment) {
        setBusyId(attachment.id);
        try {
            await openAttachment(attachment);
            setError('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to open attachment');
        } finally {
            setBusyId(null);
        }
    }

    async function deletePendingAttachment() {
        const attachment = attachmentPendingDeletion;
        if (!attachment) return;
        setBusyId(attachment.id);
        try {
            await deleteAttachment(attachment.id);
            setAttachments(prev => prev.filter(item => item.id !== attachment.id));
            setError('');
            await onChanged?.();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to delete attachment';
            setError(message);
            throw new Error(message);
        } finally {
            setBusyId(null);
        }
    }

    return (
        <>
        <div className={`${compact ? 'rounded-md border border-slate-200 bg-white p-3' : 'rounded-lg border border-slate-200 bg-slate-50 p-4'}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-white text-slate-600" aria-hidden="true">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m18 8-8.5 8.5a4 4 0 0 1-5.7-5.7L13 1.7a2.8 2.8 0 0 1 4 4l-9.1 9.1a1.6 1.6 0 1 1-2.3-2.3L14 4" />
                        </svg>
                    </span>
                    <div>
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-600">{title}</div>
                        <div className="text-xs text-slate-500">{attachments.length} attached</div>
                    </div>
                </div>

                {canUpload && (
                    <>
                        <input
                            ref={inputRef}
                            type="file"
                            className="hidden"
                            accept={ACCEPTED_ATTACHMENT_TYPES}
                            onChange={handleFileSelected}
                        />
                        <button
                            type="button"
                            onClick={() => inputRef.current?.click()}
                            disabled={uploading}
                            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                        >
                            {uploading ? 'Uploading' : 'Upload'}
                        </button>
                    </>
                )}
            </div>

            {!canUpload && disabledReason && (
                <div className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                    {disabledReason}
                </div>
            )}

            {error && (
                <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                </div>
            )}

            <div className="mt-3">
                {loading ? (
                    <div className="text-sm text-slate-500">Loading attachments...</div>
                ) : attachments.length === 0 ? (
                    <div className="rounded border border-dashed border-slate-200 bg-white px-3 py-4 text-sm text-slate-600">
                        No attachments yet.
                    </div>
                ) : (
                    <div className="space-y-2">
                        {attachments.map(attachment => {
                            const uploadedBy = attachment.Uploader?.displayName || attachment.Uploader?.email || 'Unknown staff member';
                            const uploadedAt = formatUploadedAt(attachment.createdAt);
                            const canDelete = canDeleteAll || (canUpload && currentUserId && Number(attachment.uploadedBy) === Number(currentUserId));

                            return (
                                <div key={attachment.id} className="flex flex-col gap-2 rounded-md border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-bold uppercase text-slate-600">
                                                {attachmentKindLabel(attachment)}
                                            </span>
                                            <span className="truncate text-sm font-semibold text-slate-900">{attachment.filename}</span>
                                        </div>
                                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                                            <span>{formatBytes(attachment.sizeBytes)}</span>
                                            <span>{uploadedBy}</span>
                                            {uploadedAt && <span>{uploadedAt}</span>}
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => handleOpenAttachment(attachment)}
                                            disabled={busyId === attachment.id}
                                            className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                                        >
                                            Open
                                        </button>
                                        {canDelete && (
                                            <button
                                                type="button"
                                                onClick={() => setAttachmentPendingDeletion(attachment)}
                                                disabled={busyId === attachment.id}
                                                className="rounded border border-red-200 bg-white px-2.5 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
                                            >
                                                Delete
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
        <ConfirmDialog
            open={Boolean(attachmentPendingDeletion)}
            onClose={() => setAttachmentPendingDeletion(null)}
            onConfirm={deletePendingAttachment}
            title="Delete attachment?"
            description={attachmentPendingDeletion ? `"${attachmentPendingDeletion.filename}" will be permanently removed.` : ''}
            confirmLabel="Delete attachment"
            destructive
        />
        </>
    );
}
