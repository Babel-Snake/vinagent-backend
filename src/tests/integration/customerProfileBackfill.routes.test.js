process.env.ALLOW_TEST_AUTH_BYPASS = 'true';
process.env.NODE_ENV = 'test';

const crypto = require('crypto');
const request = require('supertest');
const app = require('../../app');
const db = require('../../models');

describe('canonical customer profile backfill and relationship reads', () => {
  const auth = 'Bearer mock-token';
  let winery;
  let target;
  let source;
  let foreignMember;

  beforeEach(async () => {
    await db.sequelize.sync({ force: true });
    winery = await db.Winery.create({ name: 'Customer Graph Winery' });
    await db.User.create({
      firebaseUid: `customer-graph-${crypto.randomUUID()}`,
      email: 'stub@example.com',
      displayName: 'Customer Graph Manager',
      role: 'manager',
      wineryId: winery.id
    });
    target = await db.Member.create({
      wineryId: winery.id,
      firstName: 'Ada',
      lastName: 'Target',
      email: 'Shared@Example.com',
      phone: '+61 400 111 222',
      addressLine1: '1 Main Road',
      suburb: 'Adelaide',
      state: 'SA',
      postcode: '5000',
      country: 'Australia',
      marketingOptIn: true
    });
    source = await db.Member.create({
      wineryId: winery.id,
      firstName: 'Ada',
      lastName: 'Source',
      email: 'shared@example.com',
      phone: '+61 400 333 444',
      addressLine1: '2 Side Road',
      suburb: 'Hahndorf',
      state: 'SA',
      postcode: '5245',
      country: 'Australia',
      marketingOptIn: false
    });
    const foreignWinery = await db.Winery.create({ name: 'Foreign Winery' });
    foreignMember = await db.Member.create({
      wineryId: foreignWinery.id,
      firstName: 'Foreign',
      lastName: 'Customer',
      email: 'foreign@example.com'
    });
  });

  afterAll(async () => db.sequelize.close());

  test('stale-protects and idempotently backfills without inferring affirmative consent', async () => {
    const firstPreview = await request(app)
      .get('/api/integration-management/customer-profile-backfill/preview')
      .set('Authorization', auth)
      .expect(200);
    expect(firstPreview.body).toEqual(expect.objectContaining({
      memberCount: 2,
      contactPointCount: 4,
      addressCount: 2,
      unknownConsentCount: 4,
      lifecycleMilestoneCount: 2,
      previewToken: expect.stringMatching(/^[a-f0-9]{64}$/)
    }));
    await target.update({ phone: '+61 400 999 888' });
    await request(app)
      .post('/api/integration-management/customer-profile-backfill/apply')
      .set('Authorization', auth)
      .send({
        requestId: crypto.randomUUID(),
        previewToken: firstPreview.body.previewToken,
        reason: 'This preview should now be rejected because Member changed.'
      })
      .expect(400);

    const preview = await request(app)
      .get('/api/integration-management/customer-profile-backfill/preview')
      .set('Authorization', auth)
      .expect(200);
    const requestId = crypto.randomUUID();
    const applied = await request(app)
      .post('/api/integration-management/customer-profile-backfill/apply')
      .set('Authorization', auth)
      .send({
        requestId,
        previewToken: preview.body.previewToken,
        reason: 'Create additive canonical customer profile projections for review.'
      })
      .expect(201);
    expect(applied.body.report).toEqual(expect.objectContaining({
      memberCount: 2,
      contactPointsCreated: 4,
      addressesCreated: 2,
      unknownConsentsCreated: 4,
      milestonesCreated: 2
    }));
    expect(await db.CustomerConsent.count({ where: { wineryId: winery.id, state: 'UNKNOWN' } })).toBe(4);
    expect(await db.CustomerConsent.count({ where: { wineryId: winery.id, state: 'GRANTED' } })).toBe(0);
    expect(await db.CustomerContactPoint.count({ where: { wineryId: foreignMember.wineryId } })).toBe(0);

    const duplicate = await request(app)
      .post('/api/integration-management/customer-profile-backfill/apply')
      .set('Authorization', auth)
      .send({
        requestId,
        previewToken: preview.body.previewToken,
        reason: 'Create additive canonical customer profile projections for review.'
      })
      .expect(200);
    expect(duplicate.body.duplicate).toBe(true);
    expect(await db.IntegrationOperationAuditEvent.count({
      where: { wineryId: winery.id, action: 'CUSTOMER_PROFILE_BACKFILL_APPLIED' }
    })).toBe(1);

    const profile = await request(app)
      .get(`/api/members/${target.id}/relationship-profile`)
      .set('Authorization', auth)
      .expect(200);
    expect(profile.body.migration).toEqual(expect.objectContaining({
      writeAuthority: 'MEMBER',
      canonicalChildrenReadOnly: true,
      contactProjectionCurrent: true,
      addressProjectionCurrent: true,
      affirmativeConsentInferredFromLegacyFlag: false
    }));
    await request(app)
      .get(`/api/members/${foreignMember.id}/relationship-profile`)
      .set('Authorization', auth)
      .expect(404);
  });

  test('transfers canonical profile history and deduplicates shared contacts during customer merge', async () => {
    const preview = await request(app)
      .get('/api/integration-management/customer-profile-backfill/preview')
      .set('Authorization', auth)
      .expect(200);
    await request(app)
      .post('/api/integration-management/customer-profile-backfill/apply')
      .set('Authorization', auth)
      .send({
        requestId: crypto.randomUUID(),
        previewToken: preview.body.previewToken,
        reason: 'Prepare canonical profile children for merge transfer coverage.'
      })
      .expect(201);

    const merged = await request(app)
      .post(`/api/members/${target.id}/merge`)
      .set('Authorization', auth)
      .send({ sourceMemberId: source.id })
      .expect(200);
    expect(merged.body.mergeSummary.canonicalProfileTransfer).toEqual(expect.objectContaining({
      contactPointDuplicates: 1,
      contactPoints: 1,
      addresses: 1,
      consents: 2,
      milestones: 1
    }));
    expect(await db.CustomerContactPoint.count({ where: { wineryId: winery.id, memberId: source.id } })).toBe(0);
    expect(await db.CustomerConsent.count({ where: { wineryId: winery.id, memberId: target.id } })).toBe(4);
    expect(await db.CustomerLifecycleMilestone.count({ where: { wineryId: winery.id, memberId: target.id } })).toBe(2);
  });
});
