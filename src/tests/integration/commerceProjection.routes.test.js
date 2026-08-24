process.env.ALLOW_TEST_AUTH_BYPASS = 'true';
process.env.NODE_ENV = 'test';

const crypto = require('crypto');
const request = require('supertest');
const app = require('../../app');
const db = require('../../models');
const commerceProjection = require('../../services/commerceProjection.service');

describe('canonical commerce shadow projection and manager reads', () => {
  const auth = 'Bearer mock-token';
  let winery;
  let manager;
  let member;
  let location;
  let product;
  let connection;

  const snapshot = overrides => ({
    contractVersion: 'commerce-order-shadow.v1',
    externalId: 'source-order-100',
    memberId: member.id,
    customerResolutionStatus: 'RESOLVED',
    locationId: location.id,
    orderNumber: 'ORDER-100',
    sourceChannel: 'ECOMMERCE',
    canonicalStatus: 'PAID',
    providerStatus: 'completed',
    paymentStatus: 'PAID',
    fulfilmentStatus: 'UNFULFILLED',
    placedAt: '2026-08-20T01:00:00.000Z',
    paidAt: '2026-08-20T01:01:00.000Z',
    currency: 'AUD',
    subtotalMinor: 10000,
    discountMinor: 0,
    taxMinor: 1000,
    shippingMinor: 1500,
    totalMinor: 12500,
    paidMinor: 12500,
    refundedMinor: 0,
    outstandingMinor: 0,
    sourceRevision: 'order-v1',
    sourceUpdatedAt: '2026-08-20T01:02:00.000Z',
    observedAt: '2026-08-20T01:03:00.000Z',
    linesComplete: true,
    lines: [{
      lineKey: 'line-shiraz',
      lineType: 'PRODUCT',
      wineryProductId: product.id,
      productResolutionStatus: 'RESOLVED',
      providerSku: 'SHZ-22',
      description: 'Estate Shiraz',
      quantity: 2,
      fulfilledQuantity: 0,
      refundedQuantity: 0,
      unit: 'BOTTLE',
      currency: 'AUD',
      unitPriceMinor: 5000,
      discountMinor: 0,
      taxMinor: 1000,
      totalMinor: 10000
    }],
    paymentEvents: [{
      eventKey: 'capture-1',
      eventType: 'CAPTURED',
      canonicalStatus: 'PAID',
      providerTransactionReference: 'txn-safe-reference',
      paymentMethodClass: 'CARD',
      amountMinor: 12500,
      currency: 'AUD',
      effectiveAt: '2026-08-20T01:01:00.000Z'
    }],
    refunds: [{
      externalId: 'refund-1',
      lineKey: 'line-shiraz',
      canonicalStatus: 'PENDING',
      providerStatus: 'requested',
      amountMinor: 2500,
      currency: 'AUD',
      reasonCategory: 'CUSTOMER_REQUEST',
      requestedAt: '2026-08-20T01:04:00.000Z',
      effectiveAt: '2026-08-20T01:04:00.000Z',
      sourceRevision: 'refund-v1',
      sourceUpdatedAt: '2026-08-20T01:04:00.000Z',
      observedAt: '2026-08-20T01:05:00.000Z'
    }],
    ...overrides
  });

  beforeEach(async () => {
    await db.sequelize.sync({ force: true });
    winery = await db.Winery.create({ name: 'Commerce Graph Winery' });
    manager = await db.User.create({
      firebaseUid: `commerce-manager-${crypto.randomUUID()}`,
      email: 'stub@example.com',
      displayName: 'Commerce Manager',
      role: 'manager',
      wineryId: winery.id
    });
    member = await db.Member.create({
      wineryId: winery.id,
      firstName: 'Order',
      lastName: 'Customer',
      lifetimeSpend: 40,
      totalOrders: 2,
      lastPurchaseAt: '2026-01-01T00:00:00.000Z'
    });
    location = await db.WineryLocation.create({
      wineryId: winery.id,
      code: 'cellar-door',
      name: 'Cellar Door'
    });
    product = await db.WineryProduct.create({
      wineryId: winery.id,
      name: 'Estate Shiraz',
      vintage: '2022',
      price: 50
    });
    connection = await db.IntegrationConnection.create({
      wineryId: winery.id,
      connectionKey: 'square-commerce',
      providerKey: 'square',
      displayName: 'Square Commerce',
      status: 'CONNECTED',
      createdBy: manager.id,
      updatedBy: manager.id
    });
    await db.IntegrationConnectionScope.create({
      wineryId: winery.id,
      connectionId: connection.id,
      domain: 'COMMERCE',
      scopeKey: 'winery',
      isDefault: true,
      isActive: true
    });
  });

  afterAll(async () => db.sequelize.close());

  test('projects repeatable complete order state without changing legacy customer rollups', async () => {
    const first = await commerceProjection.projectCommerceOrderSnapshot({
      wineryId: winery.id,
      connectionId: connection.id,
      input: snapshot()
    });
    expect(first).toEqual(expect.objectContaining({
      status: 'PROJECTED_SHADOW',
      linesProjected: 1,
      paymentEventsCreated: 1,
      refundsProjected: 1,
      automationEligible: false,
      rollupsUpdated: false
    }));
    await member.reload();
    expect(Number(member.lifetimeSpend)).toBe(40);
    expect(member.totalOrders).toBe(2);
    expect(new Date(member.lastPurchaseAt).toISOString()).toBe('2026-01-01T00:00:00.000Z');

    const updated = await commerceProjection.projectCommerceOrderSnapshot({
      wineryId: winery.id,
      connectionId: connection.id,
      input: snapshot({
        sourceRevision: 'order-v2',
        sourceUpdatedAt: '2026-08-20T02:00:00.000Z',
        observedAt: '2026-08-20T02:01:00.000Z',
        lines: [{
          lineKey: 'shipping',
          lineType: 'SHIPPING',
          wineryProductId: null,
          productResolutionStatus: 'NOT_APPLICABLE',
          description: 'Standard delivery',
          quantity: 1,
          fulfilledQuantity: 0,
          refundedQuantity: 0,
          unit: 'SERVICE',
          currency: 'AUD',
          unitPriceMinor: 1500,
          discountMinor: 0,
          taxMinor: 0,
          totalMinor: 1500
        }],
        refunds: []
      })
    });
    expect(updated.paymentEventsCreated).toBe(0);
    expect(await db.PaymentSummaryEvent.count()).toBe(1);
    expect(await db.SalesOrderLine.count()).toBe(1);
    expect((await db.SalesOrderLine.findOne()).lineKey).toBe('shipping');

    const list = await request(app)
      .get('/api/integration-management/sales-orders?status=PAID')
      .set('Authorization', auth)
      .expect(200);
    expect(list.body.pagination.total).toBe(1);
    expect(list.body.salesOrders[0]).not.toHaveProperty('providerExtensions');
    const detail = await request(app)
      .get(`/api/integration-management/sales-orders/${first.salesOrderId}`)
      .set('Authorization', auth)
      .expect(200);
    expect(detail.body.salesOrder.Lines[0].lineKey).toBe('shipping');
    expect(detail.body.salesOrder.PaymentEvents).toHaveLength(1);
    expect(detail.body.salesOrder.Refunds).toHaveLength(1);
    expect(detail.body.salesOrder.Refunds[0].salesOrderLineId).toBeNull();
  });

  test('rejects financial/identity secrets and invalid explicit mappings', async () => {
    await expect(commerceProjection.projectCommerceOrderSnapshot({
      wineryId: winery.id,
      connectionId: connection.id,
      input: snapshot({ providerExtensions: { cardNumber: '4111111111111111' } })
    })).rejects.toThrow('forbidden field');
    await expect(commerceProjection.projectCommerceOrderSnapshot({
      wineryId: winery.id,
      connectionId: connection.id,
      input: snapshot({ memberId: null, customerResolutionStatus: 'RESOLVED' })
    })).rejects.toThrow('memberId');
    const foreignWinery = await db.Winery.create({ name: 'Foreign Commerce Winery' });
    const foreignProduct = await db.WineryProduct.create({ wineryId: foreignWinery.id, name: 'Foreign Wine' });
    await expect(commerceProjection.projectCommerceOrderSnapshot({
      wineryId: winery.id,
      connectionId: connection.id,
      input: snapshot({
        lines: [{ ...snapshot().lines[0], wineryProductId: foreignProduct.id }]
      })
    })).rejects.toThrow('do not belong to the winery');
  });

  test('accepts explicit unresolved identity, ignores stale orders, and blocks duplicate source order numbers', async () => {
    const first = await commerceProjection.projectCommerceOrderSnapshot({
      wineryId: winery.id,
      connectionId: connection.id,
      input: snapshot()
    });
    const stale = await commerceProjection.projectCommerceOrderSnapshot({
      wineryId: winery.id,
      connectionId: connection.id,
      input: snapshot({
        sourceRevision: 'old-order',
        sourceUpdatedAt: '2026-08-19T00:00:00.000Z',
        observedAt: '2026-08-20T03:00:00.000Z'
      })
    });
    expect(stale).toEqual({ status: 'STALE_IGNORED', salesOrderId: first.salesOrderId });

    const conflict = await commerceProjection.projectCommerceOrderSnapshot({
      wineryId: winery.id,
      connectionId: connection.id,
      input: snapshot({
        externalId: 'source-order-duplicate',
        sourceRevision: 'duplicate-v1',
        sourceUpdatedAt: '2026-08-20T04:00:00.000Z',
        observedAt: '2026-08-20T04:01:00.000Z'
      })
    });
    expect(conflict).toEqual({ status: 'SOURCE_CONFLICT', salesOrderId: first.salesOrderId });
    expect(await db.ProjectionIssue.count({ where: { issueType: 'OUT_OF_ORDER' } })).toBe(1);
    expect(await db.ProjectionIssue.count({ where: { issueType: 'SOURCE_CONFLICT', severity: 'BLOCKING' } })).toBe(1);

    const unresolved = await commerceProjection.projectCommerceOrderSnapshot({
      wineryId: winery.id,
      connectionId: connection.id,
      input: snapshot({
        externalId: 'walk-in-order',
        orderNumber: 'WALK-IN-101',
        memberId: null,
        customerResolutionStatus: 'UNRESOLVED',
        sourceRevision: 'walk-in-v1',
        sourceUpdatedAt: '2026-08-20T05:00:00.000Z',
        observedAt: '2026-08-20T05:01:00.000Z',
        lines: [{
          ...snapshot().lines[0],
          lineKey: 'unmapped-wine',
          wineryProductId: null,
          productResolutionStatus: 'UNRESOLVED'
        }],
        paymentEvents: [],
        refunds: []
      })
    });
    expect((await db.SalesOrder.findByPk(unresolved.salesOrderId)).memberId).toBeNull();
  });

  test('keeps immutable payment facts and records a conflicting event-key replay', async () => {
    const first = await commerceProjection.projectCommerceOrderSnapshot({
      wineryId: winery.id,
      connectionId: connection.id,
      input: snapshot()
    });
    const replay = await commerceProjection.projectCommerceOrderSnapshot({
      wineryId: winery.id,
      connectionId: connection.id,
      input: snapshot({
        sourceRevision: 'order-v2',
        sourceUpdatedAt: '2026-08-20T02:00:00.000Z',
        observedAt: '2026-08-20T02:01:00.000Z',
        paymentEvents: [{ ...snapshot().paymentEvents[0], amountMinor: 12000 }]
      })
    });
    expect(replay).toEqual(expect.objectContaining({ salesOrderId: first.salesOrderId, paymentEventConflicts: 1 }));
    expect((await db.PaymentSummaryEvent.findOne()).amountMinor).toBe(12500);
  });

  test('preserves orders during customer merge and keeps reads winery scoped', async () => {
    const projected = await commerceProjection.projectCommerceOrderSnapshot({
      wineryId: winery.id,
      connectionId: connection.id,
      input: snapshot()
    });
    const target = await db.Member.create({ wineryId: winery.id, firstName: 'Retained', lastName: 'Customer' });
    await request(app)
      .post(`/api/members/${target.id}/merge`)
      .set('Authorization', auth)
      .send({ sourceMemberId: member.id })
      .expect(200);
    expect((await db.SalesOrder.findByPk(projected.salesOrderId)).memberId).toBe(target.id);

    const foreignWinery = await db.Winery.create({ name: 'Other Tenant' });
    const foreignManager = await db.User.create({
      firebaseUid: `other-commerce-manager-${crypto.randomUUID()}`,
      email: 'other@example.invalid',
      displayName: 'Other Manager',
      role: 'manager',
      wineryId: foreignWinery.id
    });
    const foreignConnection = await db.IntegrationConnection.create({
      wineryId: foreignWinery.id,
      connectionKey: 'foreign-commerce',
      providerKey: 'foreign',
      displayName: 'Foreign',
      status: 'CONNECTED',
      createdBy: foreignManager.id,
      updatedBy: foreignManager.id
    });
    const foreignReference = await db.ExternalResourceReference.create({
      wineryId: foreignWinery.id,
      connectionId: foreignConnection.id,
      resourceType: 'SALES_ORDER',
      externalId: 'foreign-order',
      observedAt: new Date(),
      resolutionStatus: 'RESOLVED'
    });
    const foreignOrder = await db.SalesOrder.create({
      wineryId: foreignWinery.id,
      primarySourceReferenceId: foreignReference.id,
      authorityConnectionId: foreignConnection.id,
      customerResolutionStatus: 'UNRESOLVED',
      canonicalStatus: 'OPEN',
      orderNumber: 'FOREIGN-1',
      sourceChannel: 'OTHER',
      paymentStatus: 'UNKNOWN',
      fulfilmentStatus: 'UNKNOWN',
      sourceRevision: 'v1',
      sourceUpdatedAt: new Date(),
      observedAt: new Date(),
      sourceHash: 'a'.repeat(64)
    });
    const list = await request(app)
      .get('/api/integration-management/sales-orders')
      .set('Authorization', auth)
      .expect(200);
    expect(list.body.salesOrders.map(order => order.id)).toEqual([projected.salesOrderId]);
    await request(app)
      .get(`/api/integration-management/sales-orders/${foreignOrder.id}`)
      .set('Authorization', auth)
      .expect(404);
  });
});
