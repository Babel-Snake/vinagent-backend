process.env.ALLOW_TEST_AUTH_BYPASS = 'true';
process.env.NODE_ENV = 'test';

const crypto = require('crypto');
const request = require('supertest');
const app = require('../../app');
const db = require('../../models');
const wineClubProjection = require('../../services/wineClubProjection.service');

describe('canonical Wine Club shadow projection and manager reads', () => {
  const auth = 'Bearer mock-token';
  let winery;
  let manager;
  let member;
  let connection;
  let secondConnection;
  let program;

  const snapshot = overrides => ({
    contractVersion: 'wine-club-shadow.v1',
    externalId: 'membership-100',
    memberId: member.id,
    programId: program.id,
    canonicalStatus: 'ACTIVE',
    providerStatus: 'active-member',
    joinedAt: '2025-01-01T00:00:00.000Z',
    activatedAt: '2025-01-02T00:00:00.000Z',
    nextChargeAt: '2026-09-01T00:00:00.000Z',
    fulfilmentMethod: 'DELIVERY',
    sourceRevision: 'membership-v2',
    sourceUpdatedAt: '2026-08-20T01:00:00.000Z',
    observedAt: '2026-08-20T01:01:00.000Z',
    preferences: { reds: true },
    events: [{
      eventKey: 'activation-1',
      eventType: 'ACTIVATED',
      fromStatus: 'PENDING',
      toStatus: 'ACTIVE',
      effectiveAt: '2025-01-02T00:00:00.000Z'
    }],
    allocations: [{
      externalId: 'allocation-spring-2026',
      cycleCode: 'spring-2026',
      canonicalStatus: 'OPEN',
      providerStatus: 'selection-open',
      opensAt: '2026-08-15T00:00:00.000Z',
      closesAt: '2026-08-30T00:00:00.000Z',
      chargesAt: '2026-09-01T00:00:00.000Z',
      fulfilmentMethod: 'DELIVERY',
      currency: 'AUD',
      totalMinor: 12000,
      sourceRevision: 'allocation-v1',
      sourceUpdatedAt: '2026-08-20T01:00:00.000Z',
      observedAt: '2026-08-20T01:01:00.000Z',
      itemsComplete: true,
      items: [
        {
          lineKey: 'line-shiraz',
          providerSku: 'SHZ-22',
          description: 'Estate Shiraz',
          quantity: 3,
          unit: 'BOTTLE',
          substitutionAllowed: false,
          currency: 'AUD',
          unitPriceMinor: 4000,
          totalMinor: 12000
        }
      ]
    }],
    ...overrides
  });

  beforeEach(async () => {
    await db.sequelize.sync({ force: true });
    winery = await db.Winery.create({ name: 'Wine Club Graph Winery' });
    manager = await db.User.create({
      firebaseUid: `club-manager-${crypto.randomUUID()}`,
      email: 'stub@example.com',
      displayName: 'Wine Club Manager',
      role: 'manager',
      wineryId: winery.id
    });
    member = await db.Member.create({
      wineryId: winery.id,
      firstName: 'Club',
      lastName: 'Customer',
      isWineClubMember: false
    });
    const createConnection = key => db.IntegrationConnection.create({
      wineryId: winery.id,
      connectionKey: key,
      providerKey: key,
      displayName: key,
      status: 'CONNECTED',
      createdBy: manager.id,
      updatedBy: manager.id
    });
    connection = await createConnection('commerce7-club');
    secondConnection = await createConnection('winedirect-club');
    await Promise.all([connection, secondConnection].map(record => db.IntegrationConnectionScope.create({
      wineryId: winery.id,
      connectionId: record.id,
      domain: 'CLUB',
      scopeKey: 'winery',
      isDefault: true,
      isActive: true
    })));
    const created = await request(app)
      .post('/api/integration-management/wine-club-programs')
      .set('Authorization', auth)
      .send({
        code: 'estate-six',
        name: 'Estate Six',
        tier: 'Estate',
        cadence: 'Quarterly',
        benefitsSummary: 'Six bottle allocation.'
      })
      .expect(201);
    program = await db.WineClubProgram.findByPk(created.body.program.id);
  });

  afterAll(async () => db.sequelize.close());

  test('projects repeatable shadow membership/allocation state without changing legacy club flags', async () => {
    const first = await wineClubProjection.projectWineClubSnapshot({
      wineryId: winery.id,
      connectionId: connection.id,
      input: snapshot()
    });
    expect(first).toEqual(expect.objectContaining({
      status: 'PROJECTED_SHADOW',
      eventsCreated: 1,
      allocationsProjected: 1,
      allocationItemsProjected: 1,
      automationEligible: false
    }));
    await member.reload();
    expect(member.isWineClubMember).toBe(false);

    const second = await wineClubProjection.projectWineClubSnapshot({
      wineryId: winery.id,
      connectionId: connection.id,
      input: snapshot({
        sourceRevision: 'membership-v3',
        sourceUpdatedAt: '2026-08-20T02:00:00.000Z',
        observedAt: '2026-08-20T02:01:00.000Z',
        events: snapshot().events,
        allocations: [{
          ...snapshot().allocations[0],
          sourceRevision: 'allocation-v2',
          sourceUpdatedAt: '2026-08-20T02:00:00.000Z',
          observedAt: '2026-08-20T02:01:00.000Z',
          totalMinor: 8000,
          items: [{
            lineKey: 'line-riesling',
            providerSku: 'RIE-24',
            description: 'Estate Riesling',
            quantity: 2,
            unit: 'BOTTLE',
            substitutionAllowed: true,
            currency: 'AUD',
            unitPriceMinor: 4000,
            totalMinor: 8000
          }]
        }]
      })
    });
    expect(second.eventsCreated).toBe(0);
    expect(await db.WineClubAllocationItem.count()).toBe(1);
    expect((await db.WineClubAllocationItem.findOne()).lineKey).toBe('line-riesling');

    const list = await request(app)
      .get('/api/integration-management/wine-club-memberships?status=ACTIVE')
      .set('Authorization', auth)
      .expect(200);
    expect(list.body.pagination.total).toBe(1);
    expect(list.body.memberships[0]).not.toHaveProperty('providerExtensions');
    const detail = await request(app)
      .get(`/api/integration-management/wine-club-memberships/${first.membershipId}`)
      .set('Authorization', auth)
      .expect(200);
    expect(detail.body.membership.Events).toHaveLength(1);
    expect(detail.body.membership.Allocations[0].Items).toHaveLength(1);
  });

  test('rejects hidden sensitive fields, ignores stale input, and records cross-source conflict', async () => {
    await expect(wineClubProjection.projectWineClubSnapshot({
      wineryId: winery.id,
      connectionId: connection.id,
      input: snapshot({ providerExtensions: { accessToken: 'do-not-store' } })
    })).rejects.toThrow('forbidden field');

    const first = await wineClubProjection.projectWineClubSnapshot({
      wineryId: winery.id,
      connectionId: connection.id,
      input: snapshot()
    });
    const stale = await wineClubProjection.projectWineClubSnapshot({
      wineryId: winery.id,
      connectionId: connection.id,
      input: snapshot({
        sourceRevision: 'membership-v1',
        sourceUpdatedAt: '2026-08-19T01:00:00.000Z',
        observedAt: '2026-08-20T03:00:00.000Z'
      })
    });
    expect(stale).toEqual({ status: 'STALE_IGNORED', membershipId: first.membershipId });
    expect(await db.ProjectionIssue.count({ where: { issueType: 'OUT_OF_ORDER' } })).toBe(1);

    const conflict = await wineClubProjection.projectWineClubSnapshot({
      wineryId: winery.id,
      connectionId: secondConnection.id,
      input: snapshot({
        externalId: 'other-provider-membership',
        sourceRevision: 'other-v1',
        sourceUpdatedAt: '2026-08-20T04:00:00.000Z',
        observedAt: '2026-08-20T04:01:00.000Z',
        allocations: []
      })
    });
    expect(conflict).toEqual({ status: 'SOURCE_CONFLICT', membershipId: first.membershipId });
    expect(await db.ProjectionIssue.count({ where: { issueType: 'SOURCE_CONFLICT', severity: 'BLOCKING' } })).toBe(1);
  });

  test('keeps programs and membership reads winery scoped', async () => {
    const foreignWinery = await db.Winery.create({ name: 'Foreign Wine Club Winery' });
    const foreignProgram = await db.WineClubProgram.create({
      wineryId: foreignWinery.id,
      code: 'foreign',
      name: 'Foreign Club'
    });
    const programs = await request(app)
      .get('/api/integration-management/wine-club-programs')
      .set('Authorization', auth)
      .expect(200);
    expect(programs.body.programs.map(item => item.id)).toEqual([program.id]);
    expect(programs.body.programs.map(item => item.id)).not.toContain(foreignProgram.id);
    await request(app)
      .get('/api/integration-management/wine-club-memberships/99999')
      .set('Authorization', auth)
      .expect(404);
  });

  test('preserves a membership during customer merge and blocks ambiguous same-program merges', async () => {
    const projected = await wineClubProjection.projectWineClubSnapshot({
      wineryId: winery.id,
      connectionId: connection.id,
      input: snapshot({ allocations: [] })
    });
    const mergeTarget = await db.Member.create({
      wineryId: winery.id,
      firstName: 'Merged',
      lastName: 'Customer'
    });
    await request(app)
      .post(`/api/members/${mergeTarget.id}/merge`)
      .set('Authorization', auth)
      .send({ sourceMemberId: member.id })
      .expect(200);
    expect((await db.WineClubMembership.findByPk(projected.membershipId)).memberId).toBe(mergeTarget.id);

    const otherSource = await db.Member.create({
      wineryId: winery.id,
      firstName: 'Duplicate',
      lastName: 'Membership'
    });
    await db.WineClubMembership.create({
      wineryId: winery.id,
      memberId: otherSource.id,
      programId: program.id,
      primarySourceReferenceId: (await db.ExternalResourceReference.create({
        wineryId: winery.id,
        connectionId: connection.id,
        resourceType: 'WINE_CLUB_MEMBERSHIP',
        externalId: 'membership-conflict',
        observedAt: new Date(),
        resolutionStatus: 'RESOLVED'
      })).id,
      authorityConnectionId: connection.id,
      canonicalStatus: 'ACTIVE',
      observedAt: new Date()
    });
    await request(app)
      .post(`/api/members/${mergeTarget.id}/merge`)
      .set('Authorization', auth)
      .send({ sourceMemberId: otherSource.id })
      .expect(400);
    expect(await db.Member.findByPk(otherSource.id)).not.toBeNull();
  });
});
