const express = require('express');
const taskController = require('../controllers/task.controller');

const router = express.Router();

router.get('/', taskController.listTasks);
router.get('/:id', taskController.getTask);
router.patch('/:id/status', taskController.updateTaskStatus);

module.exports = router;
