const { Task, UserTaskFlag } = require('../models');
const { NotFoundError } = require('../utils/errors');

async function toggleFlag(req, res, next) {
    try {
        const { userId, wineryId } = req.user;
        const { taskId } = req.params;
        const task = await Task.findOne({
            where: { id: taskId, wineryId },
            attributes: ['id']
        });
        if (!task) throw new NotFoundError('Task not found');

        const existing = await UserTaskFlag.findOne({
            where: { userId, taskId }
        });

        if (existing) {
            await existing.destroy();
            return res.json({ flagged: false });
        } else {
            await UserTaskFlag.create({ userId, taskId });
            return res.json({ flagged: true });
        }
    } catch (err) {
        next(err);
    }
}

async function listFlaggedTasks(req, res, next) {
    try {
        const { userId, wineryId } = req.user;
        const flags = await UserTaskFlag.findAll({
            where: { userId },
            attributes: ['taskId'],
            include: [{
                model: Task,
                where: { wineryId },
                attributes: [],
                required: true
            }]
        });
        const taskIds = flags.map(f => f.taskId);
        res.json({ taskIds });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    toggleFlag,
    listFlaggedTasks
};
