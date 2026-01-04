export interface Task {
    id: number;
    category: string;
    subType: string;
    customerType: string;
    type: string; // Legacy
    status: string;
    sentiment: string;
    priority: string;
    payload: any;
    createdAt: string;
    assigneeId?: number;
    parentTaskId?: number;
    suggestedReplyBody?: string;
    suggestedChannel?: string;
    Member?: {
        id: number;
        firstName: string;
        lastName: string;
    };
    Assignee?: {
        id: number;
        displayName: string;
    };
    Creator?: {
        id: number;
        displayName: string;
        role?: string;
    };
}

export interface AutoclassifyResponse {
    category: string;
    subType: string;
    priority: string;
    sentiment: string;
    payload: any;
    suggestedTitle: string;
}

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000') + '/api';

import { auth } from './firebase';

async function getAuthToken(): Promise<string> {
    if (auth.currentUser) {
        return `Bearer ${await auth.currentUser.getIdToken()}`;
    }
    return '';
}

export async function fetchTasks(status?: string): Promise<Task[]> {
    const params = new URLSearchParams();
    if (status) params.append('status', status);

    const res = await fetch(`${API_BASE}/tasks?${params.toString()}`, {
        headers: {
            'Authorization': await getAuthToken()
        },
        cache: 'no-store'
    });

    if (!res.ok) {
        throw new Error('Failed to fetch tasks');
    }

    const data = await res.json();
    return data.tasks;
}

export async function updateTask(taskId: number, updates: Partial<Task>): Promise<Task> {
    const res = await fetch(`${API_BASE}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': await getAuthToken()
        },
        body: JSON.stringify(updates)
    });

    if (!res.ok) {
        throw new Error('Failed to update task');
    }

    const data = await res.json();
    return data.task;
}

export async function createTask(taskData: Partial<Task> & { notes?: string }): Promise<Task> {
    const res = await fetch(`${API_BASE}/tasks`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': await getAuthToken()
        },
        body: JSON.stringify(taskData)
    });

    if (!res.ok) {
        throw new Error('Failed to create task');
    }

    const data = await res.json();
    return data.task;
}

export async function autoclassifyTask(text: string, memberId?: number): Promise<AutoclassifyResponse> {
    const res = await fetch(`${API_BASE}/tasks/autoclassify`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': await getAuthToken()
        },
        body: JSON.stringify({ text, memberId })
    });

    if (!res.ok) {
        throw new Error('Failed to autoclassify task');
    }

    return await res.json();
}

export interface Staff {
    id: number;
    displayName: string;
    email: string;
    createdAt: string;
}

export async function createStaff(data: { username: string; password: string; }): Promise<Staff> {
    const res = await fetch(`${API_BASE}/staff`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': await getAuthToken()
        },
        body: JSON.stringify(data)
    });

    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create staff');
    }

    const json = await res.json();
    return json.staff;
}

export async function resolveStaff(username: string): Promise<{ email: string; wineryId: number }> {
    const res = await fetch(`${API_BASE}/public/resolve-staff?username=${encodeURIComponent(username)}`, {
        cache: 'no-store'
    });

    if (!res.ok) {
        if (res.status === 409) {
            throw new Error('AMBIGUOUS');
        }
        const err = await res.json();
        throw new Error(err.error || 'Failed to resolve staff user');
    }

    return await res.json();
}

export async function getMyProfile(): Promise<any> {
    const res = await fetch(`${API_BASE}/public/me`, {
        headers: {
            'Authorization': await getAuthToken()
        }
    });

    if (!res.ok) {
        throw new Error('Failed to fetch profile');
    }

    return await res.json();
}

export async function getUsers(): Promise<Staff[]> {
    const res = await fetch(`${API_BASE}/users`, {
        headers: {
            'Authorization': await getAuthToken()
        }
    });

    if (!res.ok) {
        throw new Error('Failed to fetch users');
    }

    const data = await res.json();
    return data.users;
}

// --- Winery Module ---

export async function getWineryFull(): Promise<any> {
    const res = await fetch(`${API_BASE}/winery/full`, {
        headers: { 'Authorization': await getAuthToken() }
    });
    if (!res.ok) throw new Error('Failed to fetch winery profile');
    return await res.json();
}

// Section Updates
export async function updateOverview(data: any): Promise<any> {
    return await putData('/winery', data);
}
export async function updateBrand(data: any): Promise<any> {
    return await putData('/winery/brand', data);
}
export async function updateBookingsConfig(data: any): Promise<any> {
    return await putData('/winery/bookings/config', data);
}
export async function updatePolicyProfile(data: any): Promise<any> {
    return await putData('/winery/policies/profile', data);
}
export async function updateIntegrationConfig(data: any): Promise<any> {
    return await putData('/winery/integrations', data);
}

// Sub-resource Helpers
async function putData(url: string, data: any) {
    const res = await fetch(`${API_BASE}${url}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': await getAuthToken()
        },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`Failed to update ${url}`);
    return await res.json();
}

export async function createProduct(data: any): Promise<any> {
    const res = await fetch(`${API_BASE}/winery/products`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': await getAuthToken()
        },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to create product');
    return await res.json();
}

export async function deleteProduct(id: number): Promise<any> {
    const res = await fetch(`${API_BASE}/winery/products/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': await getAuthToken() }
    });
    if (!res.ok) throw new Error('Failed to delete product');
    return await res.json();
}

export async function createBookingType(data: any): Promise<any> {
    const res = await fetch(`${API_BASE}/winery/bookings/types`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': await getAuthToken()
        },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to create booking type');
    return await res.json();
}

export async function deleteBookingType(id: number): Promise<any> {
    const res = await fetch(`${API_BASE}/winery/bookings/types/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': await getAuthToken() }
    });
    if (!res.ok) throw new Error('Failed to delete booking type');
    return await res.json();
}

export async function createFAQ(data: any): Promise<any> {
    const res = await fetch(`${API_BASE}/winery/faqs`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': await getAuthToken()
        },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to create FAQ');
    return await res.json();
}

export async function deleteFAQ(id: number): Promise<any> {
    const res = await fetch(`${API_BASE}/winery/faqs/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': await getAuthToken() }
    });
    if (!res.ok) throw new Error('Failed to delete FAQ');
    return await res.json();
}
