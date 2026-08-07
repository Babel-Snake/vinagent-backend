const express = require('express');
const controller = require('../controllers/project.controller');

const router = express.Router();

router.get('/for-item', controller.listProjectsForItem);
router.get('/', controller.listProjects);
router.post('/', controller.createProject);
router.get('/:id', controller.getProject);
router.patch('/:id', controller.updateProject);
router.put('/:id/lead', controller.assignLead);
router.delete('/:id/lead', controller.revokeLead);
router.post('/:id/tasks', controller.createDelegatedTask);
router.post('/:id/participants', controller.addParticipant);
router.patch('/:id/participants/:userId', controller.updateParticipant);
router.delete('/:id/participants/:userId', controller.removeParticipant);
router.get('/:id/items', controller.listItems);
router.post('/:id/items', controller.addItem);
router.patch('/:id/items/:projectItemId', controller.updateItem);
router.delete('/:id/items/:projectItemId', controller.removeItem);
router.get('/:id/dependencies', controller.listDependencies);
router.post('/:id/dependencies', controller.addDependency);
router.delete('/:id/dependencies/:dependencyId', controller.removeDependency);
router.get('/:id/activity', controller.listActivity);

module.exports = router;
