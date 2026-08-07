const aiSuggestionService = require('./aiSuggestion.service');

function queueSuggestionRefresh(taskId, wineryId) {
  if (process.env.NODE_ENV === 'test') {
    return;
  }

  setImmediate(() => {
    aiSuggestionService.generateAiSuggestion(taskId, wineryId, {
      force: true,
      includeHistory: true
    });
  });
}

module.exports = {
  queueSuggestionRefresh
};
