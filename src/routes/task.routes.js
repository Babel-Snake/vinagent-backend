const express = require('express');
const taskController = require('../controllers/task.controller');
const { requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

// NOTE: Authentication is applied at routes/index.js level
// Staff, Managers, Admins can read and create tasks
router.post('/autoclassify', taskController.autoclassify);
router.post('/', taskController.createTask);
router.get('/', taskController.listTasks);
router.get('/:id', taskController.getTask);

// Updates (including approval) - controller handles role check for status=APPROVED
router.patch('/:id', taskController.updateTask);

module.exports = router;
