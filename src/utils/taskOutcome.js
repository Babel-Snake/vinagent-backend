const RESOLVED_AS = ['COMPLETED', 'WORKAROUND', 'ESCALATED', 'DECLINED', 'DUPLICATE', 'NO_ACTION'];
const RESOLUTION_TYPES = [
    'EXECUTED',
    'REPLIED',
    'MANUAL_WORKAROUND',
    'POLICY_DECLINE',
    'CUSTOMER_NO_RESPONSE',
    'NO_ACTION_NEEDED',
    'SPAM_OR_INVALID',
    'EXTERNAL_ESCALATION',
    'INTERNAL_ESCALATION',
    'MERGED_DUPLICATE',
    'ALREADY_RESOLVED',
    'INFO_ONLY'
];
const CUSTOMER_OUTCOMES = [
    'BOOKING_CONFIRMED',
    'ORDER_UPDATED',
    'ACCOUNT_UPDATED',
    'INFO_PROVIDED',
    'ISSUE_RESOLVED',
    'REQUEST_DECLINED',
    'REFERRED',
    'NO_CHANGE',
    'UNKNOWN'
];

function getDefaultResolvedAs(status) {
    if (status === 'ACTIONED') {
        return 'COMPLETED';
    }
    if (status === 'REJECTED') {
        return 'NO_ACTION';
    }
    return null;
}

function getDefaultResolutionType(task, status) {
    if (status === 'REJECTED') {
        return task?.payload?.manualIntake?.taskOrigin === 'EXTERNAL'
            ? 'NO_ACTION_NEEDED'
            : 'INFO_ONLY';
    }

    switch (task?.category) {
        case 'GENERAL':
            return 'REPLIED';
        case 'BOOKING':
        case 'ORDER':
        case 'ACCOUNT':
            return 'EXECUTED';
        case 'OPERATIONS':
        case 'INTERNAL':
        case 'SYSTEM':
        default:
            return 'EXECUTED';
    }
}

function getDefaultCustomerOutcome(task, status) {
    if (status === 'REJECTED') {
        return 'NO_CHANGE';
    }

    switch (task?.category) {
        case 'BOOKING':
            return 'BOOKING_CONFIRMED';
        case 'ORDER':
            return 'ORDER_UPDATED';
        case 'ACCOUNT':
            return 'ACCOUNT_UPDATED';
        case 'GENERAL':
            return 'INFO_PROVIDED';
        default:
            return task?.payload?.manualIntake?.taskOrigin === 'EXTERNAL'
                ? 'ISSUE_RESOLVED'
                : 'UNKNOWN';
    }
}

function getDefaultTaskOutcome(task, status) {
    return {
        resolvedAs: getDefaultResolvedAs(status),
        resolutionType: getDefaultResolutionType(task, status),
        customerOutcome: getDefaultCustomerOutcome(task, status)
    };
}

function clearTaskOutcomeFields(task) {
    task.resolvedAs = null;
    task.resolutionType = null;
    task.customerOutcome = null;
    task.resolutionSummary = null;
    task.followUpRequired = false;
    task.followUpDueAt = null;
    task.followUpSummary = null;
    task.resolvedAt = null;
    return task;
}

function pickTaskOutcomeSnapshot(task) {
    return {
        resolvedAs: task?.resolvedAs || null,
        resolutionType: task?.resolutionType || null,
        customerOutcome: task?.customerOutcome || null,
        resolutionSummary: task?.resolutionSummary || null,
        followUpRequired: Boolean(task?.followUpRequired),
        followUpDueAt: task?.followUpDueAt || null,
        followUpSummary: task?.followUpSummary || null,
        resolvedAt: task?.resolvedAt || null
    };
}

module.exports = {
    RESOLVED_AS,
    RESOLUTION_TYPES,
    CUSTOMER_OUTCOMES,
    getDefaultTaskOutcome,
    clearTaskOutcomeFields,
    pickTaskOutcomeSnapshot
};
