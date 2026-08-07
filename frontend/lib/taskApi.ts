import { API_BASE, getAuthToken } from './apiCore';
import type {
    AutoclassifyResponse,
    InboundMethod,
    SuggestedChannel,
    Task,
    TaskAction,
    TaskFilters,
    TaskListResponse,
    TaskQueueSummary,
    TaskOrigin,
    TaskStep,
    TaskStepActionSuggestionInput,
    TaskStepInput
} from './api';

async function taskRequest<T>(path: string, init: RequestInit = {}, fallback: string): Promise<T> {
    const res = await fetch(`${API_BASE}/tasks${path}`, {
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
        throw new Error(err?.error?.message || err?.error || fallback);
    }
    if (res.status === 204) return undefined as T;
    return res.json();
}

export async function fetchTaskPage(filters: TaskFilters = {}): Promise<TaskListResponse> {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== false && value !== '' && value !== 'all') params.append(key, String(value));
    });
    return taskRequest<TaskListResponse>(`?${params}`, {}, 'Failed to fetch tasks');
}

export async function fetchTaskQueueSummary(filters: TaskFilters = {}): Promise<TaskQueueSummary> {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== false && value !== '' && value !== 'all') params.append(key, String(value));
    });
    const result = await taskRequest<{ summary: TaskQueueSummary }>(`/summary?${params}`, {}, 'Failed to fetch queue summary');
    return result.summary;
}

/**
 * Compatibility helper for callers that only need the current page of tasks.
 * New list views should use fetchTaskPage so total result counts stay available.
 */
export async function fetchTasks(filters: TaskFilters = {}): Promise<Task[]> {
    return (await fetchTaskPage(filters)).tasks;
}

export async function updateTask(taskId: number, updates: Partial<Task>): Promise<Task> {
    const result = await taskRequest<{ task: Task }>(`/${taskId}`, {
        method: 'PATCH', body: JSON.stringify(updates)
    }, 'Failed to update task');
    return result.task;
}

export async function updateNotePrivacy(taskId: number, actionId: number, isPrivate: boolean): Promise<TaskAction> {
    const result = await taskRequest<{ action: TaskAction }>(`/${taskId}/notes/${actionId}`, {
        method: 'PATCH', body: JSON.stringify({ isPrivate })
    }, 'Failed to update note privacy');
    return result.action;
}

export async function getTask(taskId: number): Promise<Task> {
    const result = await taskRequest<{ task: Task }>(`/${taskId}`, {}, 'Failed to fetch task');
    return result.task;
}

export async function createTask(taskData: Partial<Task> & {
    notes?: string;
    initialNote?: string;
    memberId?: number;
    suggestedReplyBody?: string;
    suggestedChannel?: string;
    suggestedReplySubject?: string;
    suggestedAction?: string;
    suggestedRecipientEmail?: string;
    suggestedCc?: string;
    steps?: TaskStepInput[];
    taskOrigin?: TaskOrigin;
    inboundMethod?: InboundMethod;
    requesterName?: string;
    requesterEmail?: string;
    requesterPhone?: string;
    calendarEventIds?: number[];
}): Promise<Task> {
    const result = await taskRequest<{ task: Task }>('', {
        method: 'POST', body: JSON.stringify(taskData)
    }, 'Failed to create task');
    return result.task;
}

export function autoclassifyTask(text: string, memberId?: number, context?: {
    taskOrigin?: TaskOrigin;
    inboundMethod?: InboundMethod;
    requesterName?: string;
    requesterEmail?: string;
    requesterPhone?: string;
    suggestedChannel?: SuggestedChannel;
}): Promise<AutoclassifyResponse> {
    return taskRequest('/autoclassify', {
        method: 'POST', body: JSON.stringify({ text, memberId, ...(context || {}) })
    }, 'Failed to autoclassify task');
}

export async function createTaskStep(taskId: number, data: TaskStepInput): Promise<TaskStep> {
    const result = await taskRequest<{ step: TaskStep }>(`/${taskId}/steps`, {
        method: 'POST', body: JSON.stringify(data)
    }, 'Failed to create task step');
    return result.step;
}

export async function updateTaskStep(taskId: number, stepId: number, updates: Partial<TaskStepInput>): Promise<TaskStep> {
    const result = await taskRequest<{ step: TaskStep }>(`/${taskId}/steps/${stepId}`, {
        method: 'PATCH', body: JSON.stringify(updates)
    }, 'Failed to update task step');
    return result.step;
}

export async function reorderTaskSteps(taskId: number, stepIds: number[]): Promise<TaskStep[]> {
    const result = await taskRequest<{ steps: TaskStep[] }>(`/${taskId}/steps/reorder`, {
        method: 'PATCH', body: JSON.stringify({ stepIds })
    }, 'Failed to reorder task steps');
    return result.steps;
}

export async function generateTaskStepSuggestion(taskId: number, stepId: number, force = true): Promise<TaskStep> {
    const result = await taskRequest<{ step: TaskStep }>(`/${taskId}/steps/${stepId}/suggestion`, {
        method: 'POST', body: JSON.stringify({ force })
    }, 'Failed to generate task step suggestion');
    return result.step;
}

export function actionTaskStepSuggestion(taskId: number, stepId: number, data: TaskStepActionSuggestionInput): Promise<{ step: TaskStep; providerResult?: unknown }> {
    return taskRequest(`/${taskId}/steps/${stepId}/action`, {
        method: 'POST', body: JSON.stringify(data)
    }, 'Failed to action task step suggestion');
}

export function deleteTaskStep(taskId: number, stepId: number): Promise<void> {
    return taskRequest(`/${taskId}/steps/${stepId}`, { method: 'DELETE' }, 'Failed to delete task step');
}
