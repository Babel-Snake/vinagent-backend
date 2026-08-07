export type AnalyticsDatum = Record<string, string | number | null | undefined>;
export type AnalyticsMetricRecord = Record<string, string | number | null | undefined>;

export interface AnalyticsRecurrenceCluster {
    key: string;
    keywords: string[];
    count: number;
    areaIds?: number[];
    examples: Array<{ key: string; title: string; href: string }>;
}

export interface AnalyticsAgedRequest {
    id: number;
    title: string;
    ageHours: number;
    href: string;
}

export interface AnalyticsClassificationTransition {
    suggestedType: string;
    confirmedType: string;
    count: number;
}

export interface AnalyticsTrendRow {
    type: string;
    current: number;
    previous: number;
    delta: number;
    changePercent: number;
}

export interface AnalyticsAreaTrendRow {
    areaKey: string;
    areaName: string;
    current: number;
    previous: number;
    delta: number;
    changePercent: number;
}

export interface AnalyticsSuggestedSignal {
    signalType: string;
    severity: string;
    title: string;
    summary?: string | null;
    fingerprint?: string | null;
}

export interface AnalyticsResponse {
    period: { type: string; offset: number; label: string; start: string; end: string };
    kpis: AnalyticsMetricRecord;
    tasks: {
        byStatus: AnalyticsDatum[];
        byCategory: AnalyticsDatum[];
        bySentiment: AnalyticsDatum[];
        byPriority: AnalyticsDatum[];
        overTime: AnalyticsDatum[];
        outcomes: { byResolvedAs: AnalyticsDatum[]; byResolutionType: AnalyticsDatum[]; byCustomerOutcome: AnalyticsDatum[] };
    };
    customers: {
        bySource: AnalyticsDatum[];
        byLoyalty: AnalyticsDatum[];
        typeRatio: AnalyticsDatum[];
        topBySpend: Array<{
            id: number;
            firstName: string;
            lastName: string;
            email?: string | null;
            loyaltyTier: string;
            totalOrders?: number;
            lifetimeSpend?: number | string;
        }>;
    };
    staff: Array<{ name: string; total: number; resolved: number; rate: number }>;
    communication: { byChannel: AnalyticsDatum[]; byDirection: AnalyticsDatum[] };
    bookings: { taskCount: number; eventCount: number; byDay: AnalyticsDatum[] };
    operations?: {
        workflow?: AnalyticsMetricRecord & { currentByState?: AnalyticsDatum[]; currentByWaitingOn?: AnalyticsDatum[]; stepStatus?: AnalyticsDatum[] };
        timing?: AnalyticsMetricRecord;
        response?: AnalyticsMetricRecord;
        handoffs?: AnalyticsMetricRecord & { byRecipient?: AnalyticsDatum[] };
        identity?: AnalyticsMetricRecord & { byStatus?: AnalyticsDatum[] };
        followUps?: AnalyticsMetricRecord & { byAutomationType?: AnalyticsDatum[] };
        acknowledgements?: AnalyticsMetricRecord;
        intelligence?: {
            requestAging?: AnalyticsMetricRecord & { buckets?: AnalyticsMetricRecord; oldest?: AnalyticsAgedRequest[] };
            classification?: AnalyticsMetricRecord & { byTransition?: AnalyticsClassificationTransition[] };
            conversions?: AnalyticsMetricRecord;
            recurrence?: AnalyticsMetricRecord & { clusters?: AnalyticsRecurrenceCluster[] };
            trends?: AnalyticsMetricRecord & { byArea?: AnalyticsAreaTrendRow[]; byType?: AnalyticsTrendRow[] };
            suggestedSignals?: AnalyticsSuggestedSignal[];
        };
    };
}
