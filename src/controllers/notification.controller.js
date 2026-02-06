const { Notification } = require('../models');

async function listNotifications(req, res, next) {
    try {
        const { userId } = req.user;
        const notifications = await Notification.findAll({
            where: { userId },
            order: [['createdAt', 'DESC']],
            limit: 50
        });
        res.json({ notifications });
    } catch (err) {
        next(err);
    }
}

async function markRead(req, res, next) {
    try {
        const { id } = req.params;
        const { userId } = req.user;
        const notification = await Notification.findOne({ where: { id, userId } });
        if (!notification) return res.status(404).json({ error: 'Notification not found' });

        notification.isRead = true;
        await notification.save();
        res.json({ notification });
    } catch (err) {
        next(err);
    }
}

module.exports = { listNotifications, markRead };
