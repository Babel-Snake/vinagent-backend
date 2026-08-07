export const STATUS_LABELS: Record<string, string> = {
    PENDING: 'Pending', ACTIONED: 'Actioned', REJECTED: 'Rejected'
};

export const STATUS_COLORS: Record<string, string> = {
    PENDING: '#f59e0b', ACTIONED: '#10b981', REJECTED: '#ef4444'
};

export const RESOLVED_AS_LABELS: Record<string, string> = {
    COMPLETED: 'Completed',
    WORKAROUND: 'Workaround',
    ESCALATED: 'Escalated',
    DECLINED: 'Declined',
    DUPLICATE: 'Duplicate',
    NO_ACTION: 'No Action'
};

export const RESOLVED_AS_COLORS: Record<string, string> = {
    COMPLETED: '#10b981',
    WORKAROUND: '#f59e0b',
    ESCALATED: '#6366f1',
    DECLINED: '#ef4444',
    DUPLICATE: '#6b7280',
    NO_ACTION: '#94a3b8'
};

export const CATEGORY_LABELS: Record<string, string> = {
    BOOKING: 'Booking', ORDER: 'Order', ACCOUNT: 'Account', GENERAL: 'General',
    INTERNAL: 'Internal', SYSTEM: 'System', OPERATIONS: 'Operations'
};

export const CUSTOMER_OUTCOME_LABELS: Record<string, string> = {
    BOOKING_CONFIRMED: 'Booking Confirmed',
    ORDER_UPDATED: 'Order Updated',
    ACCOUNT_UPDATED: 'Account Updated',
    INFO_PROVIDED: 'Info Provided',
    ISSUE_RESOLVED: 'Issue Resolved',
    REQUEST_DECLINED: 'Request Declined',
    REFERRED: 'Referred',
    NO_CHANGE: 'No Change',
    UNKNOWN: 'Unknown'
};

export const SOURCE_LABELS: Record<string, string> = {
    manual: 'Manual', sms: 'SMS', email: 'Email', booking: 'Booking',
    wine_club: 'Wine Club', pos: 'POS', import: 'Import', website: 'Website',
    referral: 'Referral', walk_in: 'Walk-in'
};

export const LOYALTY_LABELS: Record<string, string> = {
    none: 'None', bronze: 'Bronze', silver: 'Silver', gold: 'Gold', platinum: 'Platinum'
};

export const LOYALTY_COLORS: Record<string, string> = {
    none: '#9ca3af', bronze: '#d97706', silver: '#6b7280', gold: '#eab308', platinum: '#6366f1'
};

export const SENTIMENT_COLORS: Record<string, string> = {
    POSITIVE: '#10b981', NEUTRAL: '#6b7280', NEGATIVE: '#ef4444'
};

export const WORKFLOW_LABELS: Record<string, string> = {
    NOT_STARTED: 'Not Started',
    IN_PROGRESS: 'In Progress',
    WAITING: 'Waiting',
    BLOCKED: 'Blocked',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled'
};

export const WORKFLOW_COLORS: Record<string, string> = {
    NOT_STARTED: '#94a3b8',
    IN_PROGRESS: '#3b82f6',
    WAITING: '#f59e0b',
    BLOCKED: '#ef4444',
    COMPLETED: '#10b981',
    CANCELLED: '#6b7280'
};

export const WAITING_LABELS: Record<string, string> = {
    NONE: 'None', STAFF: 'Staff', CUSTOMER: 'Customer', MANAGER: 'Manager', EXTERNAL: 'External'
};

export const IDENTITY_LABELS: Record<string, string> = {
    AUTO_LINKED: 'Auto Linked',
    AUTO_CREATED: 'Auto Created',
    REVIEW_REQUIRED: 'Review Required',
    REVIEW_CONFIRMED: 'Review Confirmed',
    MANUALLY_LINKED: 'Manually Linked',
    UNRESOLVED: 'Unresolved',
    UNLINKED: 'Unlinked',
    SELECTED_MEMBER: 'Selected Member',
    UNRECORDED: 'Unrecorded'
};

export const AUTOMATION_LABELS: Record<string, string> = {
    EXPLICIT_FOLLOW_UP: 'Explicit Follow-up',
    CUSTOMER_NO_RESPONSE_CALLBACK: 'No-response Callback',
    ESCALATION_REVIEW: 'Escalation Review'
};

export const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function formatNumber(value: unknown) {
    return (Number(value) || 0).toLocaleString('en-AU');
}

export function formatHours(value: unknown) {
    const numeric = Number(value) || 0;
    if (numeric === 0) return '0h';
    if (numeric < 1) return `${Math.round(numeric * 60)}m`;
    if (numeric >= 48) return `${(numeric / 24).toFixed(1)}d`;
    return `${numeric.toFixed(1)}h`;
}

export function formatMinutes(value: unknown) {
    const numeric = Number(value) || 0;
    if (numeric === 0) return '0m';
    if (numeric >= 60) return `${(numeric / 60).toFixed(1)}h`;
    return `${numeric.toFixed(0)}m`;
}

export function formatPercent(value: unknown) {
    return `${Math.round(Number(value) || 0)}%`;
}
