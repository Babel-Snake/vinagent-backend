const {
  buildScopeKey,
  buildEventScopeKey,
  buildJobScopeKey,
  buildCanonicalOutboxKey,
  buildProjectionIssueFingerprint,
  stableSerialize
} = require('../../services/integrationDataFoundation.service');
const {
  CONNECTION_STATUSES,
  CUSTOMER_CONSENT_STATES,
  CUSTOMER_CONTACT_TYPES,
  INTEGRATION_DOMAINS,
  includesRegistryValue
} = require('../../services/integrationDataRegistry.service');

describe('integration data foundation helpers', () => {
  test('builds deterministic winery, area, and location scope keys', () => {
    expect(buildScopeKey()).toBe('winery');
    expect(buildScopeKey({ areaId: '12' })).toBe('area:12');
    expect(buildScopeKey({ locationId: 7 })).toBe('location:7');
    expect(() => buildScopeKey({ areaId: 12, locationId: 7 })).toThrow('cannot target an area and a location');
    expect(() => buildScopeKey({ areaId: 'not-an-id' })).toThrow('positive integer');
  });

  test('builds connection, canonical resource, and intake event scopes', () => {
    expect(buildEventScopeKey({ connectionId: 3, sourceStream: 'Bookings:Main Venue' }))
      .toBe('connection:3:source:bookings%3Amain%20venue');
    expect(buildEventScopeKey({ resourceType: 'BOOKING', resourceId: 'ABC-42' }))
      .toBe('canonical:booking:abc-42');
    expect(buildEventScopeKey({ intakeKey: 'manual-import' })).toBe('intake:manual-import');
    expect(() => buildEventScopeKey({ resourceType: 'BOOKING' })).toThrow('both required');
  });

  test('builds stable durable-job and canonical-outbox keys', () => {
    expect(buildJobScopeKey({ connectionId: 3, resourceType: 'BOOKING', streamKey: 'Main Venue' }))
      .toBe('connection:3:resource:booking:stream:main%20venue');
    expect(buildJobScopeKey()).toBe('winery:resource:general:stream:default');
    expect(buildCanonicalOutboxKey({ resourceType: 'BOOKING', resourceId: 'ABC-42', revision: 7 }))
      .toBe('canonical:booking:abc-42:revision:7');
  });

  test('generates the same issue fingerprint when evidence object keys are reordered', () => {
    const common = {
      connectionId: 3,
      resourceType: 'BOOKING',
      externalId: 'ABC-42',
      issueType: 'LOCATION_UNMAPPED',
      sourceVersion: 'v7'
    };
    const first = buildProjectionIssueFingerprint({ ...common, evidence: { location: 'Deck', code: 17 } });
    const second = buildProjectionIssueFingerprint({ ...common, evidence: { code: 17, location: 'Deck' } });

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toBe(first);
    expect(stableSerialize({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
  });

  test('exposes bounded application registries without using database enums', () => {
    expect(Object.isFrozen(CONNECTION_STATUSES)).toBe(true);
    expect(INTEGRATION_DOMAINS).toContain('BOOKING');
    expect(CUSTOMER_CONTACT_TYPES).toEqual(['EMAIL', 'PHONE']);
    expect(CUSTOMER_CONSENT_STATES).toContain('UNKNOWN');
    expect(includesRegistryValue(CONNECTION_STATUSES, 'connected')).toBe(true);
    expect(includesRegistryValue(CONNECTION_STATUSES, 'invented')).toBe(false);
  });
});
