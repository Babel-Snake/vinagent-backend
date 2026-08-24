const Joi = require('joi');
const { ValidationError } = require('../utils/errors');

const definitions = Object.freeze({
  'booking.inventory_status': Object.freeze({
    factKey: 'booking.inventory_status',
    description: 'Current deterministic inventory conclusion for one booking.',
    subjectTypes: Object.freeze(['BOOKING']),
    valueType: 'STRING',
    valueSchemaVersion: 'v1',
    valueSchema: Joi.string().valid(
      'AVAILABLE',
      'SHORTAGE',
      'UNKNOWN',
      'STALE',
      'UNIT_MISMATCH',
      'SOURCE_CONFLICT'
    ),
    unit: null,
    sensitivity: 'INTERNAL'
  }),
  'booking.inventory_shortfall_count': Object.freeze({
    factKey: 'booking.inventory_shortfall_count',
    description: 'Number of booking inventory demand checks with a deterministic shortfall.',
    subjectTypes: Object.freeze(['BOOKING']),
    valueType: 'NUMBER',
    valueSchemaVersion: 'v1',
    valueSchema: Joi.number().integer().min(0),
    unit: 'checks',
    sensitivity: 'INTERNAL'
  }),
  'booking.workforce_status': Object.freeze({
    factKey: 'booking.workforce_status',
    description: 'Current deterministic workforce coverage conclusion for one booking.',
    subjectTypes: Object.freeze(['BOOKING']),
    valueType: 'STRING',
    valueSchemaVersion: 'v1',
    valueSchema: Joi.string().valid('COVERED', 'GAP', 'UNKNOWN', 'STALE'),
    unit: null,
    sensitivity: 'INTERNAL'
  }),
  'booking.workforce_gap_count': Object.freeze({
    factKey: 'booking.workforce_gap_count',
    description: 'Number of mapped booking workforce demands currently reporting a gap.',
    subjectTypes: Object.freeze(['BOOKING']),
    valueType: 'NUMBER',
    valueSchemaVersion: 'v1',
    valueSchema: Joi.number().integer().min(0),
    unit: 'demands',
    sensitivity: 'INTERNAL'
  }),
  'booking.operational_requirement_count': Object.freeze({
    factKey: 'booking.operational_requirement_count',
    description: 'Count of non-restricted operational requirements attached to one booking.',
    subjectTypes: Object.freeze(['BOOKING']),
    valueType: 'NUMBER',
    valueSchemaVersion: 'v1',
    valueSchema: Joi.number().integer().min(0),
    unit: 'requirements',
    sensitivity: 'INTERNAL'
  }),
  'shipment.exception_active': Object.freeze({
    factKey: 'shipment.exception_active',
    description: 'Whether one shipment currently has an active delivery exception.',
    subjectTypes: Object.freeze(['SHIPMENT']),
    valueType: 'BOOLEAN',
    valueSchemaVersion: 'v1',
    valueSchema: Joi.boolean(),
    unit: null,
    sensitivity: 'INTERNAL'
  }),
  'shipment.exception_severity': Object.freeze({
    factKey: 'shipment.exception_severity',
    description: 'Canonical current exception severity for one shipment.',
    subjectTypes: Object.freeze(['SHIPMENT']),
    valueType: 'STRING',
    valueSchemaVersion: 'v1',
    valueSchema: Joi.string().valid('NONE', 'LOW', 'MEDIUM', 'HIGH'),
    unit: null,
    sensitivity: 'INTERNAL'
  }),
  'shipment.delivery_timing_status': Object.freeze({
    factKey: 'shipment.delivery_timing_status',
    description: 'Deterministic promised-versus-current delivery timing conclusion.',
    subjectTypes: Object.freeze(['SHIPMENT']),
    valueType: 'STRING',
    valueSchemaVersion: 'v1',
    valueSchema: Joi.string().valid(
      'UNKNOWN',
      'ON_TIME',
      'AT_RISK',
      'LATE',
      'DELIVERED_ON_TIME',
      'DELIVERED_LATE'
    ),
    unit: null,
    sensitivity: 'INTERNAL'
  }),
  'message.delivery_status': Object.freeze({
    factKey: 'message.delivery_status',
    description: 'Current canonical delivery status for one communication Message.',
    subjectTypes: Object.freeze(['MESSAGE']),
    valueType: 'STRING',
    valueSchemaVersion: 'v1',
    valueSchema: Joi.string().valid(
      'RECEIVED',
      'QUEUED',
      'ACCEPTED',
      'SENT',
      'DELIVERED',
      'READ',
      'COMPLETED',
      'DEFERRED',
      'BOUNCED',
      'FAILED',
      'UNDELIVERABLE',
      'UNKNOWN'
    ),
    unit: null,
    sensitivity: 'INTERNAL'
  }),
  'message.delivery_failure_active': Object.freeze({
    factKey: 'message.delivery_failure_active',
    description: 'Whether the current Message delivery state requires failure attention.',
    subjectTypes: Object.freeze(['MESSAGE']),
    valueType: 'BOOLEAN',
    valueSchemaVersion: 'v1',
    valueSchema: Joi.boolean(),
    unit: null,
    sensitivity: 'INTERNAL'
  })
});

function getFactDefinition(factKey) {
  return definitions[String(factKey || '').trim().toLowerCase()] || null;
}

function requireFactDefinition(factKey) {
  const definition = getFactDefinition(factKey);
  if (!definition) throw new ValidationError('factKey is not registered');
  return definition;
}

function validateFactValue(definition, value) {
  const result = definition.valueSchema.required().validate(value, {
    abortEarly: false,
    convert: false
  });
  if (result.error) {
    throw new ValidationError(
      'Value does not satisfy fact definition ' + definition.factKey,
      result.error.details
    );
  }
  return result.value;
}

function listFactDefinitions() {
  return Object.values(definitions).map(definition => ({
    factKey: definition.factKey,
    description: definition.description,
    subjectTypes: [...definition.subjectTypes],
    valueType: definition.valueType,
    valueSchemaVersion: definition.valueSchemaVersion,
    valueSchema: definition.valueSchema.describe(),
    unit: definition.unit,
    sensitivity: definition.sensitivity
  }));
}

module.exports = {
  getFactDefinition,
  requireFactDefinition,
  validateFactValue,
  listFactDefinitions
};
