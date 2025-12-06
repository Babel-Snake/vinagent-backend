// src/controllers/taskController.js
// Implements GET /tasks, GET /tasks/:id, PATCH /tasks/:id
// as defined in API_SPEC.md.

const logger = require('../config/logger');
// TODO: const taskService = require('../services/taskService');

async function listTasks(req, res, next) {
  try {
    const { status, type, page, pageSize } = req.query;
    const { wineryId } = req.user;

    // TODO: call taskService.listTasks({ wineryId, status, type, page, pageSize })
    logger.info('List tasks requested', { wineryId, status, type });

    // Placeholder response structure
    return res.json({
      data: [],
      pagination: {
        page: Number(page) || 1,
        pageSize: Number(pageSize) || 20,
        total: 0
      }
    });
  } catch (err) {
    next(err);
  }
}

async function getTaskById(req, res, next) {
  try {
    const id = Number(req.params.id);
    const { wineryId } = req.user;

    // TODO: call taskService.getTaskById({ id, wineryId })
    logger.info('Get task requested', { id, wineryId });

    // Placeholder 404 for now
    return res.status(404).json({
      error: {
        code: 'TASK_NOT_FOUND',
        message: 'Task not found'
      }
    });
  } catch (err) {
    next(err);
  }
}

async function updateTask(req, res, next) {
  try {
    const id = Number(req.params.id);
    const { wineryId, userId, role } = req.user;
    const { status, payload, suggestedChannel, suggestedReplyBody } = req.body;

    // TODO: call taskService.updateTask({ id, wineryId, userId, status, payload, suggestedChannel, suggestedReplyBody })

    logger.info('Update task requested', {
      id,
      wineryId,
      userId,
      status
    });

    // Placeholder
    return res.json({
      id,
      status,
      payload,
      suggestedChannel,
      suggestedReplyBody
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listTasks,
  getTaskById,
  updateTask
};
