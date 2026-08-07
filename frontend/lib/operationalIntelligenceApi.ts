import { API_BASE, getAuthToken } from './apiCore';
import type { AnalyticsResponse } from './analyticsTypes';
import type {
    OperationalIntelligenceConfig,
    OperationalIntelligenceConfigPreset,
    OperationalIntelligenceConfigPreviewResponse,
    OperationalIntelligenceConfigResponse,
    OperationalIntelligenceSignal,
    OperationalIntelligenceSignalInput,
    OperationalIntelligenceSignalStatus,
    OperationalIntelligenceSignalType,
    Task
} from './api';

export async function getAnalytics(period = 'month', offset = 0): Promise<AnalyticsResponse> {
    const params = new URLSearchParams({ period, offset: offset.toString() });
    const res = await fetch(`${API_BASE}/analytics?${params.toString()}`, {
        headers: { 'Authorization': await getAuthToken() },
        cache: 'no-store'
    });
    if (!res.ok) throw new Error('Failed to fetch analytics');
    return await res.json();
}

export async function getOperationalIntelligenceSignals(filters: {
    status?: OperationalIntelligenceSignalStatus | 'ALL';
    signalType?: OperationalIntelligenceSignalType | 'ALL';
    areaId?: number | 'all';
    page?: number;
    pageSize?: number;
} = {}): Promise<{ signals: OperationalIntelligenceSignal[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } }> {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) params.set(key, String(value));
    });
    const res = await fetch(`${API_BASE}/operations/intelligence/signals?${params.toString()}`, {
        headers: { 'Authorization': await getAuthToken() },
        cache: 'no-store'
    });
    if (!res.ok) throw new Error('Failed to fetch operational intelligence signals');
    return await res.json();
}

export async function createOperationalIntelligenceSignal(data: OperationalIntelligenceSignalInput): Promise<{ signal: OperationalIntelligenceSignal; created: boolean }> {
    const res = await fetch(`${API_BASE}/operations/intelligence/signals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': await getAuthToken() },
        body: JSON.stringify(data)
    });
    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || err?.error || 'Failed to save operational intelligence signal');
    }
    return await res.json();
}

export async function getOperationalIntelligenceConfig(): Promise<OperationalIntelligenceConfigResponse> {
    const res = await fetch(`${API_BASE}/operations/intelligence/config`, {
        headers: { 'Authorization': await getAuthToken() },
        cache: 'no-store'
    });
    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || err?.error || 'Failed to fetch operational intelligence config');
    }
    return await res.json();
}

export async function updateOperationalIntelligenceConfig(data: Partial<OperationalIntelligenceConfig> & { preset?: OperationalIntelligenceConfigPreset['key'] }): Promise<OperationalIntelligenceConfigResponse> {
    return mutateConfig('', data, 'Failed to update operational intelligence config');
}

export async function previewOperationalIntelligenceConfig(data: Partial<OperationalIntelligenceConfig> & {
    preset?: OperationalIntelligenceConfigPreset['key'];
    period?: 'day' | 'week' | 'month' | 'year';
    offset?: number;
    historyPeriods?: number;
    start?: string;
    end?: string;
}): Promise<OperationalIntelligenceConfigPreviewResponse> {
    return mutateConfig('/preview', data, 'Failed to preview operational intelligence config', 'POST');
}

async function mutateConfig<T>(path: string, data: unknown, fallback: string, method = 'PATCH'): Promise<T> {
    const res = await fetch(`${API_BASE}/operations/intelligence/config${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': await getAuthToken() },
        body: JSON.stringify(data)
    });
    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || err?.error || fallback);
    }
    return await res.json();
}

type SignalRunInput = {
    period?: 'day' | 'week' | 'month' | 'year';
    offset?: number;
    start?: string;
    end?: string;
};

type SignalRunResult = {
    suggestedCount: number;
    createdCount: number;
    updatedCount: number;
    suppressedDuplicateCount: number;
    signals: OperationalIntelligenceSignal[];
};

async function runSignals(path: string, data: SignalRunInput, fallback: string) {
    const res = await fetch(`${API_BASE}/operations/intelligence/signals/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': await getAuthToken() },
        body: JSON.stringify(data)
    });
    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || err?.error || fallback);
    }
    return res.json();
}

export function materializeOperationalIntelligenceSignals(data: SignalRunInput = {}): Promise<SignalRunResult> {
    return runSignals('materialize', data, 'Failed to save suggested operational intelligence signals');
}

export function runScheduledOperationalIntelligenceSignals(data: SignalRunInput = {}): Promise<SignalRunResult & {
    wineryCount: number;
    results: Array<SignalRunResult & { wineryId: number }>;
}> {
    return runSignals('scheduled-run', data, 'Failed to run scheduled operational intelligence signals');
}

async function patchSignal(id: number, path: string, data: unknown, fallback: string): Promise<{ signal: OperationalIntelligenceSignal }> {
    const res = await fetch(`${API_BASE}/operations/intelligence/signals/${id}${path}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': await getAuthToken() },
        body: JSON.stringify(data)
    });
    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || err?.error || fallback);
    }
    return res.json();
}

export function reviewOperationalIntelligenceSignal(id: number, data: {
    status: 'OPEN' | 'ACKNOWLEDGED' | 'DISMISSED';
    reviewNote?: string | null;
}) {
    return patchSignal(id, '', data, 'Failed to review operational intelligence signal');
}

export function updateOperationalIntelligenceSignalWorkflow(id: number, data: {
    reviewOwnerUserId?: number | null;
    reviewDueAt?: string | null;
    suggestedAction?: string | null;
    reviewNote?: string | null;
}) {
    return patchSignal(id, '/workflow', data, 'Failed to update operational intelligence signal workflow');
}

export async function createTaskFromOperationalIntelligenceSignal(id: number, data: {
    reviewNote?: string | null;
    priority?: 'low' | 'normal' | 'high';
    suggestedAction?: string | null;
    assigneeId?: number | null;
    dueAt?: string | null;
    steps?: Array<{ title: string; description?: string | null; ownerUserId?: number | null; dueAt?: string | null }>;
} = {}): Promise<{ task: Task; signal: OperationalIntelligenceSignal; duplicate?: boolean }> {
    const res = await fetch(`${API_BASE}/operations/intelligence/signals/${id}/create-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': await getAuthToken() },
        body: JSON.stringify(data)
    });
    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || err?.error || 'Failed to create task from operational intelligence signal');
    }
    return await res.json();
}
