const { ValidationError } = require('../utils/errors');

class ProjectionIssueResolutionUnavailableError extends ValidationError {
  constructor(issueType) {
    super(`No typed resolution handler is registered for '${issueType}'`);
    this.code = 'PROJECTION_ISSUE_RESOLUTION_UNAVAILABLE';
  }
}

function normalizeIssueType(issueType) {
  const normalized = String(issueType || '').trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_.-]{0,119}$/.test(normalized)) {
    throw new ValidationError('Projection issue type must be a stable key');
  }
  return normalized;
}

function createProjectionIssueResolutionRegistry() {
  const handlers = new Map();
  return {
    register(issueType, handler, { replace = false } = {}) {
      const normalized = normalizeIssueType(issueType);
      if (typeof handler !== 'function') throw new ValidationError('Projection issue resolution handler must be a function');
      if (handlers.has(normalized) && !replace) {
        throw new ValidationError(`A projection issue resolution handler is already registered for '${normalized}'`);
      }
      handlers.set(normalized, handler);
      return normalized;
    },
    has(issueType) {
      return handlers.has(normalizeIssueType(issueType));
    },
    list() {
      return [...handlers.keys()].sort();
    },
    async resolve(issue, data, context = {}) {
      const issueType = normalizeIssueType(issue?.issueType);
      const handler = handlers.get(issueType);
      if (!handler) throw new ProjectionIssueResolutionUnavailableError(issueType);
      return handler(issue, data, context);
    }
  };
}

module.exports = {
  ProjectionIssueResolutionUnavailableError,
  createProjectionIssueResolutionRegistry
};
