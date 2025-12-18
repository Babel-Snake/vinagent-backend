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

const triageService = require('../services/triage.service');

const { validate, createTaskSchema, updateTaskSchema, autoclassifySchema } = require('../utils/validation');
const taskService = require('../services/taskService');

async function autoclassify(req, res, next) {
    try {
        const { wineryId, userId } = req.user;
        const validBody = validate(autoclassifySchema, req.body);

        const result = await triageService.classifyStaffNote({
            text: validBody.text,
            memberId: validBody.memberId,
            wineryId,
            userId
        });
        res.json(result);
    } catch (err) {
        next(err);
    }
}

async function createTask(req, res, next) {
    try {
        const { wineryId, userId } = req.user;
        const validData = validate(createTaskSchema, req.body);

        const task = await taskService.createTask({
            wineryId,
            userId,
            data: validData
        });
        res.status(201).json({ task });
    } catch (err) {
        next(err);
    }
}

async function updateTask(req, res, next) {
    try {
        const { wineryId, userId, role } = req.user;
        const { id } = req.params;
        const validUpdates = validate(updateTaskSchema, req.body);

        const task = await taskService.updateTask({
            taskId: id,
            wineryId,
            userId,
            userRole: role,
            updates: validUpdates
        });

        res.json({ task });
    } catch (err) {
        if (err.message === 'Task not found') {
            return res.status(404).json({ error: 'Task not found' });
        }
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
