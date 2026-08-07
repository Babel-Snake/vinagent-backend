import { API_BASE, getAuthToken } from './apiCore';
import type {
    IntegrationEvent,
    IntegrationEventCreateInput,
    IntegrationEventFilters,
    IntegrationEventListResponse,
    IntegrationEventReviewInput,
    IntegrationEventReviewResponse
} from './api';

async function integrationRequest<T>(path: string, init: RequestInit = {}, fallback: string): Promise<T> {
    const res = await fetch(`${API_BASE}/integration-events${path}`, {
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
    return res.json();
}

export function fetchIntegrationEvents(filters: IntegrationEventFilters = {}): Promise<IntegrationEventListResponse> {
    const params = new URLSearchParams();
    if (filters.status && filters.status !== 'all') params.append('status', filters.status);
    if (filters.eventType && filters.eventType !== 'all') params.append('eventType', filters.eventType);
    if (filters.provider && filters.provider !== 'all') params.append('provider', filters.provider);
    if (filters.areaId && filters.areaId !== 'all') params.append('areaId', String(filters.areaId));
    if (filters.search) params.append('search', filters.search);
    if (filters.page) params.append('page', String(filters.page));
    if (filters.pageSize) params.append('pageSize', String(filters.pageSize));
    return integrationRequest(`?${params.toString()}`, {}, 'Failed to fetch integration events');
}

export async function getIntegrationEvent(eventId: number): Promise<IntegrationEvent> {
    const result = await integrationRequest<{ event: IntegrationEvent }>(`/${eventId}`, {}, 'Failed to fetch integration event');
    return result.event;
}

export function createIntegrationEvent(data: IntegrationEventCreateInput): Promise<{ event: IntegrationEvent; duplicate: boolean }> {
    return integrationRequest('', { method: 'POST', body: JSON.stringify(data) }, 'Failed to create integration event');
}

export function reviewIntegrationEvent(eventId: number, data: IntegrationEventReviewInput): Promise<IntegrationEventReviewResponse> {
    return integrationRequest(`/${eventId}/review`, { method: 'POST', body: JSON.stringify(data) }, 'Failed to review integration event');
}
