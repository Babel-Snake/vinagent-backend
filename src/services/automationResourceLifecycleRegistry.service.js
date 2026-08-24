const { ValidationError } = require('../utils/errors');

const handlers = new Map();
const keyFor = ({ resourceType, itemType, purposeKey }) => [resourceType, itemType, purposeKey]
  .map(value => String(value || '').trim().toUpperCase())
  .join(':');

function register(handler) {
  if (!handler || typeof handler !== 'object') throw new ValidationError('Lifecycle handler must be an object.');
  for (const field of ['resourceType', 'itemType', 'purposeKey']) {
    if (!String(handler[field] || '').trim()) throw new ValidationError(`Lifecycle handler ${field} is required.`);
  }
  for (const method of ['buildConfiguration', 'resolveDesired']) {
    if (typeof handler[method] !== 'function') throw new ValidationError(`Lifecycle handler ${method} is required.`);
  }
  if (!Array.isArray(handler.managedFields) || handler.managedFields.length === 0) {
    throw new ValidationError('Lifecycle handler managedFields are required.');
  }
  const key = keyFor(handler);
  const existing = handlers.get(key);
  if (existing && existing !== handler) throw new ValidationError(`Lifecycle handler '${key}' is already registered.`);
  handlers.set(key, handler);
  return handler;
}

function get(criteria) {
  return handlers.get(keyFor(criteria)) || null;
}

function list() {
  return [...handlers.values()].map(handler => ({
    resourceType: handler.resourceType,
    itemType: handler.itemType,
    purposeKey: handler.purposeKey,
    managedFields: [...handler.managedFields],
    policy: handler.policy
  }));
}

function clearForTests() {
  handlers.clear();
}

module.exports = { register, get, list, clearForTests };
