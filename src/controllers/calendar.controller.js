
const { CalendarEvent, Task, User } = require('../models');
const { Op } = require('sequelize');
const logger = require('../config/logger');

// List Events
exports.listEvents = async (req, res) => {
    try {

        const { start, end } = req.query;
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const wineryId = req.user.wineryId;


        const where = { wineryId };

        if (start && end) {
            where.start = {
                [Op.gte]: new Date(start) // Events starting on/after request start
            };
            where.end = {
                [Op.lte]: new Date(end) // Events ending on/before request end
            }
            // Note: This specific logic might miss events spanning across the range boundaries.
            // Better logic for finding overlapping events:
            // (StartA <= EndB) and (EndA >= StartB)
            where[Op.and] = [
                { start: { [Op.lte]: new Date(end) } },
                { end: { [Op.gte]: new Date(start) } }
            ];
            delete where.start; // remove the previous naive check
            delete where.end;
        }


        const events = await CalendarEvent.findAll({
            where,
            include: [
                { model: Task, as: 'LinkedTask', attributes: ['id', 'status', 'category', 'subType', 'priority'] },
                { model: User, as: 'Creator', attributes: ['id', 'displayName', 'email'] }
            ],
            order: [['start', 'ASC']]
        });


        res.json(events);

    } catch (error) {
        logger.error('Error fetching calendar events:', error);

        // Temporary Debug Logging
        try {
            const fs = require('fs');
            const path = require('path');
            const logPath = path.join(__dirname, '../../debug_calendar_error.log');
            fs.appendFileSync(logPath, `[${new Date().toISOString()}] FETCH ERROR: ${error.message}\n${error.stack}\n\n`);
        } catch (e) { /* ignore */ }

        res.status(500).json({ error: 'Failed to fetch events' });
    }

};

// Create Event
exports.createEvent = async (req, res) => {
    try {

        const { title, description, start, end, allDay, type, taskId } = req.body;

        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const wineryId = req.user.wineryId;
        const createdBy = req.user.id;


        // Validation
        if (!title || !start || !end) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const event = await CalendarEvent.create({
            title,
            description,
            start,
            end,
            allDay,
            type,
            wineryId,
            createdBy,
            taskId
        });

        res.status(201).json(event);
    } catch (error) {
        logger.error('Error creating calendar event:', error);
        res.status(500).json({ error: 'Failed to create event' });
    }
};

// Update Event
exports.updateEvent = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, start, end, allDay, type, taskId } = req.body;
        const wineryId = req.user.wineryId;

        const event = await CalendarEvent.findOne({ where: { id, wineryId } });

        if (!event) {
            return res.status(404).json({ error: 'Event not found' });
        }

        await event.update({
            title,
            description,
            start,
            end,
            allDay,
            type,
            taskId
        });

        res.json(event);
    } catch (error) {
        logger.error('Error updating calendar event:', error);
        res.status(500).json({ error: 'Failed to update event' });
    }
};

// Delete Event
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
