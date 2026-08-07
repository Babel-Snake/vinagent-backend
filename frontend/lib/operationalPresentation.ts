export type OperationalSubtypeOption = { value: string; label: string };

export const REQUEST_SUBTYPE_OPTIONS: OperationalSubtypeOption[] = [
    { value: 'APPROVAL', label: 'Approval' },
    { value: 'STOCK_SUPPLIES', label: 'Stock and supplies' },
    { value: 'INFORMATION', label: 'Information' },
    { value: 'MAINTENANCE', label: 'Maintenance' },
    { value: 'STAFFING', label: 'Staffing' },
    { value: 'CUSTOMER_FOLLOW_UP', label: 'Customer follow-up' },
    { value: 'OTHER', label: 'Other' }
];

export const NOTE_SUBTYPE_OPTIONS: OperationalSubtypeOption[] = [
    { value: 'CUSTOMER_HANDOVER', label: 'Customer handover' },
    { value: 'OPERATIONAL_OBSERVATION', label: 'Operational observation' },
    { value: 'DECISION', label: 'Decision' },
    { value: 'INCIDENT', label: 'Incident' },
    { value: 'PROCESS_NOTE', label: 'Process note' },
    { value: 'OTHER', label: 'Other' }
];

const labels: Record<string, string> = {
    REQUEST: 'Request',
    NOTE: 'Note',
    TASK: 'Task',
    NOTICE: 'Notice',
    PENDING: 'Pending',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
    CANCELLED: 'Cancelled',
    RECORDED: 'Recorded',
    ORGANISATION: 'Whole winery',
    AREAS: 'Operational area',
    LOW: 'Low',
    NORMAL: 'Normal',
    HIGH: 'High'
};

for (const option of [...REQUEST_SUBTYPE_OPTIONS, ...NOTE_SUBTYPE_OPTIONS]) {
    labels[option.value] = option.label;
}

/** Converts known values to product language and keeps future enum values readable. */
export function operationalLabel(value?: string | null): string {
    if (!value) return 'Not specified';
    if (labels[value]) return labels[value];

    return value
        .replace(/[_-]+/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, character => character.toUpperCase());
}

export function subtypeOptionsFor(type: 'REQUEST' | 'NOTE'): OperationalSubtypeOption[] {
    return type === 'REQUEST' ? REQUEST_SUBTYPE_OPTIONS : NOTE_SUBTYPE_OPTIONS;
}
