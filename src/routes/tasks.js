// src/routes/tasks.js
// Dashboard task APIs: list, get, update/approve.

const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');

// GET /api/tasks?status=PENDING_REVIEW
router.get('/', taskController.listTasks);

// GET /api/tasks/:id
router.get('/:id', taskController.getTaskById);

// PATCH /api/tasks/:id
router.patch('/:id', taskController.updateTask);

module.exports = router;
