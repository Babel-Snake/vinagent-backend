const { Task, TaskAction } = require('../models');
const logger = require('../config/logger');
const recordVisibility = require('./recordVisibility.service');

async function updateNotePrivacy({ taskId, actionId, wineryId, userId, userRole, isPrivate }) {
  const task = await Task.findOne({ where: { id: taskId, wineryId } });
  if (!task) throw new Error('Task not found');
  await recordVisibility.assertCanMutateTask(task, { wineryId, userId, userRole });

  const action = await TaskAction.findOne({
    where: { id: actionId, taskId, actionType: 'NOTE_ADDED' }
  });
  if (!action) throw new Error('Task Action not found');

  if (action.userId !== userId && userRole === 'staff') {
    const err = new Error('Only the note author or a manager can change note privacy.');
    err.statusCode = 403;
    err.code = 'FORBIDDEN';
    throw err;
  }

  const details = action.details || {};
  details.isPrivate = isPrivate;
  action.details = details;
  action.changed('details', true);
  await action.save();

  logger.info('Note privacy toggled', { actionId, taskId, isPrivate, userId });
  return action;
}

module.exports = {
  updateNotePrivacy
};
