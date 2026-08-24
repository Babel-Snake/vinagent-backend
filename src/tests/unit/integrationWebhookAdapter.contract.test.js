const crypto = require('crypto');
const {
  WEBHOOK_CHANGE_HINT_SCHEMA_VERSION,
  WEBHOOK_ADAPTER_CONTRACT_VERSION,
  createVinAgentHmacChangeHintAdapter,
  defineIntegrationWebhookAdapter
} = require('../../services/integrationWebhookAdapter.contract');
const {
  createIntegrationWebhookAdapterRegistry,
  createConfiguredIntegrationWebhookAdapterRegistry
} = require('../../services/integrationWebhookAdapters.service');

describe('integration webhook adapter contract', () => {
  const now = new Date('2026-08-20T05:00:00.000Z');
  const timestamp = String(Math.floor(now.getTime() / 1000));
  const payload = {
    schemaVersion: WEBHOOK_CHANGE_HINT_SCHEMA_VERSION,
    eventId: 'booking-event-42',
    eventType: 'booking.changed',
    occurredAt: '2026-08-20T04:59:00.000Z',
    providerEventVersion: '7',
    correlationId: 'provider-correlation-42',
    changes: [{ resourceType: 'BOOKING', externalId: 'booking-42', changeKind: 'UPSERT' }]
  };

  function signedRequest(secret, body = payload, signedAt = timestamp) {
    const rawBody = Buffer.from(JSON.stringify(body));
    const signature = crypto.createHmac('sha256', secret)
      .update(signedAt)
      .update('.')
      .update(rawBody)
      .digest('hex');
    return {
      rawBody,
      headers: {
        'x-vinagent-webhook-timestamp': signedAt,
        'x-vinagent-webhook-signature': `sha256=${signature}`
      }
    };
  }

  test('verifies exact raw bytes and returns a bounded domain change hint', () => {
    const adapter = createVinAgentHmacChangeHintAdapter();
    const secret = 'test-webhook-secret';
    const result = adapter.verifyAndNormalize({
      ...signedRequest(secret),
      verificationMaterial: { secret },
      domain: 'BOOKING',
      configuration: { maxAgeSeconds: 300 },
      now
    });
    expect(result).toEqual(payload);
  });

  test('rejects stale signatures, tampered bytes, and cross-domain hints', () => {
    const adapter = createVinAgentHmacChangeHintAdapter();
    const secret = 'test-webhook-secret';
    expect(() => adapter.verifyAndNormalize({
      ...signedRequest(secret, payload, String(Number(timestamp) - 301)),
      verificationMaterial: { secret },
      domain: 'BOOKING',
      now
    })).toThrow(expect.objectContaining({ code: 'PROVIDER_WEBHOOK_TIMESTAMP_INVALID' }));

    const tampered = signedRequest(secret);
    tampered.rawBody = Buffer.from(`${tampered.rawBody.toString('utf8')} `);
    expect(() => adapter.verifyAndNormalize({
      ...tampered,
      verificationMaterial: { secret },
      domain: 'BOOKING',
      now
    })).toThrow(expect.objectContaining({ code: 'PROVIDER_WEBHOOK_AUTHENTICATION_FAILED' }));

    expect(() => adapter.verifyAndNormalize({
      ...signedRequest(secret),
      verificationMaterial: { secret },
      domain: 'CLUB',
      now
    })).toThrow(expect.objectContaining({ code: 'PROVIDER_WEBHOOK_PAYLOAD_INVALID' }));
  });

  test('registers adapters deterministically and validates definitions', () => {
    const registry = createIntegrationWebhookAdapterRegistry();
    const adapter = createVinAgentHmacChangeHintAdapter();
    expect(registry.register(adapter)).toBe('vinagent.hmac-change-hint');
    expect(registry.has(adapter.adapterKey, 'BOOKING')).toBe(true);
    expect(() => registry.register(adapter)).toThrow('already registered');
    expect(registry.list()).toEqual([expect.objectContaining({
      adapterKey: 'vinagent.hmac-change-hint',
      contractVersion: WEBHOOK_ADAPTER_CONTRACT_VERSION,
      supportedDomains: ['*']
    })]);
    expect(createConfiguredIntegrationWebhookAdapterRegistry().list()).toHaveLength(1);
    expect(() => defineIntegrationWebhookAdapter({ adapterKey: 'invalid' })).toThrow('definition is invalid');
  });
});
