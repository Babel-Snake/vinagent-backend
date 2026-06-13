export interface Task {
    id: number;
    category: string;
    subType: string;
    customerType: string;
    type: string; // Legacy
    status: string;
    workflowState?: string;
    waitingOn?: string;
    nextStepSummary?: string;
    blockedReason?: string;
    sentiment: string;
    priority: string;
    payload: any;
    createdAt: string;
    dueAt?: string | null;
    deadlineState?: 'NONE' | 'SCHEDULED' | 'DUE_SOON' | 'OVERDUE';
    isOverdue?: boolean;
    isDueSoon?: boolean;
    hoursUntilDue?: number | null;
    overdueHours?: number | null;
    deadlineSortRank?: number;
    effectiveUrgency?: 'normal' | 'due_soon' | 'overdue';
    resolvedAs?: string | null;
    resolutionType?: string | null;
    customerOutcome?: string | null;
    resolutionSummary?: string | null;
    followUpRequired?: boolean;
    followUpDueAt?: string | null;
    followUpSummary?: string | null;
    resolvedAt?: string | null;
    notes?: string;
    assigneeId?: number;
    parentTaskId?: number;
    suggestedReplyBody?: string;
    suggestedChannel?: string;
    suggestedReplySubject?: string;
    suggestedAction?: string;
    suggestedRecipientEmail?: string;
    suggestedCc?: string;
    memberId?: number;
    messageId?: number;
    Member?: {
        id: number;
        firstName: string;
        lastName: string;
        email?: string;
        phone?: string;
    };
    Assignee?: {
        id: number;
        displayName: string;
        email?: string;
        role?: string;
    };
    Creator?: {
        id: number;
        displayName: string;
        role?: string;
    };
    ParentTask?: {
        id: number;
        category?: string | null;
        subType?: string | null;
        status: string;
        resolvedAs?: string | null;
        resolutionType?: string | null;
        customerOutcome?: string | null;
        resolvedAt?: string | null;
    };
    Message?: TaskMessage;
    Messages?: TaskMessage[];
    TaskSteps?: TaskStep[];
    TaskActions?: TaskAction[];
    SubTasks?: Task[];
    LinkedNotices?: Notice[];
    CalendarEvents?: CalendarEvent[];
    regenerateSuggestedReply?: boolean;
}

export interface TaskMessage {
    id: number;
    source: string;
    direction: string;
    subject?: string | null;
    body?: string | null;
    receivedAt?: string | null;
    createdAt: string;
    rawPayload?: any;
}

export interface IdentitySuggestedCandidate {
    memberId: number;
    label: string;
    confidence: string;
    reason: string;
    score?: number;
    email?: string | null;
    phone?: string | null;
}

export interface TaskAction {
    id: number;
    actionType: string;
    details?: any;
    createdAt: string;
    userId?: number;
    User?: {
        id: number;
        displayName: string;
        role?: string;
        updatedAt: string;
    };
}

export interface TaskStep {
    id: number;
    taskId: number;
    title: string;
    description?: string | null;
    stepType: string;
    status: string;
    waitingOn: string;
    sortOrder: number;
    ownerUserId?: number | null;
    dueAt?: string | null;
    blockedReason?: string | null;
    completionNotes?: string | null;
    suggestedReplyBody?: string | null;
    suggestedReplySubject?: string | null;
    suggestedChannel?: string | null;
    suggestedAction?: string | null;
    suggestedRecipientEmail?: string | null;
    suggestedCc?: string | null;
    suggestionStatus?: string | null;
    suggestionGeneratedAt?: string | null;
    suggestionError?: string | null;
    completedAt?: string | null;
    metadata?: any;
    Owner?: {
        id: number;
        displayName: string;
        email?: string;
        role?: string;
    };
}

export interface TaskStepInput {
    title: string;
    description?: string | null;
    stepType?: string;
    status?: string;
    waitingOn?: string;
    sortOrder?: number;
    ownerUserId?: number | null;
    dueAt?: string | null;
    blockedReason?: string | null;
    completionNotes?: string | null;
    suggestedReplyBody?: string | null;
    suggestedReplySubject?: string | null;
    suggestedChannel?: string | null;
    suggestedAction?: string | null;
    suggestedRecipientEmail?: string | null;
    suggestedCc?: string | null;
    suggestionStatus?: string | null;
    suggestionGeneratedAt?: string | null;
    suggestionError?: string | null;
    metadata?: any;
}

export interface TaskStepActionSuggestionInput {
    suggestedReplyBody?: string | null;
    suggestedReplySubject?: string | null;
    suggestedChannel?: string | null;
    suggestedAction?: string | null;
    suggestedRecipientEmail?: string | null;
    suggestedCc?: string | null;
    completeStep?: boolean;
    completionNotes?: string | null;
}

export type AttachmentEntityType = 'TASK' | 'TASK_STEP' | 'TASK_OUTCOME' | 'TASK_FOLLOW_UP' | 'NOTICE';

export interface Attachment {
    id: number;
    entityType: AttachmentEntityType;
    entityId: number;
    wineryId: number;
    filename: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    uploadedBy?: number | null;
    createdAt: string;
    updatedAt: string;
    downloadUrl: string;
    Uploader?: {
        id: number;
        displayName?: string | null;
        email?: string | null;
        role?: string;
    } | null;
}

export type TaskOrigin = 'INTERNAL' | 'EXTERNAL';
export type InboundMethod = 'internal' | 'email' | 'phone' | 'sms' | 'in_person' | 'other';
export type SuggestedChannel = 'sms' | 'email' | 'voice' | 'none';

export interface AutoclassifyResponse {
    category: string;
    subType: string;
    priority: string;
    sentiment: string;
    payload: any;
    suggestedTitle: string;
    suggestedReplyBody?: string;
    suggestedChannel?: string;
    suggestedReplySubject?: string;
    suggestedAction?: string;
    suggestedAssigneeId?: number;
    suggestedRecipientEmail?: string;
    suggestedCc?: string;
    suggestedSteps?: TaskStepInput[];
    suggestedMember?: {
        id: number;
        firstName: string;
        lastName: string;
        email?: string;
        phone?: string;
    };
}


export interface Notification {
    id: number;
    userId: number;
    type: string;
    message: string;
    isRead: boolean;
    data: any;
    createdAt: string;
}

export type NoticeCategory =
    | 'GENERAL'
    | 'WINE'
    | 'VINTAGE_CHANGE'
    | 'PRICING'
    | 'STOCK'
    | 'CUSTOMERS'
    | 'MAINTENANCE'
    | 'EVENTS'
    | 'STAFF'
    | 'WINE_CLUB'
    | 'URGENT';

export type NoticePriority = 'normal' | 'important' | 'urgent';
export type NoticeAudienceType = 'all_staff' | 'roles' | 'users';

export interface Notice {
    id: number;
    title: string;
    body: string;
    bodyPreview?: string;
    category: NoticeCategory;
    priority: NoticePriority;
    isPinned: boolean;
    audienceType: NoticeAudienceType;
    audienceRoles?: string[] | null;
    audienceUserIds?: number[] | null;
    effectiveFrom?: string | null;
    expiresAt?: string | null;
    archivedAt?: string | null;
    externalSource?: string | null;
    externalId?: string | null;
    externalPostedAt?: string | null;
    externalAuthorName?: string | null;
    sourceEventId?: number | null;
    wineryId: number;
    createdBy?: number | null;
    updatedBy?: number | null;
    archivedBy?: number | null;
    createdAt: string;
    updatedAt: string;
    isArchived?: boolean;
    isExpired?: boolean;
    status?: 'active' | 'expired' | 'archived';
    Author?: {
        id: number;
        displayName?: string | null;
        email?: string;
        role?: string;
    };
    Updater?: {
        id: number;
        displayName?: string | null;
        email?: string;
        role?: string;
    };
    Archiver?: {
        id: number;
        displayName?: string | null;
        email?: string;
        role?: string;
    };
    LinkedTasks?: Task[];
    CalendarEvents?: CalendarEvent[];
}

export interface NoticeComment {
    id: number;
    noticeId: number;
    wineryId: number;
    userId?: number | null;
    parentCommentId?: number | null;
    body: string;
    createdAt: string;
    updatedAt: string;
    Replies?: NoticeComment[];
    Author?: {
        id: number;
        displayName?: string | null;
        email?: string;
        role?: string;
    };
}

export interface NoticeInput {
    title: string;
    body: string;
    category: NoticeCategory;
    priority: NoticePriority;
    isPinned?: boolean;
    audienceType?: NoticeAudienceType;
    audienceRoles?: string[] | null;
    audienceUserIds?: number[] | null;
    calendarEventIds?: number[];
    effectiveFrom?: string | null;
    expiresAt?: string | null;
    isArchived?: boolean;
}

export interface NoticeListResponse {
    notices: Notice[];
    pagination: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
    };
}

export type IntegrationEventType =
    | 'call.intake'
    | 'notice.imported'
    | 'task.suggested'
    | 'message.imported'
    | 'file.imported'
    | 'unknown.received';

export type IntegrationEventStatus =
    | 'RECEIVED'
    | 'NORMALIZED'
    | 'PENDING_REVIEW'
    | 'PROCESSED'
    | 'IGNORED'
    | 'ARCHIVED'
    | 'FAILED'
    | 'DUPLICATE';

export type IntegrationIntakeMethod =
    | 'webhook'
    | 'api'
    | 'automation'
    | 'email'
    | 'manual'
    | 'import'
    | 'provider_adapter';

export interface IntegrationEvent {
    id: number;
    provider: string;
    intakeMethod: IntegrationIntakeMethod | string;
    eventType: IntegrationEventType | string;
    externalEventId?: string | null;
    rawPayload?: Record<string, unknown>;
    normalizedPayload?: Record<string, unknown>;
    status: IntegrationEventStatus;
    processingError?: string | null;
    receivedAt: string;
    processedAt?: string | null;
    reviewedAt?: string | null;
    relatedRecordType?: string | null;
    relatedRecordId?: number | null;
    metadata?: Record<string, unknown>;
    wineryId: number;
    createdBy?: number | null;
    reviewedBy?: number | null;
    createdAt: string;
    updatedAt: string;
    isTerminal?: boolean;
    Creator?: {
        id: number;
        displayName?: string | null;
        email?: string | null;
        role?: string;
    } | null;
    Reviewer?: {
        id: number;
        displayName?: string | null;
        email?: string | null;
        role?: string;
    } | null;
}

export interface IntegrationEventListResponse {
    events: IntegrationEvent[];
    pagination: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
    };
}

export interface IntegrationEventFilters {
    status?: IntegrationEventStatus | 'all' | string;
    eventType?: IntegrationEventType | 'all' | string;
    provider?: string;
    search?: string;
    page?: number;
    pageSize?: number;
}

export interface IntegrationEventCreateInput {
    provider: string;
    intakeMethod?: IntegrationIntakeMethod;
    eventType: IntegrationEventType;
    externalEventId?: string | null;
    rawPayload: Record<string, unknown>;
    normalizedPayload?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    receivedAt?: string | null;
}

export type IntegrationReviewAction = 'publish_notice' | 'create_task' | 'link_task' | 'ignore' | 'archive';

export interface IntegrationEventReviewInput {
    action: IntegrationReviewAction;
    reason?: string | null;
    taskId?: number;
    taskIds?: number[];
    notice?: Partial<NoticeInput>;
    task?: {
        requesterName?: string | null;
        requesterPhone?: string | null;
        category?: string;
        subType?: string;
        priority?: string;
        dueAt?: string | null;
        suggestedAction?: string | null;
        steps?: TaskStepInput[];
    };
}

export interface IntegrationEventReviewResponse {
    event: IntegrationEvent;
    noticeId?: number;
    taskId?: number;
    notice?: Notice;
    task?: Task;
}

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000') + '/api';

import { auth } from './firebase';

const PIN_SESSION_KEY = 'vinagent_pin_session';
const DEFAULT_WINERY_KEY = 'vinagent_default_winery';
const LEGACY_KIOSK_KEY = 'kiosk_config';

export interface DefaultWineryContext {
    wineryId: number;
    wineryName?: string;
}

export interface PinSession {
    token: string;
    expiresAt: string;
    idleTimeoutSeconds: number;
    user: {
        id: number;
        displayName?: string | null;
        email?: string | null;
        role: string;
        actualRole?: string;
        authMode: 'pin' | 'pin_basic';
        wineryId: number;
        wineryName?: string;
    };
}

export function getPinSession(): PinSession | null {
    if (typeof window === 'undefined') return null;

    const raw = window.localStorage.getItem(PIN_SESSION_KEY);
    if (!raw) return null;

    try {
        const session = JSON.parse(raw) as PinSession;
        if (!session.token || !session.expiresAt || new Date(session.expiresAt).getTime() <= Date.now()) {
            clearPinSession();
            return null;
        }
        return session;
    } catch {
        clearPinSession();
        return null;
    }
}

export function savePinSession(session: PinSession) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(PIN_SESSION_KEY, JSON.stringify(session));
}

export function clearPinSession() {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(PIN_SESSION_KEY);
}

export function isPinSessionActive() {
    return Boolean(getPinSession());
}

export function getDefaultWineryContext(): DefaultWineryContext | null {
    if (typeof window === 'undefined') return null;

    const raw = window.localStorage.getItem(DEFAULT_WINERY_KEY) || window.localStorage.getItem(LEGACY_KIOSK_KEY);
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw);
        const wineryId = Number(parsed.wineryId);
        if (!Number.isInteger(wineryId) || wineryId < 1) {
            clearDefaultWineryContext();
            return null;
        }

        const context = {
            wineryId,
            wineryName: parsed.wineryName || parsed.name || undefined
        };
        window.localStorage.setItem(DEFAULT_WINERY_KEY, JSON.stringify(context));
        return context;
    } catch {
        clearDefaultWineryContext();
        return null;
    }
}

export function saveDefaultWineryContext(context: DefaultWineryContext) {
    if (typeof window === 'undefined') return;

    const wineryId = Number(context.wineryId);
    if (!Number.isInteger(wineryId) || wineryId < 1) return;

    window.localStorage.setItem(DEFAULT_WINERY_KEY, JSON.stringify({
        wineryId,
        wineryName: context.wineryName || undefined
    }));
}

export function clearDefaultWineryContext() {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(DEFAULT_WINERY_KEY);
    window.localStorage.removeItem(LEGACY_KIOSK_KEY);
}

async function getAuthToken(): Promise<string> {
    if (auth.currentUser) {
        return `Bearer ${await auth.currentUser.getIdToken()}`;
    }
    const pinSession = getPinSession();
    if (pinSession) {
        return `Bearer ${pinSession.token}`;
    }
    return '';
}

export async function fetchTasks(filters: any = {}): Promise<Task[]> {
    const params = new URLSearchParams();
    if (filters.status && filters.status !== 'all') params.append('status', filters.status);
    if (filters.category && filters.category !== 'all') params.append('category', filters.category);
    if (filters.priority && filters.priority !== 'all') params.append('priority', filters.priority);
    if (filters.sentiment && filters.sentiment !== 'all') params.append('sentiment', filters.sentiment);
    if (filters.assigneeId && filters.assigneeId !== 'all') params.append('assigneeId', filters.assigneeId);
    if (filters.createdById && filters.createdById !== 'all') params.append('createdById', filters.createdById);
    if (filters.search) params.append('search', filters.search);
    if (filters.sortBy) params.append('sortBy', filters.sortBy);
    if (filters.dateFrom) params.append('dateFrom', filters.dateFrom);
    if (filters.dateTo) params.append('dateTo', filters.dateTo);
    if (filters.showOnlyFlagged) params.append('showOnlyFlagged', String(filters.showOnlyFlagged));
    if (filters.mentionedMe) params.append('mentionedMe', String(filters.mentionedMe));
    if (filters.deadlineState && filters.deadlineState !== 'all') params.append('deadlineState', String(filters.deadlineState));
  if (filters.actionedById && filters.actionedById !== 'all') params.append('actionedById', String(filters.actionedById));
    if (filters.page) params.append('page', String(filters.page));
    if (filters.pageSize) params.append('pageSize', String(filters.pageSize));

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

export async function updateNotePrivacy(taskId: number, actionId: number, isPrivate: boolean): Promise<any> {
    const res = await fetch(`${API_BASE}/tasks/${taskId}/notes/${actionId}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': await getAuthToken()
        },
        body: JSON.stringify({ isPrivate })
    });

    if (!res.ok) {
        throw new Error('Failed to update note privacy');
    }

    const data = await res.json();
    return data.action;
}

export async function getTask(taskId: number): Promise<Task> {
    const res = await fetch(`${API_BASE}/tasks/${taskId}`, {
        headers: {
            'Authorization': await getAuthToken()
        },
        cache: 'no-store'
    });

    if (!res.ok) {
        throw new Error('Failed to fetch task');
    }

    const data = await res.json();
    return data.task;
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

export async function autoclassifyTask(text: string, memberId?: number, context?: {
    taskOrigin?: TaskOrigin;
    inboundMethod?: InboundMethod;
    requesterName?: string;
    requesterEmail?: string;
    requesterPhone?: string;
    suggestedChannel?: SuggestedChannel;
}): Promise<AutoclassifyResponse> {
    const res = await fetch(`${API_BASE}/tasks/autoclassify`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': await getAuthToken()
        },
        body: JSON.stringify({ text, memberId, ...(context || {}) })
    });

    if (!res.ok) {
        throw new Error('Failed to autoclassify task');
    }

    return await res.json();
}

export async function fetchNotices(filters: any = {}): Promise<NoticeListResponse> {
    const params = new URLSearchParams();
    if (filters.search) params.append('search', filters.search);
    if (filters.category && filters.category !== 'all') params.append('category', filters.category);
    if (filters.priority && filters.priority !== 'all') params.append('priority', filters.priority);
    if (filters.status && filters.status !== 'active') params.append('status', filters.status);
    if (filters.pinned && filters.pinned !== 'all') params.append('pinned', filters.pinned);
    if (filters.authorId && filters.authorId !== 'all') params.append('authorId', filters.authorId);
    if (filters.sortBy) params.append('sortBy', filters.sortBy);
    if (filters.dateFrom) params.append('dateFrom', filters.dateFrom);
    if (filters.dateTo) params.append('dateTo', filters.dateTo);
    if (filters.effectiveFrom) params.append('effectiveFrom', filters.effectiveFrom);
    if (filters.effectiveTo) params.append('effectiveTo', filters.effectiveTo);
    if (filters.page) params.append('page', String(filters.page));
    if (filters.pageSize) params.append('pageSize', String(filters.pageSize));

    const res = await fetch(`${API_BASE}/notices?${params.toString()}`, {
        headers: {
            'Authorization': await getAuthToken()
        },
        cache: 'no-store'
    });

    if (!res.ok) {
        throw new Error('Failed to fetch notices');
    }

    return await res.json();
}

export async function getNotice(noticeId: number): Promise<Notice> {
    const res = await fetch(`${API_BASE}/notices/${noticeId}`, {
        headers: {
            'Authorization': await getAuthToken()
        },
        cache: 'no-store'
    });

    if (!res.ok) {
        throw new Error('Failed to fetch notice');
    }

    const json = await res.json();
    return json.notice;
}

export async function createNotice(data: NoticeInput): Promise<Notice> {
    const res = await fetch(`${API_BASE}/notices`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': await getAuthToken()
        },
        body: JSON.stringify(data)
    });

    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || 'Failed to create notice');
    }

    const json = await res.json();
    return json.notice;
}

export async function updateNotice(id: number, data: Partial<NoticeInput>): Promise<Notice> {
    const res = await fetch(`${API_BASE}/notices/${id}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': await getAuthToken()
        },
        body: JSON.stringify(data)
    });

    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || 'Failed to update notice');
    }

    const json = await res.json();
    return json.notice;
}

export async function archiveNotice(id: number): Promise<Notice> {
    const res = await fetch(`${API_BASE}/notices/${id}`, {
        method: 'DELETE',
        headers: {
            'Authorization': await getAuthToken()
        }
    });

    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || 'Failed to archive notice');
    }

    const json = await res.json();
    return json.notice;
}

export async function fetchNoticeComments(noticeId: number): Promise<NoticeComment[]> {
    const res = await fetch(`${API_BASE}/notices/${noticeId}/comments`, {
        headers: {
            'Authorization': await getAuthToken()
        },
        cache: 'no-store'
    });

    if (!res.ok) {
        const err = await res.json().catch(() => null);
        const message = err?.error?.message || err?.error || res.statusText || 'Failed to fetch notice comments';
        throw new Error(`Failed to fetch notice comments (${res.status}): ${message}`);
    }

    const json = await res.json();
    return json.comments;
}

export async function createNoticeComment(noticeId: number, body: string, parentCommentId?: number | null): Promise<NoticeComment> {
    const res = await fetch(`${API_BASE}/notices/${noticeId}/comments`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': await getAuthToken()
        },
        body: JSON.stringify({ body, parentCommentId: parentCommentId || null })
    });

    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || 'Failed to post notice comment');
    }

    const json = await res.json();
    return json.comment;
}

export async function deleteNoticeComment(noticeId: number, commentId: number): Promise<void> {
    const res = await fetch(`${API_BASE}/notices/${noticeId}/comments/${commentId}`, {
        method: 'DELETE',
        headers: {
            'Authorization': await getAuthToken()
        }
    });

    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || 'Failed to delete notice comment');
    }
}

export async function linkNoticeTask(noticeId: number, taskId: number): Promise<Notice> {
    const res = await fetch(`${API_BASE}/notices/${noticeId}/tasks`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': await getAuthToken()
        },
        body: JSON.stringify({ taskId })
    });

    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || 'Failed to link task');
    }

    const json = await res.json();
    return json.notice;
}

export async function unlinkNoticeTask(noticeId: number, taskId: number): Promise<Notice> {
    const res = await fetch(`${API_BASE}/notices/${noticeId}/tasks/${taskId}`, {
        method: 'DELETE',
        headers: {
            'Authorization': await getAuthToken()
        }
    });

    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || 'Failed to unlink task');
    }

    const json = await res.json();
    return json.notice;
}

export async function linkTaskNotice(taskId: number, noticeId: number): Promise<Task> {
    const res = await fetch(`${API_BASE}/tasks/${taskId}/notices`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': await getAuthToken()
        },
        body: JSON.stringify({ noticeId })
    });

    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || 'Failed to link notice');
    }

    const json = await res.json();
    return json.task;
}

export async function unlinkTaskNotice(taskId: number, noticeId: number): Promise<Task> {
    const res = await fetch(`${API_BASE}/tasks/${taskId}/notices/${noticeId}`, {
        method: 'DELETE',
        headers: {
            'Authorization': await getAuthToken()
        }
    });

    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || 'Failed to unlink notice');
    }

    const json = await res.json();
    return json.task;
}

export async function fetchIntegrationEvents(filters: IntegrationEventFilters = {}): Promise<IntegrationEventListResponse> {
    const params = new URLSearchParams();
    if (filters.status && filters.status !== 'all') params.append('status', filters.status);
    if (filters.eventType && filters.eventType !== 'all') params.append('eventType', filters.eventType);
    if (filters.provider && filters.provider !== 'all') params.append('provider', filters.provider);
    if (filters.search) params.append('search', filters.search);
    if (filters.page) params.append('page', String(filters.page));
    if (filters.pageSize) params.append('pageSize', String(filters.pageSize));

    const res = await fetch(`${API_BASE}/integration-events?${params.toString()}`, {
        headers: {
            'Authorization': await getAuthToken()
        },
        cache: 'no-store'
    });

    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || 'Failed to fetch integration events');
    }

    return await res.json();
}

export async function getIntegrationEvent(eventId: number): Promise<IntegrationEvent> {
    const res = await fetch(`${API_BASE}/integration-events/${eventId}`, {
        headers: {
            'Authorization': await getAuthToken()
        },
        cache: 'no-store'
    });

    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || 'Failed to fetch integration event');
    }

    const json = await res.json();
    return json.event;
}

export async function createIntegrationEvent(data: IntegrationEventCreateInput): Promise<{ event: IntegrationEvent; duplicate: boolean }> {
    const res = await fetch(`${API_BASE}/integration-events`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': await getAuthToken()
        },
        body: JSON.stringify(data)
    });

    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || 'Failed to create integration event');
    }

    return await res.json();
}

export async function reviewIntegrationEvent(eventId: number, data: IntegrationEventReviewInput): Promise<IntegrationEventReviewResponse> {
    const res = await fetch(`${API_BASE}/integration-events/${eventId}/review`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': await getAuthToken()
        },
        body: JSON.stringify(data)
    });

    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || 'Failed to review integration event');
    }

    return await res.json();
}

export interface Staff {
    id: number;
    displayName: string;
    email: string;
    createdAt: string;
    role?: string;
    isActive?: boolean;
    responsibilities?: string;
    pinEnabled?: boolean;
    pinUpdatedAt?: string | null;
    pinLockedUntil?: string | null;
    pinLastLoginAt?: string | null;
}


export async function createStaff(data: { username: string; password: string; pin?: string; }): Promise<Staff> {
    const res = await fetch(`${API_BASE}/staff`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': await getAuthToken()
        },
        body: JSON.stringify(data)
    });

    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || err?.error || 'Failed to create staff');
    }

    const json = await res.json();
    return json.staff;
}

export async function updateStaff(id: number, data: { displayName?: string; email?: string; role?: string; isActive?: boolean; responsibilities?: string }): Promise<Staff> {
    const res = await fetch(`${API_BASE}/staff/${id}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': await getAuthToken()
        },
        body: JSON.stringify(data)
    });

    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || err.message || 'Failed to update staff');
    }

    const json = await res.json();
    return json.staff;
}

export async function listStaff(): Promise<Staff[]> {
    const res = await fetch(`${API_BASE}/staff`, {
        headers: {
            'Authorization': await getAuthToken()
        },
        cache: 'no-store'
    });

    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || err?.error || 'Failed to fetch staff');
    }

    const data = await res.json();
    return data.staff;
}

export async function resetStaffAccessCode(
    id: number,
    data: { password?: string; pin?: string; clearPin?: boolean }
): Promise<Staff> {
    const res = await fetch(`${API_BASE}/staff/${id}/reset-password`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': await getAuthToken()
        },
        body: JSON.stringify(data)
    });

    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || err.error || err.message || 'Failed to reset access code');
    }

    const json = await res.json();
    return json.staff;
}

export async function deleteStaff(id: number): Promise<void> {
    const res = await fetch(`${API_BASE}/staff/${id}`, {
        method: 'DELETE',
        headers: {
            'Authorization': await getAuthToken()
        }
    });

    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || err.message || 'Failed to delete staff');
    }
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

export async function getPinConfig(wineryId: number): Promise<{
    wineryId: number;
    wineryName?: string;
    pinLoginEnabled: boolean;
    allowManagerBasicPin: boolean;
    pinIdleTimeoutSeconds: number;
}> {
    const res = await fetch(`${API_BASE}/public/pin-config?wineryId=${encodeURIComponent(String(wineryId))}`, {
        cache: 'no-store'
    });

    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || err?.error || 'Failed to fetch PIN login settings');
    }

    return await res.json();
}

export async function pinLogin(data: { wineryId: number; pin: string }): Promise<PinSession> {
    const res = await fetch(`${API_BASE}/public/pin-login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    });

    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || err?.error || 'PIN login failed');
    }

    return await res.json();
}

export async function updateMyProfile(data: { displayName: string }): Promise<any> {
    const res = await fetch(`${API_BASE}/public/me`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': await getAuthToken()
        },
        body: JSON.stringify(data)
    });

    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || err.error || err.message || 'Failed to update profile');
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

export interface WineryContact {
    id: number;
    wineryId: number;
    name: string;
    role: string;
    email?: string;
    phone?: string;
    layer?: string;
    notes?: string;
    reportsToId?: number;
    responsibilities?: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface Winery {
    id: number;
    name: string;
    slug: string;
    description?: string;
    website?: string;
    phone?: string;
    email?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
    logoUrl?: string;
    bannerUrl?: string;
    createdAt: string;
    updatedAt: string;
    policyProfile?: WineryPolicyProfile;
    integrationConfig?: WineryIntegrationConfig;
    settings?: WinerySettings;
    contacts?: WineryContact[];
}

export interface WinerySettings {
    id?: number;
    wineryId?: number;
    identityMatchingConfig?: {
        autoLinkThreshold: number;
        reviewThreshold: number;
        maxReviewCandidates: number;
        allowPhoneSuffixNameAutoLink: boolean;
        allowNameOnlyReview: boolean;
    };
    authConfig?: {
        pinLoginEnabled: boolean;
        allowManagerBasicPin: boolean;
        pinIdleTimeoutSeconds: number;
        pinSessionHours: number;
        pinMaxAttempts: number;
        pinLockoutMinutes: number;
    };
}

export interface WineryPolicyProfile {
    id: number;
    wineryId: number;
    cancellationPolicy?: string;
    refundPolicy?: string;
    privacyPolicy?: string;
    termsOfService?: string;
    updatedAt: string;
}

export interface WineryIntegrationConfig {
    id: number;
    wineryId: number;
    smsProvider?: string;
    smsFromNumber?: string;
    emailProvider?: string;
    emailFromAddress?: string;
    channelsEnabled?: string[];
    kioskModeEnabled?: boolean;
    posProvider?: string;
    crmProvider?: string;
    bookingProvider?: string;
    deliveryProvider?: string;
    providerConnections?: Record<string, IntegrationConnection>;
    updatedAt: string;
}

export interface IntegrationConnection {
    provider?: string | null;
    executionProvider?: string | null;
    liveAdapterAvailable?: boolean;
    status?: 'not_connected' | 'connected' | 'error' | 'needs_reauth';
    authMethod?: 'none' | 'api_key' | 'oauth' | 'webhook' | 'manual';
    externalAccountId?: string | null;
    externalLocationId?: string | null;
    baseUrl?: string | null;
    webhookUrl?: string | null;
    webhookSigningConfigured?: boolean;
    webhookSecret?: string | null;
    clearWebhookSecret?: boolean;
    webhookSecretLastRotatedAt?: string | null;
    capabilities?: string[];
    lastTestedAt?: string | null;
    lastError?: string | null;
    notes?: string | null;
    summary?: string;
}

export interface EmailSyncResult {
    provider: string;
    mailboxAddress: string;
    folderId: string;
    fetched: number;
    imported: number;
    duplicates: number;
    createdTasks: number;
    syncedAt: string;
    lastMessageReceivedAt?: string | null;
}

export async function searchMembers(query: string): Promise<any[]> {
    const res = await fetch(`${API_BASE}/members/search?q=${encodeURIComponent(query)}`, {
        headers: {
            'Authorization': await getAuthToken()
        }
    });

    if (!res.ok) {
        throw new Error('Failed to search members');
    }

    const data = await res.json();
    return data.members;
}

export async function getWineryFull(): Promise<Winery> {
    const res = await fetch(`${API_BASE}/winery/full`, {
        headers: { 'Authorization': await getAuthToken() }
    });
    if (!res.ok) {
        const body = await res.json().catch(() => null);
        const message = body?.error?.message || body?.error || res.statusText || 'Failed to fetch winery profile';
        throw new Error(`Failed to fetch winery profile (${res.status}): ${message}`);
    }
    const json = await res.json();
    return json.data;
}

// Section Updates
export async function updateOverview(data: any): Promise<any> {
    return await putData('/winery', data);
}
export async function updateBrand(data: any): Promise<any> {
    return await putData('/winery/brand', data);
}
export async function updateBookingsConfig(data: any): Promise<any> {
    return await putData('/winery/bookings-config', data);
}

export async function createTaskStep(taskId: number, data: TaskStepInput): Promise<TaskStep> {
    const res = await fetch(`${API_BASE}/tasks/${taskId}/steps`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': await getAuthToken()
        },
        body: JSON.stringify(data)
    });

    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || err?.error || 'Failed to create task step');
    }

    const json = await res.json();
    return json.step;
}

export async function updateTaskStep(taskId: number, stepId: number, updates: Partial<TaskStepInput>): Promise<TaskStep> {
    const res = await fetch(`${API_BASE}/tasks/${taskId}/steps/${stepId}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': await getAuthToken()
        },
        body: JSON.stringify(updates)
    });

    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || err?.error || 'Failed to update task step');
    }

    const json = await res.json();
    return json.step;
}

export async function reorderTaskSteps(taskId: number, stepIds: number[]): Promise<TaskStep[]> {
    const res = await fetch(`${API_BASE}/tasks/${taskId}/steps/reorder`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': await getAuthToken()
        },
        body: JSON.stringify({ stepIds })
    });

    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || err?.error || 'Failed to reorder task steps');
    }

    const json = await res.json();
    return json.steps;
}

export async function generateTaskStepSuggestion(taskId: number, stepId: number, force = true): Promise<TaskStep> {
    const res = await fetch(`${API_BASE}/tasks/${taskId}/steps/${stepId}/suggestion`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': await getAuthToken()
        },
        body: JSON.stringify({ force })
    });

    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || err?.error || 'Failed to generate task step suggestion');
    }

    const json = await res.json();
    return json.step;
}

export async function actionTaskStepSuggestion(
    taskId: number,
    stepId: number,
    data: TaskStepActionSuggestionInput
): Promise<{ step: TaskStep; providerResult?: any }> {
    const res = await fetch(`${API_BASE}/tasks/${taskId}/steps/${stepId}/action`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': await getAuthToken()
        },
        body: JSON.stringify(data)
    });

    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || err?.error || 'Failed to action task step suggestion');
    }

    return await res.json();
}

export async function deleteTaskStep(taskId: number, stepId: number): Promise<void> {
    const res = await fetch(`${API_BASE}/tasks/${taskId}/steps/${stepId}`, {
        method: 'DELETE',
        headers: {
            'Authorization': await getAuthToken()
        }
    });

    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || err?.error || 'Failed to delete task step');
    }
}

function readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result;
            if (typeof result !== 'string') {
                reject(new Error('Failed to read attachment file'));
                return;
            }
            const commaIndex = result.indexOf(',');
            resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
        };
        reader.onerror = () => reject(new Error('Failed to read attachment file'));
        reader.readAsDataURL(file);
    });
}

export async function fetchAttachments(entityType: AttachmentEntityType, entityId: number): Promise<Attachment[]> {
    const params = new URLSearchParams({
        entityType,
        entityId: String(entityId)
    });

    const res = await fetch(`${API_BASE}/attachments?${params.toString()}`, {
        headers: {
            'Authorization': await getAuthToken()
        },
        cache: 'no-store'
    });

    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || err?.error || 'Failed to fetch attachments');
    }

    const json = await res.json();
    return json.attachments;
}

export async function uploadAttachment(entityType: AttachmentEntityType, entityId: number, file: File): Promise<Attachment> {
    const contentBase64 = await readFileAsBase64(file);
    const res = await fetch(`${API_BASE}/attachments`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': await getAuthToken()
        },
        body: JSON.stringify({
            entityType,
            entityId,
            filename: file.name,
            mimeType: file.type || 'application/octet-stream',
            sizeBytes: file.size,
            contentBase64
        })
    });

    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || err?.error || 'Failed to upload attachment');
    }

    const json = await res.json();
    return json.attachment;
}

export async function deleteAttachment(attachmentId: number): Promise<void> {
    const res = await fetch(`${API_BASE}/attachments/${attachmentId}`, {
        method: 'DELETE',
        headers: {
            'Authorization': await getAuthToken()
        }
    });

    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || err?.error || 'Failed to delete attachment');
    }
}

export async function openAttachment(attachment: Attachment): Promise<void> {
    const res = await fetch(`${API_BASE}/attachments/${attachment.id}/download`, {
        headers: {
            'Authorization': await getAuthToken()
        }
    });

    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || err?.error || 'Failed to open attachment');
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const newWindow = window.open(url, '_blank', 'noopener,noreferrer');
    if (!newWindow) {
        const link = document.createElement('a');
        link.href = url;
        link.download = attachment.filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
export async function updatePolicyProfile(data: any): Promise<any> {
    return await putData('/winery/policy-profile', data);
}
export async function updateIntegrationConfig(data: any): Promise<any> {
    return await putData('/winery/integration-config', data);
}
export async function testIntegrationConnection(domain: string): Promise<IntegrationConnection> {
    const res = await fetch(`${API_BASE}/winery/integration-config/test`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': await getAuthToken()
        },
        body: JSON.stringify({ domain })
    });
    if (!res.ok) throw new Error('Failed to test integration connection');
    const json = await res.json();
    return json.data;
}
export async function syncEmailInbox(limit = 25): Promise<EmailSyncResult> {
    const res = await fetch(`${API_BASE}/winery/integration-config/email/sync`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': await getAuthToken()
        },
        body: JSON.stringify({ limit })
    });
    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || 'Failed to sync email inbox');
    }
    const json = await res.json();
    return json.data;
}
export async function updateWinerySettings(data: any): Promise<any> {
    return await putData('/winery/settings', data);
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

export async function updateProduct(id: number, data: any): Promise<any> {
    const res = await fetch(`${API_BASE}/winery/products/${id}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': await getAuthToken()
        },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to update product');
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

export async function updateBookingType(id: number, data: any): Promise<any> {
    const res = await fetch(`${API_BASE}/winery/bookings/types/${id}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': await getAuthToken()
        },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to update booking type');
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

export async function updateFAQ(id: number, data: any): Promise<any> {
    const res = await fetch(`${API_BASE}/winery/faqs/${id}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': await getAuthToken()
        },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to update FAQ');
    return await res.json();
}

export async function deleteFAQ(id: number): Promise<any> {
    const res = await fetch(`${API_BASE}/winery/faqs/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': await getAuthToken() }
    });
    return await res.json();
}

export async function createSOP(data: any): Promise<any> {
    const res = await fetch(`${API_BASE}/winery/sops`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': await getAuthToken()
        },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to create SOP');
    return await res.json();
}

export async function updateSOP(id: number, data: any): Promise<any> {
    const res = await fetch(`${API_BASE}/winery/sops/${id}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': await getAuthToken()
        },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to update SOP');
    return await res.json();
}

export async function deleteSOP(id: number): Promise<any> {
    const res = await fetch(`${API_BASE}/winery/sops/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': await getAuthToken() }
    });
    if (!res.ok) throw new Error('Failed to delete SOP');
    return await res.json();
}

// --- Customer/Member Module ---

export async function getCustomers(filters: any = {}): Promise<any> {
    const params = new URLSearchParams();
    if (filters.q) params.append('q', filters.q);
    if (filters.source && filters.source !== 'all') params.append('source', filters.source);
    if (filters.state && filters.state !== 'all') params.append('state', filters.state);
    if (filters.loyaltyTier && filters.loyaltyTier !== 'all') params.append('loyaltyTier', filters.loyaltyTier);
    if (filters.customerType && filters.customerType !== 'all') params.append('customerType', filters.customerType);
    if (filters.isWineClubMember) params.append('isWineClubMember', 'true');
    if (filters.sortBy) params.append('sortBy', filters.sortBy);
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());

    const res = await fetch(`${API_BASE}/members?${params.toString()}`, {
        headers: { 'Authorization': await getAuthToken() },
        cache: 'no-store'
    });
    if (!res.ok) throw new Error('Failed to fetch customers');
    return await res.json();
}

export async function getCustomer(id: number): Promise<any> {
    const res = await fetch(`${API_BASE}/members/${id}`, {
        headers: { 'Authorization': await getAuthToken() }
    });
    if (!res.ok) throw new Error('Failed to fetch customer');
    return await res.json();
}

export async function createCustomer(data: any): Promise<any> {
    const res = await fetch(`${API_BASE}/members`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': await getAuthToken()
        },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to create customer');
    return await res.json();
}

export async function mergeCustomers(targetId: number, sourceMemberId: number, fieldOverrides?: Record<string, string>): Promise<any> {
    const res = await fetch(`${API_BASE}/members/${targetId}/merge`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': await getAuthToken()
        },
        body: JSON.stringify({ sourceMemberId, fieldOverrides: fieldOverrides || {} })
    });
    if (!res.ok) throw new Error('Failed to merge customers');
    return await res.json();
}

export async function updateCustomer(id: number, data: any): Promise<any> {
    const res = await fetch(`${API_BASE}/members/${id}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': await getAuthToken()
        },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to update customer');
    return await res.json();
}

export async function deleteCustomer(id: number): Promise<void> {
    const res = await fetch(`${API_BASE}/members/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': await getAuthToken() }
    });
    if (!res.ok) throw new Error('Failed to delete customer');
}


export async function getNotifications(): Promise<Notification[]> {
    const res = await fetch(`${API_BASE}/notifications`, {
        headers: { 'Authorization': await getAuthToken() }
    });
    if (!res.ok) throw new Error('Failed to fetch notifications');
    const data = await res.json();
    return data.notifications;
}

// --- Analytics ---

export async function getAnalytics(period = 'month', offset = 0): Promise<any> {
    const params = new URLSearchParams({ period, offset: offset.toString() });
    const res = await fetch(`${API_BASE}/analytics?${params.toString()}`, {
        headers: { 'Authorization': await getAuthToken() },
        cache: 'no-store'
    });
    if (!res.ok) throw new Error('Failed to fetch analytics');
    return await res.json();
}

export async function markNotificationRead(id: number): Promise<void> {
    const res = await fetch(`${API_BASE}/notifications/${id}/read`, {
        method: 'PATCH',
        headers: { 'Authorization': await getAuthToken() }
    });
    if (!res.ok) throw new Error('Failed to mark notification as read');
}

export async function dismissNotification(id: number): Promise<void> {
    const res = await fetch(`${API_BASE}/notifications/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': await getAuthToken() }
    });
    if (!res.ok) throw new Error('Failed to dismiss notification');
}

export async function getFlaggedTaskIds(): Promise<number[]> {
    const res = await fetch(`${API_BASE}/tasks/flags`, {
        headers: { 'Authorization': await getAuthToken() }
    });
    if (!res.ok) throw new Error('Failed to fetch flags');
    const data = await res.json();
    return data.taskIds;
}


export async function toggleTaskFlag(taskId: number): Promise<boolean> {
    const res = await fetch(`${API_BASE}/tasks/flags/${taskId}/toggle`, {
        method: 'POST',
        headers: { 'Authorization': await getAuthToken() }
    });
    if (!res.ok) throw new Error('Failed to toggle flag');
    const data = await res.json();
    return data.flagged;
}

// --- Calendar Module ---

export interface CalendarEvent {
    id: number;
    title: string;
    description?: string;
    start: string;
    end: string;
    allDay: boolean;
    type: 'reminder' | 'meeting' | 'event' | 'task_deadline' | 'notice' | 'other';
    wineryId: number;
    createdBy: number;
    taskId?: number | null;
    noticeId?: number | null;
    taskIds?: number[];
    noticeIds?: number[];

    LinkedTask?: {
        id: number;
        title?: string;
        category?: string;
        subType?: string;
        status: string;
        priority: string;
        payload?: any;
        assigneeId?: number | null;
        dueAt?: string | null;
    };
    LinkedTasks?: Task[];

    LinkedNotice?: {
        id: number;
        title: string;
        category: NoticeCategory;
        priority: NoticePriority;
        isPinned: boolean;
        effectiveFrom?: string | null;
        expiresAt?: string | null;
        archivedAt?: string | null;
    };
    LinkedNotices?: Notice[];

    Creator?: {
        id: number;
        displayName: string;
        email: string;
    };
}

export async function getCalendarEvents(start: Date, end: Date): Promise<CalendarEvent[]> {
    const params = new URLSearchParams({
        start: start.toISOString(),
        end: end.toISOString()
    });

    const res = await fetch(`${API_BASE}/calendar?${params.toString()}`, {
        headers: {
            'Authorization': await getAuthToken()
        },
        cache: 'no-store'
    });


    if (!res.ok) {
        console.error('Calendar Fetch Error:', res.status, res.statusText, await res.text());
        throw new Error('Failed to fetch calendar events');
    }


    return await res.json();
}

export async function searchCalendarEvents(search: string, pageSize = 10): Promise<CalendarEvent[]> {
    const params = new URLSearchParams();
    if (search.trim()) params.append('search', search.trim());
    params.append('pageSize', String(pageSize));

    const res = await fetch(`${API_BASE}/calendar?${params.toString()}`, {
        headers: {
            'Authorization': await getAuthToken()
        },
        cache: 'no-store'
    });

    if (!res.ok) {
        throw new Error('Failed to search calendar events');
    }

    return await res.json();
}

export async function createCalendarEvent(eventData: Partial<CalendarEvent>): Promise<CalendarEvent> {
    const res = await fetch(`${API_BASE}/calendar`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': await getAuthToken()
        },
        body: JSON.stringify(eventData)
    });

    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || 'Failed to create calendar event');
    }

    return await res.json();
}

export async function updateCalendarEvent(id: number, eventData: Partial<CalendarEvent>): Promise<CalendarEvent> {
    const res = await fetch(`${API_BASE}/calendar/${id}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': await getAuthToken()
        },
        body: JSON.stringify(eventData)
    });

    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || 'Failed to update calendar event');
    }

    return await res.json();
}

export async function deleteCalendarEvent(id: number): Promise<void> {
    const res = await fetch(`${API_BASE}/calendar/${id}`, {
        method: 'DELETE',
        headers: {
            'Authorization': await getAuthToken()
        }
    });

    if (!res.ok) {
        throw new Error('Failed to delete calendar event');
    }
}

// --- WINERY CONTACTS ---
export async function createWineryContact(data: Partial<WineryContact>): Promise<WineryContact> {
    const res = await fetch(`${API_BASE}/winery/contacts`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': await getAuthToken()
        },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to create winery contact');
    const json = await res.json();
    return json.data;
}

export async function updateWineryContact(id: number, data: Partial<WineryContact>): Promise<WineryContact> {
    const res = await fetch(`${API_BASE}/winery/contacts/${id}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': await getAuthToken()
        },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to update winery contact');
    const json = await res.json();
    return json.data;
}

export async function deleteWineryContact(id: number): Promise<void> {
    const res = await fetch(`${API_BASE}/winery/contacts/${id}`, {
        method: 'DELETE',
        headers: {
            'Authorization': await getAuthToken()
        }
    });
    if (!res.ok) throw new Error('Failed to delete winery contact');
}

