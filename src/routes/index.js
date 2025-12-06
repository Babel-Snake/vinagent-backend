// src/routes/index.js
// Aggregates all API routes under /api.

const express = require('express');
const router = express.Router();

const webhookRoutes = require('./webhooks');
const taskRoutes = require('./tasks');
const addressUpdateRoutes = require('./addressUpdate');
const { authMiddleware } = require('../middleware/authMiddleware');

// Webhooks (no Firebase auth; secured by provider secret/signature)
router.use('/webhooks', webhookRoutes);

// Dashboard APIs (protected by Firebase auth)
router.use('/tasks', authMiddleware, taskRoutes);

// Member self-service (secured by MemberActionToken)
router.use('/', addressUpdateRoutes);

module.exports = router;
