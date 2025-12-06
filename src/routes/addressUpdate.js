// src/routes/addressUpdate.js
// Member self-service address update endpoints.

const express = require('express');
const router = express.Router();
const addressUpdateController = require('../controllers/addressUpdateController');

// GET /api/address-update/validate?token=...
router.get('/address-update/validate', addressUpdateController.validateToken);

// POST /api/address-update/confirm
router.post('/address-update/confirm', addressUpdateController.confirmAddress);

module.exports = router;
