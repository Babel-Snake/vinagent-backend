import { API_BASE, getAuthToken } from './apiCore';
import type { AreaMembership, OperationalArea } from './api';
import type { ProfileResponse, Staff } from './peopleTypes';
import type { PinSession } from './sessionApi';

async function responseError(res: Response, fallback: string) {
    const err = await res.json().catch(() => null);
    return new Error(err?.error?.message || err?.error || err?.message || fallback);
}

export async function fetchOperationalAreas(includeInactive = false): Promise<OperationalArea[]> {
    const params = includeInactive ? '?includeInactive=true' : '';
    const res = await fetch(`${API_BASE}/operational-areas${params}`, {
        headers: { 'Authorization': await getAuthToken() }, cache: 'no-store'
    });
    if (!res.ok) throw new Error('Failed to fetch operational areas');
    return (await res.json()).areas;
}

export async function createOperationalArea(data: {
    name: string; description?: string | null; isActive?: boolean; sortOrder?: number;
}): Promise<OperationalArea> {
    const res = await fetch(`${API_BASE}/operational-areas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': await getAuthToken() },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw await responseError(res, 'Failed to create operational area');
    return (await res.json()).area;
}

export async function updateOperationalArea(id: number, data: Partial<OperationalArea>): Promise<OperationalArea> {
    const res = await fetch(`${API_BASE}/operational-areas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': await getAuthToken() },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw await responseError(res, 'Failed to update operational area');
    return (await res.json()).area;
}

export async function replaceStaffAreaMemberships(userId: number, memberships: AreaMembership[]): Promise<AreaMembership[]> {
    const res = await fetch(`${API_BASE}/operational-areas/memberships/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': await getAuthToken() },
        body: JSON.stringify({ memberships: memberships.map(({ areaId, membershipRole, isPrimary }) => ({ areaId, membershipRole, isPrimary })) })
    });
    if (!res.ok) throw await responseError(res, 'Failed to update area memberships');
    return (await res.json()).memberships;
}

export async function createStaff(data: { username: string; password: string; pin?: string }): Promise<Staff> {
    const res = await fetch(`${API_BASE}/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': await getAuthToken() },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw await responseError(res, 'Failed to create staff');
    return (await res.json()).staff;
}

export async function updateStaff(id: number, data: { displayName?: string; email?: string; role?: string; isActive?: boolean; responsibilities?: string }): Promise<Staff> {
    const res = await fetch(`${API_BASE}/staff/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': await getAuthToken() },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw await responseError(res, 'Failed to update staff');
    return (await res.json()).staff;
}

export async function listStaff(): Promise<Staff[]> {
    const res = await fetch(`${API_BASE}/staff`, {
        headers: { 'Authorization': await getAuthToken() }, cache: 'no-store'
    });
    if (!res.ok) throw await responseError(res, 'Failed to fetch staff');
    return (await res.json()).staff;
}

export async function resetStaffAccessCode(id: number, data: { password?: string; pin?: string; clearPin?: boolean }): Promise<Staff> {
    const res = await fetch(`${API_BASE}/staff/${id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': await getAuthToken() },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw await responseError(res, 'Failed to reset access code');
    return (await res.json()).staff;
}

export async function deleteStaff(id: number): Promise<void> {
    const res = await fetch(`${API_BASE}/staff/${id}`, {
        method: 'DELETE', headers: { 'Authorization': await getAuthToken() }
    });
    if (!res.ok) throw await responseError(res, 'Failed to delete staff');
}

export async function resolveStaff(username: string): Promise<{ email: string; wineryId: number }> {
    const res = await fetch(`${API_BASE}/public/resolve-staff?username=${encodeURIComponent(username)}`, { cache: 'no-store' });
    if (!res.ok) {
        if (res.status === 409) throw new Error('AMBIGUOUS');
        throw await responseError(res, 'Failed to resolve staff user');
    }
    return res.json();
}

export async function getMyProfile(): Promise<ProfileResponse> {
    const res = await fetch(`${API_BASE}/public/me`, { headers: { 'Authorization': await getAuthToken() } });
    if (!res.ok) throw new Error('Failed to fetch profile');
    return res.json();
}

export async function getPinConfig(wineryId: number): Promise<{
    wineryId: number; wineryName?: string; pinLoginEnabled: boolean; allowManagerBasicPin: boolean; pinIdleTimeoutSeconds: number;
}> {
    const res = await fetch(`${API_BASE}/public/pin-config?wineryId=${encodeURIComponent(String(wineryId))}`, { cache: 'no-store' });
    if (!res.ok) throw await responseError(res, 'Failed to fetch PIN login settings');
    return res.json();
}

export async function pinLogin(data: { wineryId: number; pin: string }): Promise<PinSession> {
    const res = await fetch(`${API_BASE}/public/pin-login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
    });
    if (!res.ok) throw await responseError(res, 'PIN login failed');
    return res.json();
}

export async function updateMyProfile(data: { displayName: string }): Promise<ProfileResponse> {
    const res = await fetch(`${API_BASE}/public/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': await getAuthToken() },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw await responseError(res, 'Failed to update profile');
    return res.json();
}

export async function getUsers(): Promise<Staff[]> {
    const res = await fetch(`${API_BASE}/users`, { headers: { 'Authorization': await getAuthToken() } });
    if (!res.ok) throw new Error('Failed to fetch users');
    return (await res.json()).users;
}
