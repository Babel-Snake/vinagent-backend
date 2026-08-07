const express = require('express');
const controller = require('../controllers/operationalItem.controller');

const router = express.Router();

router.get('/', controller.listRequests);
router.post('/', controller.createRequest);
router.get('/:id', controller.getRequest);
router.patch('/:id', controller.updateRequest);
router.post('/:id/decision', controller.decideRequest);
router.get('/:id/comments', controller.listRequestComments);
router.post('/:id/comments', controller.createRequestComment);
router.delete('/:id/comments/:commentId', controller.deleteRequestComment);
router.get('/:id/relations', controller.listRequestRelations);
router.post('/:id/relations', controller.createRequestRelation);
router.delete('/:id/relations/:relationId', controller.deleteRequestRelation);
router.post('/:id/create-task', controller.convertRequestToTask);

module.exports = router;
