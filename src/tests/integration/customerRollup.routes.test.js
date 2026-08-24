process.env.ALLOW_TEST_AUTH_BYPASS = 'true';
process.env.NODE_ENV = 'test';

const crypto = require('crypto');
const request = require('supertest');
const app = require('../../app');
const db = require('../../models');
const businessEntityLinkService = require('../../services/businessEntityLink.service');

describe('rebuildable canonical customer rollups', () => {
  const auth = 'Bearer mock-token';
  let winery;
  let manager;
  let member;
  let connection;
  let orders;

  beforeEach(async () => {
    await db.sequelize.sync({ force: true });
    winery = await db.Winery.create({ name: 'Customer Rollup Winery' });
    manager = await db.User.create({
      firebaseUid: 'rollup-manager-' + crypto.randomUUID(),
      email: 'stub@example.com',
      displayName: 'Rollup Manager',
      role: 'manager',
      wineryId: winery.id
    });
    member = await db.Member.create({
      wineryId: winery.id,
      firstName: 'Canonical',
      lastName: 'Customer',
      lifetimeSpend: 99,
      totalOrders: 7,
      visitCount: 4,
      isWineClubMember: false,
      lastPurchaseAt: '2025-01-01T00:00:00.000Z'
    });
    connection = await db.IntegrationConnection.create({
      wineryId: winery.id,
      connectionKey: 'rollup-source',
      providerKey: 'fixture',
      displayName: 'Rollup Source',
      status: 'CONNECTED',
      createdBy: manager.id,
      updatedBy: manager.id
    });
    const reference = async (resourceType, externalId) => db.ExternalResourceReference.create({
      wineryId: winery.id,
      connectionId: connection.id,
      resourceType,
      externalId,
      observedAt: new Date(),
      resolutionStatus: 'RESOLVED'
    });
    const bookingReference = await reference('BOOKING', 'rollup-booking');
    await db.Booking.create({
      wineryId: winery.id,
      memberId: member.id,
      primarySourceReferenceId: bookingReference.id,
      authorityConnectionId: connection.id,
      canonicalStatus: 'COMPLETED',
      providerStatus: 'completed',
      referenceCode: 'ROLLUP-BOOKING',
      sourceChannel: 'fixture',
      startAt: new Date('2026-08-01T01:00:00.000Z'),
      completedAt: new Date('2026-08-01T02:00:00.000Z'),
      partySize: 2,
      projectionRevision: 'v1',
      sourceUpdatedAt: new Date('2026-08-01T03:00:00.000Z'),
      sourceHash: 'd'.repeat(64),
      resolvedAt: new Date('2026-08-01T03:01:00.000Z')
    });
    const program = await db.WineClubProgram.create({
      wineryId: winery.id,
      code: 'rollup-club',
      name: 'Rollup Club',
      createdBy: manager.id,
      updatedBy: manager.id
    });
    const membershipReference = await reference('WINE_CLUB_MEMBERSHIP', 'rollup-membership');
    await db.WineClubMembership.create({
      wineryId: winery.id,
      memberId: member.id,
      programId: program.id,
      primarySourceReferenceId: membershipReference.id,
      authorityConnectionId: connection.id,
      canonicalStatus: 'ACTIVE',
      activatedAt: new Date('2026-01-01T00:00:00.000Z'),
      sourceRevision: 'v1',
      sourceUpdatedAt: new Date('2026-08-01T00:00:00.000Z'),
      observedAt: new Date('2026-08-01T00:01:00.000Z')
    });
    const createOrder = async (number, currency, paidMinor, refundedMinor, paidAt) => {
      const sourceReference = await reference('SALES_ORDER', 'source-' + number);
      return db.SalesOrder.create({
        wineryId: winery.id,
        memberId: member.id,
        primarySourceReferenceId: sourceReference.id,
        authorityConnectionId: connection.id,
        customerResolutionStatus: 'RESOLVED',
        canonicalStatus: refundedMinor ? 'PARTIALLY_REFUNDED' : 'PAID',
        orderNumber: number,
        sourceChannel: 'POS',
        paymentStatus: refundedMinor ? 'PARTIALLY_REFUNDED' : 'PAID',
        fulfilmentStatus: 'FULFILLED',
        currency,
        paidMinor,
        refundedMinor,
        placedAt: new Date(paidAt),
        paidAt: new Date(paidAt),
        sourceRevision: 'v1',
        sourceUpdatedAt: new Date(paidAt),
        observedAt: new Date(paidAt),
        sourceHash: crypto.createHash('sha256').update(number).digest('hex')
      });
    };
    orders = [
      await createOrder('AUD-1', 'AUD', 12000, 2000, '2026-08-02T01:00:00.000Z'),
      await createOrder('AUD-2', 'AUD', 12000, 0, '2026-08-03T01:00:00.000Z'),
      await createOrder('USD-1', 'USD', 5000, 0, '2026-08-04T01:00:00.000Z')
    ];
    await businessEntityLinkService.proposeBusinessEntityLink({
      wineryId: winery.id,
      input: {
        relationshipType: 'POSSIBLE_SAME_SALES_ORDER',
        sourceType: 'SALES_ORDER',
        sourceId: orders[0].id,
        targetType: 'SALES_ORDER',
        targetId: orders[1].id,
        evidenceKey: 'rollup-overlap',
        derivationType: 'DETERMINISTIC',
        evidenceSummary: 'Two source orders need duplicate review before trusted rollups.',
        confidence: 0.7,
        observedAt: '2026-08-05T00:00:00.000Z'
      }
    });
  });

  afterAll(async () => db.sequelize.close());

  async function preview() {
    return request(app)
      .get('/api/integration-management/customer-rollups/preview')
      .set('Authorization', auth)
      .expect(200);
  }

  test('stale-protects and rebuilds currency-safe shadow rollups without changing legacy fields', async () => {
    const stalePreview = await preview();
    await orders[0].update({ paidMinor: 13000 });
    await request(app)
      .post('/api/integration-management/customer-rollups/rebuild')
      .set('Authorization', auth)
      .send({
        requestId: crypto.randomUUID(),
        previewToken: stalePreview.body.previewToken,
        reason: 'Rebuild canonical customer relationship rollups for review.'
      })
      .expect(400);
    const currentPreview = await preview();
    expect(currentPreview.body.policy).toEqual(expect.objectContaining({
      writesLegacyMemberRollups: false,
      separatesCurrencies: true,
      possibleDuplicateOrdersRemainCounted: true,
      automationEligible: false
    }));
    const requestId = crypto.randomUUID();
    const body = {
      requestId,
      previewToken: currentPreview.body.previewToken,
      reason: 'Rebuild canonical customer relationship rollups for review.'
    };
    const rebuilt = await request(app)
      .post('/api/integration-management/customer-rollups/rebuild')
      .set('Authorization', auth)
      .send(body)
      .expect(201);
    expect(rebuilt.body.run).toEqual(expect.objectContaining({
      status: 'COMPLETE',
      memberCount: 1,
      relationshipRollupCount: 1,
      monetaryRollupCount: 2,
      contributionCount: 8
    }));
    await request(app)
      .post('/api/integration-management/customer-rollups/rebuild')
      .set('Authorization', auth)
      .send(body)
      .expect(200);

    const relationship = await db.CustomerRelationshipRollup.findOne();
    expect(relationship).toEqual(expect.objectContaining({
      activeClubMembershipCount: 1,
      isCurrentClubMember: true,
      completedBookingCount: 1,
      purchaseOrderCount: 3,
      sourceOverlapStatus: 'POSSIBLE_DUPLICATES',
      authorityStatus: 'SHADOW_UNVERIFIED',
      automationEligible: false
    }));
    const monetary = await db.CustomerMonetaryRollup.findAll({ order: [['currency', 'ASC']] });
    expect(monetary.map(item => ({
      currency: item.currency,
      gross: Number(item.grossPaidMinor),
      refunded: Number(item.refundedMinor),
      net: Number(item.netPaidMinor)
    }))).toEqual([
      { currency: 'AUD', gross: 25000, refunded: 2000, net: 23000 },
      { currency: 'USD', gross: 5000, refunded: 0, net: 5000 }
    ]);
    await member.reload();
    expect(Number(member.lifetimeSpend)).toBe(99);
    expect(member.totalOrders).toBe(7);
    expect(member.visitCount).toBe(4);
    expect(member.isWineClubMember).toBe(false);
  });

  test('exposes current rollups and contribution lineage through tenant-scoped reads', async () => {
    const currentPreview = await preview();
    const rebuilt = await request(app)
      .post('/api/integration-management/customer-rollups/rebuild')
      .set('Authorization', auth)
      .send({
        requestId: crypto.randomUUID(),
        previewToken: currentPreview.body.previewToken,
        reason: 'Build explainable rollups for relationship profile review.'
      })
      .expect(201);
    const profile = await request(app)
      .get('/api/members/' + member.id + '/relationship-profile')
      .set('Authorization', auth)
      .expect(200);
    expect(profile.body.canonicalRollups.available).toBe(true);
    expect(profile.body.canonicalRollups.relationship.purchaseOrderCount).toBe(3);
    expect(profile.body.canonicalRollups.monetary).toHaveLength(2);
    expect(profile.body.canonicalRollups.automationEligible).toBe(false);

    const runs = await request(app)
      .get('/api/integration-management/customer-rollup-runs')
      .set('Authorization', auth)
      .expect(200);
    expect(runs.body.pagination.total).toBe(1);
    const detail = await request(app)
      .get('/api/integration-management/customer-rollup-runs/' + rebuilt.body.run.id)
      .set('Authorization', auth)
      .expect(200);
    expect(detail.body.pagination.total).toBe(8);
    expect(detail.body.contributions.every(item => item.subjectMemberId === member.id)).toBe(true);

    const foreignWinery = await db.Winery.create({ name: 'Foreign Rollup Winery' });
    const foreignUser = await db.User.create({
      firebaseUid: 'foreign-rollup-' + crypto.randomUUID(),
      email: 'foreign-rollup@example.invalid',
      displayName: 'Foreign Rollup Manager',
      role: 'manager',
      wineryId: foreignWinery.id
    });
    const foreignRun = await db.CustomerRollupRun.create({
      wineryId: foreignWinery.id,
      requestId: crypto.randomUUID(),
      previewToken: 'a'.repeat(64),
      inputHash: 'b'.repeat(64),
      calculationVersion: 'foreign-v1',
      status: 'COMPLETE',
      initiatedBy: foreignUser.id,
      reason: 'Foreign tenant fixture run.',
      startedAt: new Date(),
      completedAt: new Date()
    });
    await request(app)
      .get('/api/integration-management/customer-rollup-runs/' + foreignRun.id)
      .set('Authorization', auth)
      .expect(404);
  });

  test('invalidates current rollups on customer merge while retaining historical contribution identity', async () => {
    const currentPreview = await preview();
    const rebuilt = await request(app)
      .post('/api/integration-management/customer-rollups/rebuild')
      .set('Authorization', auth)
      .send({
        requestId: crypto.randomUUID(),
        previewToken: currentPreview.body.previewToken,
        reason: 'Build rollups before exercising customer merge invalidation.'
      })
      .expect(201);
    const retained = await db.Member.create({
      wineryId: winery.id,
      firstName: 'Retained',
      lastName: 'Customer'
    });
    await request(app)
      .post('/api/members/' + retained.id + '/merge')
      .set('Authorization', auth)
      .send({ sourceMemberId: member.id })
      .expect(200);
    expect(await db.CustomerRelationshipRollup.count({ where: { wineryId: winery.id } })).toBe(0);
    expect(await db.CustomerMonetaryRollup.count({ where: { wineryId: winery.id } })).toBe(0);
    expect(await db.CustomerRollupContribution.count({
      where: { runId: rebuilt.body.run.id, subjectMemberId: member.id }
    })).toBe(8);
    const profile = await request(app)
      .get('/api/members/' + retained.id + '/relationship-profile')
      .set('Authorization', auth)
      .expect(200);
    expect(profile.body.canonicalRollups.available).toBe(false);
  });
});
