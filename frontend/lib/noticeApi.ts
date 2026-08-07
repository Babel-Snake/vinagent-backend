import { API_BASE, getAuthToken } from './apiCore';
import type { Notice, NoticeComment, NoticeFilters, NoticeInput, NoticeListResponse, Task } from './api';

async function noticeRequest<T>(path: string, init: RequestInit = {}, fallback: string): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: {
            ...(init.body ? { 'Content-Type': 'application/json' } : {}),
            'Authorization': await getAuthToken(),
            ...init.headers
        },
        cache: init.method ? undefined : 'no-store'
    });
    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || fallback);
    }
    if (res.status === 204) return undefined as T;
    return res.json();
}

export function fetchNotices(filters: NoticeFilters = {}): Promise<NoticeListResponse> {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
        if (value === undefined || value === '' || value === 'all') return;
        if (key === 'status' && value === 'active') return;
        params.append(key, String(value));
    });
    return noticeRequest(`/notices?${params}`, {}, 'Failed to fetch notices');
}

export async function getNotice(noticeId: number): Promise<Notice> {
    return (await noticeRequest<{ notice: Notice }>(`/notices/${noticeId}`, {}, 'Failed to fetch notice')).notice;
}

export async function createNotice(data: NoticeInput): Promise<Notice> {
    return (await noticeRequest<{ notice: Notice }>('/notices', { method: 'POST', body: JSON.stringify(data) }, 'Failed to create notice')).notice;
}

export async function updateNotice(id: number, data: Partial<NoticeInput>): Promise<Notice> {
    return (await noticeRequest<{ notice: Notice }>(`/notices/${id}`, { method: 'PATCH', body: JSON.stringify(data) }, 'Failed to update notice')).notice;
}

export async function acknowledgeNotice(id: number): Promise<Notice> {
    return (await noticeRequest<{ notice: Notice }>(`/notices/${id}/acknowledgement`, { method: 'PUT' }, 'Failed to acknowledge notice')).notice;
}

export async function archiveNotice(id: number): Promise<Notice> {
    return (await noticeRequest<{ notice: Notice }>(`/notices/${id}`, { method: 'DELETE' }, 'Failed to archive notice')).notice;
}

export async function fetchNoticeComments(noticeId: number): Promise<NoticeComment[]> {
    const res = await fetch(`${API_BASE}/notices/${noticeId}/comments`, {
        headers: { 'Authorization': await getAuthToken() }, cache: 'no-store'
    });
    if (!res.ok) {
        const err = await res.json().catch(() => null);
        const message = err?.error?.message || err?.error || res.statusText || 'Failed to fetch notice comments';
        throw new Error(`Failed to fetch notice comments (${res.status}): ${message}`);
    }
    return (await res.json()).comments;
}

export async function createNoticeComment(noticeId: number, body: string, parentCommentId?: number | null): Promise<NoticeComment> {
    return (await noticeRequest<{ comment: NoticeComment }>(`/notices/${noticeId}/comments`, {
        method: 'POST', body: JSON.stringify({ body, parentCommentId: parentCommentId || null })
    }, 'Failed to post notice comment')).comment;
}

export function deleteNoticeComment(noticeId: number, commentId: number): Promise<void> {
    return noticeRequest(`/notices/${noticeId}/comments/${commentId}`, { method: 'DELETE' }, 'Failed to delete notice comment');
}

export async function linkNoticeTask(noticeId: number, taskId: number): Promise<Notice> {
    return (await noticeRequest<{ notice: Notice }>(`/notices/${noticeId}/tasks`, {
        method: 'POST', body: JSON.stringify({ taskId })
    }, 'Failed to link task')).notice;
}

export async function unlinkNoticeTask(noticeId: number, taskId: number): Promise<Notice> {
    return (await noticeRequest<{ notice: Notice }>(`/notices/${noticeId}/tasks/${taskId}`, { method: 'DELETE' }, 'Failed to unlink task')).notice;
}

export async function linkTaskNotice(taskId: number, noticeId: number): Promise<Task> {
    return (await noticeRequest<{ task: Task }>(`/tasks/${taskId}/notices`, {
        method: 'POST', body: JSON.stringify({ noticeId })
    }, 'Failed to link notice')).task;
}

export async function unlinkTaskNotice(taskId: number, noticeId: number): Promise<Task> {
    return (await noticeRequest<{ task: Task }>(`/tasks/${taskId}/notices/${noticeId}`, { method: 'DELETE' }, 'Failed to unlink notice')).task;
}
