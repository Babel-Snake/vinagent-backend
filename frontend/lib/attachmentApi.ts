import { API_BASE, getAuthToken } from './apiCore';
import type { Attachment, AttachmentEntityType } from './api';

function readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result !== 'string') {
                reject(new Error('Failed to read attachment file'));
                return;
            }
            const commaIndex = reader.result.indexOf(',');
            resolve(commaIndex >= 0 ? reader.result.slice(commaIndex + 1) : reader.result);
        };
        reader.onerror = () => reject(new Error('Failed to read attachment file'));
        reader.readAsDataURL(file);
    });
}

export async function fetchAttachments(entityType: AttachmentEntityType, entityId: number): Promise<Attachment[]> {
    const params = new URLSearchParams({ entityType, entityId: String(entityId) });
    const res = await fetch(`${API_BASE}/attachments?${params}`, {
        headers: { 'Authorization': await getAuthToken() }, cache: 'no-store'
    });
    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || err?.error || 'Failed to fetch attachments');
    }
    return (await res.json()).attachments;
}

export async function uploadAttachment(entityType: AttachmentEntityType, entityId: number, file: File): Promise<Attachment> {
    const contentBase64 = await readFileAsBase64(file);
    const res = await fetch(`${API_BASE}/attachments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': await getAuthToken() },
        body: JSON.stringify({ entityType, entityId, filename: file.name, mimeType: file.type || 'application/octet-stream', sizeBytes: file.size, contentBase64 })
    });
    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || err?.error || 'Failed to upload attachment');
    }
    return (await res.json()).attachment;
}

export async function deleteAttachment(attachmentId: number): Promise<void> {
    const res = await fetch(`${API_BASE}/attachments/${attachmentId}`, {
        method: 'DELETE', headers: { 'Authorization': await getAuthToken() }
    });
    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || err?.error || 'Failed to delete attachment');
    }
}

export async function openAttachment(attachment: Attachment): Promise<void> {
    const res = await fetch(`${API_BASE}/attachments/${attachment.id}/download`, {
        headers: { 'Authorization': await getAuthToken() }
    });
    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || err?.error || 'Failed to open attachment');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const newWindow = window.open(url, '_blank', 'noopener,noreferrer');
    if (!newWindow) {
        const link = document.createElement('a');
        link.href = url;
        link.download = attachment.filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
