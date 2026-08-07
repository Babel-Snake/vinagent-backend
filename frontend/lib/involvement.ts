import type { CalendarEvent } from './calendarApi';
import type { Notice } from './noticeTypes';
import type { OperationalRecord, OperationalRequest, UnifiedOperation } from './operationalTypes';
import type { UserProfile } from './peopleTypes';
import type { Project, ProjectItemSource } from './projectTypes';
import type { Task } from './taskTypes';

export type InvolvementKind = 'DIRECT' | 'AREA';
export type InvolvementReason =
    | 'ASSIGNEE'
    | 'REQUESTED_FROM'
    | 'RECIPIENT'
    | 'AUDIENCE'
    | 'CREATOR'
    | 'LINKED_WORK'
    | 'PROJECT_ROLE'
    | 'AREA'
    | 'ROLE';

export interface InvolvementSignal {
    kind: InvolvementKind;
    reason: InvolvementReason | string;
}

export type InvolvementViewer = Pick<UserProfile, 'id' | 'role' | 'areaIds' | 'areaMemberships'>;

type AreaBearingRecord = {
    primaryAreaId?: number | null;
    linkedAreaIds?: number[];
    OperationalAreas?: Array<{ id: number }>;
    areas?: Array<{ id: number }>;
};

function direct(reason: InvolvementReason): InvolvementSignal {
    return { kind: 'DIRECT', reason };
}

function area(reason: InvolvementReason = 'AREA'): InvolvementSignal {
    return { kind: 'AREA', reason };
}

function sameUser(left?: number | null, right?: number | null) {
    return Boolean(left && right && Number(left) === Number(right));
}

export function viewerAreaIds(viewer?: InvolvementViewer | null) {
    return [...new Set([
        ...(viewer?.areaIds || []),
        ...(viewer?.areaMemberships || []).map(membership => membership.areaId)
    ].map(Number).filter(Number.isInteger))];
}

export function recordAreaIds(record?: AreaBearingRecord | null) {
    if (!record) return [];
    return [...new Set([
        ...(record.OperationalAreas || []).map(item => item.id),
        ...(record.areas || []).map(item => item.id),
        ...(record.primaryAreaId ? [record.primaryAreaId] : []),
        ...(record.linkedAreaIds || [])
    ].map(Number).filter(Number.isInteger))];
}

function belongsToViewerArea(record: AreaBearingRecord, viewer?: InvolvementViewer | null) {
    const userAreas = new Set(viewerAreaIds(viewer));
    return recordAreaIds(record).some(areaId => userAreas.has(areaId));
}

export function taskInvolvement(task: Task, viewer?: InvolvementViewer | null): InvolvementSignal | null {
    if (sameUser(task.assigneeId, viewer?.id)) return direct('ASSIGNEE');
    if ((task.TaskSteps || []).some(step => sameUser(step.ownerUserId, viewer?.id))) return direct('ASSIGNEE');
    return belongsToViewerArea(task, viewer) ? area() : null;
}

export function requestInvolvement(item: OperationalRequest, viewer?: InvolvementViewer | null): InvolvementSignal | null {
    if (sameUser(item.requestedFromUserId, viewer?.id)) return direct('REQUESTED_FROM');
    return belongsToViewerArea(item, viewer) ? area() : null;
}

export function noteInvolvement(item: OperationalRecord, viewer?: InvolvementViewer | null): InvolvementSignal | null {
    const recipientIds = item.recipientUserIds || item.Recipients?.map(recipient => recipient.id) || [];
    if (recipientIds.some(userId => sameUser(userId, viewer?.id))) return direct('RECIPIENT');
    return belongsToViewerArea(item, viewer) ? area() : null;
}

export function noticeInvolvement(notice: Notice, viewer?: InvolvementViewer | null): InvolvementSignal | null {
    if (notice.audienceType === 'users' && (notice.audienceUserIds || []).some(userId => sameUser(userId, viewer?.id))) {
        return direct('AUDIENCE');
    }
    if (notice.audienceType === 'roles' && viewer?.role && (notice.audienceRoles || []).includes(viewer.role)) {
        return area('ROLE');
    }
    return belongsToViewerArea(notice, viewer) ? area() : null;
}

export function eventInvolvement(event: CalendarEvent, viewer?: InvolvementViewer | null): InvolvementSignal | null {
    const linkedTasks = [...(event.LinkedTasks || []), ...(event.LinkedTask ? [event.LinkedTask as Task] : [])];
    const linkedNotices = [...(event.LinkedNotices || []), ...(event.LinkedNotice ? [event.LinkedNotice as Notice] : [])];
    const linkedSignals = [
        ...linkedTasks.map(task => taskInvolvement(task, viewer)),
        ...linkedNotices.map(notice => noticeInvolvement(notice, viewer))
    ];
    if (linkedSignals.some(signal => signal?.kind === 'DIRECT')) return direct('LINKED_WORK');
    if (sameUser(event.createdBy, viewer?.id)) return direct('CREATOR');
    return linkedSignals.some(signal => signal?.kind === 'AREA') ? area() : null;
}

export function projectInvolvement(project: Project, viewer?: InvolvementViewer | null): InvolvementSignal | null {
    const directlyInvolved = Boolean(
        project.involvement?.roles?.length
        || sameUser(project.ownerUserId, viewer?.id)
        || sameUser(project.leadUserId, viewer?.id)
        || project.Participants?.some(participant => sameUser(participant.userId, viewer?.id))
    );
    if (directlyInvolved) return direct('PROJECT_ROLE');
    return belongsToViewerArea(project, viewer) ? area() : null;
}

export function projectItemInvolvement(source: Pick<ProjectItemSource, 'owner' | 'involvement'>, viewer?: InvolvementViewer | null): InvolvementSignal | null {
    if (source.involvement) return source.involvement;
    if (sameUser(source.owner?.id, viewer?.id)) return direct('ASSIGNEE');
    return null;
}

export function operationInvolvement(item: UnifiedOperation, viewer?: InvolvementViewer | null): InvolvementSignal | null {
    if (item.involvement) return item.involvement;
    if (sameUser(item.owner?.id, viewer?.id)) return direct(item.type === 'REQUEST' ? 'REQUESTED_FROM' : 'ASSIGNEE');
    return belongsToViewerArea(item, viewer) ? area() : null;
}

export function involvementLabel(signal?: InvolvementSignal | null) {
    if (!signal) return '';
    const labels: Record<string, string> = {
        ASSIGNEE: 'Assigned to you',
        REQUESTED_FROM: 'Requested from you',
        RECIPIENT: 'Directed to you',
        AUDIENCE: 'For you',
        CREATOR: 'Your event',
        LINKED_WORK: 'Your linked work',
        PROJECT_ROLE: 'Your project',
        AREA: 'Your department',
        ROLE: 'Your role'
    };
    return labels[signal.reason] || (signal.kind === 'DIRECT' ? 'Yours' : 'Your department');
}

export function involvementSurfaceClass(signal?: InvolvementSignal | null) {
    if (signal?.kind === 'DIRECT') return 'involvement-surface involvement-surface-direct';
    if (signal?.kind === 'AREA') return 'involvement-surface involvement-surface-area';
    return '';
}
