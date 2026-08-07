const { Task, TaskAction, TaskStep, Member, Message, User, CalendarEvent, Notice, NoticeAcknowledgement, OperationalArea } = require('../models');
const { Op, fn, col } = require('sequelize');
const noticeService = require('../services/notice.service');
const operationalIntelligenceConfig = require('../services/operationalIntelligenceConfig.service');
const operationalIntelligenceService = require('../services/operationalIntelligence.service');

// Compute start/end dates for a given period + offset.
function getDateRange(period = 'month', offset = 0) {
    const now = new Date();
    let start;
    let end;

    switch (period) {
        case 'day':
            start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
            end = new Date(start);
            end.setDate(end.getDate() + 1);
            break;
        case 'week': {
            const day = now.getDay() || 7; // Mon=1
            const thisMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1);
            start = new Date(thisMonday);
            start.setDate(start.getDate() - offset * 7);
            end = new Date(start);
            end.setDate(end.getDate() + 7);
            break;
        }
        case 'year':
            start = new Date(now.getFullYear() - offset, 0, 1);
            end = new Date(now.getFullYear() - offset + 1, 0, 1);
            break;
        case 'month':
        default:
            start = new Date(now.getFullYear(), now.getMonth() - offset, 1);
            end = new Date(now.getFullYear(), now.getMonth() - offset + 1, 1);
            break;
    }
    return { start, end };
}

function formatPeriodLabel(period, start, end) {
    const opts = { month: 'short', year: 'numeric' };
    if (period === 'day') {
        return start.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    }
    if (period === 'week') {
        return `${start.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} - ${new Date(end.getTime() - 1).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    }
    if (period === 'year') return start.getFullYear().toString();
    return start.toLocaleDateString('en-AU', opts);
}

function toDate(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function round(value, precision = 1) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    const multiplier = 10 ** precision;
    return Math.round(numeric * multiplier) / multiplier;
}

function average(values, precision = 1) {
    const filtered = values.filter((value) => Number.isFinite(value));
    if (filtered.length === 0) return 0;
    return round(filtered.reduce((sum, value) => sum + value, 0) / filtered.length, precision);
}

function median(values, precision = 1) {
    const filtered = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
    if (filtered.length === 0) return 0;
    const middle = Math.floor(filtered.length / 2);
    const value = filtered.length % 2 === 0
        ? (filtered[middle - 1] + filtered[middle]) / 2
        : filtered[middle];
    return round(value, precision);
}

function percentage(numerator, denominator) {
    if (!denominator) return 0;
    return Math.round((numerator / denominator) * 100);
}

function diffHours(start, end) {
    const startDate = toDate(start);
    const endDate = toDate(end);
    if (!startDate || !endDate) return null;
    return (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);
}

function diffMinutes(start, end) {
    const hours = diffHours(start, end);
    return hours === null ? null : hours * 60;
}

function parseJsonLike(value) {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch {
        return {};
    }
}

function increment(map, key, amount = 1) {
    const normalizedKey = key || 'UNKNOWN';
    map.set(normalizedKey, (map.get(normalizedKey) || 0) + amount);
}

function rowsFromMap(map, keyName) {
    return Array.from(map.entries())
        .map(([key, count]) => ({ [keyName]: key, count }))
        .sort((a, b) => b.count - a.count);
}

function countBy(items, keyName, outputKey = keyName) {
    const map = new Map();
    items.forEach((item) => increment(map, item[keyName] || 'UNKNOWN'));
    return rowsFromMap(map, outputKey);
}

function getPayload(task) {
    return parseJsonLike(task?.payload);
}

function getManualIntake(task) {
    return getPayload(task).manualIntake || {};
}

function getActionDetails(action) {
    return parseJsonLike(action?.details);
}

function getAutomationMeta(task) {
    return getPayload(task).followUpAutomation || {};
}

function getTaskAgeHours(task, now, field = 'createdAt') {
    const from = task[field] || task.createdAt;
    const age = diffHours(from, now);
    return age !== null && age >= 0 ? age : null;
}

function dayNameFromDate(value) {
    const date = toDate(value);
    if (!date) return 'Unknown';
    return date.toLocaleDateString('en-AU', { weekday: 'long' });
}

function buildResponseMetrics(inboundMessages, outboundMessages) {
    const inboundByTask = new Map();

    inboundMessages.forEach((message) => {
        if (!message.taskId) return;
        const timestamp = toDate(message.receivedAt || message.createdAt);
        if (!timestamp) return;
        const existing = inboundByTask.get(message.taskId);
        if (!existing || timestamp < existing) {
            inboundByTask.set(message.taskId, timestamp);
        }
    });

    const outboundByTask = new Map();
    outboundMessages.forEach((message) => {
        if (!message.taskId) return;
        const timestamp = toDate(message.receivedAt || message.createdAt);
        if (!timestamp) return;
        if (!outboundByTask.has(message.taskId)) {
            outboundByTask.set(message.taskId, []);
        }
        outboundByTask.get(message.taskId).push(timestamp);
    });

    const firstResponseMinutes = [];
    inboundByTask.forEach((inboundAt, taskId) => {
        const firstOutbound = (outboundByTask.get(taskId) || [])
            .filter((outboundAt) => outboundAt >= inboundAt)
            .sort((a, b) => a - b)[0];
        if (firstOutbound) {
            const minutes = diffMinutes(inboundAt, firstOutbound);
            if (minutes !== null && minutes >= 0) firstResponseMinutes.push(minutes);
        }
    });

    return {
        inboundThreads: inboundByTask.size,
        respondedThreads: firstResponseMinutes.length,
        awaitingResponseThreads: Math.max(inboundByTask.size - firstResponseMinutes.length, 0),
        responseCoverageRate: percentage(firstResponseMinutes.length, inboundByTask.size),
        avgFirstResponseMinutes: average(firstResponseMinutes, 1),
        medianFirstResponseMinutes: median(firstResponseMinutes, 1)
    };
}

function buildHandoffMetrics(actions, users, periodTaskCount) {
    const userMap = new Map(users.map((user) => [Number(user.id), user.displayName || user.email || `User ${user.id}`]));
    const byRecipient = new Map();
    const tasksWithHandoffs = new Set();

    const handoffActions = actions.filter((action) => {
        const details = getActionDetails(action);
        if (action.actionType === 'ASSIGNED') return details.to !== undefined && details.to !== details.from;
        if (action.actionType === 'STEP_UPDATED') {
            return Boolean(details.changes && Object.prototype.hasOwnProperty.call(details.changes, 'ownerUserId'));
        }
        return false;
    });

    handoffActions.forEach((action) => {
        const details = getActionDetails(action);
        const taskId = action.taskId || action.Task?.id;
        if (taskId) tasksWithHandoffs.add(taskId);

        const recipientId = action.actionType === 'ASSIGNED'
            ? details.to
            : details.changes?.ownerUserId;
        const label = recipientId ? (userMap.get(Number(recipientId)) || `User ${recipientId}`) : 'Unassigned';
        increment(byRecipient, label);
    });

    return {
        total: handoffActions.length,
        tasksWithHandoffs: tasksWithHandoffs.size,
        averagePerCreatedTask: periodTaskCount ? round(handoffActions.length / periodTaskCount, 2) : 0,
        byRecipient: rowsFromMap(byRecipient, 'name')
    };
}

function buildIdentityMetrics(tasks) {
    const statuses = new Map();
    let totalExternal = 0;

    tasks.forEach((task) => {
        const intake = getManualIntake(task);
        const status = intake.identityResolutionStatus;
        const isExternal = intake.taskOrigin === 'EXTERNAL'
            || Boolean(intake.inboundMethod && intake.inboundMethod !== 'internal')
            || ['MEMBER', 'VISITOR'].includes(task.customerType);

        if (!isExternal && !status) return;
        totalExternal += 1;
        increment(statuses, status || 'UNRECORDED');
    });

    const reviewRequired = statuses.get('REVIEW_REQUIRED') || 0;
    const unresolved = (statuses.get('UNRESOLVED') || 0) + (statuses.get('UNLINKED') || 0);

    return {
        totalExternal,
        autoLinked: statuses.get('AUTO_LINKED') || 0,
        autoCreated: statuses.get('AUTO_CREATED') || 0,
        reviewRequired,
        reviewConfirmed: statuses.get('REVIEW_CONFIRMED') || 0,
        manuallyLinked: statuses.get('MANUALLY_LINKED') || 0,
        unresolved,
        reviewRate: percentage(reviewRequired, totalExternal),
        byStatus: rowsFromMap(statuses, 'status')
    };
}

function buildFollowUpMetrics(tasks) {
    const managedFollowUps = tasks.filter((task) => getAutomationMeta(task).isAutoGenerated);
    const byAutomationType = new Map();

    managedFollowUps.forEach((task) => {
        increment(byAutomationType, getAutomationMeta(task).automationType || 'UNKNOWN');
    });

    const pending = managedFollowUps.filter((task) => task.status === 'PENDING').length;
    const completed = managedFollowUps.filter((task) => task.status === 'ACTIONED').length;
    const cancelled = managedFollowUps.filter((task) => task.status === 'REJECTED' || task.workflowState === 'CANCELLED').length;

    return {
        generated: managedFollowUps.length,
        pending,
        completed,
        cancelled,
        completionRate: percentage(completed, managedFollowUps.length),
        cancellationRate: percentage(cancelled, managedFollowUps.length),
        byAutomationType: rowsFromMap(byAutomationType, 'automationType')
    };
}

function buildOperationalMetrics({
    now,
    periodTasks,
    closedTasks,
    openTasks,
    actions,
    inboundMessages,
    outboundMessages,
    users,
    followUpChildTasks,
    taskSteps
}) {
    const waitingTasks = openTasks.filter((task) => task.workflowState === 'WAITING' || (task.waitingOn && task.waitingOn !== 'NONE'));
    const blockedTasks = openTasks.filter((task) => task.workflowState === 'BLOCKED');
    const overdueTasks = openTasks.filter((task) => {
        const dueAt = toDate(task.dueAt);
        return dueAt && dueAt < now;
    });
    const dueSoonCutoff = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    const dueSoonTasks = openTasks.filter((task) => {
        const dueAt = toDate(task.dueAt);
        return dueAt && dueAt >= now && dueAt <= dueSoonCutoff;
    });

    const resolutionHours = closedTasks
        .map((task) => diffHours(task.createdAt, task.resolvedAt || task.updatedAt))
        .filter((value) => value !== null && value >= 0);

    const openAges = openTasks.map((task) => getTaskAgeHours(task, now)).filter((value) => value !== null);
    const waitingAges = waitingTasks.map((task) => getTaskAgeHours(task, now, 'updatedAt')).filter((value) => value !== null);
    const blockedAges = blockedTasks.map((task) => getTaskAgeHours(task, now, 'updatedAt')).filter((value) => value !== null);

    const reopenedCount = actions.filter((action) => {
        const details = getActionDetails(action);
        return details.changes?.status === 'PENDING'
            && ['ACTIONED', 'REJECTED'].includes(details.oldValues?.status);
    }).length;

    return {
        workflow: {
            currentByState: countBy(openTasks, 'workflowState', 'workflowState'),
            currentByWaitingOn: countBy(waitingTasks, 'waitingOn', 'waitingOn'),
            stepStatus: countBy(taskSteps, 'status', 'status'),
            currentWaiting: waitingTasks.length,
            currentBlocked: blockedTasks.length,
            overdueTasks: overdueTasks.length,
            dueSoonTasks: dueSoonTasks.length,
            staleOpenTasks: openTasks.filter((task) => (getTaskAgeHours(task, now) || 0) > 72).length,
            staleWaitingTasks: waitingTasks.filter((task) => (getTaskAgeHours(task, now, 'updatedAt') || 0) > 48).length,
            staleBlockedTasks: blockedTasks.filter((task) => (getTaskAgeHours(task, now, 'updatedAt') || 0) > 24).length
        },
        timing: {
            avgResolutionHours: average(resolutionHours, 1),
            medianResolutionHours: median(resolutionHours, 1),
            avgOpenAgeHours: average(openAges, 1),
            avgWaitingAgeHours: average(waitingAges, 1),
            avgBlockedAgeHours: average(blockedAges, 1),
            reopenedTasks: reopenedCount
        },
        response: buildResponseMetrics(inboundMessages, outboundMessages),
        handoffs: buildHandoffMetrics(actions, users, periodTasks.length),
        identity: buildIdentityMetrics(periodTasks),
        followUps: buildFollowUpMetrics(followUpChildTasks)
    };
}

async function getAnalytics(req, res, next) {
    try {
        const { wineryId } = req.user;
        const period = req.query.period || 'month';
        const offset = parseInt(req.query.offset) || 0;

        const { start, end } = getDateRange(period, offset);
        const periodFilter = { [Op.gte]: start, [Op.lt]: end };
        const label = formatPeriodLabel(period, start, end);

        const [
            openTaskCount,
            resolvedInPeriod,
            newCustomersInPeriod,
            totalCustomers,
            wineClubCount,
            revenueTracked,
            inboundMessagesInPeriod,
            tasksByStatus,
            tasksByCategory,
            tasksBySentiment,
            tasksByPriority,
            tasksOverTime,
            tasksByResolvedAs,
            tasksByResolutionType,
            tasksByCustomerOutcome,
            followUpRequiredCount,
            customersBySource,
            customersByLoyalty,
            topCustomersBySpend,
            customerTypeRatio,
            tasksByStaff,
            messagesByChannel,
            messagesByDirection,
            bookingTasksInPeriod,
            calendarEventsInPeriod,
            bookingTasksForDay,
            periodTaskDetails,
            closedTaskDetails,
            openTaskDetails,
            taskActionsInPeriod,
            inboundThreadMessages,
            staffUsers,
            followUpChildTasks,
            taskStepsInPeriod
        ] = await Promise.all([
            Task.count({ where: { wineryId, status: { [Op.in]: ['PENDING'] } } }),
            Task.count({ where: { wineryId, status: { [Op.in]: ['ACTIONED', 'REJECTED'] }, resolvedAt: periodFilter } }),
            Member.count({ where: { wineryId, createdAt: periodFilter } }),
            Member.count({ where: { wineryId } }),
            Member.count({ where: { wineryId, isWineClubMember: true } }),
            Member.sum('lifetimeSpend', { where: { wineryId } }),
            Message.count({ where: { wineryId, direction: 'inbound', createdAt: periodFilter } }),

            Task.findAll({
                where: { wineryId, createdAt: periodFilter },
                attributes: ['status', [fn('COUNT', col('id')), 'count']],
                group: ['status'], raw: true
            }),
            Task.findAll({
                where: { wineryId, createdAt: periodFilter, category: { [Op.not]: null } },
                attributes: ['category', [fn('COUNT', col('id')), 'count']],
                group: ['category'], raw: true
            }),
            Task.findAll({
                where: { wineryId, createdAt: periodFilter, sentiment: { [Op.not]: null } },
                attributes: ['sentiment', [fn('COUNT', col('id')), 'count']],
                group: ['sentiment'], raw: true
            }),
            Task.findAll({
                where: { wineryId, createdAt: periodFilter },
                attributes: ['priority', [fn('COUNT', col('id')), 'count']],
                group: ['priority'], raw: true
            }),
            Task.findAll({
                where: { wineryId, createdAt: periodFilter },
                attributes: [
                    [fn('DATE', col('createdAt')), 'date'],
                    [fn('COUNT', col('id')), 'count']
                ],
                group: [fn('DATE', col('createdAt'))],
                order: [[fn('DATE', col('createdAt')), 'ASC']],
                raw: true
            }),
            Task.findAll({
                where: { wineryId, resolvedAt: periodFilter, resolvedAs: { [Op.not]: null } },
                attributes: ['resolvedAs', [fn('COUNT', col('id')), 'count']],
                group: ['resolvedAs'], raw: true
            }),
            Task.findAll({
                where: { wineryId, resolvedAt: periodFilter, resolutionType: { [Op.not]: null } },
                attributes: ['resolutionType', [fn('COUNT', col('id')), 'count']],
                group: ['resolutionType'], raw: true
            }),
            Task.findAll({
                where: { wineryId, resolvedAt: periodFilter, customerOutcome: { [Op.not]: null } },
                attributes: ['customerOutcome', [fn('COUNT', col('id')), 'count']],
                group: ['customerOutcome'], raw: true
            }),
            Task.count({
                where: {
                    wineryId,
                    resolvedAt: periodFilter,
                    followUpRequired: true
                }
            }),

            Member.findAll({
                where: { wineryId, source: { [Op.not]: null } },
                attributes: ['source', [fn('COUNT', col('id')), 'count']],
                group: ['source'], raw: true
            }),
            Member.findAll({
                where: { wineryId },
                attributes: ['loyaltyTier', [fn('COUNT', col('id')), 'count']],
                group: ['loyaltyTier'], raw: true
            }),
            Member.findAll({
                where: { wineryId },
                attributes: ['id', 'firstName', 'lastName', 'email', 'lifetimeSpend', 'totalOrders', 'loyaltyTier'],
                order: [['lifetimeSpend', 'DESC']],
                limit: 10, raw: true
            }),
            Member.findAll({
                where: { wineryId },
                attributes: ['isWineClubMember', [fn('COUNT', col('id')), 'count']],
                group: ['isWineClubMember'], raw: true
            }),

            Task.findAll({
                where: { wineryId, assigneeId: { [Op.not]: null }, createdAt: periodFilter },
                attributes: ['assigneeId', [fn('COUNT', col('Task.id')), 'total']],
                include: [{ model: User, as: 'Assignee', attributes: ['displayName'] }],
                group: ['assigneeId', 'Assignee.id'],
                raw: true, nest: true
            }),

            Message.findAll({
                where: { wineryId, createdAt: periodFilter },
                attributes: ['source', [fn('COUNT', col('id')), 'count']],
                group: ['source'], raw: true
            }),
            Message.findAll({
                where: { wineryId, createdAt: periodFilter },
                attributes: ['direction', [fn('COUNT', col('id')), 'count']],
                group: ['direction'], raw: true
            }),

            Task.count({ where: { wineryId, category: 'BOOKING', createdAt: periodFilter } }),
            CalendarEvent.count({ where: { wineryId, start: periodFilter } }),
            Task.findAll({
                where: { wineryId, category: 'BOOKING', createdAt: periodFilter },
                attributes: ['createdAt'],
                raw: true
            }),

            Task.findAll({
                where: { wineryId, createdAt: periodFilter },
                attributes: [
                    'id', 'status', 'workflowState', 'waitingOn', 'category', 'subType', 'customerType',
                    'payload', 'createdAt', 'updatedAt', 'dueAt', 'resolvedAt', 'resolvedAs',
                    'resolutionType', 'customerOutcome', 'parentTaskId'
                ],
                raw: true
            }),
            Task.findAll({
                where: {
                    wineryId,
                    status: { [Op.in]: ['ACTIONED', 'REJECTED'] },
                    resolvedAt: periodFilter
                },
                attributes: [
                    'id', 'status', 'createdAt', 'updatedAt', 'resolvedAt', 'resolvedAs',
                    'resolutionType', 'customerOutcome'
                ],
                raw: true
            }),
            Task.findAll({
                where: { wineryId, status: 'PENDING' },
                attributes: [
                    'id', 'status', 'workflowState', 'waitingOn', 'createdAt', 'updatedAt',
                    'dueAt', 'assigneeId', 'priority'
                ],
                raw: true
            }),
            TaskAction.findAll({
                where: { createdAt: periodFilter },
                include: [{ model: Task, attributes: ['id', 'wineryId', 'assigneeId'], where: { wineryId } }],
                raw: true,
                nest: true
            }),
            Message.findAll({
                where: {
                    wineryId,
                    direction: 'inbound',
                    taskId: { [Op.not]: null },
                    createdAt: periodFilter
                },
                attributes: ['id', 'taskId', 'receivedAt', 'createdAt'],
                raw: true
            }),
            User.findAll({
                where: { wineryId },
                attributes: ['id', 'displayName', 'email'],
                raw: true
            }),
            Task.findAll({
                where: {
                    wineryId,
                    parentTaskId: { [Op.not]: null },
                    createdAt: periodFilter
                },
                attributes: ['id', 'status', 'workflowState', 'payload', 'createdAt', 'updatedAt', 'parentTaskId'],
                raw: true
            }),
            TaskStep.findAll({
                where: { createdAt: periodFilter },
                attributes: ['id', 'status', 'waitingOn', 'stepType', 'createdAt'],
                include: [{ model: Task, attributes: ['id'], where: { wineryId } }],
                raw: true,
                nest: true
            })
        ]);

        const inboundTaskIds = Array.from(new Set(inboundThreadMessages.map((message) => message.taskId).filter(Boolean)));
        const outboundThreadMessages = inboundTaskIds.length > 0
            ? await Message.findAll({
                where: {
                    wineryId,
                    direction: 'outbound',
                    taskId: { [Op.in]: inboundTaskIds }
                },
                attributes: ['id', 'taskId', 'receivedAt', 'createdAt'],
                raw: true
            })
            : [];

        const bookingDayCounts = new Map();
        bookingTasksForDay.forEach((task) => increment(bookingDayCounts, dayNameFromDate(task.createdAt)));
        const bookingsByDay = rowsFromMap(bookingDayCounts, 'dayName');

        const staffMetrics = await Promise.all(
            tasksByStaff.map(async (s) => {
                const resolved = await Task.count({
                    where: {
                        wineryId,
                        assigneeId: s.assigneeId,
                        status: { [Op.in]: ['ACTIONED', 'REJECTED'] },
                        resolvedAt: periodFilter
                    }
                });
                const total = parseInt(s.total, 10) || 0;
                return {
                    name: s.Assignee?.displayName || 'Unknown',
                    total,
                    resolved,
                    rate: total > 0 ? Math.round((resolved / total) * 100) : 0
                };
            })
        );

        const operations = buildOperationalMetrics({
            now: new Date(),
            periodTasks: periodTaskDetails,
            closedTasks: closedTaskDetails,
            openTasks: openTaskDetails,
            actions: taskActionsInPeriod,
            inboundMessages: inboundThreadMessages,
            outboundMessages: outboundThreadMessages,
            users: staffUsers,
            followUpChildTasks,
            taskSteps: taskStepsInPeriod
        });

        const requiredNotices = await Notice.findAll({
            where: { wineryId, requiresAcknowledgement: true, createdAt: periodFilter },
            include: [{
                model: OperationalArea,
                as: 'OperationalAreas',
                attributes: ['id', 'name'],
                through: { attributes: [] },
                required: false
            }]
        });
        await noticeService.attachAcknowledgementState(requiredNotices, { wineryId, userId: req.user.id });
        const acknowledgementStates = requiredNotices.map(notice => notice.getDataValue('acknowledgement') || {});
        const expectedAcknowledgements = acknowledgementStates.reduce((sum, state) => sum + (state.expectedCount || 0), 0);
        const completedAcknowledgements = acknowledgementStates.reduce((sum, state) => sum + (state.acknowledgedCount || 0), 0);
        operations.acknowledgements = {
            requiredNotices: requiredNotices.length,
            fullyAcknowledgedNotices: acknowledgementStates.filter(state => state.outstandingCount === 0).length,
            overdueNotices: acknowledgementStates.filter(state => state.isOverdue).length,
            expectedAcknowledgements,
            completedAcknowledgements,
            outstandingAcknowledgements: Math.max(expectedAcknowledgements - completedAcknowledgements, 0),
            completionRate: percentage(completedAcknowledgements, expectedAcknowledgements),
            acknowledgementsThisPeriod: await NoticeAcknowledgement.count({ where: { wineryId, acknowledgedAt: periodFilter } })
        };
        operations.intelligence = await operationalIntelligenceService.getOperationalIntelligence({
            wineryId,
            start,
            end,
            now: new Date()
        });
        const intelligenceConfig = await operationalIntelligenceConfig.getConfigForWinery(wineryId);
        operations.intelligence.suggestedSignals = operationalIntelligenceService.buildSuggestedSignalInputs({
            intelligence: operations.intelligence,
            acknowledgements: operations.acknowledgements,
            start,
            end,
            config: intelligenceConfig
        });

        res.json({
            period: { type: period, offset, label, start, end },
            kpis: {
                openTasks: openTaskCount,
                resolvedInPeriod,
                followUpsMarked: followUpRequiredCount,
                newCustomers: newCustomersInPeriod,
                totalCustomers,
                wineClubMembers: wineClubCount,
                revenueTracked: parseFloat(revenueTracked) || 0,
                inboundMessages: inboundMessagesInPeriod
            },
            tasks: {
                byStatus: tasksByStatus,
                byCategory: tasksByCategory,
                bySentiment: tasksBySentiment,
                byPriority: tasksByPriority,
                overTime: tasksOverTime,
                outcomes: {
                    byResolvedAs: tasksByResolvedAs,
                    byResolutionType: tasksByResolutionType,
                    byCustomerOutcome: tasksByCustomerOutcome
                }
            },
            customers: {
                bySource: customersBySource,
                byLoyalty: customersByLoyalty,
                topBySpend: topCustomersBySpend,
                typeRatio: customerTypeRatio
            },
            staff: staffMetrics,
            communication: {
                byChannel: messagesByChannel,
                byDirection: messagesByDirection
            },
            bookings: {
                taskCount: bookingTasksInPeriod,
                eventCount: calendarEventsInPeriod,
                byDay: bookingsByDay
            },
            operations
        });
    } catch (err) {
        next(err);
    }
}

module.exports = { getAnalytics };
