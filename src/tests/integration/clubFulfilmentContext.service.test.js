process.env.NODE_ENV = 'test';
process.env.ALLOW_TEST_AUTH_BYPASS = 'true';

const crypto = require('crypto');
const request = require('supertest');
const app = require('../../app');
const db = require('../../models');
const clubFulfilmentContext = require('../../services/clubFulfilmentContext.service');

describe('bounded Wine Club fulfilment context', () => {
  const auth = 'Bearer mock-token';
  let winery;
  let manager;
  let allocation;
  let position;
  let baseTime;

  beforeEach(async () => {
    baseTime = Date.now();
    await db.sequelize.sync({ force: true });
    winery = await db.Winery.create({ name: 'Club Fulfilment Context Winery' });
    manager = await db.User.create({
      firebaseUid: 'club-context-manager-' + crypto.randomUUID(),
      email: 'stub@example.com',
      displayName: 'Club Context Manager',
      role: 'manager',
      wineryId: winery.id
    });
    const member = await db.Member.create({
      wineryId: winery.id,
      firstName: 'Private',
      lastName: 'Member',
      email: 'private@example.com'
    });
    const connection = await db.IntegrationConnection.create({
      wineryId: winery.id,
      connectionKey: 'club-context-source',
      providerKey: 'fixture',
      displayName: 'Club Context Source',
      status: 'CONNECTED',
      createdBy: manager.id,
      updatedBy: manager.id
    });
    const reference = async (resourceType, externalId) => db.ExternalResourceReference.create({
      wineryId: winery.id,
      connectionId: connection.id,
      resourceType,
      externalId,
      observedAt: new Date(baseTime - 1000),
      resolutionStatus: 'RESOLVED'
    });
    const program = await db.WineClubProgram.create({
      wineryId: winery.id,
      code: 'reserve-club',
      name: 'Reserve Club',
      createdBy: manager.id,
      updatedBy: manager.id
    });
    const membershipReference = await reference('WINE_CLUB_MEMBERSHIP', 'club-context-membership');
    const membership = await db.WineClubMembership.create({
      wineryId: winery.id,
      memberId: member.id,
      programId: program.id,
      primarySourceReferenceId: membershipReference.id,
      authorityConnectionId: connection.id,
      canonicalStatus: 'ACTIVE',
      sourceRevision: 'v1',
      sourceUpdatedAt: new Date(baseTime - 2000),
      observedAt: new Date(baseTime - 1000)
    });
    const allocationReference = await reference('WINE_CLUB_ALLOCATION', 'club-context-allocation');
    allocation = await db.WineClubAllocation.create({
      wineryId: winery.id,
      membershipId: membership.id,
      programId: program.id,
      primarySourceReferenceId: allocationReference.id,
      authorityConnectionId: connection.id,
      cycleCode: 'SPRING-2026',
      canonicalStatus: 'OPEN',
      fulfilmentMethod: 'DELIVERY',
      currency: 'AUD',
      totalMinor: 12000,
      sourceRevision: 'v1',
      sourceUpdatedAt: new Date(baseTime - 2000),
      observedAt: new Date(baseTime - 1000)
    });
    const product = await db.WineryProduct.create({
      wineryId: winery.id,
      name: 'Reserve Shiraz',
      category: 'WINE',
      stockStatus: 'IN_STOCK'
    });
    const variant = await db.ProductVariant.create({
      wineryId: winery.id,
      wineryProductId: product.id,
      code: 'reserve-shiraz-750',
      name: 'Reserve Shiraz 750mL',
      sku: 'PRIVATE-PROVIDER-SKU',
      unitOfMeasure: 'BOTTLE',
      createdBy: manager.id,
      updatedBy: manager.id
    });
    await db.WineClubAllocationItem.create({
      wineryId: winery.id,
      allocationId: allocation.id,
      lineKey: 'line-1',
      productVariantId: variant.id,
      providerSku: 'PRIVATE-PROVIDER-SKU',
      description: 'Reserve Shiraz',
      quantity: 4,
      unit: 'BOTTLE',
      substitutionAllowed: false,
      currency: 'AUD',
      unitPriceMinor: 3000,
      totalMinor: 12000
    });
    const stockLocation = await db.StockLocation.create({
      wineryId: winery.id,
      code: 'warehouse',
      name: 'Warehouse',
      locationType: 'WAREHOUSE',
      createdBy: manager.id,
      updatedBy: manager.id
    });
    const positionReference = await reference('INVENTORY_POSITION', 'club-context-position');
    position = await db.InventoryPosition.create({
      wineryId: winery.id,
      productVariantId: variant.id,
      stockLocationId: stockLocation.id,
      primarySourceReferenceId: positionReference.id,
      authorityConnectionId: connection.id,
      onHandQuantity: 10,
      availableQuantity: 10,
      reservedQuantity: 0,
      incomingQuantity: 0,
      damagedQuantity: 0,
      heldQuantity: 0,
      unit: 'BOTTLE',
      sourceAssertedAt: new Date(baseTime - 2000),
      sourceUpdatedAt: new Date(baseTime - 2000),
      observedAt: new Date(baseTime - 1000),
      staleAt: new Date(baseTime + 3600000),
      sourceRevision: 'v1',
      sourceHash: 'a'.repeat(64),
      authorityPolicyVersion: 'fixture-v1',
      qualityState: 'SOURCE_ASSERTED'
    });
    await db.InventoryCommitment.create({
      wineryId: winery.id,
      productVariantId: variant.id,
      stockLocationId: stockLocation.id,
      sourceType: 'WINE_CLUB_ALLOCATION',
      sourceId: allocation.id,
      purposeKey: 'club-allocation-line-1',
      quantity: 4,
      unit: 'BOTTLE',
      requiredAt: new Date(baseTime + 1800000),
      status: 'EXPECTED',
      confidence: 1,
      derivation: 'DETERMINISTIC',
      derivationVersion: 'fixture-v1',
      sourceUpdatedAt: new Date(baseTime - 2000),
      observedAt: new Date(baseTime - 1000)
    });
  });

  afterAll(async () => db.sequelize.close());

  test('combines allocation, stock, payment, shipment, and work evidence without restricted details', async () => {
    const context = await clubFulfilmentContext.resolveClubFulfilment({
      wineryId: winery.id,
      input: { allocationId: allocation.id, maxAgeSeconds: 3600 },
      now: new Date(baseTime)
    });
    expect(context).toEqual(expect.objectContaining({
      schemaVersion: 'club.fulfilment.v1',
      allocation: expect.objectContaining({ id: allocation.id, status: 'OPEN' }),
      membership: expect.objectContaining({
        programCode: 'reserve-club',
        status: 'ACTIVE'
      }),
      inventory: expect.objectContaining({
        status: 'AVAILABLE',
        calculationReliable: true,
        commitmentCount: 1,
        unmappedItemCount: 0
      }),
      readiness: { status: 'READY', calculationReliable: true },
      automationEligible: false
    }));
    expect(context.items[0]).toEqual(expect.objectContaining({
      productCode: 'reserve-shiraz-750',
      commitmentIds: [expect.any(Number)]
    }));
    expect(JSON.stringify(context)).not.toContain('private@example.com');
    expect(JSON.stringify(context)).not.toContain('PRIVATE-PROVIDER-SKU');

    const response = await request(app)
      .get('/api/integration-management/wine-club-allocations/' + allocation.id + '/fulfilment-context')
      .query({ maxAgeSeconds: 3600 })
      .set('Authorization', auth);
    expect(response.status).toBe(200);
    expect(response.body.context.readiness.status).toBe('READY');
  });

  test('reports deterministic stock shortage and fails tenant-safe', async () => {
    await position.update({ availableQuantity: 2 });
    const context = await clubFulfilmentContext.resolveClubFulfilment({
      wineryId: winery.id,
      input: { allocationId: allocation.id, maxAgeSeconds: 3600 },
      now: new Date(baseTime)
    });
    expect(context.inventory).toEqual(expect.objectContaining({
      status: 'SHORTAGE',
      calculationReliable: true
    }));
    expect(context.readiness).toEqual({
      status: 'STOCK_SHORTAGE',
      calculationReliable: true
    });
    const otherWinery = await db.Winery.create({ name: 'Other Club Context Winery' });
    await expect(clubFulfilmentContext.resolveClubFulfilment({
      wineryId: otherWinery.id,
      input: { allocationId: allocation.id, maxAgeSeconds: 3600 }
    })).rejects.toThrow('Wine Club allocation not found');
  });
});
