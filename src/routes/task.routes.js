const express = require('express');
const taskController = require('../controllers/task.controller');

const router = express.Router();

// NOTE: Authentication is applied at routes/index.js level
// Staff, Managers, Admins can read and create tasks
router.post('/autoclassify', taskController.autoclassify);
router.post('/', taskController.createTask);
router.get('/', taskController.listTasks);
router.get('/summary', taskController.getTaskSummary);
router.get('/:id', taskController.getTask);

// Updates include status changes, notes, assignment, and suggestion refreshes.
router.patch('/:id', taskController.updateTask);
router.post('/:id/notices', taskController.linkNotice);
router.delete('/:id/notices/:noticeId', taskController.unlinkNotice);
router.post('/:id/steps', taskController.createTaskStep);
router.patch('/:id/steps/reorder', taskController.reorderTaskSteps);
router.post('/:id/steps/:stepId/suggestion', taskController.generateTaskStepSuggestion);
router.post('/:id/steps/:stepId/action', taskController.actionTaskStepSuggestion);
router.patch('/:id/steps/:stepId', taskController.updateTaskStep);
router.delete('/:id/steps/:stepId', taskController.deleteTaskStep);

// Note Privacy Toggle
router.patch('/:id/notes/:actionId', taskController.updateNotePrivacy);

module.exports = router;
