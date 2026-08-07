import { API_BASE, getAuthToken } from './apiCore';
import type {
    Project,
    ProjectAuditEvent,
    ProjectDependency,
    ProjectDelegatedTaskInput,
    ProjectInput,
    ProjectItem,
    ProjectItemType,
    ProjectListResponse,
    ProjectParticipationRole
} from './projectTypes';

async function projectRequest<T>(path: string, init: RequestInit = {}, fallback = 'Project request failed'): Promise<T> {
    const response = await fetch(`${API_BASE}/projects${path}`, {
        ...init,
        headers: {
            ...(init.body ? { 'Content-Type': 'application/json' } : {}),
            'Authorization': await getAuthToken(),
            ...init.headers
        },
        cache: init.method ? undefined : 'no-store'
    });
    if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error?.message || error?.error || fallback);
    }
    if (response.status === 204) return undefined as T;
    return response.json();
}

function query(filters: Record<string, unknown>) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '' && value !== 'all') params.set(key, String(value));
    });
    const result = params.toString();
    return result ? `?${result}` : '';
}

export function fetchProjects(filters: {
    status?: string;
    health?: string;
    ownerUserId?: string | number;
    involvement?: 'all' | 'me';
    areaId?: string | number;
    search?: string;
    targetFrom?: string;
    targetTo?: string;
    sortBy?: string;
    page?: number;
    pageSize?: number;
} = {}): Promise<ProjectListResponse> {
    return projectRequest(query(filters), {}, 'Failed to fetch Projects');
}

export async function getProject(projectId: number): Promise<Project> {
    return (await projectRequest<{ project: Project }>(`/${projectId}`, {}, 'Failed to fetch Project')).project;
}

export async function createProject(data: ProjectInput): Promise<Project> {
    return (await projectRequest<{ project: Project }>('', {
        method: 'POST', body: JSON.stringify(data)
    }, 'Failed to create Project')).project;
}

export async function updateProject(projectId: number, data: Partial<ProjectInput> & {
    completionOverride?: boolean;
    completionReason?: string | null;
    notifyParticipants?: boolean;
}): Promise<Project> {
    return (await projectRequest<{ project: Project }>(`/${projectId}`, {
        method: 'PATCH', body: JSON.stringify(data)
    }, 'Failed to update Project')).project;
}

export async function assignProjectLead(projectId: number, leadUserId: number): Promise<Project> {
    return (await projectRequest<{ project: Project }>(`/${projectId}/lead`, {
        method: 'PUT', body: JSON.stringify({ leadUserId })
    }, 'Failed to appoint Project Lead')).project;
}

export async function revokeProjectLead(projectId: number): Promise<Project> {
    return (await projectRequest<{ project: Project }>(`/${projectId}/lead`, {
        method: 'DELETE'
    }, 'Failed to revoke Project Lead')).project;
}

export async function createDelegatedProjectTask(projectId: number, data: ProjectDelegatedTaskInput): Promise<{ taskId: number; project: Project }> {
    return projectRequest(`/${projectId}/tasks`, {
        method: 'POST', body: JSON.stringify(data)
    }, 'Failed to delegate Project Task');
}

export async function addProjectParticipant(projectId: number, data: {
    userId: number;
    participationRole?: ProjectParticipationRole;
    notificationsEnabled?: boolean;
}): Promise<Project> {
    return (await projectRequest<{ project: Project }>(`/${projectId}/participants`, {
        method: 'POST', body: JSON.stringify(data)
    }, 'Failed to add participant')).project;
}

export async function updateProjectParticipant(projectId: number, userId: number, data: {
    participationRole?: ProjectParticipationRole;
    notificationsEnabled?: boolean;
}): Promise<Project> {
    return (await projectRequest<{ project: Project }>(`/${projectId}/participants/${userId}`, {
        method: 'PATCH', body: JSON.stringify(data)
    }, 'Failed to update participant')).project;
}

export function removeProjectParticipant(projectId: number, userId: number): Promise<{ deleted: boolean }> {
    return projectRequest(`/${projectId}/participants/${userId}`, { method: 'DELETE' }, 'Failed to remove participant');
}

export async function addProjectItem(projectId: number, data: {
    itemType: ProjectItemType;
    itemId: number;
    isRequired?: boolean;
    isMilestone?: boolean;
    sortOrder?: number;
}): Promise<ProjectItem> {
    return (await projectRequest<{ item: ProjectItem }>(`/${projectId}/items`, {
        method: 'POST', body: JSON.stringify(data)
    }, 'Failed to link item')).item;
}

export async function updateProjectItem(projectId: number, projectItemId: number, data: {
    isRequired?: boolean;
    isMilestone?: boolean;
    sortOrder?: number;
}): Promise<ProjectItem> {
    return (await projectRequest<{ item: ProjectItem }>(`/${projectId}/items/${projectItemId}`, {
        method: 'PATCH', body: JSON.stringify(data)
    }, 'Failed to update Project item')).item;
}

export function removeProjectItem(projectId: number, projectItemId: number): Promise<{ deleted: boolean }> {
    return projectRequest(`/${projectId}/items/${projectItemId}`, { method: 'DELETE' }, 'Failed to unlink item');
}

export async function addProjectDependency(projectId: number, blockingTaskId: number, blockedTaskId: number): Promise<ProjectDependency> {
    return (await projectRequest<{ dependency: ProjectDependency }>(`/${projectId}/dependencies`, {
        method: 'POST', body: JSON.stringify({ blockingTaskId, blockedTaskId })
    }, 'Failed to add dependency')).dependency;
}

export function removeProjectDependency(projectId: number, dependencyId: number): Promise<{ deleted: boolean }> {
    return projectRequest(`/${projectId}/dependencies/${dependencyId}`, { method: 'DELETE' }, 'Failed to remove dependency');
}

export async function fetchProjectActivity(projectId: number): Promise<ProjectAuditEvent[]> {
    return (await projectRequest<{ activity: ProjectAuditEvent[] }>(`/${projectId}/activity`, {}, 'Failed to fetch Project activity')).activity;
}

export async function fetchProjectsForItem(itemType: ProjectItemType, itemId: number): Promise<Project[]> {
    return (await projectRequest<{ projects: Project[] }>(`/for-item${query({ itemType, itemId })}`, {}, 'Failed to fetch linked Projects')).projects;
}
