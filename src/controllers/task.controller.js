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

async function createTask(req, res, next) {
    const t = await Task.sequelize.transaction();
    try {
        const { wineryId, userId } = req.user;
        const { category, subType, customerType, type, memberId, messageId, payload, priority, notes } = req.body;

        const task = await Task.create({
            wineryId,
            // Use provided fields or fallback
            category: category || 'INTERNAL',
            subType: subType || 'INTERNAL_TASK',
            customerType: customerType || 'UNKNOWN',
            type: subType || type || 'INTERNAL_TASK', // Sync legacy type
            status: 'PENDING_REVIEW',
            priority: priority || 'normal',
            payload: payload || {},
            memberId: memberId || null,
            messageId: messageId || null,
            createdBy: userId // Track who created it
        }, { transaction: t });

        await TaskAction.create({
            taskId: task.id,
            userId: userId,
            actionType: 'MANUAL_CREATED',
            details: { notes }
        }, { transaction: t });

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
        const { status, payload, priority, notes, suggestedReplyBody, category, subType } = req.body;

        const task = await Task.findOne({ where: { id, wineryId } });

        if (!task) {
            await t.rollback();
            return res.status(404).json({ error: 'Task not found' });
        }

        const changes = {};
        const oldValues = {};

        // Helper to track changes
        const updateField = (field, value) => {
            if (value !== undefined && value !== task[field]) {
                changes[field] = value;
                oldValues[field] = task[field];
                task[field] = value;
            }
        };

        updateField('status', status);
        updateField('priority', priority);
        updateField('category', category); // Allow re-categorization
        updateField('subType', subType);

        if (payload) {
            // Deep compare optional but for now assume change if provided
            changes.payload = payload;
            oldValues.payload = task.payload;
            task.payload = payload;
        }

        task.updatedBy = userId;
        await task.save({ transaction: t });

        // Record Actions
        if (Object.keys(changes).length > 0) {
            // Special case for approval/rejection causing specific action types
            let actionType = 'MANUAL_UPDATE';
            if (changes.status === 'APPROVED') actionType = 'APPROVED';
            if (changes.status === 'REJECTED') actionType = 'REJECTED';

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

        // Trigger Execution if Approved (and status JUST changed to APPROVED)
        if (changes.status === 'APPROVED') {
            // Fetch settings to check if we should execute
            const settings = await WinerySettings.findOne({ where: { wineryId } });
            // Pass settings to execution service (or let service fetch it, but optimizing here)
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
    updateTask
};
