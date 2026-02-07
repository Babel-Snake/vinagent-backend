const express = require('express');
const router = express.Router();
const taskFlagController = require('../controllers/taskFlag.controller');
const { authMiddleware } = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.get('/', taskFlagController.listFlaggedTasks);
router.post('/:taskId/toggle', taskFlagController.toggleFlag);

module.exports = router;
