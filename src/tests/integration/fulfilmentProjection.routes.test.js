process.env.ALLOW_TEST_AUTH_BYPASS = 'true';
process.env.NODE_ENV = 'test';

const crypto = require('crypto');
const request = require('supertest');
const app = require('../../app');
const db = require('../../models');
const fulfilmentProjection = require('../../services/fulfilmentProjection.service');
const shipmentExceptionContext = require('../../services/shipmentExceptionContext.service');
const shipmentExceptionLifecycle = require('../../services/shipmentExceptionLifecycle.service');

describe('canonical fulfilment shadow projection and exception context', () => {
  const auth = 'Bearer mock-token';
  let winery;
  let manager;
  let staff;
  let area;
  let member;
  let product;
  let variant;
  let commerceConnection;
  let fulfilmentConnection;
  let order;
  let orderLine;
  let address;
  let baseTime;

  const at = offset => new Date(baseTime + offset).toISOString();
  const snapshot = overrides => ({
    contractVersion: 'shipment-shadow.v1',
    externalId: 'shipment-source-100',
    memberId: member.id,
    customerResolutionStatus: 'RESOLVED',
    salesOrderId: order.id,
    orderResolutionStatus: 'RESOLVED',
    wineClubAllocationId: null,
    allocationResolutionStatus: 'NOT_APPLICABLE',
    restrictedAddressId: address.id,
    carrierKey: 'AUSTRALIA_POST',
    serviceLevel: 'EXPRESS',
    trackingReference: 'TRACK-SECRET-1234',
    canonicalStatus: 'DELIVERY_EXCEPTION',
    providerStatus: 'delayed',
    promisedDeliveryAt: at(2 * 60 * 60 * 1000),
    shippedAt: at(-24 * 60 * 60 * 1000),
    estimatedDeliveryAt: at(4 * 60 * 60 * 1000),
    deliveredAt: null,
    returnedAt: null,
    destinationCountry: 'AU',
    destinationRegion: 'SA',
    destinationPostcodePrefix: '50',
    sourceRevision: 'shipment-v1',
    sourceUpdatedAt: at(-90 * 1000),
    observedAt: at(-60 * 1000),
    packagesComplete: true,
    packages: [{
      packageKey: 'package-1',
      trackingReference: 'PACKAGE-SECRET-5678',
      packageType: 'BOX',
      weight: 3.5,
      weightUnit: 'KG',
      length: 40,
      width: 30,
      height: 20,
      dimensionUnit: 'CM'
    }],
    itemsComplete: true,
    items: [{
      itemKey: 'shipment-line-1',
      packageKey: 'package-1',
      salesOrderLineId: orderLine.id,
      lineResolutionStatus: 'RESOLVED',
      productVariantId: variant.id,
      productResolutionStatus: 'RESOLVED',
      providerSku: 'SHZ-22',
      description: 'Estate Shiraz',
      quantity: 2,
      unit: 'BOTTLE'
    }],
    trackingEvents: [{
      eventKey: 'carrier-event-delay',
      packageKey: 'package-1',
      canonicalCode: 'DELAYED',
      providerCode: 'WEATHER_DELAY',
      description: 'Carrier network delayed by weather.',
      occurredAt: at(-2 * 60 * 1000),
      locationSummary: 'Adelaide facility',
      exceptionCategory: 'WEATHER'
    }],
    ...overrides
  });

  beforeEach(async () => {
    baseTime = Date.now();
    await db.sequelize.sync({ force: true });
    winery = await db.Winery.create({ name: 'Fulfilment Graph Winery' });
    manager = await db.User.create({
      firebaseUid: `fulfilment-manager-${crypto.randomUUID()}`,
      email: 'stub@example.com',
      displayName: 'Fulfilment Manager',
      role: 'manager',
      wineryId: winery.id
    });
    staff = await db.User.create({
      firebaseUid: `fulfilment-staff-${crypto.randomUUID()}`,
      email: 'delivery-staff@example.com',
      displayName: 'Delivery Staff',
      role: 'staff',
      wineryId: winery.id
    });
    area = await db.OperationalArea.create({
      wineryId: winery.id,
      name: 'Customer Fulfilment'
    });
    member = await db.Member.create({
      wineryId: winery.id,
      firstName: 'Shipment',
      lastName: 'Customer'
    });
    address = await db.CustomerAddress.create({
      wineryId: winery.id,
      memberId: member.id,
      addressType: 'SHIPPING',
      fingerprint: 'a'.repeat(64),
      addressLine1: 'Restricted delivery address',
      suburb: 'Adelaide',
      state: 'SA',
      postcode: '5000',
      country: 'Australia',
      sourceKind: 'MANAGER',
      sourceKey: 'shipment-address'
    });
    product = await db.WineryProduct.create({ wineryId: winery.id, name: 'Estate Shiraz' });
    variant = await db.ProductVariant.create({
      wineryId: winery.id,
      wineryProductId: product.id,
      code: 'estate-shiraz-2022',
      name: 'Estate Shiraz 2022',
      sku: 'SHZ-22',
      unitOfMeasure: 'BOTTLE',
      isDefault: true
    });
    commerceConnection = await db.IntegrationConnection.create({
      wineryId: winery.id,
      connectionKey: 'commerce-for-shipment',
      providerKey: 'generic-commerce',
      displayName: 'Generic Commerce',
      status: 'CONNECTED',
      createdBy: manager.id,
      updatedBy: manager.id
    });
    const orderReference = await db.ExternalResourceReference.create({
      wineryId: winery.id,
      connectionId: commerceConnection.id,
      resourceType: 'SALES_ORDER',
      externalId: 'order-for-shipment',
      providerVersion: 'v1',
      sourceHash: 'b'.repeat(64),
      providerUpdatedAt: at(-60 * 60 * 1000),
      observedAt: at(-59 * 60 * 1000),
      resolutionStatus: 'RESOLVED'
    });
    order = await db.SalesOrder.create({
      wineryId: winery.id,
      memberId: member.id,
      primarySourceReferenceId: orderReference.id,
      authorityConnectionId: commerceConnection.id,
      customerResolutionStatus: 'RESOLVED',
      canonicalStatus: 'PAID',
      orderNumber: 'ORDER-SHIP-1',
      sourceChannel: 'ECOMMERCE',
      paymentStatus: 'PAID',
      fulfilmentStatus: 'PARTIAL',
      sourceRevision: 'v1',
      sourceUpdatedAt: at(-60 * 60 * 1000),
      observedAt: at(-59 * 60 * 1000),
      sourceHash: 'c'.repeat(64)
    });
    await orderReference.update({ canonicalType: 'SALES_ORDER', canonicalId: order.id });
    orderLine = await db.SalesOrderLine.create({
      wineryId: winery.id,
      salesOrderId: order.id,
      wineryProductId: product.id,
      productVariantId: variant.id,
      productResolutionStatus: 'RESOLVED',
      lineKey: 'line-1',
      lineType: 'PRODUCT',
      description: 'Estate Shiraz',
      quantity: 2,
      unit: 'BOTTLE'
    });
    fulfilmentConnection = await db.IntegrationConnection.create({
      wineryId: winery.id,
      connectionKey: 'carrier-source',
      providerKey: 'generic-carrier',
      displayName: 'Generic Carrier',
      status: 'CONNECTED',
      createdBy: manager.id,
      updatedBy: manager.id
    });
    await db.IntegrationConnectionScope.create({
      wineryId: winery.id,
      connectionId: fulfilmentConnection.id,
      domain: 'FULFILMENT',
      scopeKey: 'winery',
      isDefault: true,
      isActive: true
    });
  });

  afterAll(async () => db.sequelize.close());

  test('projects one shipment, protects tracking/address data, and resolves exception context', async () => {
    const first = await fulfilmentProjection.projectShipmentSnapshot({
      wineryId: winery.id,
      connectionId: fulfilmentConnection.id,
      input: snapshot()
    });
    expect(first).toEqual(expect.objectContaining({
      status: 'PROJECTED_SHADOW',
      packagesProjected: 1,
      itemsProjected: 1,
      eventsCreated: 1,
      automationEligible: false
    }));
    const retry = await fulfilmentProjection.projectShipmentSnapshot({
      wineryId: winery.id,
      connectionId: fulfilmentConnection.id,
      input: snapshot()
    });
    expect(retry).toEqual(expect.objectContaining({
      shipmentId: first.shipmentId,
      eventsCreated: 0,
      eventConflicts: 0
    }));
    expect(await db.Shipment.count()).toBe(1);
    expect(await db.ShipmentTrackingEvent.count()).toBe(1);
    const stored = JSON.stringify({
      shipment: await db.Shipment.findByPk(first.shipmentId),
      packages: await db.ShipmentPackage.findAll(),
      events: await db.ShipmentTrackingEvent.findAll()
    });
    expect(stored).not.toContain('TRACK-SECRET-1234');
    expect(stored).not.toContain('PACKAGE-SECRET-5678');
    expect(stored).not.toContain('Restricted delivery address');

    const context = await shipmentExceptionContext.resolveShipmentException({
      wineryId: winery.id,
      input: { shipmentId: first.shipmentId, maxAgeSeconds: 3600 },
      now: new Date(baseTime)
    });
    expect(context).toEqual(expect.objectContaining({
      relationships: expect.objectContaining({
        memberId: member.id,
        salesOrderId: order.id
      }),
      exception: expect.objectContaining({
        active: true,
        category: 'WEATHER',
        severity: 'MEDIUM'
      }),
      timing: expect.objectContaining({ status: 'AT_RISK' }),
      freshness: expect.objectContaining({ status: 'FRESH' })
    }));
    expect(JSON.stringify(context)).not.toContain('5000');
    expect(JSON.stringify(context)).not.toContain('TRACK-SECRET');

    const detail = await request(app)
      .get(`/api/integration-management/shipments/${first.shipmentId}`)
      .set('Authorization', auth);
    expect(detail.status).toBe(200);
    expect(detail.body.shipment).toEqual(expect.objectContaining({
      trackingReferenceDisplay: '••••1234',
      trackingReferenceLast4: '1234'
    }));
    const detailJson = JSON.stringify(detail.body);
    expect(detailJson).not.toContain('trackingReferenceHash');
    expect(detailJson).not.toContain('TRACK-SECRET-1234');
    expect(detailJson).not.toContain('Restricted delivery address');
  });

  test('appends delivery, clears the current exception, and retains immutable history', async () => {
    const first = await fulfilmentProjection.projectShipmentSnapshot({
      wineryId: winery.id,
      connectionId: fulfilmentConnection.id,
      input: snapshot()
    });
    const activeIntent = await shipmentExceptionLifecycle.resolveDesired({
      binding: {
        wineryId: winery.id,
        resourceId: first.shipmentId,
        configurationSnapshot: {
          responseMinutes: 120,
          category: 'ORDER',
          subType: 'DELIVERY_EXCEPTION',
          priority: 'high',
          assigneeId: staff.id
        }
      }
    });
    expect(activeIntent).toEqual(expect.objectContaining({
      intent: 'UPDATE',
      reason: 'SHIPMENT_EXCEPTION_CHANGED',
      snapshot: expect.objectContaining({
        assigneeId: staff.id,
        memberId: member.id,
        'payload.exceptionCategory': 'WEATHER'
      })
    }));
    const delivered = await fulfilmentProjection.projectShipmentSnapshot({
      wineryId: winery.id,
      connectionId: fulfilmentConnection.id,
      input: snapshot({
        canonicalStatus: 'DELIVERED',
        providerStatus: 'delivered',
        deliveredAt: at(3 * 60 * 60 * 1000),
        sourceRevision: 'shipment-v2',
        sourceUpdatedAt: at(3 * 60 * 60 * 1000),
        observedAt: at((3 * 60 * 60 * 1000) + 1000),
        trackingEvents: [
          snapshot().trackingEvents[0],
          {
            eventKey: 'carrier-event-delivered',
            packageKey: 'package-1',
            canonicalCode: 'DELIVERED',
            providerCode: 'DELIVERED',
            description: 'Delivered.',
            occurredAt: at(3 * 60 * 60 * 1000),
            locationSummary: 'Destination region',
            exceptionCategory: 'NONE'
          }
        ]
      })
    });
    expect(delivered).toEqual(expect.objectContaining({
      shipmentId: first.shipmentId,
      eventsCreated: 1,
      eventConflicts: 0
    }));
    expect(await db.ShipmentTrackingEvent.count()).toBe(2);
    const shipment = await db.Shipment.findByPk(first.shipmentId);
    expect(shipment).toMatchObject({
      canonicalStatus: 'DELIVERED',
      latestExceptionCategory: 'NONE',
      latestExceptionCode: null,
      latestExceptionSummary: null
    });
    const context = await shipmentExceptionContext.resolveShipmentException({
      wineryId: winery.id,
      input: { shipmentId: first.shipmentId, maxAgeSeconds: 86400 },
      now: new Date(baseTime + (3 * 60 * 60 * 1000))
    });
    expect(context.exception).toEqual({
      active: false,
      category: 'NONE',
      code: null,
      summary: null,
      severity: 'NONE'
    });
    expect(context.timing.status).toBe('DELIVERED_LATE');
    const futureDatedContext = await shipmentExceptionContext.resolveShipmentException({
      wineryId: winery.id,
      input: { shipmentId: first.shipmentId, maxAgeSeconds: 86400 },
      now: new Date(baseTime)
    });
    expect(futureDatedContext.freshness.status).toBe('STALE');
    expect(futureDatedContext.explanations).toContain('SHIPMENT_OBSERVATION_IN_FUTURE');
    const clearedIntent = await shipmentExceptionLifecycle.resolveDesired({
      binding: {
        wineryId: winery.id,
        resourceId: first.shipmentId,
        configurationSnapshot: {}
      }
    });
    expect(clearedIntent).toEqual(expect.objectContaining({
      intent: 'CANCEL',
      reason: 'SHIPMENT_EXCEPTION_CLEARED'
    }));
  });

  test('offers a manager-installed draft exception rule without enabling live fulfilment', async () => {
    const templates = await request(app)
      .get('/api/automations/templates')
      .set('Authorization', auth);
    expect(templates.status).toBe(200);
    expect(templates.body.templates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'shipment.exception_resolution.v1',
        contextPack: 'shipment.exception.v1',
        requiresManagerActivation: true
      })
    ]));
    const installed = await request(app)
      .post('/api/automations/templates/shipment.exception_resolution.v1/rules')
      .set('Authorization', auth)
      .send({
        assigneeId: staff.id,
        areaId: area.id,
        responseMinutes: 180
      });
    expect(installed.status).toBe(201);
    expect(installed.body.rule.status).toBe('DRAFT');
    const version = await db.AutomationRuleVersion.findOne({
      where: { ruleId: installed.body.rule.id, version: 1 }
    });
    expect(version.definition).toEqual(expect.objectContaining({
      trigger: { eventType: 'shipment.exception' },
      action: expect.objectContaining({
        timing: {
          dueAt: {
            path: 'context.exception.shipment.latestTrackingOccurredAt',
            offsetMinutes: 180
          }
        }
      })
    }));
    expect(await db.IntegrationDomainActivation.count({
      where: { wineryId: winery.id, domain: 'FULFILMENT' }
    })).toBe(0);
  });

  test('rejects stale/conflicting/secret input and cross-winery mappings', async () => {
    const first = await fulfilmentProjection.projectShipmentSnapshot({
      wineryId: winery.id,
      connectionId: fulfilmentConnection.id,
      input: snapshot()
    });
    const stale = await fulfilmentProjection.projectShipmentSnapshot({
      wineryId: winery.id,
      connectionId: fulfilmentConnection.id,
      input: snapshot({
        sourceRevision: 'old',
        sourceUpdatedAt: at(-2 * 60 * 60 * 1000),
        observedAt: at(-30 * 1000)
      })
    });
    expect(stale.status).toBe('STALE_IGNORED');
    await expect(fulfilmentProjection.projectShipmentSnapshot({
      wineryId: winery.id,
      connectionId: fulfilmentConnection.id,
      input: snapshot({ providerExtensions: { destinationAddress: 'must-not-store' } })
    })).rejects.toThrow('forbidden field');
    const eventConflict = await fulfilmentProjection.projectShipmentSnapshot({
      wineryId: winery.id,
      connectionId: fulfilmentConnection.id,
      input: snapshot({
        sourceRevision: 'shipment-v2',
        sourceUpdatedAt: at(1000),
        observedAt: at(2000),
        trackingEvents: [{
          ...snapshot().trackingEvents[0],
          description: 'Conflicting reuse of immutable event key.'
        }]
      })
    });
    expect(eventConflict.eventConflicts).toBe(1);
    expect(await db.ShipmentTrackingEvent.count()).toBe(1);

    const trackingConflict = await fulfilmentProjection.projectShipmentSnapshot({
      wineryId: winery.id,
      connectionId: fulfilmentConnection.id,
      input: snapshot({
        externalId: 'shipment-source-other',
        sourceRevision: 'other-v1',
        sourceUpdatedAt: at(3000),
        observedAt: at(4000)
      })
    });
    expect(trackingConflict).toEqual(expect.objectContaining({
      status: 'SOURCE_CONFLICT',
      shipmentId: first.shipmentId
    }));

    const otherWinery = await db.Winery.create({ name: 'Other Fulfilment Winery' });
    const otherProduct = await db.WineryProduct.create({ wineryId: otherWinery.id, name: 'Other Wine' });
    const otherVariant = await db.ProductVariant.create({
      wineryId: otherWinery.id,
      wineryProductId: otherProduct.id,
      code: 'other-wine',
      name: 'Other Wine',
      unitOfMeasure: 'BOTTLE'
    });
    await expect(fulfilmentProjection.projectShipmentSnapshot({
      wineryId: winery.id,
      connectionId: fulfilmentConnection.id,
      input: snapshot({
        items: [{
          ...snapshot().items[0],
          salesOrderLineId: null,
          lineResolutionStatus: 'NOT_APPLICABLE',
          productVariantId: otherVariant.id
        }]
      })
    })).rejects.toThrow('active winery mappings');
    expect(await db.ProjectionIssue.count({
      where: { wineryId: winery.id, issueType: 'SOURCE_CONFLICT' }
    })).toBeGreaterThanOrEqual(2);
  });
});
