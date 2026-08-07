import { clientLogger } from '../../lib/clientLogger';
import type { TaskAction } from '../../lib/api';

const BASIC_ACTIVITY_ACTION_TYPES = new Set([
    'ACTIONED',
    'REJECTED',
    'ASSIGNED',
    'LINKED_TASK',
    'NOTE_ADDED',
    'STEP_COMPLETED',
    'ATTACHMENT_ADDED',
    'ATTACHMENT_DELETED',
    'EXECUTION_TRIGGERED',
    'EXECUTION_RECORDED',
    'OUTCOME_RECORDED',
    'MEMBER_ENRICHED'
]);

const BASIC_MANUAL_UPDATE_FIELDS = new Set(['memberId', 'priority', 'dueAt', 'parentTaskId']);
const TASK_MODAL_DEBUG_KEY = 'vinagent:debug-task-modal';

export function isHighImpactActivity(action: TaskAction) {
    if (BASIC_ACTIVITY_ACTION_TYPES.has(action.actionType)) return true;
    if (action.actionType !== 'MANUAL_UPDATE') return false;

    const changes = action.details?.changes || {};
    return Object.keys(changes).some(key => BASIC_MANUAL_UPDATE_FIELDS.has(key));
}

export function displayActionValue(value: unknown) {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);

    try {
        const seen = new WeakSet();
        const serialized = JSON.stringify(value, (_key, nestedValue) => {
            if (typeof nestedValue === 'bigint') return String(nestedValue);
            if (typeof nestedValue === 'symbol') return nestedValue.toString();
            if (typeof nestedValue === 'function') return '[Function]';
            if (nestedValue && typeof nestedValue === 'object') {
                if (seen.has(nestedValue)) return '[Circular]';
                seen.add(nestedValue);
            }
            return nestedValue;
        });
        return serialized === undefined ? String(value) : serialized;
    } catch {
        try {
            return String(value);
        } catch {
            return '[Unable to display value]';
        }
    }
}

export function objectEntries(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    try {
        return Object.entries(value);
    } catch {
        return [];
    }
}

export function isDetailRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function truncateDisplayValue(value: string, maxLength = 2000) {
    return value.length <= maxLength ? value : `${value.slice(0, maxLength)}... [truncated]`;
}

export function displayAdvancedValue(value: unknown) {
    return truncateDisplayValue(displayActionValue(value));
}

export function formatActivityType(value?: string | null) {
    return value
        ? String(value).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[._-]+/g, ' ').toLowerCase().replace(/\b\w/g, char => char.toUpperCase())
        : 'Activity';
}

export function actionTimestamp(action: TaskAction) {
    const time = new Date(action.createdAt || 0).getTime();
    return Number.isFinite(time) ? time : 0;
}

export function actionKey(action: TaskAction, index: number) {
    return action.id ?? `${action.actionType || 'activity'}-${actionTimestamp(action)}-${index}`;
}

export function isTaskModalDebugEnabled() {
    if (typeof window === 'undefined') return false;
    try {
        return window.sessionStorage.getItem(TASK_MODAL_DEBUG_KEY) === '1'
            || new URLSearchParams(window.location.search).get('debugTaskModal') === '1';
    } catch {
        return false;
    }
}

export function logTaskModalDebugFlat(label: string, payload: unknown) {
    if (!isTaskModalDebugEnabled()) return;
    try {
        clientLogger.info(`[TaskModalDebugFlat] ${label} ${JSON.stringify(payload)}`);
    } catch {
        clientLogger.info(`[TaskModalDebugFlat] ${label} [payload could not be serialized]`);
    }
}

export function detailSnippet(value: unknown) {
    return truncateDisplayValue(displayActionValue(value), 500);
}

export function elementSnapshot(label: string, element: Element | null) {
    if (!element || typeof window === 'undefined') return { label, exists: false };

    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return {
        label,
        exists: true,
        rect: {
            top: Math.round(rect.top), left: Math.round(rect.left), width: Math.round(rect.width),
            height: Math.round(rect.height), bottom: Math.round(rect.bottom), right: Math.round(rect.right)
        },
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        position: style.position,
        overflow: `${style.overflowX}/${style.overflowY}`,
        scroll: {
            top: Math.round(element.scrollTop), left: Math.round(element.scrollLeft),
            height: Math.round(element.scrollHeight), width: Math.round(element.scrollWidth),
            clientHeight: Math.round(element.clientHeight), clientWidth: Math.round(element.clientWidth)
        },
        pointerEvents: style.pointerEvents,
        zIndex: style.zIndex
    };
}
