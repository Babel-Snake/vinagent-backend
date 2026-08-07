function plain(record) {
  return record?.toJSON ? record.toJSON() : record;
}

function time(value) {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function isTaskComplete(task) {
  return plain(task)?.workflowState === 'COMPLETED';
}

function isTaskCancelled(task) {
  return plain(task)?.workflowState === 'CANCELLED';
}

function sortByDue(left, right) {
  const leftDue = time(left.source?.dueAt || left.source?.start) ?? Number.MAX_SAFE_INTEGER;
  const rightDue = time(right.source?.dueAt || right.source?.start) ?? Number.MAX_SAFE_INTEGER;
  if (leftDue !== rightDue) return leftDue - rightDue;
  if (Number(left.link?.sortOrder || 0) !== Number(right.link?.sortOrder || 0)) {
    return Number(left.link?.sortOrder || 0) - Number(right.link?.sortOrder || 0);
  }
  return Number(left.link?.id || 0) - Number(right.link?.id || 0);
}

function nextActionFromEntry(entry, reason) {
  if (!entry) return null;
  return {
    reason,
    itemType: entry.itemType,
    itemId: entry.source.id,
    title: entry.source.title,
    dueAt: entry.source.dueAt || entry.source.start || null,
    owner: entry.source.owner || null,
    involvement: entry.source.involvement || null,
    href: entry.source.href
  };
}

function buildProjectSummary({ project, itemEntries = [], dependencies = [], now = new Date() }) {
  const value = plain(project) || {};
  const nowTime = now.getTime();
  const tasks = itemEntries.filter(entry => entry.itemType === 'TASK');
  const requiredTasks = tasks.filter(entry => Boolean(entry.link.isRequired));
  const completedRequiredTasks = requiredTasks.filter(entry => isTaskComplete(entry.rawSource));
  const incompleteRequiredTasks = requiredTasks.filter(entry => !isTaskComplete(entry.rawSource));
  const requiredTaskIds = new Set(requiredTasks.map(entry => Number(entry.source.id)));

  const unresolvedDependencies = dependencies.filter(dependency => {
    const dep = plain(dependency);
    const blockingTask = dep.BlockingTask || dep.blockingTask;
    const blockedTask = dep.BlockedTask || dep.blockedTask;
    return blockingTask && blockedTask && !isTaskComplete(blockingTask) && !isTaskComplete(blockedTask) && !isTaskCancelled(blockedTask);
  });
  const dependencyBlockedTaskIds = new Set(
    unresolvedDependencies
      .map(dependency => Number(plain(dependency).blockedTaskId))
      .filter(taskId => requiredTaskIds.has(taskId))
  );

  const explicitlyBlocked = incompleteRequiredTasks.filter(entry => plain(entry.rawSource).workflowState === 'BLOCKED');
  const blockedTaskIds = new Set([
    ...explicitlyBlocked.map(entry => Number(entry.source.id)),
    ...dependencyBlockedTaskIds
  ]);
  const blockedTasks = incompleteRequiredTasks.filter(entry => blockedTaskIds.has(Number(entry.source.id)));

  const overdueTasks = incompleteRequiredTasks.filter(entry => {
    const dueAt = time(plain(entry.rawSource).dueAt);
    return dueAt !== null && dueAt < nowTime;
  });
  const pendingRequests = itemEntries.filter(entry => entry.itemType === 'REQUEST' && plain(entry.rawSource).status === 'PENDING');
  const overdueRequests = pendingRequests.filter(entry => {
    const dueAt = time(plain(entry.rawSource).dueAt);
    return dueAt !== null && dueAt < nowTime;
  });

  const upcomingMilestones = itemEntries
    .filter(entry => Boolean(entry.link.isMilestone))
    .filter(entry => {
      const dueAt = time(entry.source.dueAt || entry.source.start);
      return dueAt !== null && dueAt >= nowTime;
    })
    .sort(sortByDue);
  const upcomingEvents = itemEntries
    .filter(entry => entry.itemType === 'CALENDAR_EVENT')
    .filter(entry => {
      const start = time(entry.source.start);
      return start !== null && start >= nowTime;
    })
    .sort(sortByDue);

  const targetTime = time(value.targetEndAt);
  const isOpen = !['COMPLETED', 'CANCELLED'].includes(value.status);
  const isPastTarget = Boolean(isOpen && targetTime !== null && targetTime < nowTime);
  const progressPercent = requiredTasks.length === 0
    ? null
    : Math.round((completedRequiredTasks.length / requiredTasks.length) * 100);
  const closeToTarget = Boolean(
    isOpen
    && targetTime !== null
    && targetTime >= nowTime
    && targetTime - nowTime <= 7 * 24 * 60 * 60 * 1000
    && (progressPercent === null || progressPercent < 80)
  );
  const isAtRisk = Boolean(value.riskReason || closeToTarget);

  let health = null;
  if (isOpen) {
    if (blockedTasks.length > 0) health = 'BLOCKED';
    else if (isPastTarget || overdueTasks.length > 0 || overdueRequests.length > 0) health = 'OVERDUE';
    else if (isAtRisk) health = 'AT_RISK';
    else health = 'ON_TRACK';
  }

  const unresolvedDependencyEntry = incompleteRequiredTasks
    .filter(entry => dependencyBlockedTaskIds.has(Number(entry.source.id)))
    .sort(sortByDue)[0];
  const blockedEntry = explicitlyBlocked.sort(sortByDue)[0];
  const overdueRequest = [...overdueRequests].sort(sortByDue)[0];
  const overdueTask = [...overdueTasks].sort(sortByDue)[0];
  const nextRequest = [...pendingRequests].sort(sortByDue)[0];
  const nextRequiredTask = [...incompleteRequiredTasks]
    .filter(entry => !blockedTaskIds.has(Number(entry.source.id)))
    .sort(sortByDue)[0];

  const nextAction = nextActionFromEntry(unresolvedDependencyEntry, 'DEPENDENCY_BLOCKED')
    || nextActionFromEntry(blockedEntry, 'BLOCKED')
    || nextActionFromEntry(overdueRequest, 'OVERDUE_DECISION')
    || nextActionFromEntry(overdueTask, 'OVERDUE_TASK')
    || nextActionFromEntry(nextRequest, 'PENDING_DECISION')
    || nextActionFromEntry(nextRequiredTask, 'REQUIRED_TASK')
    || nextActionFromEntry(upcomingMilestones[0], 'UPCOMING_MILESTONE');

  return {
    health,
    progressPercent,
    requiredTaskCount: requiredTasks.length,
    completedRequiredTaskCount: completedRequiredTasks.length,
    incompleteRequiredTaskCount: incompleteRequiredTasks.length,
    blockedTaskCount: blockedTasks.length,
    overdueTaskCount: overdueTasks.length,
    pendingDecisionCount: pendingRequests.length,
    overdueDecisionCount: overdueRequests.length,
    unresolvedDependencyCount: unresolvedDependencies.length,
    isPastTarget,
    isAtRisk,
    upcomingMilestone: upcomingMilestones[0]
      ? { itemType: upcomingMilestones[0].itemType, ...upcomingMilestones[0].source }
      : null,
    upcomingEvents: upcomingEvents.slice(0, 5).map(entry => ({ itemType: entry.itemType, ...entry.source })),
    nextAction,
    attention: {
      blockedTasks: blockedTasks.map(entry => entry.source),
      overdueTasks: overdueTasks.map(entry => entry.source),
      pendingDecisions: pendingRequests.map(entry => entry.source),
      unresolvedDependencies: unresolvedDependencies.map(dependency => {
        const dep = plain(dependency);
        return {
          id: dep.id,
          blockingTaskId: dep.blockingTaskId,
          blockedTaskId: dep.blockedTaskId
        };
      })
    }
  };
}

module.exports = {
  buildProjectSummary,
  isTaskComplete
};
