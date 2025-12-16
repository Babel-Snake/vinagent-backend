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
