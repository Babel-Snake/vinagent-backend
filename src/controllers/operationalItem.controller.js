const operationalItemService = require('../services/operationalItem.service');
const operationalCollaborationService = require('../services/operationalCollaboration.service');
const {
  validate,
  createOperationalRequestSchema,
  updateOperationalRequestSchema,
  decideOperationalRequestSchema,
  createOperationalRecordSchema,
  updateOperationalRecordSchema,
  operationalItemListSchema,
  operationalItemCommentSchema,
  operationalItemRelationSchema,
  operationalItemConversionSchema
} = require('../utils/validation');

function context(req) {
  return {
    wineryId: req.user.wineryId,
    userId: req.user.id,
    userRole: req.user.role
  };
}

async function listRequests(req, res, next) {
  try {
    const result = await operationalItemService.listRequests({
      ...context(req),
      filters: validate(operationalItemListSchema, req.query)
    });
    res.json(result);
  } catch (err) { next(err); }
}

async function createRequest(req, res, next) {
  try {
    const item = await operationalItemService.createRequest({
      ...context(req),
      data: validate(createOperationalRequestSchema, req.body)
    });
    res.status(201).json({ request: item });
  } catch (err) { next(err); }
}

async function getRequest(req, res, next) {
  try {
    const item = await operationalItemService.getRequestById({
      ...context(req),
      requestId: Number(req.params.id)
    });
    res.json({ request: item });
  } catch (err) { next(err); }
}

async function updateRequest(req, res, next) {
  try {
    const item = await operationalItemService.updateRequest({
      ...context(req),
      requestId: Number(req.params.id),
      data: validate(updateOperationalRequestSchema, req.body)
    });
    res.json({ request: item });
  } catch (err) { next(err); }
}

async function decideRequest(req, res, next) {
  try {
    const item = await operationalItemService.decideRequest({
      ...context(req),
      requestId: Number(req.params.id),
      data: validate(decideOperationalRequestSchema, req.body)
    });
    res.json({ request: item });
  } catch (err) { next(err); }
}

async function listRecords(req, res, next) {
  try {
    const result = await operationalItemService.listRecords({
      ...context(req),
      filters: validate(operationalItemListSchema, req.query)
    });
    res.json(result);
  } catch (err) { next(err); }
}

async function createRecord(req, res, next) {
  try {
    const item = await operationalItemService.createRecord({
      ...context(req),
      data: validate(createOperationalRecordSchema, req.body)
    });
    res.status(201).json({ record: item });
  } catch (err) { next(err); }
}

async function getRecord(req, res, next) {
  try {
    const item = await operationalItemService.getRecordById({
      ...context(req),
      recordId: Number(req.params.id)
    });
    res.json({ record: item });
  } catch (err) { next(err); }
}

async function updateRecord(req, res, next) {
  try {
    const item = await operationalItemService.updateRecord({
      ...context(req),
      recordId: Number(req.params.id),
      data: validate(updateOperationalRecordSchema, req.body)
    });
    res.json({ record: item });
  } catch (err) { next(err); }
}

async function listComments(req, res, next, itemType) {
  try {
    const comments = await operationalCollaborationService.listComments({ ...context(req), itemType, itemId: Number(req.params.id) });
    res.json({ comments });
  } catch (err) { next(err); }
}

async function createComment(req, res, next, itemType) {
  try {
    const comment = await operationalCollaborationService.createComment({
      ...context(req), itemType, itemId: Number(req.params.id), data: validate(operationalItemCommentSchema, req.body)
    });
    res.status(201).json({ comment });
  } catch (err) { next(err); }
}

async function deleteComment(req, res, next, itemType) {
  try {
    const result = await operationalCollaborationService.deleteComment({
      ...context(req), itemType, itemId: Number(req.params.id), commentId: Number(req.params.commentId)
    });
    res.json(result);
  } catch (err) { next(err); }
}

async function listRelations(req, res, next, itemType) {
  try {
    const relations = await operationalCollaborationService.listRelations({ ...context(req), itemType, itemId: Number(req.params.id) });
    res.json({ relations });
  } catch (err) { next(err); }
}

async function createRelation(req, res, next, itemType) {
  try {
    const relation = await operationalCollaborationService.createRelation({
      ...context(req), sourceType: itemType, sourceId: Number(req.params.id), data: validate(operationalItemRelationSchema, req.body)
    });
    res.status(201).json({ relation });
  } catch (err) { next(err); }
}

async function deleteRelation(req, res, next, itemType) {
  try {
    const result = await operationalCollaborationService.deleteRelation({
      ...context(req), itemType, itemId: Number(req.params.id), relationId: Number(req.params.relationId)
    });
    res.json(result);
  } catch (err) { next(err); }
}

async function convertToTask(req, res, next, itemType) {
  try {
    const result = await operationalCollaborationService.convertToTask({
      ...context(req), itemType, itemId: Number(req.params.id), data: validate(operationalItemConversionSchema, req.body)
    });
    res.status(201).json(result);
  } catch (err) { next(err); }
}

module.exports = {
  listRequests,
  createRequest,
  getRequest,
  updateRequest,
  decideRequest,
  listRecords,
  createRecord,
  getRecord,
  updateRecord,
  listRequestComments: (req, res, next) => listComments(req, res, next, 'REQUEST'),
  createRequestComment: (req, res, next) => createComment(req, res, next, 'REQUEST'),
  deleteRequestComment: (req, res, next) => deleteComment(req, res, next, 'REQUEST'),
  listRequestRelations: (req, res, next) => listRelations(req, res, next, 'REQUEST'),
  createRequestRelation: (req, res, next) => createRelation(req, res, next, 'REQUEST'),
  deleteRequestRelation: (req, res, next) => deleteRelation(req, res, next, 'REQUEST'),
  convertRequestToTask: (req, res, next) => convertToTask(req, res, next, 'REQUEST'),
  listRecordComments: (req, res, next) => listComments(req, res, next, 'NOTE'),
  createRecordComment: (req, res, next) => createComment(req, res, next, 'NOTE'),
  deleteRecordComment: (req, res, next) => deleteComment(req, res, next, 'NOTE'),
  listRecordRelations: (req, res, next) => listRelations(req, res, next, 'NOTE'),
  createRecordRelation: (req, res, next) => createRelation(req, res, next, 'NOTE'),
  deleteRecordRelation: (req, res, next) => deleteRelation(req, res, next, 'NOTE'),
  convertRecordToTask: (req, res, next) => convertToTask(req, res, next, 'NOTE')
};
