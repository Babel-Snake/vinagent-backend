process.env.ALLOW_TEST_AUTH_BYPASS = 'true';
process.env.NODE_ENV = 'test';

const crypto = require('crypto');
const request = require('supertest');
const app = require('../../app');
const db = require('../../models');
const inventoryProjection = require('../../services/inventoryProjection.service');
const bookingReadinessContext = require('../../services/bookingReadinessContext.service');

describe('canonical inventory shadow projection and freshness-safe availability', () => {
  const auth = 'Bearer mock-token';
  let winery;
  let manager;
  let product;
  let venue;
  let variant;
  let stockLocation;
  let connection;
  let baseTime;

  const snapshot = overrides => ({
    contractVersion: 'inventory-position-shadow.v1',
    externalId: 'stock-truffle-cellar-door',
    productVariantId: variant.id,
    stockLocationId: stockLocation.id,
    onHandQuantity: 8,
    availableQuantity: 5,
    reservedQuantity: 3,
    incomingQuantity: 2,
    damagedQuantity: 0,
    heldQuantity: 0,
    unit: 'PORTION',
    incomingExpectedAt: new Date(baseTime + (60 * 60 * 1000)).toISOString(),
    sourceAssertedAt: new Date(baseTime - (2 * 60 * 1000)).toISOString(),
    sourceUpdatedAt: new Date(baseTime - (90 * 1000)).toISOString(),
    observedAt: new Date(baseTime - (60 * 1000)).toISOString(),
    staleAt: new Date(baseTime + (24 * 60 * 60 * 1000)).toISOString(),
    sourceRevision: 'inventory-v1',
    authorityPolicyVersion: 'inventory-shadow-policy-v1',
    qualityState: 'SOURCE_ASSERTED',
    ...overrides
  });

  beforeEach(async () => {
    baseTime = Date.now();
    await db.sequelize.sync({ force: true });
    winery = await db.Winery.create({ name: 'Inventory Graph Winery' });
    manager = await db.User.create({
      firebaseUid: `inventory-manager-${crypto.randomUUID()}`,
      email: 'stub@example.com',
      displayName: 'Inventory Manager',
      role: 'manager',
      wineryId: winery.id
    });
    product = await db.WineryProduct.create({
      wineryId: winery.id,
      name: 'Paired Truffle',
      category: 'FOOD',
      stockStatus: 'IN_STOCK'
    });
    venue = await db.WineryLocation.create({
      wineryId: winery.id,
      code: 'cellar-door',
      name: 'Cellar Door'
    });
    const variantResponse = await request(app)
      .post('/api/integration-management/product-variants')
      .set('Authorization', auth)
      .send({
        wineryProductId: product.id,
        code: 'truffle-portion',
        name: 'Paired Truffle Portion',
        sku: 'TRUFFLE-PORTION',
        unitOfMeasure: 'PORTION',
        isDefault: true
      });
    expect(variantResponse.status).toBe(201);
    variant = await db.ProductVariant.findByPk(variantResponse.body.productVariant.id);
    const locationResponse = await request(app)
      .post('/api/integration-management/stock-locations')
      .set('Authorization', auth)
      .send({
        wineryLocationId: venue.id,
        code: 'cellar-door-store',
        name: 'Cellar Door Store',
        locationType: 'SERVICE_STORE',
        isDefault: true
      });
    expect(locationResponse.status).toBe(201);
    stockLocation = await db.StockLocation.findByPk(locationResponse.body.stockLocation.id);
    connection = await db.IntegrationConnection.create({
      wineryId: winery.id,
      connectionKey: 'inventory-source',
      providerKey: 'generic-inventory',
      displayName: 'Generic Inventory',
      status: 'CONNECTED',
      createdBy: manager.id,
      updatedBy: manager.id
    });
    await db.IntegrationConnectionScope.create({
      wineryId: winery.id,
      connectionId: connection.id,
      domain: 'INVENTORY',
      scopeKey: 'winery',
      isDefault: true,
      isActive: true
    });
  });

  afterAll(async () => db.sequelize.close());

  test('projects repeatable current state with immutable history and preserves merchandising stock', async () => {
    const first = await inventoryProjection.projectInventoryPositionSnapshot({
      wineryId: winery.id,
      connectionId: connection.id,
      input: snapshot()
    });
    expect(first).toEqual(expect.objectContaining({
      status: 'PROJECTED_SHADOW',
      snapshotCreated: true,
      automationEligible: false
    }));
    const retry = await inventoryProjection.projectInventoryPositionSnapshot({
      wineryId: winery.id,
      connectionId: connection.id,
      input: snapshot()
    });
    expect(retry).toEqual(expect.objectContaining({
      status: 'PROJECTED_SHADOW',
      inventoryPositionId: first.inventoryPositionId,
      snapshotCreated: false
    }));
    const updated = await inventoryProjection.projectInventoryPositionSnapshot({
      wineryId: winery.id,
      connectionId: connection.id,
      input: snapshot({
        availableQuantity: 4,
        sourceRevision: 'inventory-v2',
        sourceUpdatedAt: new Date(baseTime + 3000).toISOString(),
        observedAt: new Date(baseTime + 4000).toISOString()
      })
    });
    expect(updated.snapshotCreated).toBe(true);
    expect(await db.InventoryPosition.count()).toBe(1);
    expect(await db.InventorySnapshot.count()).toBe(2);
    await product.reload();
    expect(product.stockStatus).toBe('IN_STOCK');

    const list = await request(app)
      .get('/api/integration-management/inventory-positions?freshness=FRESH')
      .set('Authorization', auth);
    expect(list.status).toBe(200);
    expect(list.body.inventoryPositions).toHaveLength(1);
    expect(list.body.inventoryPositions[0]).toEqual(expect.objectContaining({
      id: first.inventoryPositionId,
      freshnessStatus: 'FRESH'
    }));
    expect(list.body.inventoryPositions[0].providerExtensions).toBeUndefined();
    const detail = await request(app)
      .get(`/api/integration-management/inventory-positions/${first.inventoryPositionId}?snapshotLimit=10`)
      .set('Authorization', auth);
    expect(detail.status).toBe(200);
    expect(detail.body.snapshots).toHaveLength(2);
  });

  test('subtracts typed commitments, includes timely incoming stock, and fails closed when stale', async () => {
    await inventoryProjection.projectInventoryPositionSnapshot({
      wineryId: winery.id,
      connectionId: connection.id,
      input: snapshot()
    });
    const commitment = await inventoryProjection.upsertInventoryCommitment({
      wineryId: winery.id,
      input: {
        productVariantId: variant.id,
        stockLocationId: stockLocation.id,
        sourceType: 'INTERNAL_EVENT',
        sourceId: 101,
        purposeKey: 'paired-truffle-tasting',
        quantity: 6,
        unit: 'PORTION',
        requiredAt: '2099-01-03T00:00:00.000Z',
        status: 'EXPECTED',
        confidence: 1,
        derivation: 'MANAGER_CONFIRMED',
        derivationVersion: 'test-demand-v1',
        sourceUpdatedAt: '2099-01-01T01:00:00.000Z',
        observedAt: '2099-01-01T01:00:00.000Z'
      }
    });
    expect(commitment).toEqual(expect.objectContaining({ status: 'UPSERTED', created: true }));
    const availability = await request(app)
      .get(
        '/api/integration-management/inventory-availability'
        + `?productVariantId=${variant.id}&stockLocationId=${stockLocation.id}`
        + '&requiredAt=2099-01-03T00:00:00.000Z&additionalRequiredQuantity=2'
        + '&unit=PORTION&includeIncoming=true'
      )
      .set('Authorization', auth);
    expect(availability.status).toBe(200);
    expect(availability.body.availability).toEqual(expect.objectContaining({
      status: 'SHORTAGE',
      calculationReliable: true,
      supplyQuantity: 7,
      activeCommittedQuantity: 6,
      netAvailableToPromiseQuantity: 1,
      shortageQuantity: 1,
      incomingIncluded: true,
      automationEligible: false
    }));

    await db.InventoryPosition.update(
      { staleAt: '2020-01-01T00:00:00.000Z' },
      { where: { wineryId: winery.id } }
    );
    const stale = await inventoryProjection.calculateAvailableToPromise({
      wineryId: winery.id,
      productVariantId: variant.id,
      stockLocationId: stockLocation.id,
      requiredAt: '2099-01-03T00:00:00.000Z'
    });
    expect(stale).toEqual(expect.objectContaining({
      status: 'STALE',
      calculationReliable: false,
      automationEligible: false
    }));
  });

  test('maps a booking requirement into auditable demand and exposes a real shortage to readiness', async () => {
    await inventoryProjection.projectInventoryPositionSnapshot({
      wineryId: winery.id,
      connectionId: connection.id,
      input: snapshot({
        availableQuantity: 5,
        incomingQuantity: 0,
        incomingExpectedAt: null
      })
    });
    const bookingConnection = await db.IntegrationConnection.create({
      wineryId: winery.id,
      connectionKey: 'booking-source-for-demand',
      providerKey: 'generic-booking',
      displayName: 'Generic Booking',
      status: 'CONNECTED',
      createdBy: manager.id,
      updatedBy: manager.id
    });
    await db.IntegrationConnectionScope.create({
      wineryId: winery.id,
      connectionId: bookingConnection.id,
      domain: 'BOOKING',
      scopeKey: 'winery',
      isDefault: true,
      isActive: true
    });
    const bookingReference = await db.ExternalResourceReference.create({
      wineryId: winery.id,
      connectionId: bookingConnection.id,
      resourceType: 'BOOKING',
      externalId: 'booking-truffle-demand',
      providerVersion: 'v1',
      sourceHash: 'a'.repeat(64),
      providerUpdatedAt: '2026-08-20T01:00:00.000Z',
      observedAt: '2026-08-20T01:01:00.000Z',
      resolutionStatus: 'RESOLVED'
    });
    const booking = await db.Booking.create({
      wineryId: winery.id,
      locationId: venue.id,
      primarySourceReferenceId: bookingReference.id,
      authorityConnectionId: bookingConnection.id,
      canonicalStatus: 'CONFIRMED',
      providerStatus: 'confirmed',
      referenceCode: 'TRUFFLE-BOOKING-1',
      sourceChannel: 'ONLINE',
      startAt: '2099-01-03T00:00:00.000Z',
      partySize: 6,
      qualityState: 'SOURCE_ASSERTED',
      authorityState: 'IMPLICIT_SINGLE_SOURCE',
      projectionRevision: 'booking-v1',
      sourceUpdatedAt: '2026-08-20T01:00:00.000Z',
      sourceHash: 'b'.repeat(64),
      resolvedAt: new Date(),
      isSourceDeleted: false
    });
    await bookingReference.update({ canonicalType: 'BOOKING', canonicalId: booking.id });
    await db.BookingRequirement.create({
      wineryId: winery.id,
      bookingId: booking.id,
      sourceReferenceId: bookingReference.id,
      requirementKey: 'ADD_ON:truffle-pairing',
      kind: 'ADD_ON',
      sourceKind: 'ADD_ON',
      code: 'truffle-pairing',
      description: 'Paired truffle tasting',
      quantity: 6,
      unit: 'portion',
      sensitivityClass: 'OPERATIONAL',
      sourceRevision: 'v1',
      isActive: true
    });

    const requestId = crypto.randomUUID();
    const mappingPayload = {
      requestId,
      reason: 'Map confirmed paired truffle requirements to the cellar-door portion stock.',
      sourceRecordType: 'BOOKING_REQUIREMENT',
      sourceConnectionId: bookingConnection.id,
      sourceCode: 'truffle-pairing',
      productVariantId: variant.id,
      stockLocationId: stockLocation.id,
      quantityMultiplier: 1,
      unit: 'PORTION',
      status: 'ACTIVE'
    };
    const mapped = await request(app)
      .post('/api/integration-management/inventory-demand-mappings')
      .set('Authorization', auth)
      .send(mappingPayload);
    expect(mapped.status).toBe(201);
    expect(mapped.body).toEqual(expect.objectContaining({
      duplicate: false,
      refresh: expect.objectContaining({
        bookingsMatched: 1,
        commitmentsUpserted: 1
      })
    }));
    const commitment = await db.InventoryCommitment.findOne({
      where: { wineryId: winery.id, sourceType: 'BOOKING', sourceId: booking.id }
    });
    expect(commitment).toMatchObject({
      productVariantId: variant.id,
      stockLocationId: stockLocation.id,
      purposeKey: 'requirement:ADD_ON:truffle-pairing',
      status: 'EXPECTED',
      derivation: 'DETERMINISTIC'
    });
    expect(Number(commitment.quantity)).toBe(6);
    const readiness = await bookingReadinessContext.resolveBookingReadiness({
      wineryId: winery.id,
      input: { bookingId: booking.id, maxAgeSeconds: 3600 },
      now: new Date()
    });
    expect(readiness.inventory).toEqual(expect.objectContaining({
      status: 'SHORTAGE',
      code: 'INVENTORY_SHORTAGE',
      calculationReliable: true,
      commitmentCount: 1
    }));
    expect(readiness.inventory.checks[0]).toEqual(expect.objectContaining({
      requiredQuantity: 6,
      netAvailableToPromiseQuantity: -1,
      shortageQuantity: 1
    }));
    const duplicate = await request(app)
      .post('/api/integration-management/inventory-demand-mappings')
      .set('Authorization', auth)
      .send(mappingPayload);
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.duplicate).toBe(true);
    expect(await db.InventoryCommitment.count({
      where: { wineryId: winery.id, sourceType: 'BOOKING', sourceId: booking.id }
    })).toBe(1);
    expect(await db.IntegrationOperationAuditEvent.count({
      where: { wineryId: winery.id, action: 'INVENTORY_DEMAND_MAPPING_UPSERTED' }
    })).toBe(1);

    const disabled = await request(app)
      .post('/api/integration-management/inventory-demand-mappings')
      .set('Authorization', auth)
      .send({
        ...mappingPayload,
        requestId: crypto.randomUUID(),
        reason: 'Disable this demand mapping while the paired truffle code is being revised.',
        status: 'DISABLED'
      });
    expect(disabled.status).toBe(201);
    expect(disabled.body.refresh.commitmentsCancelled).toBe(1);
    await commitment.reload();
    expect(commitment.status).toBe('CANCELLED');
  });

  test('blocks conflicts, out-of-order updates, secrets, and cross-winery mappings', async () => {
    const projected = await inventoryProjection.projectInventoryPositionSnapshot({
      wineryId: winery.id,
      connectionId: connection.id,
      input: snapshot()
    });
    const stale = await inventoryProjection.projectInventoryPositionSnapshot({
      wineryId: winery.id,
      connectionId: connection.id,
      input: snapshot({
        sourceRevision: 'inventory-old',
        sourceUpdatedAt: new Date(baseTime - (60 * 60 * 1000)).toISOString(),
        observedAt: new Date(baseTime - (30 * 1000)).toISOString()
      })
    });
    expect(stale.status).toBe('STALE_IGNORED');
    await expect(inventoryProjection.projectInventoryPositionSnapshot({
      wineryId: winery.id,
      connectionId: connection.id,
      input: snapshot({ providerExtensions: { apiToken: 'must-not-store' } })
    })).rejects.toThrow('forbidden field');

    const secondConnection = await db.IntegrationConnection.create({
      wineryId: winery.id,
      connectionKey: 'second-inventory-source',
      providerKey: 'other-inventory',
      displayName: 'Other Inventory',
      status: 'CONNECTED',
      createdBy: manager.id,
      updatedBy: manager.id
    });
    await db.IntegrationConnectionScope.create({
      wineryId: winery.id,
      connectionId: secondConnection.id,
      domain: 'INVENTORY',
      scopeKey: 'winery',
      isDefault: true,
      isActive: true
    });
    const conflict = await inventoryProjection.projectInventoryPositionSnapshot({
      wineryId: winery.id,
      connectionId: secondConnection.id,
      input: snapshot({
        externalId: 'other-source-same-position',
        sourceRevision: 'other-v1',
        sourceUpdatedAt: new Date(baseTime + 3000).toISOString(),
        observedAt: new Date(baseTime + 4000).toISOString()
      })
    });
    expect(conflict).toEqual(expect.objectContaining({
      status: 'SOURCE_CONFLICT',
      inventoryPositionId: projected.inventoryPositionId
    }));
    expect(await db.ProjectionIssue.count({
      where: { wineryId: winery.id, issueType: 'SOURCE_CONFLICT' }
    })).toBe(1);
    const availability = await inventoryProjection.calculateAvailableToPromise({
      wineryId: winery.id,
      productVariantId: variant.id,
      stockLocationId: stockLocation.id
    });
    expect(availability.status).toBe('SOURCE_CONFLICT');

    const otherWinery = await db.Winery.create({ name: 'Other Winery' });
    const otherProduct = await db.WineryProduct.create({ wineryId: otherWinery.id, name: 'Other Product' });
    const otherVariant = await db.ProductVariant.create({
      wineryId: otherWinery.id,
      wineryProductId: otherProduct.id,
      code: 'other',
      name: 'Other Variant',
      unitOfMeasure: 'EACH'
    });
    await expect(inventoryProjection.projectInventoryPositionSnapshot({
      wineryId: winery.id,
      connectionId: connection.id,
      input: snapshot({ productVariantId: otherVariant.id })
    })).rejects.toThrow('active winery mapping');
    const hidden = await request(app)
      .get(`/api/integration-management/inventory-positions/${projected.inventoryPositionId}`)
      .set('Authorization', auth);
    expect(hidden.status).toBe(200);
  });
});
