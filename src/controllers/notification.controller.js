const { Notification, OperationalIntelligenceSignal, Project, Task } = require('../models');

function parseNotificationData(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    if (typeof value !== 'string') return {};
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

async function notificationBelongsToWinery(notification, wineryId) {
    const data = parseNotificationData(notification.data);
    if (data.wineryId !== undefined && data.wineryId !== null) {
        return Number(data.wineryId) === Number(wineryId);
    }

    const references = [
        [Task, data.taskId],
        [Project, data.projectId],
        [OperationalIntelligenceSignal, data.signalId]
    ];
    let hasTenantResource = false;
    for (const [Model, id] of references) {
        if (!id) continue;
        hasTenantResource = true;
        const resource = await Model.findOne({
            where: { id, wineryId },
            attributes: ['id']
        });
        // Fail closed for both foreign and orphaned legacy references. Their
        // notification payload may outlive the resource that established tenancy.
        if (!resource) return false;
    }
    // Notifications have no winery column, so a payload without either an
    // explicit winery or a resolvable tenant-owned resource is ambiguous.
    return hasTenantResource;
}

async function listNotifications(req, res, next) {
    try {
        const { userId, wineryId } = req.user;
        const notifications = await Notification.findAll({
            where: { userId },
            order: [['createdAt', 'DESC']],
            limit: 200
        });
        const visible = [];
        for (const notification of notifications) {
            if (await notificationBelongsToWinery(notification, wineryId)) visible.push(notification);
        }
        res.json({ notifications: visible.slice(0, 50) });
    } catch (err) {
        next(err);
    }
}

async function markRead(req, res, next) {
    try {
        const { id } = req.params;
        const { userId, wineryId } = req.user;
        const notification = await Notification.findOne({ where: { id, userId } });
        if (!notification || !(await notificationBelongsToWinery(notification, wineryId))) {
            return res.status(404).json({ error: 'Notification not found' });
        }

        notification.isRead = true;
        await notification.save();
        res.json({ notification });
    } catch (err) {
        next(err);
    }
}

async function dismissNotification(req, res, next) {
    try {
        const { id } = req.params;
        const { userId, wineryId } = req.user;
        const notification = await Notification.findOne({ where: { id, userId } });
        if (!notification || !(await notificationBelongsToWinery(notification, wineryId))) {
            return res.status(404).json({ error: 'Notification not found' });
        }

        await notification.destroy();
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
}

module.exports = { listNotifications, markRead, dismissNotification, notificationBelongsToWinery };
