const { createTask } = require('./taskCreation.service');
const { getTaskById } = require('./taskDetailQuery.service');
const { getTasksForWinery, getTaskQueueSummary } = require('./taskListQuery.service');
const { updateNotePrivacy } = require('./taskNote.service');
const {
  createTaskStep,
  deleteTaskStep,
  reorderTaskSteps,
  updateTaskStep
} = require('./taskStepCommands.service');
const {
  actionTaskStepSuggestion,
  generateTaskStepSuggestion
} = require('./taskStepSuggestionCommands.service');
const { updateTask } = require('./taskUpdate.service');

module.exports = {
  createTask,
  updateTask,
  getTasksForWinery,
  getTaskQueueSummary,
  getTaskById,
  createTaskStep,
  updateTaskStep,
  reorderTaskSteps,
  generateTaskStepSuggestion,
  actionTaskStepSuggestion,
  deleteTaskStep,
  updateNotePrivacy
};
