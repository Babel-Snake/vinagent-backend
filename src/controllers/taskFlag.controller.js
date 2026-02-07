const { UserTaskFlag, Task } = require('../models');

async function toggleFlag(req, res, next) {
    try {
        const { userId } = req.user;
        const { taskId } = req.params;

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
        if (!UserTaskFlag) {
            console.error('CRITICAL: UserTaskFlag model is undefined!');
            return res.status(500).json({ error: 'Model UserTaskFlag not loaded' });
        }

        const { userId } = req.user;
        const flags = await UserTaskFlag.findAll({
            where: { userId },
            attributes: ['taskId']
        });
        const taskIds = flags.map(f => f.taskId);
        res.json({ taskIds });
    } catch (err) {
        console.error('Failed to list flags:', err);
        res.status(500).json({ error: err.message });
    }
}

module.exports = {
    toggleFlag,
    listFlaggedTasks
};
