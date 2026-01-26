const express = require('express');
const router = express.Router();
const memberController = require('../controllers/member.controller');

router.get('/search', memberController.searchMembers);

module.exports = router;
