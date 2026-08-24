process.env.ALLOW_TEST_AUTH_BYPASS = 'true';
process.env.NODE_ENV = 'test';

const crypto = require('crypto');
const request = require('supertest');
const app = require('../../app');
const db = require('../../models');
const businessEntityLinkService = require('../../services/businessEntityLink.service');

describe('evidence-backed business entity relationships', () => {
  const auth = 'Bearer mock-token';
  let winery;
  let manager;
  let member;
  let connection;
  let booking;
  let order;
  let secondOrder;
  let orderReference;

  beforeEach(async () => {
    await db.sequelize.sync({ force: true });
    winery = await db.Winery.create({ name: 'Relationship Graph Winery' });
    manager = await db.User.create({
      firebaseUid: 'relationship-manager-' + crypto.randomUUID(),
      email: 'stub@example.com',
      displayName: 'Relationship Manager',
      role: 'manager',
      wineryId: winery.id
    });
    member = await db.Member.create({ wineryId: winery.id, firstName: 'Linked', lastName: 'Customer' });
    connection = await db.IntegrationConnection.create({
      wineryId: winery.id,
      connectionKey: 'relationship-source',
      providerKey: 'fixture',
      displayName: 'Relationship Source',
      status: 'CONNECTED',
      createdBy: manager.id,
      updatedBy: manager.id
    });
    const bookingReference = await db.ExternalResourceReference.create({
      wineryId: winery.id,
      connectionId: connection.id,
      resourceType: 'BOOKING',
      externalId: 'booking-reference',
      observedAt: new Date(),
      resolutionStatus: 'RESOLVED'
    });
    orderReference = await db.ExternalResourceReference.create({
      wineryId: winery.id,
      connectionId: connection.id,
      resourceType: 'SALES_ORDER',
      externalId: 'order-reference',
      observedAt: new Date(),
      resolutionStatus: 'RESOLVED'
    });
    booking = await db.Booking.create({
      wineryId: winery.id,
      memberId: member.id,
      primarySourceReferenceId: bookingReference.id,
      authorityConnectionId: connection.id,
      canonicalStatus: 'COMPLETED',
      providerStatus: 'completed',
      referenceCode: 'BOOK-1',
      sourceChannel: 'fixture',
      startAt: new Date('2026-08-20T01:00:00.000Z'),
      partySize: 2,
      projectionRevision: 'v1',
      sourceUpdatedAt: new Date('2026-08-20T02:00:00.000Z'),
      sourceHash: 'b'.repeat(64),
      resolvedAt: new Date('2026-08-20T02:01:00.000Z')
    });
    const orderValues = (reference, number) => ({
      wineryId: winery.id,
      memberId: member.id,
      primarySourceReferenceId: reference.id,
      authorityConnectionId: connection.id,
      customerResolutionStatus: 'RESOLVED',
      canonicalStatus: 'PAID',
      orderNumber: number,
      sourceChannel: 'POS',
      paymentStatus: 'PAID',
      fulfilmentStatus: 'FULFILLED',
      sourceRevision: 'v1',
      sourceUpdatedAt: new Date('2026-08-20T03:00:00.000Z'),
      observedAt: new Date('2026-08-20T03:01:00.000Z'),
      sourceHash: 'c'.repeat(64)
    });
    order = await db.SalesOrder.create(orderValues(orderReference, 'ORDER-1'));
    const secondReference = await db.ExternalResourceReference.create({
      wineryId: winery.id,
      connectionId: connection.id,
      resourceType: 'SALES_ORDER',
      externalId: 'order-reference-2',
      observedAt: new Date(),
      resolutionStatus: 'RESOLVED'
    });
    secondOrder = await db.SalesOrder.create(orderValues(secondReference, 'ORDER-2'));
  });

  afterAll(async () => db.sequelize.close());

  const proposal = overrides => ({
    relationshipType: 'BOOKING_RESULTED_IN_ORDER',
    sourceType: 'BOOKING',
    sourceId: booking.id,
    targetType: 'SALES_ORDER',
    targetId: order.id,
    evidenceKey: 'booking-order-source-link',
    derivationType: 'SOURCE_ASSERTED',
    derivationVersion: 'fixture-v1',
    evidenceSummary: 'The commerce source explicitly referenced this booking.',
    confidence: 1,
    sourceConnectionId: connection.id,
    sourceReferenceId: orderReference.id,
    observedAt: '2026-08-20T04:00:00.000Z',
    metadata: { providerField: 'booking_reference' },
    ...overrides
  });

  test('stores idempotent evidence without making unreviewed relationships actionable', async () => {
    const first = await businessEntityLinkService.proposeBusinessEntityLink({
      wineryId: winery.id,
      input: proposal()
    });
    expect(first).toEqual(expect.objectContaining({
      linkCreated: true,
      evidenceCreated: true,
      automationEligible: false
    }));
    expect(first.link.confirmationStatus).toBe('UNREVIEWED');
    const duplicate = await businessEntityLinkService.proposeBusinessEntityLink({
      wineryId: winery.id,
      input: proposal({ observedAt: '2026-08-20T04:05:00.000Z' })
    });
    expect(duplicate.duplicate).toBe(true);
    expect(await db.BusinessEntityLink.count()).toBe(1);
    expect(await db.BusinessEntityLinkEvidence.count()).toBe(1);

    await expect(businessEntityLinkService.proposeBusinessEntityLink({
      wineryId: winery.id,
      input: proposal({ evidenceSummary: 'The same key now claims a different relationship assertion.' })
    })).rejects.toThrow('evidenceKey');
    await expect(businessEntityLinkService.proposeBusinessEntityLink({
      wineryId: winery.id,
      input: proposal({ evidenceKey: 'sensitive', metadata: { cardNumber: 'not-allowed' } })
    })).rejects.toThrow('forbidden field');
  });

  test('normalizes symmetric candidates and never merges the underlying entities', async () => {
    const first = await businessEntityLinkService.proposeBusinessEntityLink({
      wineryId: winery.id,
      input: {
        relationshipType: 'POSSIBLE_SAME_SALES_ORDER',
        sourceType: 'SALES_ORDER',
        sourceId: secondOrder.id,
        targetType: 'SALES_ORDER',
        targetId: order.id,
        evidenceKey: 'same-order-candidate',
        derivationType: 'DETERMINISTIC',
        derivationVersion: 'order-correlation-v1',
        evidenceSummary: 'Stable non-identity fields produced a review candidate.',
        confidence: 0.7,
        observedAt: '2026-08-20T05:00:00.000Z'
      }
    });
    const reversed = await businessEntityLinkService.proposeBusinessEntityLink({
      wineryId: winery.id,
      input: {
        relationshipType: 'POSSIBLE_SAME_SALES_ORDER',
        sourceType: 'SALES_ORDER',
        sourceId: order.id,
        targetType: 'SALES_ORDER',
        targetId: secondOrder.id,
        evidenceKey: 'same-order-candidate-2',
        derivationType: 'AI_INFERRED',
        derivationVersion: 'order-correlation-ai-v1',
        evidenceSummary: 'A second model supplied corroborating review evidence.',
        confidence: 0.8,
        observedAt: '2026-08-20T05:01:00.000Z'
      }
    });
    expect(reversed.link.id).toBe(first.link.id);
    expect(await db.BusinessEntityLink.count()).toBe(1);
    expect(await db.BusinessEntityLinkEvidence.count()).toBe(2);
    expect(await db.SalesOrder.count()).toBe(2);
  });

  test('supports audited manager confirmation, invalidation, and request replay', async () => {
    const proposed = await businessEntityLinkService.proposeBusinessEntityLink({
      wineryId: winery.id,
      input: proposal()
    });
    const requestId = crypto.randomUUID();
    const confirmUrl = '/api/integration-management/business-entity-links/' + proposed.link.id + '/confirm';
    const confirmed = await request(app)
      .post(confirmUrl)
      .set('Authorization', auth)
      .send({ requestId, reason: 'Manager verified the booking reference against the order.' })
      .expect(201);
    expect(confirmed.body.link.confirmationStatus).toBe('CONFIRMED');
    const replay = await request(app)
      .post(confirmUrl)
      .set('Authorization', auth)
      .send({ requestId, reason: 'Manager verified the booking reference against the order.' })
      .expect(200);
    expect(replay.body.duplicate).toBe(true);

    await request(app)
      .post('/api/integration-management/business-entity-links/' + proposed.link.id + '/invalidate')
      .set('Authorization', auth)
      .send({
        requestId: crypto.randomUUID(),
        reason: 'Later reconciliation showed the provider booking reference was incorrect.'
      })
      .expect(201);
    await proposed.link.reload();
    expect(proposed.link).toEqual(expect.objectContaining({
      confirmationStatus: 'INVALIDATED',
      isActive: false
    }));
    expect(await db.IntegrationOperationAuditEvent.count({
      where: { targetType: 'BUSINESS_ENTITY_LINK', targetId: String(proposed.link.id) }
    })).toBe(2);
  });

  test('creates manager-confirmed links idempotently and keeps manager reads tenant scoped', async () => {
    const requestId = crypto.randomUUID();
    const payload = {
      requestId,
      reason: 'Manager matched the booking receipt to this completed sales order.',
      relationshipType: 'BOOKING_RESULTED_IN_ORDER',
      sourceType: 'BOOKING',
      sourceId: booking.id,
      targetType: 'SALES_ORDER',
      targetId: order.id
    };
    const created = await request(app)
      .post('/api/integration-management/business-entity-links')
      .set('Authorization', auth)
      .send(payload)
      .expect(201);
    expect(created.body.link.confirmationStatus).toBe('CONFIRMED');
    await request(app)
      .post('/api/integration-management/business-entity-links')
      .set('Authorization', auth)
      .send(payload)
      .expect(200);
    await request(app)
      .post('/api/integration-management/business-entity-links')
      .set('Authorization', auth)
      .send({ ...payload, targetId: secondOrder.id })
      .expect(400);
    const definitions = await request(app)
      .get('/api/integration-management/business-entity-link-definitions')
      .set('Authorization', auth)
      .expect(200);
    expect(definitions.body.definitions.map(item => item.relationshipType))
      .toContain('BOOKING_RESULTED_IN_ORDER');
    const listUrl = '/api/integration-management/business-entity-links?entityType=BOOKING&entityId=' + booking.id;
    const list = await request(app)
      .get(listUrl)
      .set('Authorization', auth)
      .expect(200);
    expect(list.body.pagination.total).toBe(1);
    expect(list.body.businessEntityLinks[0].automationEligible).toBe(false);
    const detail = await request(app)
      .get('/api/integration-management/business-entity-links/' + created.body.link.id)
      .set('Authorization', auth)
      .expect(200);
    expect(detail.body.businessEntityLink.Evidence).toHaveLength(1);

    const foreignWinery = await db.Winery.create({ name: 'Foreign Relationship Winery' });
    const foreignMember = await db.Member.create({
      wineryId: foreignWinery.id,
      firstName: 'Foreign',
      lastName: 'Customer'
    });
    await expect(businessEntityLinkService.proposeBusinessEntityLink({
      wineryId: winery.id,
      input: {
        relationshipType: 'POSSIBLE_SAME_CUSTOMER',
        sourceType: 'CUSTOMER',
        sourceId: member.id,
        targetType: 'CUSTOMER',
        targetId: foreignMember.id,
        evidenceKey: 'cross-tenant',
        derivationType: 'DETERMINISTIC',
        evidenceSummary: 'This invalid candidate crosses the winery tenant boundary.',
        confidence: 0.5,
        observedAt: '2026-08-20T06:00:00.000Z'
      }
    })).rejects.toThrow('not found in this winery');
  });

  test('rejects an unreviewed candidate without deleting its evidence', async () => {
    const proposed = await businessEntityLinkService.proposeBusinessEntityLink({
      wineryId: winery.id,
      input: {
        relationshipType: 'POSSIBLE_SAME_SALES_ORDER',
        sourceType: 'SALES_ORDER',
        sourceId: order.id,
        targetType: 'SALES_ORDER',
        targetId: secondOrder.id,
        evidenceKey: 'reject-candidate',
        derivationType: 'DETERMINISTIC',
        evidenceSummary: 'A weak correlation created a candidate for explicit rejection.',
        confidence: 0.3,
        observedAt: '2026-08-20T06:30:00.000Z'
      }
    });
    await request(app)
      .post('/api/integration-management/business-entity-links/' + proposed.link.id + '/reject')
      .set('Authorization', auth)
      .send({
        requestId: crypto.randomUUID(),
        reason: 'Manager confirmed these are distinct sales from different channels.'
      })
      .expect(201);
    await proposed.link.reload();
    expect(proposed.link.confirmationStatus).toBe('REJECTED');
    expect(proposed.link.isActive).toBe(false);
    expect(await db.BusinessEntityLinkEvidence.count({
      where: { businessEntityLinkId: proposed.link.id }
    })).toBe(1);
  });

  test('retargets or invalidates customer candidates safely when customers merge', async () => {
    const retained = await db.Member.create({
      wineryId: winery.id,
      firstName: 'Retained',
      lastName: 'Identity'
    });
    const third = await db.Member.create({
      wineryId: winery.id,
      firstName: 'Third',
      lastName: 'Identity'
    });
    const collapsed = await businessEntityLinkService.proposeBusinessEntityLink({
      wineryId: winery.id,
      input: {
        relationshipType: 'POSSIBLE_SAME_CUSTOMER',
        sourceType: 'CUSTOMER',
        sourceId: member.id,
        targetType: 'CUSTOMER',
        targetId: retained.id,
        evidenceKey: 'merge-collapse',
        derivationType: 'DETERMINISTIC',
        evidenceSummary: 'This candidate will collapse when the source customer is merged.',
        confidence: 0.7,
        observedAt: '2026-08-20T07:00:00.000Z'
      }
    });
    const retargeted = await businessEntityLinkService.proposeBusinessEntityLink({
      wineryId: winery.id,
      input: {
        relationshipType: 'POSSIBLE_SAME_CUSTOMER',
        sourceType: 'CUSTOMER',
        sourceId: member.id,
        targetType: 'CUSTOMER',
        targetId: third.id,
        evidenceKey: 'merge-retarget',
        derivationType: 'DETERMINISTIC',
        evidenceSummary: 'This candidate should follow the retained customer identity after merge.',
        confidence: 0.6,
        observedAt: '2026-08-20T07:01:00.000Z'
      }
    });
    await request(app)
      .post('/api/members/' + retained.id + '/merge')
      .set('Authorization', auth)
      .send({ sourceMemberId: member.id })
      .expect(200);
    await collapsed.link.reload();
    await retargeted.link.reload();
    expect(collapsed.link.confirmationStatus).toBe('INVALIDATED');
    expect(retargeted.link.isActive).toBe(true);
    expect([retargeted.link.sourceId, retargeted.link.targetId]).toContain(retained.id);
    expect([retargeted.link.sourceId, retargeted.link.targetId]).not.toContain(member.id);
  });
});
