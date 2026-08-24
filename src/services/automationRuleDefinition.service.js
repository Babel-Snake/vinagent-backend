const crypto = require('crypto');
const { ValidationError } = require('../utils/errors');

const CANONICAL_EVENT_TYPE_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;
const CAPABILITY_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;
const PATH_PATTERN = /^(event|context|rule)(?:\.[A-Za-z0-9_]+)*$/;
const CONDITION_OPERATORS = new Set([
  'EQ',
  'NOT_EQ',
  'IN',
  'NOT_IN',
  'CONTAINS',
  'GT',
  'GTE',
  'LT',
  'LTE',
  'EXISTS',
  'NOT_EXISTS',
  'BEFORE',
  'AFTER',
  'WITHIN_NEXT_MINUTES',
  'OLDER_THAN_MINUTES'
]);
const ACTION_TYPES = new Set(['TASK', 'NOTICE']);
const UNKNOWN_POLICIES = new Set(['SKIP', 'FAIL']);
const TIMING_FIELDS = new Set(['dueAt', 'effectiveFrom', 'expiresAt', 'acknowledgementDueAt']);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertSafeObjectKeys(value, path = 'definition', depth = 0) {
  if (depth > 30) throw new ValidationError('Automation definition nesting is too deep.');
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSafeObjectKeys(item, `${path}[${index}]`, depth + 1));
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) {
      throw new ValidationError(`${path} contains an unsafe field name.`);
    }
    assertSafeObjectKeys(child, `${path}.${key}`, depth + 1);
  }
}

function assertString(value, label, maxLength = 160) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new ValidationError(`${label} must be a non-empty string of at most ${maxLength} characters.`);
  }
  return value.trim();
}

function validateCondition(node, path = 'conditions', depth = 0) {
  if (depth > 10) throw new ValidationError('Automation condition nesting cannot exceed 10 levels.');
  if (!isPlainObject(node)) throw new ValidationError(`${path} must be an object.`);

  const groupKeys = ['all', 'any', 'not'].filter(key => Object.prototype.hasOwnProperty.call(node, key));
  if (groupKeys.length > 0) {
    if (groupKeys.length !== 1 || Object.keys(node).length !== 1) {
      throw new ValidationError(`${path} must contain exactly one of all, any, or not.`);
    }
    const groupKey = groupKeys[0];
    if (groupKey === 'not') {
      validateCondition(node.not, `${path}.not`, depth + 1);
      return;
    }
    if (!Array.isArray(node[groupKey]) || node[groupKey].length > 50) {
      throw new ValidationError(`${path}.${groupKey} must be an array with at most 50 conditions.`);
    }
    node[groupKey].forEach((child, index) => validateCondition(child, `${path}.${groupKey}[${index}]`, depth + 1));
    return;
  }

  const conditionPath = assertString(node.path, `${path}.path`, 240);
  if (!PATH_PATTERN.test(conditionPath)) {
    throw new ValidationError(`${path}.path must start with event, context, or rule and contain only field names.`);
  }
  const operator = assertString(node.operator, `${path}.operator`, 40).toUpperCase();
  if (!CONDITION_OPERATORS.has(operator)) throw new ValidationError(`Unsupported condition operator '${operator}'.`);
  if (!['EXISTS', 'NOT_EXISTS'].includes(operator) && !Object.prototype.hasOwnProperty.call(node, 'value')) {
    throw new ValidationError(`${path}.value is required for ${operator}.`);
  }
}

function validateTiming(timing) {
  if (timing === undefined || timing === null) return;
  if (!isPlainObject(timing)) throw new ValidationError('action.timing must be an object.');
  for (const [field, value] of Object.entries(timing)) {
    if (!TIMING_FIELDS.has(field)) throw new ValidationError(`Unsupported action timing field '${field}'.`);
    if (!isPlainObject(value)) throw new ValidationError(`action.timing.${field} must be an object.`);
    if (value.path !== undefined) {
      const timingPath = assertString(value.path, `action.timing.${field}.path`, 240);
      if (!PATH_PATTERN.test(timingPath)) throw new ValidationError(`action.timing.${field}.path is invalid.`);
    } else if (value.value === undefined) {
      throw new ValidationError(`action.timing.${field} requires path or value.`);
    }
    if (value.offsetMinutes !== undefined && !Number.isFinite(Number(value.offsetMinutes))) {
      throw new ValidationError(`action.timing.${field}.offsetMinutes must be numeric.`);
    }
  }
}

function normalizeDefinition(input) {
  if (!isPlainObject(input)) throw new ValidationError('Automation definition must be an object.');
  if (JSON.stringify(input).length > 100000) throw new ValidationError('Automation definition is too large.');
  assertSafeObjectKeys(input);

  const trigger = isPlainObject(input.trigger) ? cloneJson(input.trigger) : {};
  const eventType = assertString(trigger.eventType, 'trigger.eventType', 120).toLowerCase();
  if (!CANONICAL_EVENT_TYPE_PATTERN.test(eventType)) {
    throw new ValidationError('trigger.eventType must use a canonical dotted name such as booking.confirmed.');
  }
  trigger.eventType = eventType;
  if (trigger.providers !== undefined) {
    if (!Array.isArray(trigger.providers) || trigger.providers.length > 20) {
      throw new ValidationError('trigger.providers must be an array with at most 20 entries.');
    }
    trigger.providers = [...new Set(trigger.providers.map(provider => assertString(provider, 'trigger.providers[]', 100).toLowerCase()))];
  }
  if (trigger.domain !== undefined && trigger.domain !== null) {
    trigger.domain = assertString(trigger.domain, 'trigger.domain', 80).toLowerCase();
  }

  const enrichments = input.enrichments === undefined ? [] : cloneJson(input.enrichments);
  if (!Array.isArray(enrichments) || enrichments.length > 20) {
    throw new ValidationError('enrichments must be an array with at most 20 steps.');
  }
  const keys = new Set();
  enrichments.forEach((step, index) => {
    if (!isPlainObject(step)) throw new ValidationError(`enrichments[${index}] must be an object.`);
    step.key = assertString(step.key, `enrichments[${index}].key`, 80);
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(step.key)) throw new ValidationError(`enrichments[${index}].key is invalid.`);
    if (keys.has(step.key)) throw new ValidationError(`Duplicate enrichment key '${step.key}'.`);
    keys.add(step.key);
    step.capability = assertString(step.capability, `enrichments[${index}].capability`, 160).toLowerCase();
    if (!CAPABILITY_PATTERN.test(step.capability)) throw new ValidationError(`enrichments[${index}].capability is invalid.`);
    if (step.input === undefined) step.input = {};
    if (!isPlainObject(step.input)) throw new ValidationError(`enrichments[${index}].input must be an object.`);
    step.required = step.required !== false;
  });

  const conditions = input.conditions === undefined ? { all: [] } : cloneJson(input.conditions);
  validateCondition(conditions);

  if (!isPlainObject(input.action)) throw new ValidationError('action must be an object.');
  const action = cloneJson(input.action);
  action.type = assertString(action.type, 'action.type', 20).toUpperCase();
  if (!ACTION_TYPES.has(action.type)) throw new ValidationError(`Unsupported automation action '${action.type}'.`);
  if (!isPlainObject(action.data)) throw new ValidationError('action.data must be an object.');
  validateTiming(action.timing);

  const onUnknown = String(input.onUnknown || 'SKIP').toUpperCase();
  if (!UNKNOWN_POLICIES.has(onUnknown)) throw new ValidationError(`Unsupported onUnknown policy '${onUnknown}'.`);

  return { trigger, enrichments, conditions, action, onUnknown };
}

function stableSort(value) {
  if (Array.isArray(value)) return value.map(stableSort);
  if (!isPlainObject(value)) return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = stableSort(value[key]);
    return result;
  }, {});
}

function hashDefinition(definition) {
  return crypto.createHash('sha256').update(JSON.stringify(stableSort(definition))).digest('hex');
}

module.exports = {
  ACTION_TYPES,
  CANONICAL_EVENT_TYPE_PATTERN,
  CONDITION_OPERATORS,
  PATH_PATTERN,
  cloneJson,
  hashDefinition,
  isPlainObject,
  normalizeDefinition,
  validateCondition
};
