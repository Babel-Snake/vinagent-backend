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

// Temporary mock token until Phase 7 (Real Auth) / Phase 6.2 (Auth UI)
const AUTH_TOKEN = 'Bearer mock-token';

export async function fetchTasks(status?: string): Promise<Task[]> {
    const params = new URLSearchParams();
    if (status) params.append('status', status);

    const res = await fetch(`${API_BASE}/tasks?${params.toString()}`, {
        headers: {
            'Authorization': AUTH_TOKEN
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
            'Authorization': AUTH_TOKEN
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
            'Authorization': AUTH_TOKEN
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
            'Authorization': AUTH_TOKEN
        },
        body: JSON.stringify({ text, memberId })
    });

    if (!res.ok) {
        throw new Error('Failed to autoclassify task');
    }

    return await res.json();
}
