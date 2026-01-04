const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');

// List all users for the winery (for assignment dropdowns etc)
router.get('/', userController.listUsers);

module.exports = router;
