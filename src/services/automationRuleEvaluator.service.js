const { ValidationError } = require('../utils/errors');

const STATES = Object.freeze({
  MATCHED: 'MATCHED',
  NOT_MATCHED: 'NOT_MATCHED',
  UNKNOWN: 'UNKNOWN'
});

function getPath(root, path) {
  if (!path) return undefined;
  return String(path).split('.').reduce((value, key) => {
    if (value === null || value === undefined || typeof value !== 'object') return undefined;
    return Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined;
  }, root);
}

function comparable(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed && Number.isFinite(Number(trimmed))) return Number(trimmed);
  }
  return value;
}

function dateValue(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function evaluateLeaf(condition, root, now) {
  const actual = getPath(root, condition.path);
  const operator = String(condition.operator).toUpperCase();
  const missing = actual === undefined || actual === null;
  let matched;

  if (operator === 'EXISTS') matched = !missing;
  else if (operator === 'NOT_EXISTS') matched = missing;
  else if (missing) return { state: STATES.UNKNOWN, path: condition.path, operator, actual: null, expected: condition.value };
  else {
    const expected = condition.value;
    switch (operator) {
      case 'EQ': matched = comparable(actual) === comparable(expected); break;
      case 'NOT_EQ': matched = comparable(actual) !== comparable(expected); break;
      case 'IN': matched = Array.isArray(expected) && expected.map(comparable).includes(comparable(actual)); break;
      case 'NOT_IN': matched = Array.isArray(expected) && !expected.map(comparable).includes(comparable(actual)); break;
      case 'CONTAINS':
        matched = Array.isArray(actual)
          ? actual.map(comparable).includes(comparable(expected))
          : String(actual).toLowerCase().includes(String(expected).toLowerCase());
        break;
      case 'GT': matched = comparable(actual) > comparable(expected); break;
      case 'GTE': matched = comparable(actual) >= comparable(expected); break;
      case 'LT': matched = comparable(actual) < comparable(expected); break;
      case 'LTE': matched = comparable(actual) <= comparable(expected); break;
      case 'BEFORE': {
        const actualDate = dateValue(actual);
        const expectedDate = dateValue(expected);
        if (!actualDate || !expectedDate) return { state: STATES.UNKNOWN, path: condition.path, operator, actual, expected };
        matched = actualDate < expectedDate;
        break;
      }
      case 'AFTER': {
        const actualDate = dateValue(actual);
        const expectedDate = dateValue(expected);
        if (!actualDate || !expectedDate) return { state: STATES.UNKNOWN, path: condition.path, operator, actual, expected };
        matched = actualDate > expectedDate;
        break;
      }
      case 'WITHIN_NEXT_MINUTES': {
        const actualDate = dateValue(actual);
        const minutes = Number(expected);
        if (!actualDate || !Number.isFinite(minutes)) return { state: STATES.UNKNOWN, path: condition.path, operator, actual, expected };
        const delta = actualDate.getTime() - now.getTime();
        matched = delta >= 0 && delta <= minutes * 60000;
        break;
      }
      case 'OLDER_THAN_MINUTES': {
        const actualDate = dateValue(actual);
        const minutes = Number(expected);
        if (!actualDate || !Number.isFinite(minutes)) return { state: STATES.UNKNOWN, path: condition.path, operator, actual, expected };
        matched = now.getTime() - actualDate.getTime() >= minutes * 60000;
        break;
      }
      default: throw new ValidationError(`Unsupported condition operator '${operator}'.`);
    }
  }

  return {
    state: matched ? STATES.MATCHED : STATES.NOT_MATCHED,
    path: condition.path,
    operator,
    actual,
    expected: condition.value
  };
}

function evaluateCondition(node, root, now = new Date()) {
  if (Object.prototype.hasOwnProperty.call(node, 'all')) {
    const children = node.all.map(child => evaluateCondition(child, root, now));
    const state = children.some(child => child.state === STATES.NOT_MATCHED)
      ? STATES.NOT_MATCHED
      : children.some(child => child.state === STATES.UNKNOWN)
        ? STATES.UNKNOWN
        : STATES.MATCHED;
    return { state, operator: 'ALL', children };
  }
  if (Object.prototype.hasOwnProperty.call(node, 'any')) {
    const children = node.any.map(child => evaluateCondition(child, root, now));
    const state = children.some(child => child.state === STATES.MATCHED)
      ? STATES.MATCHED
      : children.some(child => child.state === STATES.UNKNOWN)
        ? STATES.UNKNOWN
        : STATES.NOT_MATCHED;
    return { state, operator: 'ANY', children };
  }
  if (Object.prototype.hasOwnProperty.call(node, 'not')) {
    const child = evaluateCondition(node.not, root, now);
    const state = child.state === STATES.MATCHED
      ? STATES.NOT_MATCHED
      : child.state === STATES.NOT_MATCHED
        ? STATES.MATCHED
        : STATES.UNKNOWN;
    return { state, operator: 'NOT', children: [child] };
  }
  return evaluateLeaf(node, root, now);
}

function resolveTemplate(value, root) {
  if (Array.isArray(value)) return value.map(item => resolveTemplate(item, root));
  if (value && typeof value === 'object') {
    return Object.entries(value).reduce((result, [key, item]) => {
      result[key] = resolveTemplate(item, root);
      return result;
    }, {});
  }
  if (typeof value !== 'string') return value;

  const exact = value.match(/^\{\{\s*([^{}]+?)\s*\}\}$/);
  if (exact) return getPath(root, exact[1].trim());
  return value.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, path) => {
    const resolved = getPath(root, path.trim());
    return resolved === undefined || resolved === null ? '' : String(resolved);
  });
}

function applyActionTiming(data, timing, root) {
  const result = { ...data };
  for (const [field, rule] of Object.entries(timing || {})) {
    const sourceValue = rule.path ? getPath(root, rule.path) : resolveTemplate(rule.value, root);
    const date = dateValue(sourceValue);
    if (!date) throw new ValidationError(`Unable to resolve a valid date for action timing field '${field}'.`);
    date.setMinutes(date.getMinutes() + Number(rule.offsetMinutes || 0));
    result[field] = date.toISOString();
  }
  return result;
}

module.exports = {
  STATES,
  applyActionTiming,
  evaluateCondition,
  getPath,
  resolveTemplate
};
