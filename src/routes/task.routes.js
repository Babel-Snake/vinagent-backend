const express = require('express');
const taskController = require('../controllers/task.controller');

const router = express.Router();

router.post('/autoclassify', taskController.autoclassify);
router.post('/', taskController.createTask);
router.get('/', taskController.listTasks);
router.get('/:id', taskController.getTask);
router.patch('/:id', taskController.updateTask);
// Keep old route for backward compatibility if needed, or remove. Removing as per plan.

module.exports = router;
