process.env.NODE_ENV = 'test';
process.env.ALLOW_TEST_AUTH_BYPASS = 'true';

const crypto = require('crypto');
const request = require('supertest');
const app = require('../../app');
const db = require('../../models');
const areaCapacityContext = require('../../services/areaCapacityContext.service');

describe('bounded area demand and readiness context', () => {
  const auth = 'Bearer mock-token';
  let winery;
  let manager;
  let area;
  let connection;
  let bookings;
  let baseTime;

  beforeEach(async () => {
    baseTime = Date.now();
    await db.sequelize.sync({ force: true });
    winery = await db.Winery.create({ name: 'Area Capacity Context Winery' });
    manager = await db.User.create({
      firebaseUid: 'area-capacity-manager-' + crypto.randomUUID(),
      email: 'stub@example.com',
      displayName: 'Area Capacity Manager',
      role: 'manager',
      wineryId: winery.id
    });
    area = await db.OperationalArea.create({
      wineryId: winery.id,
      name: 'Cellar Door'
    });
    connection = await db.IntegrationConnection.create({
      wineryId: winery.id,
      connectionKey: 'area-capacity-bookings',
      providerKey: 'fixture',
      displayName: 'Area Capacity Bookings',
      status: 'CONNECTED',
      createdBy: manager.id,
      updatedBy: manager.id
    });
    const bookingType = await db.WineryBookingType.create({
      wineryId: winery.id,
      areaId: area.id,
      name: 'Paired Tasting',
      durationMinutes: 60,
      minGuests: 1,
      maxGuests: 12
    });
    const createBooking = async (externalId, referenceCode, offset, partySize) => {
      const reference = await db.ExternalResourceReference.create({
        wineryId: winery.id,
        connectionId: connection.id,
        resourceType: 'BOOKING',
        externalId,
        observedAt: new Date(baseTime - 1000),
        resolutionStatus: 'RESOLVED'
      });
      const booking = await db.Booking.create({
        wineryId: winery.id,
        primaryBookingTypeId: bookingType.id,
        primarySourceReferenceId: reference.id,
        authorityConnectionId: connection.id,
        canonicalStatus: 'CONFIRMED',
        providerStatus: 'confirmed',
        referenceCode,
        sourceChannel: 'fixture',
        startAt: new Date(baseTime + offset),
        endAt: new Date(baseTime + offset + 3600000),
        partySize,
        qualityState: 'SOURCE_ASSERTED',
        authorityState: 'IMPLICIT_SINGLE_SOURCE',
        projectionRevision: 'v1',
        sourceUpdatedAt: new Date(baseTime - 1000),
        sourceHash: crypto.createHash('sha256').update(externalId).digest('hex'),
        resolvedAt: new Date(baseTime - 500)
      });
      await reference.update({
        canonicalType: 'BOOKING',
        canonicalId: booking.id,
        resolutionStatus: 'RESOLVED'
      });
      await db.BookingAreaLink.create({
        wineryId: winery.id,
        bookingId: booking.id,
        areaId: area.id,
        relationshipType: 'PRIMARY'
      });
      return booking;
    };
    bookings = [
      await createBooking('area-booking-1', 'AREA-1', 3600000, 4),
      await createBooking('area-booking-2', 'AREA-2', 7200000, 6)
    ];
  });

  afterAll(async () => db.sequelize.close());

  const input = overrides => ({
    areaId: area.id,
    from: new Date(baseTime).toISOString(),
    to: new Date(baseTime + 86400000).toISOString(),
    maxAgeSeconds: 3600,
    maxBookings: 100,
    ...overrides
  });

  test('aggregates covers and readiness without inventing physical venue capacity', async () => {
    const context = await areaCapacityContext.resolveAreaCapacity({
      wineryId: winery.id,
      input: input(),
      now: new Date(baseTime)
    });
    expect(context).toEqual(expect.objectContaining({
      schemaVersion: 'area.capacity.v1',
      area: { id: area.id, name: 'Cellar Door' },
      demand: expect.objectContaining({
        bookingCount: 2,
        totalCovers: 10
      }),
      physicalCapacity: {
        status: 'UNCONFIGURED',
        configuredCovers: null,
        utilisationPercent: null
      },
      readiness: expect.objectContaining({
        status: 'READY',
        calculationReliable: true,
        readyBookingCount: 2
      }),
      automationEligible: false
    }));
    expect(context.demand.experienceBreakdown).toEqual([
      expect.objectContaining({
        bookingTypeName: 'Paired Tasting',
        bookingCount: 2,
        covers: 10
      })
    ]);

    const response = await request(app)
      .get('/api/integration-management/areas/' + area.id + '/capacity-context')
      .query({
        from: input().from,
        to: input().to,
        maxAgeSeconds: 3600,
        maxBookings: 100
      })
      .set('Authorization', auth);
    expect(response.status).toBe(200);
    expect(response.body.context.demand.totalCovers).toBe(10);
  });

  test('fails closed for truncated or unresolved cross-domain demand and isolates tenants', async () => {
    const truncated = await areaCapacityContext.resolveAreaCapacity({
      wineryId: winery.id,
      input: input({ maxBookings: 1 }),
      now: new Date(baseTime)
    });
    expect(truncated.window.truncated).toBe(true);
    expect(truncated.readiness).toEqual(expect.objectContaining({
      status: 'UNKNOWN',
      calculationReliable: false
    }));

    const product = await db.WineryProduct.create({
      wineryId: winery.id,
      name: 'Capacity Fixture Product',
      category: 'WINE',
      stockStatus: 'IN_STOCK'
    });
    const variant = await db.ProductVariant.create({
      wineryId: winery.id,
      wineryProductId: product.id,
      code: 'capacity-fixture-variant',
      name: 'Capacity Fixture Variant',
      unitOfMeasure: 'BOTTLE',
      createdBy: manager.id,
      updatedBy: manager.id
    });
    const stockLocation = await db.StockLocation.create({
      wineryId: winery.id,
      code: 'capacity-fixture-stock',
      name: 'Capacity Fixture Stock',
      createdBy: manager.id,
      updatedBy: manager.id
    });
    await db.BookingRequirement.create({
      wineryId: winery.id,
      bookingId: bookings[0].id,
      sourceReferenceId: bookings[0].primarySourceReferenceId,
      requirementKey: 'ADD_ON:truffle-pairing',
      kind: 'ADD_ON',
      sourceKind: 'ADD_ON',
      code: 'truffle-pairing',
      description: 'Paired truffle tasting',
      quantity: 2,
      unit: 'PORTION',
      sourceRevision: 'fixture-v1'
    });
    await db.InventoryCommitment.create({
      wineryId: winery.id,
      productVariantId: variant.id,
      stockLocationId: stockLocation.id,
      sourceType: 'BOOKING',
      sourceId: bookings[0].id,
      purposeKey: 'capacity-fixture-demand',
      quantity: 2,
      unit: 'BOTTLE',
      requiredAt: bookings[0].startAt,
      status: 'EXPECTED',
      confidence: 1,
      derivation: 'DETERMINISTIC',
      derivationVersion: 'fixture-v1',
      sourceUpdatedAt: new Date(baseTime - 1000),
      observedAt: new Date(baseTime - 1000),
      metadata: { requirementCode: 'truffle-pairing' }
    });
    const unknown = await areaCapacityContext.resolveAreaCapacity({
      wineryId: winery.id,
      input: input(),
      now: new Date(baseTime)
    });
    expect(unknown.readiness).toEqual(expect.objectContaining({
      status: 'UNKNOWN',
      calculationReliable: false,
      unknownBookingCount: 1
    }));

    const otherWinery = await db.Winery.create({ name: 'Other Area Winery' });
    await expect(areaCapacityContext.resolveAreaCapacity({
      wineryId: otherWinery.id,
      input: input(),
      now: new Date(baseTime)
    })).rejects.toThrow('Operational area not found');
  });
});
