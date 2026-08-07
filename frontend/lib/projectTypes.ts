import type { JsonObject } from './coreTypes';
import type { InvolvementSignal } from './involvement';

export type ProjectStatus = 'PLANNED' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';
export type ProjectHealth = 'ON_TRACK' | 'AT_RISK' | 'BLOCKED' | 'OVERDUE';
export type ProjectItemType = 'TASK' | 'REQUEST' | 'NOTICE' | 'NOTE' | 'CALENDAR_EVENT';
export type ProjectParticipationRole = 'PARTICIPANT' | 'STAKEHOLDER';

export interface ProjectPerson {
    id: number;
    displayName?: string | null;
    email?: string | null;
    role?: string;
    isActive?: boolean;
}

export interface ProjectArea {
    id: number;
    name?: string | null;
    relationshipType: 'PRIMARY' | 'LINKED';
}

export interface ProjectParticipant {
    projectId: number;
    userId: number;
    participationRole: ProjectParticipationRole;
    notificationsEnabled: boolean;
    addedBy?: number;
    User?: ProjectPerson;
    createdAt?: string;
    updatedAt?: string;
}

export interface ProjectItemSource {
    id: number;
    title: string;
    status: string;
    workflowState?: string | null;
    waitingOn?: string | null;
    blockedReason?: string | null;
    dueAt?: string | null;
    start?: string | null;
    end?: string | null;
    allDay?: boolean;
    priority?: string | null;
    owner?: ProjectPerson | null;
    involvement?: InvolvementSignal | null;
    href: string;
}

export interface ProjectItem {
    id: number;
    wineryId: number;
    projectId: number;
    itemType: ProjectItemType;
    itemId: number;
    linkType?: 'REFERENCE' | 'DELEGATED_WORK';
    isRequired: boolean;
    isMilestone: boolean;
    sortOrder: number;
    addedBy?: number | null;
    AddedBy?: ProjectPerson | null;
    source: ProjectItemSource;
    createdAt: string;
    updatedAt: string;
}

export interface ProjectDependency {
    id: number;
    projectId: number;
    blockingTaskId: number;
    blockedTaskId: number;
    blockingTask?: ProjectItemSource | null;
    blockedTask?: ProjectItemSource | null;
    Creator?: ProjectPerson | null;
    createdAt: string;
}

export interface ProjectNextAction {
    reason: string;
    itemType: ProjectItemType;
    itemId: number;
    title: string;
    dueAt?: string | null;
    owner?: ProjectPerson | null;
    involvement?: InvolvementSignal | null;
    href: string;
}

export interface ProjectSummary {
    health: ProjectHealth | null;
    progressPercent: number | null;
    requiredTaskCount: number;
    completedRequiredTaskCount: number;
    incompleteRequiredTaskCount: number;
    blockedTaskCount: number;
    overdueTaskCount: number;
    pendingDecisionCount: number;
    overdueDecisionCount: number;
    unresolvedDependencyCount: number;
    isPastTarget: boolean;
    isAtRisk: boolean;
    upcomingMilestone?: (ProjectItemSource & { itemType: ProjectItemType }) | null;
    upcomingEvents: Array<ProjectItemSource & { itemType: 'CALENDAR_EVENT' }>;
    nextAction?: ProjectNextAction | null;
    attention: {
        blockedTasks: ProjectItemSource[];
        overdueTasks: ProjectItemSource[];
        pendingDecisions: ProjectItemSource[];
        unresolvedDependencies: Array<{ id: number; blockingTaskId: number; blockedTaskId: number }>;
    };
}

export interface ProjectAuditEvent {
    id: number;
    eventType: string;
    projectId: number;
    actorUserId?: number | null;
    beforeSnapshot?: JsonObject | null;
    afterSnapshot?: JsonObject | null;
    metadata?: JsonObject | null;
    Actor?: ProjectPerson | null;
    createdAt: string;
}

export interface ProjectPermissions {
    canView: boolean;
    canManage: boolean;
    canGovern: boolean;
    isLead: boolean;
    canDelegateTasks: boolean;
    canChangeLeadership: boolean;
    canChangeScope: boolean;
    canComplete: boolean;
    canCancel: boolean;
}

export type ProjectInvolvementRole = 'LEAD' | 'OWNER' | 'PARTICIPANT' | 'STAKEHOLDER' | 'DELEGATED_TASK_ASSIGNEE';

export interface ProjectInvolvement {
    roles: ProjectInvolvementRole[];
    primaryRole: ProjectInvolvementRole | null;
    delegatedTaskCount: number;
}

export interface Project {
    id: number;
    wineryId: number;
    title: string;
    intendedOutcome: string;
    businessContext?: string | null;
    status: ProjectStatus;
    areaScope: 'ORGANISATION' | 'AREAS';
    primaryAreaId?: number | null;
    ownerUserId?: number | null;
    leadUserId?: number | null;
    leadGrantedByUserId?: number | null;
    leadGrantedAt?: string | null;
    plannedStartAt?: string | null;
    targetEndAt?: string | null;
    actualCompletedAt?: string | null;
    riskReason?: string | null;
    riskReviewAt?: string | null;
    completionReason?: string | null;
    createdBy: number;
    updatedBy: number;
    createdAt: string;
    updatedAt: string;
    Owner?: ProjectPerson | null;
    Lead?: ProjectPerson | null;
    LeadGrantor?: ProjectPerson | null;
    Creator?: ProjectPerson | null;
    Updater?: ProjectPerson | null;
    areas: ProjectArea[];
    Participants?: ProjectParticipant[];
    summary: ProjectSummary;
    items: ProjectItem[];
    dependencies: ProjectDependency[];
    activity?: ProjectAuditEvent[];
    restrictedItemCount: number;
    involvement?: ProjectInvolvement;
    // Optional at the client boundary so a rolling deployment or stale local API
    // cannot crash Project detail before the current permission contract arrives.
    permissions?: ProjectPermissions;
}

export interface ProjectInput {
    title: string;
    intendedOutcome: string;
    businessContext?: string | null;
    status: ProjectStatus;
    ownerUserId?: number | null;
    leadUserId?: number | null;
    plannedStartAt?: string | null;
    targetEndAt?: string | null;
    riskReason?: string | null;
    riskReviewAt?: string | null;
    areaScope: 'ORGANISATION' | 'AREAS';
    primaryAreaId?: number | null;
    linkedAreaIds?: number[];
    participantUserIds?: number[];
}

export interface ProjectDelegatedTaskInput {
    title: string;
    body?: string | null;
    dueAt?: string | null;
    priority?: 'low' | 'normal' | 'high';
    assigneeId: number;
    areaId: number;
    isRequired?: boolean;
    isMilestone?: boolean;
}

export interface ProjectListResponse {
    projects: Project[];
    pagination: { page: number; pageSize: number; total: number; totalPages: number };
}
