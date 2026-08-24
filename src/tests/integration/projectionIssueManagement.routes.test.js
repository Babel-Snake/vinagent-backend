process.env.ALLOW_TEST_AUTH_BYPASS = 'true';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../../app');
const db = require('../../models');

describe('projection issue management routes', () => {
  const auth = 'Bearer mock-token';
  let winery;
  let foreignWinery;
  let manager;
  let connection;
  let issue;

  beforeEach(async () => {
    await db.sequelize.sync({ force: true });
    winery = await db.Winery.create({ name: 'Mapping Winery', timeZone: 'Australia/Adelaide' });
    foreignWinery = await db.Winery.create({ name: 'Foreign Mapping Winery', timeZone: 'Australia/Adelaide' });
    manager = await db.User.create({
      firebaseUid: 'projection-issue-manager',
      email: 'stub@example.com',
      displayName: 'Projection Issue Manager',
      role: 'manager',
      wineryId: winery.id
    });
    connection = await db.IntegrationConnection.create({
      wineryId: winery.id,
      connectionKey: 'legacy-opentable-candidate',
      providerKey: 'opentable',
      displayName: 'OpenTable legacy candidate',
      manifestVersion: 'legacy-backfill-1',
      status: 'PENDING'
    });
    issue = await db.ProjectionIssue.create({
      wineryId: winery.id,
      issueType: 'CONNECTION_MAPPING_AMBIGUOUS',
      fingerprint: 'a'.repeat(64),
      status: 'OPEN',
      severity: 'WARNING',
      title: 'OpenTable identity requires review',
      summary: 'Two source records cannot be merged safely.',
      evidence: { sourceKeys: ['winery:1:booking'], apiToken: 'must-be-redacted' },
      candidates: [connection.connectionKey],
      sourceVersion: 'legacy-backfill-1',
      observationCount: 1,
      detectedAt: new Date('2026-08-20T00:00:00.000Z'),
      lastObservedAt: new Date('2026-08-20T00:00:00.000Z')
    });
    await db.ProjectionIssue.create({
      wineryId: foreignWinery.id,
      issueType: 'LOCATION_UNMAPPED',
      fingerprint: 'b'.repeat(64),
      status: 'OPEN',
      severity: 'BLOCKING',
      title: 'Private foreign issue',
      evidence: { privateMarker: 'foreign-private-evidence' },
      observationCount: 1,
      detectedAt: new Date(),
      lastObservedAt: new Date()
    });
  });

  afterAll(async () => db.sequelize.close());

  test('lists tenant-scoped redacted issues and exposes only registered typed resolvers', async () => {
    const listed = await request(app)
      .get('/api/integration-management/projection-issues?status=OPEN')
      .set('Authorization', auth)
      .expect(200);
    expect(listed.body.pagination.total).toBe(1);
    expect(listed.body.issues[0]).toMatchObject({
      id: issue.id,
      evidence: { sourceKeys: ['winery:1:booking'], apiToken: '[REDACTED]' }
    });
    expect(JSON.stringify(listed.body)).not.toContain('foreign-private-evidence');
    await request(app)
      .get(`/api/integration-management/projection-issues/${issue.id}`)
      .set('Authorization', auth)
      .expect(200)
      .expect(response => expect(response.body.issue.id).toBe(issue.id));
    await request(app)
      .get('/api/integration-management/projection-issue-resolvers')
      .set('Authorization', auth)
      .expect(200)
      .expect(response => expect(response.body.issueTypes).toEqual([
        'CONNECTION_MAPPING_AMBIGUOUS',
        'CONNECTION_MAPPING_STALE',
        'SOURCE_CONFLICT'
      ]));
    const foreignIssue = await db.ProjectionIssue.findOne({ where: { wineryId: foreignWinery.id } });
    await request(app)
      .get(`/api/integration-management/projection-issues/${foreignIssue.id}`)
      .set('Authorization', auth)
      .expect(404);
  });

  test('acknowledges and resolves a typed mapping decision with immutable idempotent audit', async () => {
    const acknowledge = {
      requestId: '11111111-1111-4111-8111-111111111111',
      reason: 'The operations manager has started reviewing the candidate connection identities.'
    };
    const acknowledged = await request(app)
      .post(`/api/integration-management/projection-issues/${issue.id}/acknowledge`)
      .set('Authorization', auth)
      .send(acknowledge)
      .expect(201);
    expect(acknowledged.body).toMatchObject({
      duplicate: false,
      issue: { id: issue.id, status: 'ACKNOWLEDGED', acknowledgedBy: manager.id }
    });
    expect(acknowledged.body.issue.acknowledgedAt).toBeTruthy();
    await request(app)
      .post(`/api/integration-management/projection-issues/${issue.id}/acknowledge`)
      .set('Authorization', auth)
      .send(acknowledge)
      .expect(200)
      .expect(response => expect(response.body.duplicate).toBe(true));

    const resolution = {
      requestId: '22222222-2222-4222-8222-222222222222',
      reason: 'The manager confirmed this exact canonical candidate should represent the legacy source.',
      decision: 'SELECT_CANDIDATE',
      selectedConnectionKey: connection.connectionKey
    };
    const resolved = await request(app)
      .post(`/api/integration-management/projection-issues/${issue.id}/resolve`)
      .set('Authorization', auth)
      .send(resolution)
      .expect(201);
    expect(resolved.body).toMatchObject({
      duplicate: false,
      issue: {
        id: issue.id,
        status: 'RESOLVED',
        resolvedBy: manager.id,
        resolutionMethod: 'MANAGER_TYPED_DECISION',
        resolutionData: {
          decision: 'SELECT_CANDIDATE',
          selectedConnectionKey: connection.connectionKey
        }
      }
    });
    await request(app)
      .post(`/api/integration-management/projection-issues/${issue.id}/resolve`)
      .set('Authorization', auth)
      .send(resolution)
      .expect(200)
      .expect(response => expect(response.body.duplicate).toBe(true));
    await request(app)
      .post(`/api/integration-management/projection-issues/${issue.id}/ignore`)
      .set('Authorization', auth)
      .send({
        requestId: '33333333-3333-4333-8333-333333333333',
        reason: 'A terminal issue must not accept a conflicting later disposition.'
      })
      .expect(400);
    expect(await db.IntegrationOperationAuditEvent.count({ where: { wineryId: winery.id } })).toBe(2);
  });

  test('rejects arbitrary mapping targets and allows explicit ignore for unsupported issue types', async () => {
    await request(app)
      .post(`/api/integration-management/projection-issues/${issue.id}/resolve`)
      .set('Authorization', auth)
      .send({
        requestId: '44444444-4444-4444-8444-444444444444',
        reason: 'This invalid candidate must be rejected without mutating issue state.',
        decision: 'SELECT_CANDIDATE',
        selectedConnectionKey: 'not-an-issue-candidate'
      })
      .expect(400);
    await issue.reload();
    expect(issue.status).toBe('OPEN');

    const unsupported = await db.ProjectionIssue.create({
      wineryId: winery.id,
      issueType: 'LOCATION_UNMAPPED',
      fingerprint: 'c'.repeat(64),
      status: 'OPEN',
      severity: 'BLOCKING',
      title: 'Location needs mapping',
      sourceVersion: 'booking.v1',
      observationCount: 1,
      detectedAt: new Date(),
      lastObservedAt: new Date()
    });
    await request(app)
      .post(`/api/integration-management/projection-issues/${unsupported.id}/resolve`)
      .set('Authorization', auth)
      .send({
        requestId: '55555555-5555-4555-8555-555555555555',
        reason: 'No typed location resolver is registered yet, so resolution must fail closed.',
        decision: 'KEEP_SEPARATE'
      })
      .expect(400);
    await request(app)
      .post(`/api/integration-management/projection-issues/${unsupported.id}/ignore`)
      .set('Authorization', auth)
      .send({
        requestId: '66666666-6666-4666-8666-666666666666',
        reason: 'The manager intentionally accepts this source record without a canonical location mapping.'
      })
      .expect(201)
      .expect(response => expect(response.body.issue.status).toBe('IGNORED'));
  });
});
