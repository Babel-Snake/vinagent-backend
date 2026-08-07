import { API_BASE, getAuthToken } from './apiCore';
import type {
    AreaScope,
    OperationalClassificationSuggestion,
    OperationalItemComment,
    OperationalItemRelation,
    OperationalItemType,
    OperationalRecord,
    OperationalRequest,
    OperationsFeedResponse,
    Pagination,
    Task
} from './api';

type ItemType = 'REQUEST' | 'NOTE';

async function operationalRequest<T>(path: string, init: RequestInit = {}, fallback: string): Promise<T> {
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
    return res.json();
}

function queryString(filters: Record<string, unknown>) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== '' && value !== 'all') params.set(key, String(value));
    });
    return params.toString();
}

function itemBase(itemType: ItemType) {
    return itemType === 'REQUEST' ? 'requests' : 'operational-records';
}

export function classifyOperationalInput(text: string): Promise<OperationalClassificationSuggestion> {
    return operationalRequest('/operations/classify', {
        method: 'POST',
        body: JSON.stringify({ text, taskOrigin: 'INTERNAL', inboundMethod: 'internal', suggestedChannel: 'none' })
    }, 'Failed to classify operational input');
}

export function fetchOperations(filters: {
    types?: OperationalItemType[];
    search?: string;
    areaId?: string | number;
    status?: string;
    sortBy?: 'newest' | 'oldest';
    page?: number;
    pageSize?: number;
} = {}): Promise<OperationsFeedResponse> {
    const params = new URLSearchParams();
    if (filters.types?.length) params.set('types', filters.types.join(','));
    if (filters.search) params.set('search', filters.search);
    if (filters.areaId && filters.areaId !== 'all') params.set('areaId', String(filters.areaId));
    if (filters.status && filters.status !== 'ALL') params.set('status', filters.status);
    if (filters.sortBy) params.set('sortBy', filters.sortBy);
    if (filters.page) params.set('page', String(filters.page));
    if (filters.pageSize) params.set('pageSize', String(filters.pageSize));
    return operationalRequest(`/operations?${params}`, {}, 'Failed to fetch operations');
}

export function fetchOperationalRequests(filters: {
    status?: string; areaId?: string | number; search?: string; page?: number; pageSize?: number;
} = {}): Promise<{ requests: OperationalRequest[]; pagination: Pagination }> {
    return operationalRequest(`/requests?${queryString(filters)}`, {}, 'Failed to fetch requests');
}

export async function getOperationalRequest(id: number): Promise<OperationalRequest> {
    const result = await operationalRequest<{ request: OperationalRequest }>(`/requests/${id}`, {}, 'Failed to fetch request');
    return result.request;
}

export async function createOperationalRequest(data: {
    title: string;
    body: string;
    originalText?: string;
    subtype?: string | null;
    priority?: 'low' | 'normal' | 'high';
    dueAt?: string | null;
    requestedFromUserId?: number | null;
    areaScope: AreaScope;
    primaryAreaId?: number | null;
    linkedAreaIds?: number[];
    aiSuggestedType?: OperationalItemType | null;
    aiConfidence?: number | null;
    aiSuggestion?: OperationalClassificationSuggestion | null;
}): Promise<OperationalRequest> {
    const result = await operationalRequest<{ request: OperationalRequest }>('/requests', {
        method: 'POST', body: JSON.stringify(data)
    }, 'Failed to create request');
    return result.request;
}

export async function decideOperationalRequest(id: number, status: 'APPROVED' | 'REJECTED' | 'CANCELLED', response?: string): Promise<OperationalRequest> {
    const result = await operationalRequest<{ request: OperationalRequest }>(`/requests/${id}/decision`, {
        method: 'POST', body: JSON.stringify({ status, response })
    }, 'Failed to decide request');
    return result.request;
}

export function fetchOperationalRecords(filters: {
    areaId?: string | number; search?: string; directedToMe?: boolean; page?: number; pageSize?: number;
} = {}): Promise<{ records: OperationalRecord[]; pagination: Pagination }> {
    return operationalRequest(`/operational-records?${queryString(filters)}`, {}, 'Failed to fetch notes');
}

export async function getOperationalRecord(id: number): Promise<OperationalRecord> {
    const result = await operationalRequest<{ record: OperationalRecord }>(`/operational-records/${id}`, {}, 'Failed to fetch note');
    return result.record;
}

export async function createOperationalRecord(data: {
    title: string;
    body: string;
    originalText?: string;
    recordType?: string | null;
    occurredAt?: string | null;
    memberId?: number | null;
    recipientUserIds?: number[];
    areaScope: AreaScope;
    primaryAreaId?: number | null;
    linkedAreaIds?: number[];
    aiSuggestedType?: OperationalItemType | null;
    aiConfidence?: number | null;
    aiSuggestion?: OperationalClassificationSuggestion | null;
}): Promise<OperationalRecord> {
    const result = await operationalRequest<{ record: OperationalRecord }>('/operational-records', {
        method: 'POST', body: JSON.stringify(data)
    }, 'Failed to create note');
    return result.record;
}

export async function fetchOperationalItemComments(itemType: ItemType, itemId: number): Promise<OperationalItemComment[]> {
    const result = await operationalRequest<{ comments: OperationalItemComment[] }>(`/${itemBase(itemType)}/${itemId}/comments`, {}, 'Failed to fetch comments');
    return result.comments;
}

export async function createOperationalItemComment(itemType: ItemType, itemId: number, body: string, parentCommentId?: number): Promise<OperationalItemComment> {
    const result = await operationalRequest<{ comment: OperationalItemComment }>(`/${itemBase(itemType)}/${itemId}/comments`, {
        method: 'POST', body: JSON.stringify({ body, parentCommentId: parentCommentId || null })
    }, 'Failed to add comment');
    return result.comment;
}

export async function fetchOperationalItemRelations(itemType: ItemType, itemId: number): Promise<OperationalItemRelation[]> {
    const result = await operationalRequest<{ relations: OperationalItemRelation[] }>(`/${itemBase(itemType)}/${itemId}/relations`, {}, 'Failed to fetch relationships');
    return result.relations;
}

export async function createOperationalItemRelation(
    itemType: ItemType,
    itemId: number,
    data: { targetType: OperationalItemType; targetId: number; relationType?: OperationalItemRelation['relationType'] }
): Promise<OperationalItemRelation> {
    const result = await operationalRequest<{ relation: OperationalItemRelation }>(`/${itemBase(itemType)}/${itemId}/relations`, {
        method: 'POST', body: JSON.stringify(data)
    }, 'Failed to add relationship');
    return result.relation;
}

export function convertOperationalItemToTask(
    itemType: ItemType,
    itemId: number,
    data: { category?: string; subType?: string | null; priority?: 'low' | 'normal' | 'high'; assigneeId?: number | null; dueAt?: string | null } = {}
): Promise<{ task: Task; relation: OperationalItemRelation; duplicate: boolean }> {
    return operationalRequest(`/${itemBase(itemType)}/${itemId}/create-task`, {
        method: 'POST', body: JSON.stringify(data)
    }, 'Failed to create task');
}
