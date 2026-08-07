import type { AreaScope, OperationalArea } from './operationalAreaTypes';
import type { Task } from './taskTypes';
import type { InvolvementSignal } from './involvement';

export type OperationalItemType = 'TASK' | 'NOTICE' | 'REQUEST' | 'NOTE';

export interface OperationalClassificationSuggestion {
    originalText: string;
    suggestedType: OperationalItemType;
    suggestedSubtype?: string | null;
    confidence: number;
    classificationSource: 'AI' | 'RULE';
    suggestedTitle?: string | null;
    suggestedBody?: string | null;
    suggestedAreaIds: number[];
    suggestedFields: Record<string, unknown>;
}

export interface OperationalAuditEvent {
    id: number;
    itemType: 'REQUEST' | 'NOTE';
    itemId: number;
    eventType: string;
    beforeSnapshot?: Record<string, unknown> | null;
    afterSnapshot?: Record<string, unknown> | null;
    metadata?: Record<string, unknown> | null;
    createdAt: string;
    Actor?: { id: number; displayName?: string | null; email?: string; role?: string };
}

export interface OperationalRequest {
    id: number;
    title: string;
    body: string;
    originalText?: string | null;
    subtype?: string | null;
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
    priority: 'low' | 'normal' | 'high';
    response?: string | null;
    dueAt?: string | null;
    decidedAt?: string | null;
    sourceType: 'MANUAL' | 'INTEGRATION' | 'AI';
    areaScope: AreaScope;
    primaryAreaId?: number | null;
    linkedAreaIds?: number[];
    OperationalAreas?: OperationalArea[];
    aiSuggestedType?: OperationalItemType | null;
    aiConfidence?: number | null;
    aiSuggestion?: OperationalClassificationSuggestion | null;
    humanConfirmedType: 'REQUEST';
    requestedFromUserId?: number | null;
    createdBy: number;
    confirmedBy: number;
    createdAt: string;
    Creator?: PersonReference;
    RequestedFrom?: PersonReference | null;
    DecisionMaker?: PersonReference | null;
    AuditEvents?: OperationalAuditEvent[];
}

export interface OperationalRecord {
    id: number;
    title: string;
    body: string;
    originalText?: string | null;
    recordType?: string | null;
    sourceType: 'MANUAL' | 'INTEGRATION' | 'AI';
    sourceReference?: string | null;
    occurredAt: string;
    metadata?: Record<string, unknown> | null;
    areaScope: AreaScope;
    primaryAreaId?: number | null;
    linkedAreaIds?: number[];
    OperationalAreas?: OperationalArea[];
    recipientUserIds?: number[];
    Recipients?: PersonReference[];
    aiSuggestedType?: OperationalItemType | null;
    aiConfidence?: number | null;
    aiSuggestion?: OperationalClassificationSuggestion | null;
    humanConfirmedType: 'NOTE';
    memberId?: number | null;
    createdBy: number;
    confirmedBy: number;
    createdAt: string;
    Creator?: PersonReference;
    Member?: { id: number; firstName: string; lastName: string; email?: string; phone?: string } | null;
    AuditEvents?: OperationalAuditEvent[];
}

export interface OperationalItemComment {
    id: number;
    itemType: 'REQUEST' | 'NOTE';
    itemId: number;
    body: string;
    userId: number;
    parentCommentId?: number | null;
    createdAt: string;
    Author?: PersonReference;
    Replies?: OperationalItemComment[];
}

export interface OperationalItemRelation {
    id: number;
    sourceType: OperationalItemType;
    sourceId: number;
    targetType: OperationalItemType;
    targetId: number;
    relationType: 'CREATED_FROM' | 'RELATES_TO' | 'BLOCKS' | 'DUPLICATES' | 'GENERATED_TASK' | 'FOLLOW_UP_FOR' | 'COMPLETION_RECORD';
    metadata?: Record<string, unknown> | null;
    createdAt: string;
}

export interface UnifiedOperation {
    key: string;
    type: OperationalItemType;
    id: number;
    title: string;
    bodyPreview: string;
    status: string;
    priority?: string | null;
    areaScope: AreaScope;
    areas: Array<{ id: number; name: string }>;
    createdAt: string;
    eventAt: string;
    dueAt?: string | null;
    owner?: PersonReference | null;
    author?: PersonReference | null;
    involvement?: InvolvementSignal | null;
    href: string;
}

export interface OperationsFeedResponse {
    operations: UnifiedOperation[];
    counts: Record<OperationalItemType, number>;
    filters: { types: OperationalItemType[]; search: string; areaId: string | number; status: string; sortBy: string };
    pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export type OperationalIntelligenceSignalType =
    | 'REQUEST_AGING' | 'RECURRENCE' | 'CLASSIFICATION_CORRECTION'
    | 'CONVERSION_OUTCOME' | 'NOTICE_ACKNOWLEDGEMENT' | 'TREND';
export type OperationalIntelligenceSignalStatus = 'OPEN' | 'ACKNOWLEDGED' | 'DISMISSED' | 'ACTION_CREATED';
export type OperationalIntelligenceSignalSeverity = 'info' | 'warning' | 'critical';

export interface OperationalIntelligenceSignal {
    id: number;
    signalType: OperationalIntelligenceSignalType;
    status: OperationalIntelligenceSignalStatus;
    severity: OperationalIntelligenceSignalSeverity;
    title: string;
    summary?: string | null;
    fingerprint: string;
    dedupeKey?: string | null;
    evidence?: object | null;
    suggestedAction?: string | null;
    periodStart?: string | null;
    periodEnd?: string | null;
    reviewNote?: string | null;
    reviewDueAt?: string | null;
    reviewedAt?: string | null;
    lastMaterializedAt?: string | null;
    materializationCount?: number;
    areaId?: number | null;
    reviewOwnerUserId?: number | null;
    actionTaskId?: number | null;
    createdAt: string;
    updatedAt: string;
    Area?: Pick<OperationalArea, 'id' | 'name'> | null;
    ActionTask?: Pick<Task, 'id' | 'status' | 'category' | 'subType' | 'priority'> | null;
    Creator?: PersonReference;
    Reviewer?: PersonReference;
    ReviewOwner?: PersonReference;
}

export interface OperationalIntelligenceSignalInput {
    signalType: OperationalIntelligenceSignalType;
    severity?: OperationalIntelligenceSignalSeverity;
    title: string;
    summary?: string | null;
    fingerprint?: string | null;
    dedupeKey?: string | null;
    evidence?: object | null;
    suggestedAction?: string | null;
    periodStart?: string | null;
    periodEnd?: string | null;
    areaId?: number | null;
    reviewOwnerUserId?: number | null;
    reviewDueAt?: string | null;
}

export interface OperationalIntelligenceConfig {
    scheduler: { enabled: boolean; period: 'day' | 'week' | 'month' | 'year'; offset: number };
    thresholds: {
        requestAgingOverdueCount: number; requestAgingOverSevenDaysCount: number; requestAgingAverageAgeHours: number;
        classificationMinimumEvaluated: number; classificationMinimumCorrected: number; classificationCorrectionRate: number;
        conversionMinimumTotal: number; conversionCompletionRate: number; trendMinimumDelta: number;
        trendMinimumChangePercent: number; trendWarningDelta: number; noticeOutstandingCount: number;
    };
    reminders: { dueSoonHours: number; overdueRepeatHours: number; batchSize: number };
}

export interface OperationalIntelligenceConfigAuditEvent {
    id: number;
    eventType: 'CONFIG_UPDATED';
    preset?: string | null;
    changedKeys?: string[] | null;
    beforeSnapshot?: OperationalIntelligenceConfig | null;
    afterSnapshot?: OperationalIntelligenceConfig | null;
    metadata?: Record<string, unknown> | null;
    createdAt: string;
    Actor?: PersonReference;
}

export interface OperationalIntelligenceConfigPreset {
    key: 'default' | 'sensitive' | 'conservative';
    label: string;
    description: string;
    config: OperationalIntelligenceConfig;
}

export interface OperationalIntelligenceConfigResponse {
    config: OperationalIntelligenceConfig;
    presets: OperationalIntelligenceConfigPreset[];
    fieldMetadata: Record<string, string>;
    auditEvents: OperationalIntelligenceConfigAuditEvent[];
    changedKeys?: string[];
}

export interface OperationalIntelligenceConfigPreviewSignal {
    fingerprint?: string | null;
    signalType: OperationalIntelligenceSignalType;
    severity: OperationalIntelligenceSignalSeverity;
    previousSeverity?: OperationalIntelligenceSignalSeverity;
    title: string;
    summary?: string | null;
    areaId?: number | null;
}

export interface OperationalIntelligenceConfigPreviewResponse {
    period: { start: string; end: string };
    currentConfig: OperationalIntelligenceConfig;
    previewConfig: OperationalIntelligenceConfig;
    changedKeys: string[];
    changedFields?: Array<{
        path: string; section: 'scheduler' | 'thresholds' | 'reminders'; field: string;
        beforeValue: string | number | boolean | null; afterValue: string | number | boolean | null; description: string;
    }>;
    impact: PreviewImpact;
    history?: {
        periodCount: number;
        totals: {
            currentSuggestedCount: number; previewSuggestedCount: number; deltaSuggestedCount: number;
            addedSignalCount: number; removedSignalCount: number; changedSignalCount: number;
        };
        currentByType: Partial<Record<OperationalIntelligenceSignalType, number>>;
        previewByType: Partial<Record<OperationalIntelligenceSignalType, number>>;
        windows: Array<{ period: { start: string; end: string }; impact: PreviewImpact }>;
    };
    presets: OperationalIntelligenceConfigPreset[];
    fieldMetadata: Record<string, string>;
}

interface PreviewImpact {
    currentSuggestedCount: number;
    previewSuggestedCount: number;
    deltaSuggestedCount: number;
    currentByType: Partial<Record<OperationalIntelligenceSignalType, number>>;
    previewByType: Partial<Record<OperationalIntelligenceSignalType, number>>;
    addedSignals: OperationalIntelligenceConfigPreviewSignal[];
    removedSignals: OperationalIntelligenceConfigPreviewSignal[];
    changedSignals: OperationalIntelligenceConfigPreviewSignal[];
    unchangedCount: number;
}

type PersonReference = { id: number; displayName?: string | null; email?: string | null; role?: string };
