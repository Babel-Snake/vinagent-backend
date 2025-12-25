const { Task, Member, Message, User } = require('../models');
const { Op } = require('sequelize');
const AppError = require('../utils/AppError');

async function listTasks(req, res, next) {
    try {
        const { wineryId, role, id: userId } = req.user;
        const { status, type, priority, assignedToMe } = req.query;

        const whereClause = { wineryId };

        if (status) whereClause.status = status;
        if (type) whereClause.type = type;
        if (priority) whereClause.priority = priority;

        // RBAC: Staff can only see their assigned tasks or unassigned tasks
        if (role === 'staff') {
            whereClause[Op.or] = [
                { assigneeId: userId },
                { assigneeId: null }
            ];
        } else if (assignedToMe === 'true') {
            // Managers/Admins can filter to their own if they want
            whereClause.assigneeId = userId;
        }

        const tasks = await Task.findAll({
            where: whereClause,
            include: [
                { model: Member, attributes: ['id', 'firstName', 'lastName'] },
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
            throw new AppError('Task not found', 404, 'NOT_FOUND');
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
            return next(new AppError('Task not found', 404, 'NOT_FOUND'));
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
