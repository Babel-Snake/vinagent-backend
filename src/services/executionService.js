// src/services/executionService.js
// After a task is APPROVED, execute the appropriate flow:
// create MemberActionToken, send link, update Task status.

const logger = require('../config/logger');
// TODO: const memberActionTokenService = require('./memberActionTokenService');
// TODO: const smsService = require('./smsService');

async function executeTask(taskId) {
  // TODO: load Task + Member from DB, then branch on task.type.
  logger.info('executeTask called', { taskId });

  // Placeholder: no-op
  return;
}

module.exports = {
  executeTask
};
