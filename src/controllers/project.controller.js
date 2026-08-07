const projectService = require('../services/project.service');
const {
  validate,
  projectCreateSchema,
  projectUpdateSchema,
  projectListSchema,
  projectParticipantCreateSchema,
  projectParticipantUpdateSchema,
  projectItemCreateSchema,
  projectItemUpdateSchema,
  projectItemLookupSchema,
  projectDependencyCreateSchema,
  projectLeadSchema,
  projectTaskCreateSchema
} = require('../utils/validation');

function context(req) {
  return {
    wineryId: req.user.wineryId,
    userId: req.user.id,
    userRole: req.user.role
  };
}

async function listProjects(req, res, next) {
  try {
    const result = await projectService.listProjects({
      ...context(req),
      filters: validate(projectListSchema, req.query)
    });
    res.json(result);
  } catch (err) { next(err); }
}

async function createProject(req, res, next) {
  try {
    const project = await projectService.createProject({
      ...context(req),
      data: validate(projectCreateSchema, req.body)
    });
    res.status(201).json({ project });
  } catch (err) { next(err); }
}

async function getProject(req, res, next) {
  try {
    const project = await projectService.getProjectById({
      ...context(req),
      projectId: Number(req.params.id)
    });
    res.json({ project });
  } catch (err) { next(err); }
}

async function updateProject(req, res, next) {
  try {
    const project = await projectService.updateProject({
      ...context(req),
      projectId: Number(req.params.id),
      data: validate(projectUpdateSchema, req.body)
    });
    res.json({ project });
  } catch (err) { next(err); }
}

async function addParticipant(req, res, next) {
  try {
    const project = await projectService.addParticipant({
      ...context(req),
      projectId: Number(req.params.id),
      data: validate(projectParticipantCreateSchema, req.body)
    });
    res.status(201).json({ project });
  } catch (err) { next(err); }
}

async function updateParticipant(req, res, next) {
  try {
    const project = await projectService.updateParticipant({
      ...context(req),
      projectId: Number(req.params.id),
      participantUserId: Number(req.params.userId),
      data: validate(projectParticipantUpdateSchema, req.body)
    });
    res.json({ project });
  } catch (err) { next(err); }
}

async function removeParticipant(req, res, next) {
  try {
    const result = await projectService.removeParticipant({
      ...context(req),
      projectId: Number(req.params.id),
      participantUserId: Number(req.params.userId)
    });
    res.json(result);
  } catch (err) { next(err); }
}

async function listItems(req, res, next) {
  try {
    const result = await projectService.listProjectItems({
      ...context(req),
      projectId: Number(req.params.id)
    });
    res.json(result);
  } catch (err) { next(err); }
}

async function addItem(req, res, next) {
  try {
    const item = await projectService.addProjectItem({
      ...context(req),
      projectId: Number(req.params.id),
      data: validate(projectItemCreateSchema, req.body)
    });
    res.status(201).json({ item });
  } catch (err) { next(err); }
}

async function updateItem(req, res, next) {
  try {
    const item = await projectService.updateProjectItem({
      ...context(req),
      projectId: Number(req.params.id),
      projectItemId: Number(req.params.projectItemId),
      data: validate(projectItemUpdateSchema, req.body)
    });
    res.json({ item });
  } catch (err) { next(err); }
}

async function removeItem(req, res, next) {
  try {
    const result = await projectService.removeProjectItem({
      ...context(req),
      projectId: Number(req.params.id),
      projectItemId: Number(req.params.projectItemId)
    });
    res.json(result);
  } catch (err) { next(err); }
}

async function listProjectsForItem(req, res, next) {
  try {
    const query = validate(projectItemLookupSchema, req.query);
    const projects = await projectService.listProjectsForItem({ ...context(req), ...query });
    res.json({ projects });
  } catch (err) { next(err); }
}

async function listDependencies(req, res, next) {
  try {
    const dependencies = await projectService.listDependencies({
      ...context(req),
      projectId: Number(req.params.id)
    });
    res.json({ dependencies });
  } catch (err) { next(err); }
}

async function addDependency(req, res, next) {
  try {
    const dependency = await projectService.addDependency({
      ...context(req),
      projectId: Number(req.params.id),
      data: validate(projectDependencyCreateSchema, req.body)
    });
    res.status(201).json({ dependency });
  } catch (err) { next(err); }
}

async function removeDependency(req, res, next) {
  try {
    const result = await projectService.removeDependency({
      ...context(req),
      projectId: Number(req.params.id),
      dependencyId: Number(req.params.dependencyId)
    });
    res.json(result);
  } catch (err) { next(err); }
}

async function listActivity(req, res, next) {
  try {
    const activity = await projectService.listProjectActivity({
      ...context(req),
      projectId: Number(req.params.id)
    });
    res.json({ activity });
  } catch (err) { next(err); }
}

async function assignLead(req, res, next) {
  try {
    const data = validate(projectLeadSchema, req.body);
    const project = await projectService.assignProjectLead({
      ...context(req),
      projectId: Number(req.params.id),
      leadUserId: data.leadUserId
    });
    res.json({ project });
  } catch (err) { next(err); }
}

async function revokeLead(req, res, next) {
  try {
    const project = await projectService.revokeProjectLead({
      ...context(req),
      projectId: Number(req.params.id)
    });
    res.json({ project });
  } catch (err) { next(err); }
}

async function createDelegatedTask(req, res, next) {
  try {
    const result = await projectService.createDelegatedProjectTask({
      ...context(req),
      projectId: Number(req.params.id),
      data: validate(projectTaskCreateSchema, req.body)
    });
    res.status(201).json(result);
  } catch (err) { next(err); }
}

module.exports = {
  listProjects,
  createProject,
  getProject,
  updateProject,
  addParticipant,
  updateParticipant,
  removeParticipant,
  listItems,
  addItem,
  updateItem,
  removeItem,
  listProjectsForItem,
  listDependencies,
  addDependency,
  removeDependency,
  listActivity,
  assignLead,
  revokeLead,
  createDelegatedTask
};
