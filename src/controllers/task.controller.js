const { Task, Member, Message, User } = require('../models');

async function listTasks(req, res, next) {
    try {
        const { wineryId } = req.user;
        const { status, type, priority } = req.query;

        const whereClause = { wineryId };

        if (status) whereClause.status = status;
        if (type) whereClause.type = type;
        if (priority) whereClause.priority = priority;

        const tasks = await Task.findAll({
            where: whereClause,
            include: [
                { model: Member, attributes: ['id', 'firstName', 'lastName'] },
                // { model: Message, attributes: ['id', 'body', 'receivedAt'] } // Optional: include message
            ],
            order: [['createdAt', 'DESC']]
        });

        res.json({ tasks });
    } catch (err) {
        next(err);
    }
}

async function getTask(req, res, next) {
    try {
        const { wineryId } = req.user;
        const { id } = req.params;

        const task = await Task.findOne({
            where: { id, wineryId },
            include: [
                { model: Member },
                { model: Message },
                { model: User, as: 'Creator', attributes: ['id', 'displayName'] }
            ]
        });

        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        res.json({ task });
    } catch (err) {
        next(err);
    }
}

const executionService = require('../services/execution.service');
const { TaskAction, WinerySettings } = require('../models');

const triageService = require('../services/triage.service');

async function autoclassify(req, res, next) {
    try {
        const { wineryId, userId } = req.user;
        const { text, memberId } = req.body;

        if (!text) {
            return res.status(400).json({ error: 'Text input is required' });
        }

        const result = await triageService.classifyStaffNote({ text, memberId, wineryId, userId });
        res.json(result);
    } catch (err) {
        next(err);
    }
}

async function createTask(req, res, next) {
    const t = await Task.sequelize.transaction();
    try {
        const { wineryId, userId } = req.user;
        // extended fields
        const { category, subType, customerType, type, memberId, messageId, payload, priority, notes,
            sentiment, assigneeId, parentTaskId } = req.body;

        const task = await Task.create({
            wineryId,
            category: category || 'INTERNAL',
            subType: subType || 'INTERNAL_TASK',
            customerType: customerType || 'UNKNOWN',
            type: subType || type || 'INTERNAL_TASK',
            status: 'PENDING_REVIEW',
            priority: priority || 'normal',
            sentiment: sentiment || 'NEUTRAL', // New
            payload: payload || {},
            memberId: memberId || null,
            messageId: messageId || null,
            createdBy: userId, // Attribution rule: staff created
            updatedBy: userId, // Initial update
            assigneeId: assigneeId || null, // Optional assignment
            parentTaskId: parentTaskId || null // Optional linking
        }, { transaction: t });

        await TaskAction.create({
            taskId: task.id,
            userId: userId,
            actionType: 'MANUAL_CREATED',
            details: {
                notes,
                originalText: payload?.originalText // Capture raw input if present
            }
        }, { transaction: t });

        // Log linking action if parent exists
        if (parentTaskId) {
            await TaskAction.create({
                taskId: task.id,
                userId: userId,
                actionType: 'LINKED_TASK',
                details: { parentTaskId, childTaskId: task.id }
            }, { transaction: t });
        }

        await t.commit();
        res.status(201).json({ task });
    } catch (err) {
        await t.rollback();
        next(err);
    }
}

async function updateTask(req, res, next) {
    const t = await Task.sequelize.transaction();
    try {
        const { wineryId, userId } = req.user;
        const { id } = req.params;
        const { status, payload, priority, notes, suggestedReplyBody, category, subType,
            sentiment, assigneeId, parentTaskId } = req.body;

        const task = await Task.findOne({ where: { id, wineryId } });

        if (!task) {
            await t.rollback();
            return res.status(404).json({ error: 'Task not found' });
        }

        const changes = {};
        const oldValues = {};

        const updateField = (field, value) => {
            if (value !== undefined && value !== task[field]) {
                changes[field] = value;
                oldValues[field] = task[field];
                task[field] = value;
            }
        };

        updateField('status', status);
        updateField('priority', priority);
        updateField('category', category);
        updateField('subType', subType);
        updateField('sentiment', sentiment); // New

        // Linking change
        if (parentTaskId !== undefined && parentTaskId !== task.parentTaskId) {
            changes.parentTaskId = parentTaskId;
            oldValues.parentTaskId = task.parentTaskId;
            task.parentTaskId = parentTaskId;

            await TaskAction.create({
                taskId: task.id,
                userId: userId,
                actionType: 'LINKED_TASK',
                details: { parentTaskId, childTaskId: task.id }
            }, { transaction: t });
        }

        // Assignment change
        if (assigneeId !== undefined && assigneeId !== task.assigneeId) {
            changes.assigneeId = assigneeId;
            oldValues.assigneeId = task.assigneeId;
            task.assigneeId = assigneeId;

            await TaskAction.create({
                taskId: task.id,
                userId: userId,
                actionType: 'ASSIGNED',
                details: { from: oldValues.assigneeId, to: assigneeId }
            }, { transaction: t });
        }

        if (payload) {
            changes.payload = payload;
            oldValues.payload = task.payload;
            task.payload = payload;
        }

        task.updatedBy = userId; // Attribution rule: always update updatedBy on manual edit
        await task.save({ transaction: t });

        // Record Generic Update Action
        if (Object.keys(changes).length > 0) {
            let actionType = 'MANUAL_UPDATE';
            if (changes.status === 'APPROVED') actionType = 'APPROVED';
            if (changes.status === 'REJECTED') actionType = 'REJECTED';
            // Note: ASSIGNED and LINKED are already logged separately, but we might want a combined log or filter them out here.
            // For now, logging general updates as well is safe.

            await TaskAction.create({
                taskId: task.id,
                userId: userId,
                actionType,
                details: { changes, oldValues }
            }, { transaction: t });
        }

        if (notes) {
            await TaskAction.create({
                taskId: task.id,
                userId: userId,
                actionType: 'NOTE_ADDED',
                details: { note: notes }
            }, { transaction: t });
        }

        if (changes.status === 'APPROVED') {
            const settings = await WinerySettings.findOne({ where: { wineryId } });
            await executionService.executeTask(task, t, settings);
        }

        await t.commit();
        res.json({ task });
    } catch (err) {
        await t.rollback();
        next(err);
    }
}

module.exports = {
    listTasks,
    getTask,
    createTask,
    updateTask,
    autoclassify
};
