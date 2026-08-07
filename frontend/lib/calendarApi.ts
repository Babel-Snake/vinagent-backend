import { clientLogger } from './clientLogger';
import { API_BASE, getAuthToken } from './apiCore';
import type { Notice, NoticeCategory, NoticePriority, Task, TaskPayload } from './api';

export interface CalendarEvent {
    id: number;
    title: string;
    description?: string;
    start: string;
    end: string;
    allDay: boolean;
    type: 'reminder' | 'meeting' | 'event' | 'task_deadline' | 'notice' | 'other';
    wineryId: number;
    createdBy: number;
    taskId?: number | null;
    noticeId?: number | null;
    taskIds?: number[];
    noticeIds?: number[];
    LinkedTask?: {
        id: number;
        title?: string;
        category?: string;
        subType?: string;
        status: string;
        priority: string;
        payload?: TaskPayload;
        assigneeId?: number | null;
        dueAt?: string | null;
    };
    LinkedTasks?: Task[];
    LinkedNotice?: {
        id: number;
        title: string;
        category: NoticeCategory;
        priority: NoticePriority;
        isPinned: boolean;
        effectiveFrom?: string | null;
        expiresAt?: string | null;
        archivedAt?: string | null;
    };
    LinkedNotices?: Notice[];
    Creator?: { id: number; displayName: string; email: string };
}

export async function getCalendarEvents(start: Date, end: Date): Promise<CalendarEvent[]> {
    const params = new URLSearchParams({ start: start.toISOString(), end: end.toISOString() });
    const res = await fetch(`${API_BASE}/calendar?${params.toString()}`, {
        headers: { 'Authorization': await getAuthToken() },
        cache: 'no-store'
    });
    if (!res.ok) {
        clientLogger.error('Calendar Fetch Error:', res.status, res.statusText, await res.text());
        throw new Error('Failed to fetch calendar events');
    }
    return await res.json();
}

export async function searchCalendarEvents(search: string, pageSize = 10): Promise<CalendarEvent[]> {
    const params = new URLSearchParams();
    if (search.trim()) params.append('search', search.trim());
    params.append('pageSize', String(pageSize));
    const res = await fetch(`${API_BASE}/calendar?${params.toString()}`, {
        headers: { 'Authorization': await getAuthToken() },
        cache: 'no-store'
    });
    if (!res.ok) throw new Error('Failed to search calendar events');
    return await res.json();
}

export async function getCalendarEvent(eventId: number): Promise<CalendarEvent> {
    const params = new URLSearchParams({ eventId: String(eventId), pageSize: '1' });
    const res = await fetch(`${API_BASE}/calendar?${params.toString()}`, {
        headers: { 'Authorization': await getAuthToken() },
        cache: 'no-store'
    });
    if (!res.ok) throw new Error('Failed to fetch calendar event');
    const events = await res.json() as CalendarEvent[];
    if (!events[0]) throw new Error('Calendar event not found');
    return events[0];
}

export async function createCalendarEvent(eventData: Partial<CalendarEvent>): Promise<CalendarEvent> {
    const res = await fetch(`${API_BASE}/calendar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': await getAuthToken() },
        body: JSON.stringify(eventData)
    });
    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || 'Failed to create calendar event');
    }
    return await res.json();
}

export async function updateCalendarEvent(id: number, eventData: Partial<CalendarEvent>): Promise<CalendarEvent> {
    const res = await fetch(`${API_BASE}/calendar/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': await getAuthToken() },
        body: JSON.stringify(eventData)
    });
    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || 'Failed to update calendar event');
    }
    return await res.json();
}

export async function deleteCalendarEvent(id: number): Promise<void> {
    const res = await fetch(`${API_BASE}/calendar/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': await getAuthToken() }
    });
    if (!res.ok) throw new Error('Failed to delete calendar event');
}
