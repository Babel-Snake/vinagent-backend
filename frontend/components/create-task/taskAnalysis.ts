import type { InboundMethod, TaskOrigin } from '../../lib/api';

export type ResponseChannel = 'email' | 'sms' | 'voice' | 'none';

export function toDateTimeLocalValue(value?: string | null) {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    const local = new Date(parsed.getTime() - (parsed.getTimezoneOffset() * 60000));
    return local.toISOString().slice(0, 16);
}

export function labelFromMethod(method: InboundMethod) {
    switch (method) {
        case 'email': return 'Email';
        case 'phone': return 'Call';
        case 'sms': return 'Text / SMS';
        case 'in_person': return 'In Person';
        case 'other': return 'Other';
        default: return 'Internal';
    }
}

export function labelFromResponseChannel(channel: ResponseChannel) {
    switch (channel) {
        case 'email': return 'Email';
        case 'sms': return 'Text / SMS';
        case 'voice': return 'Phone Call';
        default: return 'No Customer Reply';
    }
}

export function defaultResponseChannelForMethod(method: InboundMethod): ResponseChannel {
    if (method === 'email') return 'email';
    if (method === 'sms') return 'sms';
    if (method === 'phone') return 'voice';
    return 'none';
}

export function isValidEmailAddress(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function defaultCategoryForOrigin(origin: TaskOrigin) {
    return origin === 'INTERNAL' ? 'INTERNAL' : 'GENERAL';
}

export function buildContextualAnalysisText({
    taskOrigin,
    inboundMethod,
    requesterName,
    requesterEmail,
    requesterPhone,
    preferredResponseChannel,
    text
}: {
    taskOrigin: TaskOrigin;
    inboundMethod: InboundMethod;
    requesterName: string;
    requesterEmail: string;
    requesterPhone: string;
    preferredResponseChannel: ResponseChannel;
    text: string;
}) {
    const lines = [
        `Task Origin: ${taskOrigin}`,
        `Inbound Method: ${labelFromMethod(inboundMethod)}`,
        `Preferred Response Channel: ${labelFromResponseChannel(preferredResponseChannel)}`
    ];

    if (requesterName.trim()) lines.push(`Requester Name: ${requesterName.trim()}`);
    if (requesterEmail.trim() && isValidEmailAddress(requesterEmail)) lines.push(`Requester Email: ${requesterEmail.trim()}`);
    if (requesterPhone.trim()) lines.push(`Requester Phone: ${requesterPhone.trim()}`);

    lines.push('Request Details:', text.trim());
    return lines.join('\n');
}

function normalizeSuggestionValue(value: unknown): unknown {
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map(normalizeSuggestionValue);
    if (value && typeof value === 'object') {
        return Object.keys(value as Record<string, unknown>)
            .sort()
            .reduce<Record<string, unknown>>((acc, key) => {
                acc[key] = normalizeSuggestionValue((value as Record<string, unknown>)[key]);
                return acc;
            }, {});
    }
    return value === undefined ? null : value;
}

function valuesMatch(left: unknown, right: unknown) {
    return JSON.stringify(normalizeSuggestionValue(left)) === JSON.stringify(normalizeSuggestionValue(right));
}

export function buildSuggestionReview(original: Record<string, unknown>, final: Record<string, unknown>) {
    const changedFields = Object.keys(final)
        .filter(field => !valuesMatch(original[field], final[field]))
        .reduce<Record<string, { suggested: unknown; final: unknown }>>((acc, field) => {
            acc[field] = { suggested: original[field] ?? null, final: final[field] ?? null };
            return acc;
        }, {});

    return {
        version: 1,
        source: 'manual_task_creation_preview',
        capturedAt: new Date().toISOString(),
        originalSuggestion: original,
        finalSelection: final,
        changedFields
    };
}
