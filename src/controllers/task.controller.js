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

module.exports = {
    listTasks,
    getTask,
    updateTaskStatus
};

const executionService = require('../services/execution.service');

async function updateTaskStatus(req, res, next) {
    const t = await Task.sequelize.transaction();
    try {
        const { wineryId, userId } = req.user;
        const { id } = req.params;
        const { status } = req.body;

        const task = await Task.findOne({ where: { id, wineryId } });

        if (!task) {
            await t.rollback();
            return res.status(404).json({ error: 'Task not found' });
        }

        // Update task
        task.status = status;
        task.updatedBy = userId;
        await task.save({ transaction: t });

        // Record Action
        const { TaskAction } = require('../models');
        await TaskAction.create({
            taskId: task.id,
            userId: userId,
            actionType: status === 'APPROVED' ? 'APPROVED' : status === 'REJECTED' ? 'REJECTED' : 'UPDATED_PAYLOAD',
            details: { newStatus: status }
        }, { transaction: t });

        // Trigger Execution if Approved
        if (status === 'APPROVED') {
            await executionService.executeTask(task, t);
        }

        await t.commit();
        res.json({ task });
    } catch (err) {
        await t.rollback();
        next(err);
    }
}
