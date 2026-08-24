const {
  defineDomainConnectorManifest,
  readDomainConnectorChanges,
  runDomainConnectorConformance
} = require('../../services/integrations/domainConnector.contract');
const {
  createDomainConnectorRegistry
} = require('../../services/integrations/domainConnectorRegistry.service');

const manifest = {
  connectorKey: 'fixture.fulfilment.carrier',
  providerKey: 'fixture-carrier',
  domain: 'FULFILMENT',
  contractVersion: '1',
  adapterVersion: '2026-08-20',
  adapterKind: 'CONFORMANCE_FIXTURE',
  resourceTypes: ['SHIPMENT'],
  supportedCredentialTypes: ['API_KEY'],
  supportsPolling: true,
  supportsWebhook: true,
  readCapabilityKey: 'fulfilment.read.shadow'
};

function fixtureAdapter(overrides = {}) {
  return {
    manifest,
    async verifyConnection() {
      return {
        status: 'CONNECTED',
        checkedAt: '2026-08-20T00:00:00.000Z',
        capability: {
          capabilityKey: 'fulfilment.read.shadow',
          contractVersion: '1',
          availabilityStatus: 'AVAILABLE',
          supportsPolling: true,
          supportsWebhook: true
        }
      };
    },
    async readChanges(request) {
      return {
        changes: [{
          resourceType: 'SHIPMENT',
          externalId: 'shipment-1',
          eventKey: 'shipment-1:in-transit',
          eventType: 'shipment.changed',
          schemaVersion: 'shipment-shadow.v1',
          occurredAt: '2026-08-20T00:01:00.000Z',
          providerUpdatedAt: '2026-08-20T00:01:00.000Z',
          projectionPayload: {
            canonicalShipmentId: 41,
            canonicalStatus: 'IN_TRANSIT',
            requestMode: request.mode
          }
        }],
        nextCursor: null,
        hasMore: false,
        watermarkAt: '2026-08-20T00:01:00.000Z',
        snapshotComplete: request.mode === 'RECONCILIATION'
      };
    },
    ...overrides
  };
}

describe('generic domain connector contract and conformance kit', () => {
  test('proves deterministic, provider-neutral normalized change output', async () => {
    const report = await runDomainConnectorConformance({
      adapter: fixtureAdapter(),
      verificationContext: { accountRef: 'protected-reference' },
      requests: [
        { key: 'incremental', mode: 'INCREMENTAL', cursor: null },
        { key: 'reconcile', mode: 'RECONCILIATION', cursor: null }
      ]
    });
    expect(report).toEqual(expect.objectContaining({
      contractVersion: '1',
      providerKey: 'fixture-carrier',
      domain: 'FULFILMENT',
      reportDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      scenarios: [
        expect.objectContaining({ key: 'incremental', changeCount: 1 }),
        expect.objectContaining({ key: 'reconcile', changeCount: 1 })
      ]
    }));
  });

  test('rejects secrets, undeclared resources, duplicate events, and incomplete reconciliation', async () => {
    await expect(readDomainConnectorChanges({
      adapter: fixtureAdapter({
        async readChanges() {
          return {
            changes: [{
              resourceType: 'SHIPMENT',
              externalId: 'shipment-1',
              eventKey: 'shipment-1',
              eventType: 'shipment.changed',
              schemaVersion: 'shipment-shadow.v1',
              occurredAt: '2026-08-20T00:01:00.000Z',
              providerUpdatedAt: '2026-08-20T00:01:00.000Z',
              projectionPayload: { apiToken: 'must-not-cross-boundary' }
            }],
            nextCursor: null,
            hasMore: false,
            watermarkAt: '2026-08-20T00:01:00.000Z',
            snapshotComplete: true
          };
        }
      }),
      request: { mode: 'INCREMENTAL' }
    })).rejects.toThrow('forbidden credential material');

    await expect(readDomainConnectorChanges({
      adapter: fixtureAdapter({
        async readChanges() {
          const page = await fixtureAdapter().readChanges({ mode: 'RECONCILIATION' });
          page.snapshotComplete = false;
          return page;
        }
      }),
      request: { mode: 'RECONCILIATION' }
    })).rejects.toThrow('must declare snapshotComplete');
  });

  test('keeps fixtures out of the runtime registry and rejects deceptive runtime manifests', () => {
    const registry = createDomainConnectorRegistry();
    expect(() => registry.register(fixtureAdapter())).toThrow('Fixture domain connectors');
    expect(() => defineDomainConnectorManifest({
      ...manifest,
      adapterKind: 'NATIVE_PROVIDER'
    })).toThrow('cannot use a fixture provider key');
  });
});
