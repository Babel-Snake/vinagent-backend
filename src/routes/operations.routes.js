const express = require('express');
const operationsController = require('../controllers/operations.controller');

const router = express.Router();

router.get('/', operationsController.list);
router.post('/classify', operationsController.classify);
router.get('/intelligence/config', operationsController.getIntelligenceConfig);
router.post('/intelligence/config/preview', operationsController.previewIntelligenceConfig);
router.patch('/intelligence/config', operationsController.updateIntelligenceConfig);
router.get('/intelligence/signals', operationsController.listIntelligenceSignals);
router.post('/intelligence/signals', operationsController.createIntelligenceSignal);
router.post('/intelligence/signals/materialize', operationsController.materializeIntelligenceSignals);
router.post('/intelligence/signals/scheduled-run', operationsController.runScheduledIntelligenceSignals);
router.patch('/intelligence/signals/:id', operationsController.reviewIntelligenceSignal);
router.patch('/intelligence/signals/:id/workflow', operationsController.updateIntelligenceSignalWorkflow);
router.post('/intelligence/signals/:id/create-task', operationsController.createTaskFromIntelligenceSignal);

module.exports = router;
