const express = require('express');
const controller = require('../controllers/operationalArea.controller');
const { requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', controller.listAreas);
router.post('/', requireRole(['manager', 'admin']), controller.createArea);
router.patch('/:id', requireRole(['manager', 'admin']), controller.updateArea);
router.put('/memberships/:userId', requireRole(['manager', 'admin']), controller.replaceMemberships);

module.exports = router;
