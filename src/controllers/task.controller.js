const taskService = require('../services/taskService');
const noticeService = require('../services/notice.service');
const triageService = require('../services/triage.service');
const AppError = require('../utils/AppError');
const {
    validate,
    createTaskSchema,
    updateTaskSchema,
    taskStepCreateSchema,
    taskStepUpdateSchema,
    taskStepReorderSchema,
    taskStepGenerateSuggestionSchema,
    taskStepActionSuggestionSchema,
    taskNoticeLinkSchema,
    autoclassifySchema
} = require('../utils/validation');

function inferSuggestedChannel(body = {}) {
    if (body.suggestedChannel) return body.suggestedChannel;
    if (body.inboundMethod === 'sms') return 'sms';
    if (body.inboundMethod === 'email') return 'email';
    if (body.inboundMethod === 'phone') return 'voice';
    return 'none';
}

function isEmailLike(value) {
    return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function normalizeCreateTaskBodyForValidation(body = {}) {
    const normalized = { ...body };
    const channel = inferSuggestedChannel(normalized);

    if (channel !== 'email') {
        normalized.suggestedRecipientEmail = null;
        normalized.suggestedCc = null;
        normalized.suggestedReplySubject = null;

        if (normalized.requesterEmail && !isEmailLike(normalized.requesterEmail)) {
            normalized.requesterEmail = null;
        }
    }

    return normalized;
}

function normalizeUpdateTaskBodyForValidation(body = {}) {
    const normalized = { ...body };

    if (normalized.suggestedChannel && normalized.suggestedChannel !== 'email') {
        normalized.suggestedRecipientEmail = null;
        normalized.suggestedCc = null;
        normalized.suggestedReplySubject = null;
    }

    return normalized;
}

async function listTasks(req, res, next) {
    try {
        const { wineryId, role, id: userId } = req.user;
        const { status, type, priority, assignedToMe, category, sentiment, assigneeId, createdById, search, dateFrom, dateTo, sortBy, showOnlyFlagged, mentionedMe, actionedById, deadlineState, page, pageSize } = req.query;

        const result = await taskService.getTasksForWinery({
            wineryId,
            userId,
            userRole: role,
            filters: { status, type, priority, assignedToMe, category, sentiment, assigneeId, createdById, search, dateFrom, dateTo, sortBy, showOnlyFlagged, mentionedMe, actionedById, deadlineState },
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
            userId,
            taskOrigin: validBody.taskOrigin,
            inboundMethod: validBody.inboundMethod,
            requesterName: validBody.requesterName,
            requesterEmail: validBody.requesterEmail,
            requesterPhone: validBody.requesterPhone,
            suggestedChannel: validBody.suggestedChannel
        });
        res.json(result);
    } catch (err) {
        next(err);
    }
}

async function createTask(req, res, next) {
    try {
        const { wineryId, userId, role } = req.user;
        const validData = validate(createTaskSchema, normalizeCreateTaskBodyForValidation(req.body));

        const task = await taskService.createTask({
            wineryId,
            userId,
            userRole: role,
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
        const validUpdates = validate(updateTaskSchema, normalizeUpdateTaskBodyForValidation(req.body));

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
        const { wineryId, userId, role } = req.user;
        const { id } = req.params;
        const validData = validate(taskStepCreateSchema, req.body);

        const step = await taskService.createTaskStep({
            taskId: id,
            wineryId,
            userId,
            userRole: role,
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

        if (stepId === 'reorder') {
            const validData = validate(taskStepReorderSchema, req.body);
            const steps = await taskService.reorderTaskSteps({
                taskId: id,
                wineryId,
                userId,
                userRole: role,
                stepIds: validData.stepIds
            });

            return res.json({ steps });
        }

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

async function reorderTaskSteps(req, res, next) {
    try {
        const { wineryId, userId, role } = req.user;
        const { id } = req.params;
        const validData = validate(taskStepReorderSchema, req.body);

        const steps = await taskService.reorderTaskSteps({
            taskId: id,
            wineryId,
            userId,
            userRole: role,
            stepIds: validData.stepIds
        });

        res.json({ steps });
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

async function generateTaskStepSuggestion(req, res, next) {
    try {
        const { wineryId, userId, role } = req.user;
        const { id, stepId } = req.params;
        const validOptions = validate(taskStepGenerateSuggestionSchema, req.body);

        const step = await taskService.generateTaskStepSuggestion({
            taskId: id,
            stepId,
            wineryId,
            userId,
            userRole: role,
            options: validOptions
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

async function actionTaskStepSuggestion(req, res, next) {
    try {
        const { wineryId, userId, role } = req.user;
        const { id, stepId } = req.params;
        const validData = validate(taskStepActionSuggestionSchema, req.body);

        const result = await taskService.actionTaskStepSuggestion({
            taskId: id,
            stepId,
            wineryId,
            userId,
            userRole: role,
            data: validData
        });

        res.json(result);
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
        const { wineryId, userId, role } = req.user;
        const { id, stepId } = req.params;

        await taskService.deleteTaskStep({
            taskId: id,
            stepId,
            wineryId,
            userId,
            userRole: role
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

async function linkNotice(req, res, next) {
    try {
        const { wineryId, userId, role } = req.user;
        const { id } = req.params;
        const { noticeId } = validate(taskNoticeLinkSchema, req.body);

        await noticeService.linkNoticeTask({
            noticeId,
            taskId: id,
            wineryId,
            userId,
            userRole: role
        });

        const task = await taskService.getTaskById({ taskId: id, wineryId });
        res.status(201).json({ task });
    } catch (err) {
        next(err);
    }
}

async function unlinkNotice(req, res, next) {
    try {
        const { wineryId, role } = req.user;
        const { id, noticeId } = req.params;

        await noticeService.unlinkNoticeTask({
            noticeId,
            taskId: id,
            wineryId,
            userRole: role
        });

        const task = await taskService.getTaskById({ taskId: id, wineryId });
        res.json({ task });
    } catch (err) {
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
    reorderTaskSteps,
    generateTaskStepSuggestion,
    actionTaskStepSuggestion,
    deleteTaskStep,
    linkNotice,
    unlinkNotice
};
