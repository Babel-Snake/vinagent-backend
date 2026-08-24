process.env.NODE_ENV = 'test';
process.env.ALLOW_TEST_AUTH_BYPASS = 'true';

const crypto = require('crypto');
const request = require('supertest');
const app = require('../../app');
const db = require('../../models');
const customerRelationshipContext = require('../../services/customerRelationshipContext.service');

describe('bounded customer relationship context', () => {
  const auth = 'Bearer mock-token';
  let winery;
  let manager;
  let member;
  let baseTime;

  beforeEach(async () => {
    baseTime = Date.now();
    await db.sequelize.sync({ force: true });
    winery = await db.Winery.create({ name: 'Relationship Context Winery' });
    manager = await db.User.create({
      firebaseUid: 'relationship-manager-' + crypto.randomUUID(),
      email: 'stub@example.com',
      displayName: 'Relationship Manager',
      role: 'manager',
      wineryId: winery.id
    });
    member = await db.Member.create({
      wineryId: winery.id,
      firstName: 'Private',
      lastName: 'Customer',
      email: 'private@example.com',
      phone: '+61400000000',
      addressLine1: 'Private address',
      notes: 'Private note',
      customerType: 'member'
    });
    await db.CustomerContactPoint.create({
      wineryId: winery.id,
      memberId: member.id,
      contactType: 'EMAIL',
      normalizedValue: 'private@example.com',
      displayValue: 'private@example.com',
      verificationStatus: 'VERIFIED',
      isPrimary: true,
      isValid: true,
      sourceKind: 'FIXTURE',
      sourceKey: 'fixture-contact'
    });
    await db.CustomerConsent.create({
      wineryId: winery.id,
      memberId: member.id,
      channel: 'EMAIL',
      purpose: 'MARKETING',
      state: 'GRANTED',
      effectiveAt: new Date(baseTime - 1000),
      collectionSource: 'FIXTURE',
      sourceKey: 'fixture-consent'
    });
    const run = await db.CustomerRollupRun.create({
      wineryId: winery.id,
      requestId: crypto.randomUUID(),
      previewToken: 'a'.repeat(64),
      inputHash: 'b'.repeat(64),
      calculationVersion: 'canonical-customer-rollup-v1',
      status: 'COMPLETE',
      initiatedBy: manager.id,
      reason: 'Create relationship context fixture.',
      memberCount: 1,
      relationshipRollupCount: 1,
      monetaryRollupCount: 1,
      startedAt: new Date(baseTime - 3000),
      completedAt: new Date(baseTime - 2000)
    });
    await db.CustomerRelationshipRollup.create({
      wineryId: winery.id,
      memberId: member.id,
      lastRunId: run.id,
      activeClubMembershipCount: 1,
      isCurrentClubMember: true,
      completedBookingCount: 2,
      purchaseOrderCount: 3,
      lastVisitAt: new Date(baseTime - 5000),
      lastPurchaseAt: new Date(baseTime - 4000),
      sourceOverlapStatus: 'CLEAR',
      authorityStatus: 'SHADOW_UNVERIFIED',
      calculationVersion: 'canonical-customer-rollup-v1',
      calculatedAt: new Date(baseTime - 2000),
      automationEligible: false
    });
    await db.CustomerMonetaryRollup.create({
      wineryId: winery.id,
      memberId: member.id,
      currency: 'AUD',
      lastRunId: run.id,
      grossPaidMinor: 15000,
      refundedMinor: 2000,
      netPaidMinor: 13000,
      contributingOrderCount: 3,
      sourceOverlapStatus: 'CLEAR',
      authorityStatus: 'SHADOW_UNVERIFIED',
      calculationVersion: 'canonical-customer-rollup-v1',
      calculatedAt: new Date(baseTime - 2000),
      automationEligible: false
    });
    const connection = await db.IntegrationConnection.create({
      wineryId: winery.id,
      connectionKey: 'relationship-club-source',
      providerKey: 'fixture',
      displayName: 'Relationship Club Source',
      status: 'CONNECTED',
      createdBy: manager.id,
      updatedBy: manager.id
    });
    const reference = await db.ExternalResourceReference.create({
      wineryId: winery.id,
      connectionId: connection.id,
      resourceType: 'WINE_CLUB_MEMBERSHIP',
      externalId: 'relationship-membership',
      observedAt: new Date(baseTime - 1000),
      resolutionStatus: 'RESOLVED'
    });
    const program = await db.WineClubProgram.create({
      wineryId: winery.id,
      code: 'relationship-club',
      name: 'Relationship Club',
      createdBy: manager.id,
      updatedBy: manager.id
    });
    await db.WineClubMembership.create({
      wineryId: winery.id,
      memberId: member.id,
      programId: program.id,
      primarySourceReferenceId: reference.id,
      authorityConnectionId: connection.id,
      canonicalStatus: 'ACTIVE',
      sourceRevision: 'v1',
      sourceUpdatedAt: new Date(baseTime - 1000),
      observedAt: new Date(baseTime - 1000)
    });
    await db.Message.create({
      wineryId: winery.id,
      memberId: member.id,
      source: 'email',
      direction: 'outbound',
      subject: 'Private subject',
      body: 'Private body',
      rawPayload: { recipient: 'private@example.com' },
      canonicalDeliveryStatus: 'DELIVERED',
      deliveryStatusOccurredAt: new Date(baseTime - 500)
    });
  });

  afterAll(async () => db.sequelize.close());

  test('combines canonical relationship evidence without exposing contact or message content', async () => {
    const context = await customerRelationshipContext.resolveCustomerRelationship({
      wineryId: winery.id,
      input: { memberId: member.id, maxAgeSeconds: 3600 },
      now: new Date(baseTime)
    });
    expect(context).toEqual(expect.objectContaining({
      schemaVersion: 'customer.relationship.v1',
      customer: {
        id: member.id,
        customerType: 'member',
        createdAt: expect.any(String)
      },
      contactability: expect.objectContaining({
        emailAvailable: true,
        verifiedEmailAvailable: true,
        phoneAvailable: false
      }),
      marketingConsent: expect.objectContaining({ EMAIL: 'GRANTED', SMS: 'UNKNOWN' }),
      relationship: expect.objectContaining({
        rollupAvailable: true,
        activeClubMembershipCount: 1,
        purchaseOrderCount: 3
      }),
      freshness: expect.objectContaining({ status: 'CURRENT' }),
      automationEligible: false
    }));
    expect(context.monetary).toEqual([expect.objectContaining({
      currency: 'AUD',
      netPaidMinor: 13000
    })]);
    expect(context.memberships).toEqual([expect.objectContaining({
      programCode: 'relationship-club',
      status: 'ACTIVE'
    })]);
    expect(context.recentActivity.contact).toEqual(expect.objectContaining({
      channel: 'email',
      direction: 'outbound',
      deliveryStatus: 'DELIVERED'
    }));
    expect(JSON.stringify(context)).not.toContain('private@example.com');
    expect(JSON.stringify(context)).not.toContain('Private subject');
    expect(JSON.stringify(context)).not.toContain('Private body');

    const response = await request(app)
      .get('/api/integration-management/customers/' + member.id + '/relationship-context')
      .query({ maxAgeSeconds: 3600 })
      .set('Authorization', auth);
    expect(response.status).toBe(200);
    expect(response.body.context.schemaVersion).toBe('customer.relationship.v1');
  });

  test('fails tenant-safe and reports missing rollup evidence as unknown', async () => {
    await db.CustomerRelationshipRollup.destroy({ where: { wineryId: winery.id, memberId: member.id } });
    const context = await customerRelationshipContext.resolveCustomerRelationship({
      wineryId: winery.id,
      input: { memberId: member.id, maxAgeSeconds: 3600 },
      now: new Date(baseTime)
    });
    expect(context.freshness).toEqual(expect.objectContaining({
      status: 'UNKNOWN',
      calculatedAt: null,
      ageSeconds: null
    }));
    const otherWinery = await db.Winery.create({ name: 'Other Relationship Winery' });
    const otherMember = await db.Member.create({
      wineryId: otherWinery.id,
      firstName: 'Other',
      lastName: 'Customer'
    });
    await expect(customerRelationshipContext.resolveCustomerRelationship({
      wineryId: winery.id,
      input: { memberId: otherMember.id, maxAgeSeconds: 3600 }
    })).rejects.toThrow('Customer not found');
  });

  test('treats expired consent as unknown and ignores future consent evidence', async () => {
    await db.CustomerConsent.bulkCreate([
      {
        wineryId: winery.id,
        memberId: member.id,
        channel: 'EMAIL',
        purpose: 'MARKETING',
        state: 'DENIED',
        effectiveAt: new Date(baseTime - 500),
        expiresAt: new Date(baseTime - 100),
        collectionSource: 'FIXTURE',
        sourceKey: 'fixture-expired-consent'
      },
      {
        wineryId: winery.id,
        memberId: member.id,
        channel: 'PHONE',
        purpose: 'MARKETING',
        state: 'GRANTED',
        effectiveAt: new Date(baseTime + 60000),
        collectionSource: 'FIXTURE',
        sourceKey: 'fixture-future-consent'
      }
    ]);
    const context = await customerRelationshipContext.resolveCustomerRelationship({
      wineryId: winery.id,
      input: { memberId: member.id, maxAgeSeconds: 3600 },
      now: new Date(baseTime)
    });
    expect(context.marketingConsent).toEqual(expect.objectContaining({
      EMAIL: 'UNKNOWN',
      PHONE: 'UNKNOWN'
    }));
  });
});
