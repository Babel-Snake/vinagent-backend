const {
  IntegrationWebhookRecoveryUnavailableError,
  createIntegrationWebhookRecoveryRegistry
} = require('../../services/integrationWebhookRecoveryRegistry.service');
const {
  createConfiguredIntegrationWebhookRecoveryRegistry
} = require('../../services/integrationWebhookRecoveries.service');

describe('integration webhook recovery registry', () => {
  test('dispatches by canonical domain and validates registrations', async () => {
    const registry = createIntegrationWebhookRecoveryRegistry();
    const handler = jest.fn(async context => ({ handled: context.eventId }));
    expect(registry.register('BOOKING', handler)).toBe('BOOKING');
    expect(registry.has('booking')).toBe(true);
    expect(registry.list()).toEqual(['BOOKING']);
    await expect(registry.dispatch('BOOKING', { eventId: 9 })).resolves.toEqual({ handled: 9 });
    expect(handler).toHaveBeenCalledWith({ eventId: 9 });
    expect(() => registry.register('BOOKING', handler)).toThrow('already registered');
    expect(() => registry.register('NOT_A_DOMAIN', handler)).toThrow('domain is invalid');
  });

  test('fails unsupported recovery domains permanently and configures Booking first', async () => {
    const registry = createIntegrationWebhookRecoveryRegistry();
    await expect(registry.dispatch('CLUB', {})).rejects.toBeInstanceOf(IntegrationWebhookRecoveryUnavailableError);
    await expect(registry.dispatch('CLUB', {})).rejects.toMatchObject({
      code: 'PROVIDER_WEBHOOK_RECOVERY_UNAVAILABLE',
      permanent: true
    });
    expect(createConfiguredIntegrationWebhookRecoveryRegistry().list()).toEqual(['BOOKING']);
  });
});
