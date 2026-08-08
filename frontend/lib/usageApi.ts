import { API_BASE, getAuthToken } from './apiCore';

export interface UsageActivityHeartbeat {
    sessionId: string;
    sequence: number;
    engagedSeconds: number;
    routeGroup: string;
}

export interface UsageSummary {
    window: { start: string; end: string };
    commercial: null | {
        lifecycleStatus: string;
        planCode: string;
        billingProvider: string;
        trialStartedAt?: string | null;
        trialEndsAt?: string | null;
        meteringStartedAt: string;
    };
    current: { activeSeats: number; storageBytes: number; members: number };
    activity: { activeUsers: number; engagedSeconds: number; sessions: number };
    operations: { tasksCreated: number; inboundMessages: number; outboundMessages: number };
    eventMetrics: Record<string, { quantity: number; eventCount: number }>;
    counterMetrics: Record<string, { eventCount: number; durationMs: number }>;
    gaugeHistory: Array<{ metricKey: string; snapshotDate: string; value: number; unit: string }>;
}

export async function recordUsageActivity(heartbeat: UsageActivityHeartbeat): Promise<void> {
    const authorization = await getAuthToken();
    if (!authorization) return;

    await fetch(`${API_BASE}/usage/activity`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': authorization
        },
        body: JSON.stringify(heartbeat),
        cache: 'no-store'
    }).then(response => {
        if (!response.ok) throw new Error('Usage activity was not accepted.');
    });
}

export async function getUsageSummary(start?: string, end?: string): Promise<UsageSummary> {
    const authorization = await getAuthToken();
    const params = new URLSearchParams();
    if (start) params.set('start', start);
    if (end) params.set('end', end);
    const response = await fetch(`${API_BASE}/usage/summary?${params}`, {
        headers: { 'Authorization': authorization },
        cache: 'no-store'
    });
    if (!response.ok) throw new Error('Unable to load winery usage.');
    const payload = await response.json() as { usage: UsageSummary };
    return payload.usage;
}
