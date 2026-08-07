const {
    CalendarEvent,
    CalendarEventNotice,
    CalendarEventTask,
    Notice,
    Task,
    User
} = require('../models');
const { Op } = require('sequelize');
const logger = require('../config/logger');
const recordVisibility = require('../services/recordVisibility.service');

const LINKED_TASK_ATTRIBUTES = [
    'id',
    'status',
    'category',
    'subType',
    'priority',
    'payload',
    'wineryId',
    'areaScope',
    'createdBy',
    'assigneeId',
    'dueAt'
];
const LINKED_NOTICE_ATTRIBUTES = [
    'id',
    'title',
    'category',
    'priority',
    'isPinned',
    'effectiveFrom',
    'expiresAt',
    'archivedAt',
    'wineryId',
    'areaScope',
    'audienceType',
    'audienceRoles',
    'audienceUserIds'
];

function normalizeIdList(values, legacyValue) {
    const rawValues = Array.isArray(values) ? values : [];
    if (legacyValue !== undefined && legacyValue !== null && legacyValue !== '') {
        rawValues.push(legacyValue);
    }

    const ids = rawValues
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0);

    return Array.from(new Set(ids));
}

function buildEventInclude() {
    return [
        { model: Task, as: 'LinkedTask', attributes: LINKED_TASK_ATTRIBUTES },
        {
            model: Task,
            as: 'LinkedTasks',
            attributes: LINKED_TASK_ATTRIBUTES,
            through: { attributes: ['createdAt', 'createdBy'] },
            required: false
        },
        { model: Notice, as: 'LinkedNotice', attributes: LINKED_NOTICE_ATTRIBUTES },
        {
            model: Notice,
            as: 'LinkedNotices',
            attributes: LINKED_NOTICE_ATTRIBUTES,
            through: { attributes: ['createdAt', 'createdBy'] },
            required: false
        },
        { model: User, as: 'Creator', attributes: ['id', 'displayName', 'email'] }
    ];
}

async function assertLinkedRecords({ wineryId, taskIds, noticeIds, transaction }) {
    if (taskIds.length > 0) {
        const tasks = await Task.findAll({
            where: { id: { [Op.in]: taskIds }, wineryId },
            attributes: ['id'],
            transaction
        });
        if (tasks.length !== taskIds.length) {
            const err = new Error('One or more linked tasks were not found');
            err.statusCode = 404;
            throw err;
        }
    }

    if (noticeIds.length > 0) {
        const notices = await Notice.findAll({
            where: { id: { [Op.in]: noticeIds }, wineryId },
            attributes: ['id'],
            transaction
        });
        if (notices.length !== noticeIds.length) {
            const err = new Error('One or more linked notices were not found');
            err.statusCode = 404;
            throw err;
        }
    }
}

async function replaceEventLinks({ event, taskIds, noticeIds, wineryId, userId, transaction }) {
    await CalendarEventTask.destroy({
        where: { calendarEventId: event.id },
        transaction
    });
    await CalendarEventNotice.destroy({
        where: { calendarEventId: event.id },
        transaction
    });

    if (taskIds.length > 0) {
        await CalendarEventTask.bulkCreate(
            taskIds.map((taskId) => ({
                calendarEventId: event.id,
                taskId,
                wineryId,
                createdBy: userId
            })),
            { transaction, ignoreDuplicates: true }
        );
    }

    if (noticeIds.length > 0) {
        await CalendarEventNotice.bulkCreate(
            noticeIds.map((noticeId) => ({
                calendarEventId: event.id,
                noticeId,
                wineryId,
                createdBy: userId
            })),
            { transaction, ignoreDuplicates: true }
        );
    }
}

async function getCalendarEventById(id, wineryId) {
    return CalendarEvent.findOne({
        where: { id, wineryId },
        include: buildEventInclude()
    });
}

exports.listEvents = async (req, res) => {
    try {
        const { start, end, search, pageSize, eventId } = req.query;
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const wineryId = req.user.wineryId;
        const where = { wineryId };

        if (eventId !== undefined) {
            const parsedEventId = Number(eventId);
            if (!Number.isInteger(parsedEventId) || parsedEventId <= 0) {
                return res.status(400).json({ error: 'Invalid calendar event ID' });
            }
            where.id = parsedEventId;
        }

        if (start && end) {
            where[Op.and] = [
                { start: { [Op.lte]: new Date(end) } },
                { end: { [Op.gte]: new Date(start) } }
            ];
        }

        if (search && String(search).trim()) {
            const term = `%${String(search).trim()}%`;
            where[Op.and] = [
                ...(where[Op.and] || []),
                {
                    [Op.or]: [
                        { title: { [Op.like]: term } },
                        { description: { [Op.like]: term } }
                    ]
                }
            ];
        }

        const limit = pageSize ? Math.min(Math.max(Number(pageSize) || 20, 1), 100) : undefined;
        const events = await CalendarEvent.findAll({
            where,
            include: buildEventInclude(),
            order: [['start', 'ASC']]
        });

        const visibleEvents = [];
        for (const event of events) {
            const value = event.toJSON();
            const linkedTasks = [
                ...(value.LinkedTasks || []),
                ...(value.LinkedTask ? [value.LinkedTask] : [])
            ];
            const linkedNotices = [
                ...(value.LinkedNotices || []),
                ...(value.LinkedNotice ? [value.LinkedNotice] : [])
            ];
            const visibleTasks = [];
            for (const task of linkedTasks) {
                if (await recordVisibility.canViewTask(task, {
                    wineryId,
                    userId: req.user.id,
                    userRole: req.user.role
                })) visibleTasks.push(task);
            }
            const visibleNotices = [];
            for (const notice of linkedNotices) {
                if (await recordVisibility.canViewNotice(notice, {
                    wineryId,
                    userId: req.user.id,
                    userRole: req.user.role
                })) visibleNotices.push(notice);
            }
            const hasRestrictedLinks = linkedTasks.length > 0 || linkedNotices.length > 0;
            if (hasRestrictedLinks && visibleTasks.length === 0 && visibleNotices.length === 0) continue;
            value.LinkedTasks = visibleTasks;
            value.LinkedTask = visibleTasks[0] || null;
            value.taskId = visibleTasks[0]?.id || null;
            value.LinkedNotices = visibleNotices;
            value.LinkedNotice = visibleNotices[0] || null;
            value.noticeId = visibleNotices[0]?.id || null;
            visibleEvents.push(value);
        }

        res.json(limit ? visibleEvents.slice(0, limit) : visibleEvents);
    } catch (error) {
        logger.error('Error fetching calendar events:', error);
        res.status(500).json({ error: 'Failed to fetch events' });
    }
};

exports.createEvent = async (req, res) => {
    const transaction = await CalendarEvent.sequelize.transaction();
    try {
        const { title, description, start, end, allDay, type } = req.body;
        if (!req.user) {
            await transaction.rollback();
            return res.status(401).json({ error: 'Unauthorized' });
        }

        if (!title || !start || !end) {
            await transaction.rollback();
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const wineryId = req.user.wineryId;
        const createdBy = req.user.id;
        const taskIds = normalizeIdList(req.body.taskIds, req.body.taskId);
        const noticeIds = normalizeIdList(req.body.noticeIds, req.body.noticeId);

        await assertLinkedRecords({ wineryId, taskIds, noticeIds, transaction });

        const event = await CalendarEvent.create({
            title,
            description,
            start,
            end,
            allDay,
            type,
            wineryId,
            createdBy,
            taskId: taskIds[0] || null,
            noticeId: noticeIds[0] || null
        }, { transaction });

        await replaceEventLinks({ event, taskIds, noticeIds, wineryId, userId: createdBy, transaction });
        await transaction.commit();

        const eventWithLinks = await getCalendarEventById(event.id, wineryId);
        res.status(201).json(eventWithLinks);
    } catch (error) {
        if (!transaction.finished) await transaction.rollback();
        logger.error('Error creating calendar event:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'Failed to create event' });
    }
};

exports.updateEvent = async (req, res) => {
    const transaction = await CalendarEvent.sequelize.transaction();
    try {
        const { id } = req.params;
        const { title, description, start, end, allDay, type } = req.body;
        const wineryId = req.user.wineryId;
        const userId = req.user.id;

        const event = await CalendarEvent.findOne({ where: { id, wineryId }, transaction });
        if (!event) {
            await transaction.rollback();
            return res.status(404).json({ error: 'Event not found' });
        }

        const taskIds = normalizeIdList(req.body.taskIds, req.body.taskId);
        const noticeIds = normalizeIdList(req.body.noticeIds, req.body.noticeId);
        await assertLinkedRecords({ wineryId, taskIds, noticeIds, transaction });

        await event.update({
            title,
            description,
            start,
            end,
            allDay,
            type,
            taskId: taskIds[0] || null,
            noticeId: noticeIds[0] || null
        }, { transaction });

        await replaceEventLinks({ event, taskIds, noticeIds, wineryId, userId, transaction });
        await transaction.commit();

        const eventWithLinks = await getCalendarEventById(event.id, wineryId);
        res.json(eventWithLinks);
    } catch (error) {
        if (!transaction.finished) await transaction.rollback();
        logger.error('Error updating calendar event:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'Failed to update event' });
    }
};

exports.deleteEvent = async (req, res) => {
    try {
        const { id } = req.params;
        const wineryId = req.user.wineryId;

        const event = await CalendarEvent.findOne({ where: { id, wineryId } });
        if (!event) {
            return res.status(404).json({ error: 'Event not found' });
        }

        await event.destroy();
        res.json({ message: 'Event deleted successfully' });
    } catch (error) {
        logger.error('Error deleting calendar event:', error);
        res.status(500).json({ error: 'Failed to delete event' });
    }
};
