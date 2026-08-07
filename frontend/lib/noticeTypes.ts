import type { CalendarEvent } from './calendarApi';
import type { AreaScope, OperationalArea } from './operationalAreaTypes';
import type { Task } from './taskTypes';

export type NoticeCategory =
    | 'GENERAL' | 'WINE' | 'VINTAGE_CHANGE' | 'PRICING' | 'STOCK' | 'CUSTOMERS'
    | 'MAINTENANCE' | 'EVENTS' | 'STAFF' | 'WINE_CLUB' | 'URGENT';
export type NoticePriority = 'normal' | 'important' | 'urgent';
export type NoticeAudienceType = 'all_staff' | 'roles' | 'users';

export interface NoticeFilters {
    search?: string;
    category?: string;
    priority?: string;
    status?: string;
    pinned?: string;
    authorId?: string | number;
    areaId?: string | number;
    sortBy?: string;
    dateFrom?: string;
    dateTo?: string;
    effectiveFrom?: string;
    effectiveTo?: string;
    page?: number;
    pageSize?: number;
}

export interface Notice {
    id: number;
    title: string;
    body: string;
    bodyPreview?: string;
    category: NoticeCategory;
    priority: NoticePriority;
    isPinned: boolean;
    requiresAcknowledgement: boolean;
    acknowledgementDueAt?: string | null;
    acknowledgement?: {
        expectedCount: number; acknowledgedCount: number; outstandingCount: number; completionRate: number;
        currentUserExpected: boolean; currentUserAcknowledgedAt?: string | null; isOverdue: boolean;
    };
    audienceType: NoticeAudienceType;
    audienceRoles?: string[] | null;
    audienceUserIds?: number[] | null;
    areaScope: AreaScope;
    primaryAreaId?: number | null;
    linkedAreaIds?: number[];
    OperationalAreas?: OperationalArea[];
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
    Author?: { id: number; displayName?: string | null; email?: string; role?: string };
    Updater?: { id: number; displayName?: string | null; email?: string; role?: string };
    Archiver?: { id: number; displayName?: string | null; email?: string; role?: string };
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
    Author?: { id: number; displayName?: string | null; email?: string; role?: string };
}

export interface NoticeInput {
    title: string;
    body: string;
    category: NoticeCategory;
    priority: NoticePriority;
    isPinned?: boolean;
    requiresAcknowledgement?: boolean;
    acknowledgementDueAt?: string | null;
    audienceType?: NoticeAudienceType;
    audienceRoles?: string[] | null;
    audienceUserIds?: number[] | null;
    areaScope?: AreaScope;
    primaryAreaId?: number | null;
    linkedAreaIds?: number[];
    calendarEventIds?: number[];
    effectiveFrom?: string | null;
    expiresAt?: string | null;
    isArchived?: boolean;
}

export interface NoticeListResponse {
    notices: Notice[];
    pagination: { page: number; pageSize: number; total: number; totalPages: number };
}
