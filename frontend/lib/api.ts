export interface Task {
    id: number;
    type: string;
    status: string;
    priority: string;
    payload: any;
    createdAt: string;
    Member?: {
        id: number;
        firstName: string;
        lastName: string;
    };
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

export async function updateTaskStatus(taskId: number, status: string): Promise<Task> {
    const res = await fetch(`${API_BASE}/tasks/${taskId}/status`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': AUTH_TOKEN
        },
        body: JSON.stringify({ status })
    });

    if (!res.ok) {
        throw new Error('Failed to update task');
    }

    const data = await res.json();
    return data.task;
}
