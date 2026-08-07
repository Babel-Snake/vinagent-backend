import { API_BASE, getAuthToken } from './apiCore';
import type {
    AreaBookingsConfig,
    AreaIntegrationDomain,
    AreaProductListing,
    EmailSyncResult,
    IntegrationConnection,
    OperationalAreaIntegrationConfig,
    OperationalAreaProfile,
    Winery,
    WineryIntegrationConfig,
    WineryPolicyProfile,
    WinerySettings
} from './wineryTypes';

async function putData<TResponse = unknown>(path: string, data: unknown): Promise<TResponse> {
    const res = await fetch(`${API_BASE}${path}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': await getAuthToken() },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`Failed to update ${path}`);
    return res.json() as Promise<TResponse>;
}

async function wineryAction<T>(path: string, init: RequestInit, fallback: string): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: {
            ...(init.body ? { 'Content-Type': 'application/json' } : {}),
            'Authorization': await getAuthToken(),
            ...init.headers
        }
    });
    if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message || body?.error || fallback);
    }
    if (res.status === 204) return undefined as T;
    return res.json();
}

export async function getWineryFull(): Promise<Winery> {
    const res = await fetch(`${API_BASE}/winery/full`, { headers: { 'Authorization': await getAuthToken() } });
    if (!res.ok) {
        const body = await res.json().catch(() => null);
        const message = body?.error?.message || body?.error || res.statusText || 'Failed to fetch winery profile';
        throw new Error(`Failed to fetch winery profile (${res.status}): ${message}`);
    }
    return (await res.json()).data;
}

export function updateOverview(data: Partial<Winery>): Promise<unknown> {
    return putData('/winery', data);
}

export function updateBrand(data: Record<string, unknown>): Promise<unknown> {
    return putData('/winery/brand', data);
}

export function updateBookingsConfig(data: Record<string, unknown>): Promise<unknown> {
    return putData('/winery/bookings-config', data);
}

export function updateOperationalAreaProfile(areaId: number, data: Omit<OperationalAreaProfile, 'id' | 'wineryId' | 'areaId'>): Promise<unknown> {
    return putData(`/winery/areas/${areaId}/profile`, data);
}

export function updateOperationalAreaBookingsConfig(areaId: number, data: Omit<AreaBookingsConfig, 'id' | 'wineryId' | 'areaId'>): Promise<unknown> {
    return putData(`/winery/areas/${areaId}/bookings-config`, data);
}

export function updateAreaProductListing(areaId: number, productId: number, data: Partial<Omit<AreaProductListing, 'id' | 'wineryId' | 'areaId' | 'productId'>>): Promise<unknown> {
    return putData(`/winery/areas/${areaId}/products/${productId}`, data);
}

export async function deleteAreaProductListing(areaId: number, productId: number): Promise<void> {
    await wineryAction(`/winery/areas/${areaId}/products/${productId}`, { method: 'DELETE' }, 'Failed to remove area product listing');
}

export async function updateAreaIntegrationConfig(
    areaId: number,
    providerConnections: Partial<Record<AreaIntegrationDomain, IntegrationConnection>>
): Promise<OperationalAreaIntegrationConfig> {
    const response = await putData<{ data: OperationalAreaIntegrationConfig }>(`/winery/areas/${areaId}/integration-config`, { providerConnections });
    return response.data;
}

export async function deleteAreaIntegrationDomain(areaId: number, domain: AreaIntegrationDomain): Promise<void> {
    await wineryAction(`/winery/areas/${areaId}/integration-config/${domain}`, { method: 'DELETE' }, 'Failed to remove area integration override');
}

export async function testAreaIntegrationConnection(areaId: number, domain: AreaIntegrationDomain): Promise<IntegrationConnection> {
    const result = await wineryAction<{ data: IntegrationConnection }>(`/winery/areas/${areaId}/integration-config/test`, {
        method: 'POST', body: JSON.stringify({ domain })
    }, 'Failed to test area integration connection');
    return result.data;
}

export function updatePolicyProfile(data: Partial<WineryPolicyProfile>): Promise<unknown> {
    return putData('/winery/policy-profile', data);
}

export function updateIntegrationConfig(data: Partial<WineryIntegrationConfig>): Promise<unknown> {
    return putData('/winery/integration-config', data);
}

export async function testIntegrationConnection(domain: string): Promise<IntegrationConnection> {
    const result = await wineryAction<{ data: IntegrationConnection }>('/winery/integration-config/test', {
        method: 'POST', body: JSON.stringify({ domain })
    }, 'Failed to test integration connection');
    return result.data;
}

export async function syncEmailInbox(limit = 25): Promise<EmailSyncResult> {
    const result = await wineryAction<{ data: EmailSyncResult }>('/winery/integration-config/email/sync', {
        method: 'POST', body: JSON.stringify({ limit })
    }, 'Failed to sync email inbox');
    return result.data;
}

export function updateWinerySettings(data: Partial<WinerySettings>): Promise<{ data: WinerySettings }> {
    return putData('/winery/settings', data);
}
