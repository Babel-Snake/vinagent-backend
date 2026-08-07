import { API_BASE, getAuthToken } from './apiCore';
import type { Notification } from './api';

export async function getNotifications(): Promise<Notification[]> {
    const res = await fetch(`${API_BASE}/notifications`, {
        headers: { 'Authorization': await getAuthToken() }
    });
    if (!res.ok) throw new Error('Failed to fetch notifications');
    return (await res.json()).notifications;
}

export async function markNotificationRead(id: number): Promise<void> {
    const res = await fetch(`${API_BASE}/notifications/${id}/read`, {
        method: 'PATCH',
        headers: { 'Authorization': await getAuthToken() }
    });
    if (!res.ok) throw new Error('Failed to mark notification as read');
}

export async function dismissNotification(id: number): Promise<void> {
    const res = await fetch(`${API_BASE}/notifications/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': await getAuthToken() }
    });
    if (!res.ok) throw new Error('Failed to dismiss notification');
}

export async function getFlaggedTaskIds(): Promise<number[]> {
    const res = await fetch(`${API_BASE}/tasks/flags`, {
        headers: { 'Authorization': await getAuthToken() }
    });
    if (!res.ok) throw new Error('Failed to fetch flags');
    const data = await res.json() as { taskIds: number[] };
    return data.taskIds;
}

export async function toggleTaskFlag(taskId: number): Promise<boolean> {
    const res = await fetch(`${API_BASE}/tasks/flags/${taskId}/toggle`, {
        method: 'POST',
        headers: { 'Authorization': await getAuthToken() }
    });
    if (!res.ok) throw new Error('Failed to toggle flag');
    const data = await res.json() as { flagged: boolean };
    return data.flagged;
}
