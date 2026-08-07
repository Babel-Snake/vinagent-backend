import type { Notice, NoticeInput } from './noticeTypes';
import type { AreaScope, OperationalArea } from './operationalAreaTypes';
import type { Task, TaskStepInput } from './taskTypes';

export type IntegrationEventType =
    | 'call.intake' | 'notice.imported' | 'task.suggested'
    | 'message.imported' | 'file.imported' | 'unknown.received';

export type IntegrationEventStatus =
    | 'RECEIVED' | 'NORMALIZED' | 'PENDING_REVIEW' | 'PROCESSED'
    | 'IGNORED' | 'ARCHIVED' | 'FAILED' | 'DUPLICATE';

export type IntegrationIntakeMethod =
    | 'webhook' | 'api' | 'automation' | 'email' | 'manual' | 'import' | 'provider_adapter';

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
    suggestedAreaId?: number | null;
    confirmedAreaId?: number | null;
    areaConfidence?: number | null;
    areaMappingSource?: 'RULE' | 'MANUAL' | 'ADAPTER' | 'AI' | 'DEFAULT' | null;
    SuggestedArea?: OperationalArea | null;
    ConfirmedArea?: OperationalArea | null;
    wineryId: number;
    createdBy?: number | null;
    reviewedBy?: number | null;
    createdAt: string;
    updatedAt: string;
    isTerminal?: boolean;
    Creator?: PersonReference | null;
    Reviewer?: PersonReference | null;
    LinkedItems?: IntegrationEventItem[];
    linkedItems?: IntegrationEventItem[];
}

export interface IntegrationEventItem {
    id: number;
    eventId: number;
    wineryId: number;
    itemType: 'TASK' | 'NOTICE' | 'REQUEST' | 'NOTE';
    itemId: number;
    itemKey?: string | null;
    linkType: 'CREATED' | 'LINKED';
    createdBy?: number | null;
    createdAt: string;
}

export interface IntegrationEventListResponse {
    events: IntegrationEvent[];
    pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface IntegrationEventFilters {
    status?: IntegrationEventStatus | 'all' | string;
    eventType?: IntegrationEventType | 'all' | string;
    provider?: string;
    areaId?: number | string;
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
    suggestedAreaId?: number | null;
    areaConfidence?: number | null;
    areaMappingSource?: 'RULE' | 'MANUAL' | 'ADAPTER' | 'AI' | 'DEFAULT' | null;
}

export type IntegrationReviewAction = 'publish_notice' | 'create_task' | 'link_task' | 'create_items' | 'ignore' | 'archive';

export interface IntegrationEventReviewItemInput {
    key?: string;
    type: 'TASK' | 'NOTICE' | 'REQUEST' | 'NOTE';
    mode?: 'CREATE' | 'LINK';
    itemId?: number;
    data?: Record<string, unknown>;
}

export interface IntegrationEventReviewInput {
    action: IntegrationReviewAction;
    reason?: string | null;
    taskId?: number;
    taskIds?: number[];
    confirmedAreaId?: number | null;
    items?: IntegrationEventReviewItemInput[];
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
        areaScope?: AreaScope;
        primaryAreaId?: number | null;
        linkedAreaIds?: number[];
    };
}

export interface IntegrationEventReviewResponse {
    event: IntegrationEvent;
    noticeId?: number;
    taskId?: number;
    notice?: Notice;
    task?: Task;
    items?: IntegrationEventItem[];
    duplicate?: boolean;
}

type PersonReference = { id: number; displayName?: string | null; email?: string | null; role?: string };
