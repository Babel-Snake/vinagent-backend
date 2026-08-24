const { User, OperationalArea } = require('../models');
const { NotFoundError, ValidationError } = require('../utils/errors');
const automationRuleService = require('./automationRule.service');
const {
  BOOKING_READINESS_CONTEXT_PACK,
  TRUFFLE_PREPARATION_PURPOSE
} = require('./bookingReadinessContext.service');
const {
  SHIPMENT_EXCEPTION_CONTEXT_PACK
} = require('./shipmentExceptionContext.service');
const {
  SHIPMENT_EXCEPTION_PURPOSE
} = require('./shipmentExceptionLifecycle.service');
const {
  BOOKING_COVERAGE_CONTEXT_PACK,
  BOOKING_COVERAGE_GAP_PURPOSE
} = require('./bookingCoverageContext.service');

const TRUFFLE_TEMPLATE_KEY = 'booking.truffle_preparation.v1';
const SHIPMENT_EXCEPTION_TEMPLATE_KEY = 'shipment.exception_resolution.v1';
const BOOKING_COVERAGE_GAP_TEMPLATE_KEY = 'booking.workforce_coverage_gap.v1';

function listAutomationTemplates() {
  return [{
    key: TRUFFLE_TEMPLATE_KEY,
    name: 'Paired truffle tasting preparation',
    description: 'Creates a human stock-check and preparation Task for a newly confirmed truffle-pairing booking.',
    actionType: 'TASK',
    contextPack: BOOKING_READINESS_CONTEXT_PACK,
    requiresManagerActivation: true,
    limitations: ['INVENTORY_REQUIRES_CONFIRMED_MAPPING', 'WORKFORCE_UNKNOWN', 'BOOKING_CONFIRMED_ONLY']
  }, {
    key: SHIPMENT_EXCEPTION_TEMPLATE_KEY,
    name: 'Shipment exception resolution',
    description: 'Creates managed customer-resolution work for a fresh canonical carrier exception.',
    actionType: 'TASK',
    contextPack: SHIPMENT_EXCEPTION_CONTEXT_PACK,
    requiresManagerActivation: true,
    limitations: ['FULFILMENT_ACTIVATION_REQUIRED', 'CUSTOMER_CONTACT_REMAINS_HUMAN', 'INTERNAL_TASK_ONLY']
  }, {
    key: BOOKING_COVERAGE_GAP_TEMPLATE_KEY,
    name: 'Booking workforce coverage gap',
    description: 'Creates managed staffing work only for a fresh, complete canonical roster gap.',
    actionType: 'TASK',
    contextPack: BOOKING_COVERAGE_CONTEXT_PACK,
    requiresManagerActivation: true,
    limitations: ['WORKFORCE_ACTIVATION_REQUIRED', 'COMPLETE_ROSTER_WINDOW_REQUIRED', 'INTERNAL_TASK_ONLY']
  }];
}

function buildTruffleRuleDefinition({ assigneeId, leadTimeMinutes }) {
  return {
    trigger: { eventType: 'booking.confirmed' },
    enrichments: [{
      key: 'readiness',
      capability: BOOKING_READINESS_CONTEXT_PACK,
      input: {
        bookingId: '{{event.normalizedPayload.resource.id}}',
        maxAgeSeconds: 3600
      },
      required: true
    }],
    conditions: {
      all: [
        { path: 'context.readiness.freshness.status', operator: 'EQ', value: 'FRESH' },
        { path: 'context.readiness.booking.status', operator: 'EQ', value: 'CONFIRMED' },
        { path: 'context.readiness.preparation.trufflePairing.required', operator: 'EQ', value: true },
        { path: 'context.readiness.openWork.hasTrufflePreparationTask', operator: 'EQ', value: false },
        { path: 'context.readiness.openWork.hasTrufflePreparationBinding', operator: 'EQ', value: false }
      ]
    },
    action: {
      type: 'TASK',
      data: {
        category: 'OPERATIONS',
        subType: 'OPERATIONS_SUPPLY_REQUEST',
        taskOrigin: 'INTERNAL',
        inboundMethod: 'internal',
        priority: 'high',
        assigneeId,
        suggestedAction: 'Check stock and prepare {{context.readiness.preparation.trufflePairing.quantity}} truffle-pairing portions for booking {{context.readiness.booking.referenceCode}}.',
        payload: {
          summary: 'Check truffle stock for booking {{context.readiness.booking.referenceCode}}',
          automationPurpose: TRUFFLE_PREPARATION_PURPOSE,
          bookingId: '{{context.readiness.booking.id}}',
          bookingReference: '{{context.readiness.booking.referenceCode}}',
          requiredQuantity: '{{context.readiness.preparation.trufflePairing.quantity}}',
          quantityUnit: '{{context.readiness.preparation.trufflePairing.unit}}',
          inventoryConclusion: '{{context.readiness.inventory.status}}'
        }
      },
      timing: {
        dueAt: {
          path: 'context.readiness.booking.startAt',
          offsetMinutes: -leadTimeMinutes
        }
      }
    },
    onUnknown: 'SKIP'
  };
}

function buildShipmentExceptionRuleDefinition({ assigneeId, responseMinutes }) {
  return {
    trigger: { eventType: 'shipment.exception' },
    enrichments: [{
      key: 'exception',
      capability: SHIPMENT_EXCEPTION_CONTEXT_PACK,
      input: {
        shipmentId: '{{event.normalizedPayload.resource.id}}',
        maxAgeSeconds: 21600
      },
      required: true
    }],
    conditions: {
      all: [
        { path: 'context.exception.freshness.status', operator: 'EQ', value: 'FRESH' },
        { path: 'context.exception.exception.active', operator: 'EQ', value: true },
        { path: 'context.exception.openWork.hasResolutionTask', operator: 'EQ', value: false }
      ]
    },
    action: {
      type: 'TASK',
      data: {
        category: 'ORDER',
        subType: 'DELIVERY_EXCEPTION',
        taskOrigin: 'INTERNAL',
        inboundMethod: 'internal',
        priority: 'high',
        assigneeId,
        memberId: '{{context.exception.relationships.memberId}}',
        suggestedAction: 'Resolve {{context.exception.exception.category}} delivery exception for shipment #{{context.exception.shipment.id}} with {{context.exception.shipment.carrierKey}}.',
        payload: {
          summary: 'Resolve shipment #{{context.exception.shipment.id}} delivery exception',
          automationPurpose: SHIPMENT_EXCEPTION_PURPOSE,
          shipmentId: '{{context.exception.shipment.id}}',
          exceptionCategory: '{{context.exception.exception.category}}',
          exceptionSeverity: '{{context.exception.exception.severity}}',
          shipmentStatus: '{{context.exception.shipment.status}}',
          carrierKey: '{{context.exception.shipment.carrierKey}}'
        }
      },
      timing: {
        dueAt: {
          path: 'context.exception.shipment.latestTrackingOccurredAt',
          offsetMinutes: responseMinutes
        }
      }
    },
    onUnknown: 'SKIP'
  };
}

function buildBookingCoverageGapRuleDefinition({ assigneeId, leadTimeMinutes }) {
  return {
    trigger: { eventType: 'booking.workforce_coverage_changed' },
    enrichments: [{
      key: 'coverage',
      capability: BOOKING_COVERAGE_CONTEXT_PACK,
      input: {
        bookingId: '{{event.normalizedPayload.resource.id}}',
        maxAgeSeconds: 21600
      },
      required: true
    }],
    conditions: {
      all: [
        { path: 'context.coverage.status', operator: 'EQ', value: 'GAP' },
        { path: 'context.coverage.calculationReliable', operator: 'EQ', value: true },
        { path: 'context.coverage.openWork.hasCoverageGapTask', operator: 'EQ', value: false },
        { path: 'context.coverage.openWork.hasCoverageGapBinding', operator: 'EQ', value: false }
      ]
    },
    action: {
      type: 'TASK',
      data: {
        category: 'OPERATIONS',
        subType: 'OPERATIONS_ESCALATION',
        taskOrigin: 'INTERNAL',
        inboundMethod: 'internal',
        priority: 'high',
        assigneeId,
        suggestedAction: 'Resolve staffing coverage for booking {{context.coverage.booking.referenceCode}}.',
        payload: {
          summary: 'Resolve staffing gap for booking {{context.coverage.booking.referenceCode}}',
          automationPurpose: BOOKING_COVERAGE_GAP_PURPOSE,
          bookingId: '{{context.coverage.booking.id}}',
          bookingReference: '{{context.coverage.booking.referenceCode}}',
          gapCount: '{{context.coverage.gapCount}}'
        }
      },
      timing: {
        dueAt: {
          path: 'context.coverage.booking.startAt',
          offsetMinutes: -leadTimeMinutes
        }
      }
    },
    onUnknown: 'SKIP'
  };
}

async function installAutomationTemplate({ key, wineryId, userId, userRole, data }) {
  if (![TRUFFLE_TEMPLATE_KEY, SHIPMENT_EXCEPTION_TEMPLATE_KEY, BOOKING_COVERAGE_GAP_TEMPLATE_KEY].includes(key)) {
    throw new NotFoundError('Automation template not found.');
  }
  const [assignee, area] = await Promise.all([
    User.findOne({ where: { id: data.assigneeId, wineryId, isActive: true }, attributes: ['id'] }),
    OperationalArea.findOne({ where: { id: data.areaId, wineryId }, attributes: ['id'] })
  ]);
  if (!assignee) throw new ValidationError('Template assignee must be an active user in this winery.');
  if (!area) throw new ValidationError('Template operational area must belong to this winery.');
  const shipmentTemplate = key === SHIPMENT_EXCEPTION_TEMPLATE_KEY;
  const coverageTemplate = key === BOOKING_COVERAGE_GAP_TEMPLATE_KEY;
  const defaultName = shipmentTemplate
    ? 'Shipment exception resolution'
    : (coverageTemplate ? 'Booking workforce coverage gap' : 'Paired truffle tasting preparation');
  const description = shipmentTemplate
    ? 'Manager-installed rule using privacy-safe canonical shipment exception context.'
    : (coverageTemplate
      ? 'Manager-installed rule using freshness-safe complete canonical roster coverage.'
      : 'Manager-installed rule using canonical booking and freshness-safe inventory context.');
  const definition = shipmentTemplate
    ? buildShipmentExceptionRuleDefinition({
      assigneeId: assignee.id,
      responseMinutes: data.responseMinutes || 240
    })
    : (coverageTemplate
      ? buildBookingCoverageGapRuleDefinition({
        assigneeId: assignee.id,
        leadTimeMinutes: data.leadTimeMinutes
      })
      : buildTruffleRuleDefinition({
        assigneeId: assignee.id,
        leadTimeMinutes: data.leadTimeMinutes
      }));
  return automationRuleService.createRule({
    wineryId,
    userId,
    userRole,
    data: {
      name: data.name || defaultName,
      description,
      areaId: area.id,
      definition
    }
  });
}

module.exports = {
  TRUFFLE_TEMPLATE_KEY,
  SHIPMENT_EXCEPTION_TEMPLATE_KEY,
  BOOKING_COVERAGE_GAP_TEMPLATE_KEY,
  listAutomationTemplates,
  buildTruffleRuleDefinition,
  buildShipmentExceptionRuleDefinition,
  buildBookingCoverageGapRuleDefinition,
  installAutomationTemplate
};
