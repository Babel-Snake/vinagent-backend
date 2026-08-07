function plain(record) {
  return record?.toJSON ? record.toJSON() : record;
}

function sameUser(left, right) {
  return Boolean(left && right && Number(left) === Number(right));
}

function areaIdsFor(record) {
  const value = plain(record) || {};
  return [...new Set([
    ...(value.OperationalAreas || []).map(area => Number(area.id)),
    ...(value.primaryAreaId ? [Number(value.primaryAreaId)] : []),
    ...(value.linkedAreaIds || []).map(Number)
  ].filter(Number.isInteger))];
}

function sharesArea(record, context) {
  const viewerAreas = new Set((context.areaIds || []).map(Number));
  return areaIdsFor(record).some(areaId => viewerAreas.has(areaId));
}

function classifyItem(itemType, record, context = {}) {
  const type = String(itemType || '').toUpperCase();
  const value = plain(record) || {};

  if (type === 'TASK') {
    if (sameUser(value.assigneeId, context.userId)) return { kind: 'DIRECT', reason: 'ASSIGNEE' };
    if ((value.TaskSteps || []).some(step => sameUser(step.ownerUserId, context.userId))) {
      return { kind: 'DIRECT', reason: 'ASSIGNEE' };
    }
  }

  if (type === 'REQUEST' && sameUser(value.requestedFromUserId, context.userId)) {
    return { kind: 'DIRECT', reason: 'REQUESTED_FROM' };
  }

  if (type === 'NOTE') {
    const recipients = value.Recipients || [];
    const recipientIds = value.recipientUserIds || recipients.map(recipient => recipient.id);
    if (recipientIds.some(userId => sameUser(userId, context.userId))) {
      return { kind: 'DIRECT', reason: 'RECIPIENT' };
    }
  }

  if (type === 'NOTICE') {
    if (value.audienceType === 'users' && (value.audienceUserIds || []).some(userId => sameUser(userId, context.userId))) {
      return { kind: 'DIRECT', reason: 'AUDIENCE' };
    }
    if (value.audienceType === 'roles' && (value.audienceRoles || []).includes(context.userRole)) {
      return { kind: 'AREA', reason: 'ROLE' };
    }
  }

  if (type === 'CALENDAR_EVENT') {
    const tasks = [...(value.LinkedTasks || []), ...(value.LinkedTask ? [value.LinkedTask] : [])];
    const notices = [...(value.LinkedNotices || []), ...(value.LinkedNotice ? [value.LinkedNotice] : [])];
    const linkedSignals = [
      ...tasks.map(task => classifyItem('TASK', task, context)),
      ...notices.map(notice => classifyItem('NOTICE', notice, context))
    ];
    if (linkedSignals.some(signal => signal?.kind === 'DIRECT')) return { kind: 'DIRECT', reason: 'LINKED_WORK' };
    if (sameUser(value.createdBy, context.userId)) return { kind: 'DIRECT', reason: 'CREATOR' };
    if (linkedSignals.some(signal => signal?.kind === 'AREA')) return { kind: 'AREA', reason: 'AREA' };
  }

  if (sharesArea(value, context)) return { kind: 'AREA', reason: 'AREA' };
  return null;
}

module.exports = { areaIdsFor, classifyItem };
