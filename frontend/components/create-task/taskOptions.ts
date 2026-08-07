import type { InboundMethod, Member, TaskOrigin } from '../../lib/api';

export type MemberSelection = Pick<Member, 'id' | 'firstName' | 'lastName' | 'email' | 'phone'>;

export const TASK_CATEGORY_SUBTYPES: Record<string, string[]> = {
    BOOKING: ['BOOKING_NEW', 'BOOKING_CHANGE', 'BOOKING_CANCELLATION', 'BOOKING_INQUIRY', 'OTHER'],
    ORDER: ['ORDER_NEW', 'ORDER_MODIFICATION', 'ORDER_SHIPPING_DELAY', 'ORDER_STATUS', 'ORDER_REPLACEMENT_REQUEST', 'ORDER_POSTPONE', 'OTHER'],
    ACCOUNT: ['ACCOUNT_ADDRESS_CHANGE', 'ACCOUNT_PAYMENT_ISSUE', 'ACCOUNT_LOGIN_ISSUE', 'OTHER'],
    OPERATIONS: ['OPERATIONS_SUPPLY_REQUEST', 'OPERATIONS_MAINTENANCE_REQUEST', 'OPERATIONS_ESCALATION', 'OTHER'],
    GENERAL: ['GENERAL_ENQUIRY', 'GENERAL_FEEDBACK', 'OTHER'],
    INTERNAL: ['INTERNAL_REMINDER', 'INTERNAL_FOLLOWUP', 'OTHER'],
    SYSTEM: ['SYSTEM_ALERT', 'OTHER']
};

export const TASK_CATEGORY_OPTIONS_BY_ORIGIN: Record<TaskOrigin, string[]> = {
    INTERNAL: ['INTERNAL', 'OPERATIONS', 'GENERAL', 'SYSTEM'],
    EXTERNAL: ['BOOKING', 'ORDER', 'ACCOUNT', 'GENERAL', 'OPERATIONS']
};

export const EXTERNAL_INBOUND_METHODS: InboundMethod[] = ['email', 'phone', 'sms', 'in_person', 'other'];

export function defaultSubTypeForCategory(category: string) {
    return (TASK_CATEGORY_SUBTYPES[category] || [])[0] || '';
}
