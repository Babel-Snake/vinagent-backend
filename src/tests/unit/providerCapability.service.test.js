const { assessProviderCapabilities } = require('../../services/providerCapability.service');

function configuredEnvironment(overrides = {}) {
  return {
    TWILIO_ACCOUNT_SID: 'AC123',
    TWILIO_AUTH_TOKEN: 'twilio-secret',
    TWILIO_PHONE_NUMBER: '+15551234567',
    SENDGRID_API_KEY: 'sendgrid-secret',
    RETELL_API_KEY: 'retell-secret',
    ...overrides
  };
}

function configuredIntegration(overrides = {}) {
  return {
    channelsEnabled: ['sms', 'email'],
    smsProvider: 'twilio',
    smsFromNumber: '+15551234567',
    emailProvider: 'sendgrid',
    emailFromAddress: 'winery@example.com',
    providerConnections: {},
    ...overrides
  };
}

describe('provider capability assessment', () => {
  test('passes supported notification providers without making provider calls', () => {
    const result = assessProviderCapabilities({
      integrationConfig: configuredIntegration(),
      winerySettings: {
        enableBookingModule: false,
        enableWineClubModule: false,
        enableOrdersModule: false,
        enableVoice: false
      },
      env: configuredEnvironment()
    });

    expect(result.ready).toBe(true);
    expect(result.capabilities).toEqual(expect.arrayContaining([
      { capability: 'sms_delivery', status: 'pass', code: 'TWILIO_CONFIGURED' },
      { capability: 'email_delivery', status: 'pass', code: 'SENDGRID_CONFIGURED' }
    ]));
  });

  test('fails when selected provider configuration is incomplete', () => {
    const result = assessProviderCapabilities({
      integrationConfig: configuredIntegration(),
      winerySettings: { enableBookingModule: false },
      env: configuredEnvironment({ SENDGRID_API_KEY: '' })
    });

    expect(result.ready).toBe(false);
    expect(result.capabilities).toContainEqual({
      capability: 'email_delivery',
      status: 'fail',
      code: 'SENDGRID_CONFIGURATION_INCOMPLETE'
    });
  });

  test('fails preflight for enabled booking because no live adapter exists yet', () => {
    const result = assessProviderCapabilities({
      integrationConfig: configuredIntegration(),
      winerySettings: { enableBookingModule: true },
      env: configuredEnvironment()
    });

    expect(result.ready).toBe(false);
    expect(result.capabilities).toContainEqual({
      capability: 'booking_execution',
      status: 'fail',
      code: 'BOOKING_LIVE_ADAPTER_UNAVAILABLE'
    });
  });

  test('accepts an area-scoped trusted Retell mapping for enabled voice', () => {
    const result = assessProviderCapabilities({
      integrationConfig: configuredIntegration(),
      winerySettings: { enableBookingModule: false, enableVoice: true },
      areaIntegrationConfigs: [{
        providerConnections: {
          retell: { provider: 'retell', externalLocationId: 'agent-reference' }
        }
      }],
      env: configuredEnvironment()
    });

    expect(result.capabilities).toContainEqual({
      capability: 'voice_webhooks',
      status: 'pass',
      code: 'RETELL_CONFIGURED'
    });
  });

  test('checks Outlook credentials even when sync is enabled without email delivery', () => {
    const result = assessProviderCapabilities({
      integrationConfig: configuredIntegration({
        channelsEnabled: ['sms'],
        emailProvider: 'outlook',
        providerConnections: { email: { externalAccountId: 'mailbox@example.com' } }
      }),
      winerySettings: { enableBookingModule: false },
      env: configuredEnvironment({ EMAIL_SYNC_ENABLED: 'true' })
    });

    expect(result.capabilities).toContainEqual({
      capability: 'email_sync',
      status: 'fail',
      code: 'OUTLOOK_SYNC_CONFIGURATION_INCOMPLETE'
    });
  });
});
