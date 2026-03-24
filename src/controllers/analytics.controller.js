const { Task, Member, Message, User, CalendarEvent } = require('../models');
const { Op, fn, col } = require('sequelize');

// Compute start/end dates for a given period + offset
function getDateRange(period = 'month', offset = 0) {
    const now = new Date();
    let start, end;

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
    if (period === 'day') return start.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    if (period === 'week') return `${start.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – ${new Date(end - 1).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    if (period === 'year') return start.getFullYear().toString();
    return start.toLocaleDateString('en-AU', opts);
}

async function getAnalytics(req, res, next) {
    try {
        const { wineryId } = req.user;
        const period = req.query.period || 'month';
        const offset = parseInt(req.query.offset) || 0;

        const { start, end } = getDateRange(period, offset);
        const periodFilter = { [Op.gte]: start, [Op.lt]: end };
        const label = formatPeriodLabel(period, start, end);

        // Fire all queries in parallel
        const [
            // KPIs (open = all-time snapshot, rest = period-scoped)
            openTaskCount,
            resolvedInPeriod,
            newCustomersInPeriod,
            totalCustomers,
            wineClubCount,
            revenueTracked,
            inboundMessagesInPeriod,

            // Task breakdowns (period-scoped)
            tasksByStatus,
            tasksByCategory,
            tasksBySentiment,
            tasksByPriority,
            tasksOverTime,

            // Customer breakdowns (all-time)
            customersBySource,
            customersByLoyalty,
            topCustomersBySpend,
            customerTypeRatio,

            // Staff (period-scoped)
            tasksByStaff,

            // Communication (period-scoped)
            messagesByChannel,
            messagesByDirection,

            // Bookings (period-scoped)
            bookingTasksInPeriod,
            calendarEventsInPeriod,
            bookingsByDay
        ] = await Promise.all([
            // --- KPIs ---
            Task.count({ where: { wineryId, status: { [Op.in]: ['PENDING'] } } }),
            Task.count({ where: { wineryId, status: { [Op.in]: ['ACTIONED', 'REJECTED'] }, updatedAt: periodFilter } }),
            Member.count({ where: { wineryId, createdAt: periodFilter } }),
            Member.count({ where: { wineryId } }),
            Member.count({ where: { wineryId, isWineClubMember: true } }),
            Member.sum('lifetimeSpend', { where: { wineryId } }),
            Message.count({ where: { wineryId, direction: 'inbound', createdAt: periodFilter } }),

            // --- Task Breakdowns (period-scoped) ---
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
            // Tasks over sub-intervals within the period
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

            // --- Customer Breakdowns (all-time) ---
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

            // --- Staff Performance (period-scoped) ---
            Task.findAll({
                where: { wineryId, assigneeId: { [Op.not]: null }, createdAt: periodFilter },
                attributes: ['assigneeId', [fn('COUNT', col('Task.id')), 'total']],
                include: [{ model: User, as: 'Assignee', attributes: ['displayName'] }],
                group: ['assigneeId', 'Assignee.id'],
                raw: true, nest: true
            }),

            // --- Communication (period-scoped) ---
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

            // --- Bookings (period-scoped) ---
            Task.count({ where: { wineryId, category: 'BOOKING', createdAt: periodFilter } }),
            CalendarEvent.count({ where: { wineryId, start: periodFilter } }),
            // Bookings by day-of-week
            Task.findAll({
                where: { wineryId, category: 'BOOKING', createdAt: periodFilter },
                attributes: [
                    [fn('DAYNAME', col('createdAt')), 'dayName'],
                    [fn('COUNT', col('id')), 'count']
                ],
                group: [fn('DAYNAME', col('createdAt'))],
                raw: true
            })
        ]);

        // Staff resolution rates (period-scoped)
        const staffMetrics = await Promise.all(
            tasksByStaff.map(async (s) => {
                const resolved = await Task.count({
                    where: { wineryId, assigneeId: s.assigneeId, status: 'EXECUTED', createdAt: periodFilter }
                });
                return {
                    name: s.Assignee?.displayName || 'Unknown',
                    total: parseInt(s.total),
                    resolved,
                    rate: s.total > 0 ? Math.round((resolved / parseInt(s.total)) * 100) : 0
                };
            })
        );

        res.json({
            period: { type: period, offset, label, start, end },
            kpis: {
                openTasks: openTaskCount,
                resolvedInPeriod,
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
                overTime: tasksOverTime
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
            }
        });
    } catch (err) {
        next(err);
    }
}

module.exports = { getAnalytics };
