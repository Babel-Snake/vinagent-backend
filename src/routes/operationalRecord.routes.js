const express = require('express');
const controller = require('../controllers/operationalItem.controller');

const router = express.Router();

router.get('/', controller.listRecords);
router.post('/', controller.createRecord);
router.get('/:id', controller.getRecord);
router.patch('/:id', controller.updateRecord);
router.get('/:id/comments', controller.listRecordComments);
router.post('/:id/comments', controller.createRecordComment);
router.delete('/:id/comments/:commentId', controller.deleteRecordComment);
router.get('/:id/relations', controller.listRecordRelations);
router.post('/:id/relations', controller.createRecordRelation);
router.delete('/:id/relations/:relationId', controller.deleteRecordRelation);
router.post('/:id/create-task', controller.convertRecordToTask);

module.exports = router;
