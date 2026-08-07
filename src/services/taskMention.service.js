const { Notification, User } = require('../models');

async function processMentions({ text, wineryId, senderId, taskId, transaction }) {
  if (!text || !text.includes('@')) return;

  const users = await User.findAll({
    where: { wineryId },
    attributes: ['id', 'displayName']
  });

  for (const user of users) {
    if (user.id === senderId || !user.displayName) continue;

    const mentionPattern = new RegExp(`@${user.displayName}\\b`, 'i');
    if (mentionPattern.test(text)) {
      await Notification.create({
        userId: user.id,
        type: 'MENTION',
        message: 'You were mentioned in a task note',
        data: { taskId }
      }, { transaction });
    }
  }
}

module.exports = {
  processMentions
};
