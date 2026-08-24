const express = require('express');
const automationController = require('../controllers/automation.controller');

const router = express.Router();

router.get('/capabilities', automationController.listCapabilities);
router.get('/templates', automationController.listTemplates);
router.post('/templates/:key/rules', automationController.installTemplate);
router.get('/bindings', automationController.listBindings);
router.get('/bindings/:id', automationController.getBinding);
router.get('/runs', automationController.listRuns);
router.get('/runs/:id', automationController.getRun);
router.get('/rules', automationController.listRules);
router.post('/rules', automationController.createRule);
router.get('/rules/:id', automationController.getRule);
router.patch('/rules/:id', automationController.updateRule);
router.patch('/rules/:id/status', automationController.updateRuleStatus);
router.post('/rules/:id/preview', automationController.previewRule);
router.post('/rules/:id/execute', automationController.executeRule);

module.exports = router;
