const Joi = require('joi');
const registry = require('./automationCapabilityRegistry.service');
const bookingFactory = require('./integrations/booking');
const crmFactory = require('./integrations/crm');
const integrationConnectionService = require('./integrationConnection.service');
const { isMockIntegrationAllowed } = require('./integrations/mockPolicy');
const contextPackRegistry = require('./contextPackRegistry.service');
const {
  BOOKING_READINESS_CONTEXT_PACK,
  bookingReadinessInputSchema,
  bookingReadinessOutputSchema,
  registerBookingReadinessContextPack
} = require('./bookingReadinessContext.service');
const {
  SHIPMENT_EXCEPTION_CONTEXT_PACK,
  inputSchema: shipmentExceptionInputSchema,
  outputSchema: shipmentExceptionOutputSchema,
  registerShipmentExceptionContextPack
} = require('./shipmentExceptionContext.service');
const {
  BOOKING_COVERAGE_CONTEXT_PACK,
  inputSchema: bookingCoverageInputSchema,
  outputSchema: bookingCoverageOutputSchema,
  registerBookingCoverageContextPack
} = require('./bookingCoverageContext.service');
const {
  CUSTOMER_RELATIONSHIP_CONTEXT_PACK,
  inputSchema: customerRelationshipInputSchema,
  outputSchema: customerRelationshipOutputSchema,
  registerCustomerRelationshipContextPack
} = require('./customerRelationshipContext.service');
const {
  CLUB_FULFILMENT_CONTEXT_PACK,
  inputSchema: clubFulfilmentInputSchema,
  outputSchema: clubFulfilmentOutputSchema,
  registerClubFulfilmentContextPack
} = require('./clubFulfilmentContext.service');
const {
  AREA_CAPACITY_CONTEXT_PACK,
  inputSchema: areaCapacityInputSchema,
  outputSchema: areaCapacityOutputSchema,
  registerAreaCapacityContextPack
} = require('./areaCapacityContext.service');

async function adapterAvailability(domain, context) {
  const resolved = await integrationConnectionService.resolveExecutionConfig({
    wineryId: context.wineryId,
    areaId: context.areaId || null,
    domain
  });
  if (resolved.provider === 'mock') {
    return isMockIntegrationAllowed()
      ? { available: true, code: 'MOCK_ADAPTER_AVAILABLE', source: resolved.source }
      : { available: false, code: 'MOCK_ADAPTER_DISABLED', source: resolved.source };
  }
  return { available: false, code: 'LIVE_ADAPTER_UNAVAILABLE', source: resolved.source };
}

function registerCoreAutomationCapabilities() {
  registerBookingReadinessContextPack();
  registerShipmentExceptionContextPack();
  registerBookingCoverageContextPack();
  registerCustomerRelationshipContextPack();
  registerClubFulfilmentContextPack();
  registerAreaCapacityContextPack();

  registry.register({
    name: AREA_CAPACITY_CONTEXT_PACK,
    description: 'Builds bounded area booking demand and cross-domain readiness without inferred capacity.',
    kind: 'READ',
    inputSchema: areaCapacityInputSchema,
    outputSchema: areaCapacityOutputSchema,
    availability: async () => ({ available: true, code: 'CANONICAL_AREA_CAPACITY_AVAILABLE' }),
    handler: context => contextPackRegistry.resolve(AREA_CAPACITY_CONTEXT_PACK, context)
  });

  registry.register({
    name: CLUB_FULFILMENT_CONTEXT_PACK,
    description: 'Builds bounded Wine Club allocation, stock, payment, shipment, and work readiness context.',
    kind: 'READ',
    inputSchema: clubFulfilmentInputSchema,
    outputSchema: clubFulfilmentOutputSchema,
    availability: async () => ({ available: true, code: 'CANONICAL_CLUB_FULFILMENT_AVAILABLE' }),
    handler: context => contextPackRegistry.resolve(CLUB_FULFILMENT_CONTEXT_PACK, context)
  });

  registry.register({
    name: CUSTOMER_RELATIONSHIP_CONTEXT_PACK,
    description: 'Builds privacy-bounded customer relationship, consent, rollup, activity, and open-work context.',
    kind: 'READ',
    inputSchema: customerRelationshipInputSchema,
    outputSchema: customerRelationshipOutputSchema,
    availability: async () => ({ available: true, code: 'CANONICAL_CUSTOMER_RELATIONSHIP_AVAILABLE' }),
    handler: context => contextPackRegistry.resolve(CUSTOMER_RELATIONSHIP_CONTEXT_PACK, context)
  });

  registry.register({
    name: BOOKING_COVERAGE_CONTEXT_PACK,
    description: 'Builds freshness-safe role and skill coverage from complete canonical roster windows.',
    kind: 'READ',
    inputSchema: bookingCoverageInputSchema,
    outputSchema: bookingCoverageOutputSchema,
    availability: async () => ({ available: true, code: 'CANONICAL_WORKFORCE_CONTEXT_AVAILABLE' }),
    handler: context => contextPackRegistry.resolve(BOOKING_COVERAGE_CONTEXT_PACK, context)
  });

  registry.register({
    name: BOOKING_READINESS_CONTEXT_PACK,
    description: 'Builds bounded preparation context from canonical Booking state without exposing restricted requirements.',
    kind: 'READ',
    inputSchema: bookingReadinessInputSchema,
    outputSchema: bookingReadinessOutputSchema,
    availability: async () => ({ available: true, code: 'CANONICAL_BOOKING_CONTEXT_AVAILABLE' }),
    handler: context => contextPackRegistry.resolve(BOOKING_READINESS_CONTEXT_PACK, context)
  });

  registry.register({
    name: SHIPMENT_EXCEPTION_CONTEXT_PACK,
    description: 'Builds bounded delivery-exception context without exposing tracking or destination address data.',
    kind: 'READ',
    inputSchema: shipmentExceptionInputSchema,
    outputSchema: shipmentExceptionOutputSchema,
    availability: async () => ({ available: true, code: 'CANONICAL_SHIPMENT_CONTEXT_AVAILABLE' }),
    handler: context => contextPackRegistry.resolve(SHIPMENT_EXCEPTION_CONTEXT_PACK, context)
  });

  registry.register({
    name: 'bookings.availability.check',
    description: 'Checks tasting or reservation availability through the configured booking connection.',
    kind: 'READ',
    inputSchema: Joi.object({
      date: Joi.string().isoDate().required(),
      time: Joi.string().pattern(/^\d{2}:\d{2}$/).required(),
      pax: Joi.number().integer().min(1).max(100).required(),
      experienceType: Joi.string().max(160).allow('', null)
    }).unknown(false),
    availability: context => adapterAvailability('booking', context),
    handler: async ({ wineryId, areaId, transaction, input }) => {
      const provider = await bookingFactory.getProvider(wineryId, { areaId, transaction });
      return provider.findAvailability(input);
    }
  });

  registry.register({
    name: 'customers.get',
    description: 'Looks up a customer or wine-club member through the configured CRM connection.',
    kind: 'READ',
    inputSchema: Joi.object({
      email: Joi.string().email().allow('', null),
      phone: Joi.string().max(40).allow('', null)
    }).or('email', 'phone').unknown(false),
    availability: context => adapterAvailability('crm', context),
    handler: async ({ wineryId, areaId, transaction, input }) => {
      const provider = await crmFactory.getProvider(wineryId, { areaId, transaction });
      return provider.getMember(input);
    }
  });

  return registry;
}

module.exports = {
  registerCoreAutomationCapabilities
};
