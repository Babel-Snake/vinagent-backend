const taskService = require('../services/taskService');
const triageService = require('../services/triage.service');
const AppError = require('../utils/AppError');
const {
    validate,
    createTaskSchema,
    updateTaskSchema,
    taskStepCreateSchema,
    taskStepUpdateSchema,
    autoclassifySchema
} = require('../utils/validation');

async function listTasks(req, res, next) {
    try {
        const { wineryId, role, id: userId } = req.user;
        const { status, type, priority, assignedToMe, category, sentiment, assigneeId, createdById, search, dateFrom, dateTo, sortBy, showOnlyFlagged, mentionedMe, actionedById, page, pageSize } = req.query;

        const result = await taskService.getTasksForWinery({
            wineryId,
            userId,
            userRole: role,
            filters: { status, type, priority, assignedToMe, category, sentiment, assigneeId, createdById, search, dateFrom, dateTo, sortBy, showOnlyFlagged, mentionedMe, actionedById },
            pagination: { page, pageSize }
        });

        res.json({
            tasks: result.tasks,
            pagination: result.pagination
        });
    } catch (err) {
        next(err);
    }
}

async function getTask(req, res, next) {
    try {
        const { wineryId } = req.user;
        const { id } = req.params;

        const task = await taskService.getTaskById({ taskId: id, wineryId });

        res.json({ task });
    } catch (err) {
        next(err);
    }
}

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

async function updateNotePrivacy(req, res, next) {
    try {
        const { wineryId, userId, role } = req.user;
        const { id, actionId } = req.params;
        const { updateTaskNoteSchema } = require('../utils/validation');
        const validUpdates = validate(updateTaskNoteSchema, req.body);

        const action = await taskService.updateNotePrivacy({
            taskId: id,
            actionId,
            wineryId,
            userId,
            userRole: role,
            isPrivate: validUpdates.isPrivate
        });

        res.json({ action });
    } catch (err) {
        if (err.message === 'Task Action not found') {
            return next(new AppError('Note not found', 404, 'NOT_FOUND'));
        }
        next(err);
    }
}

async function createTaskStep(req, res, next) {
    try {
        const { wineryId, userId } = req.user;
        const { id } = req.params;
        const validData = validate(taskStepCreateSchema, req.body);

        const step = await taskService.createTaskStep({
            taskId: id,
            wineryId,
            userId,
            data: validData
        });

        res.status(201).json({ step });
    } catch (err) {
        if (err.message === 'Task not found') {
            return next(new AppError('Task not found', 404, 'NOT_FOUND'));
        }
        next(err);
    }
}

async function updateTaskStep(req, res, next) {
    try {
        const { wineryId, userId, role } = req.user;
        const { id, stepId } = req.params;
        const validUpdates = validate(taskStepUpdateSchema, req.body);

        const step = await taskService.updateTaskStep({
            taskId: id,
            stepId,
            wineryId,
            userId,
            userRole: role,
            updates: validUpdates
        });

        res.json({ step });
    } catch (err) {
        if (err.message === 'Task not found') {
            return next(new AppError('Task not found', 404, 'NOT_FOUND'));
        }
        if (err.message === 'Task step not found') {
            return next(new AppError('Task step not found', 404, 'NOT_FOUND'));
        }
        next(err);
    }
}

async function deleteTaskStep(req, res, next) {
    try {
        const { wineryId, userId } = req.user;
        const { id, stepId } = req.params;

        await taskService.deleteTaskStep({
            taskId: id,
            stepId,
            wineryId,
            userId
        });

        res.json({ success: true });
    } catch (err) {
        if (err.message === 'Task not found') {
            return next(new AppError('Task not found', 404, 'NOT_FOUND'));
        }
        if (err.message === 'Task step not found') {
            return next(new AppError('Task step not found', 404, 'NOT_FOUND'));
        }
        next(err);
    }
}

module.exports = {
    listTasks,
    getTask,
    createTask,
    updateTask,
    autoclassify,
    updateNotePrivacy,
    createTaskStep,
    updateTaskStep,
    deleteTaskStep
};
