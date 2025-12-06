// src/services/taskService.js
// Handles Task creation, updates, and status transitions.

const logger = require('../config/logger');
// TODO: require models when implemented

async function createTaskFromTriage({ messageId, memberId, wineryId, triageResult }) {
  // TODO: use Sequelize models.Task and TaskAction to persist
  logger.info('createTaskFromTriage called', {
    messageId,
    memberId,
    wineryId,
    type: triageResult.type
  });

  // Return placeholder shape for now
  return {
    id: 5001,
    ...triageResult,
    status: 'PENDING_REVIEW'
  };
}

async function updateTask({ id, wineryId, userId, status, payload, suggestedChannel, suggestedReplyBody }) {
  // TODO: enforce status transitions and persist changes
  logger.info('updateTask called', { id, wineryId, userId, status });

  return {
    id,
    status,
    payload,
    suggestedChannel,
    suggestedReplyBody
  };
}

module.exports = {
  createTaskFromTriage,
  updateTask
};
