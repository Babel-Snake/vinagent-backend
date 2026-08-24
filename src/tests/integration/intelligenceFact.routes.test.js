process.env.NODE_ENV = 'test';
process.env.ALLOW_TEST_AUTH_BYPASS = 'true';

const crypto = require('crypto');
const request = require('supertest');
const app = require('../../app');
const db = require('../../models');
const intelligenceFactService = require('../../services/intelligenceFact.service');

describe('registered intelligence fact materialization', () => {
  const auth = 'Bearer mock-token';
  let winery;
  let message;
  let baseTime;

  beforeEach(async () => {
    baseTime = Date.now();
    await db.sequelize.sync({ force: true });
    winery = await db.Winery.create({ name: 'Fact Layer Winery' });
    await db.User.create({
      firebaseUid: 'fact-manager-' + crypto.randomUUID(),
      email: 'stub@example.com',
      displayName: 'Fact Manager',
      role: 'manager',
      wineryId: winery.id
    });
    message = await db.Message.create({
      wineryId: winery.id,
      source: 'email',
      direction: 'outbound',
      subject: 'Private subject',
      body: 'Private body',
      rawPayload: { recipient: 'private@example.com' },
      canonicalDeliveryStatus: 'FAILED',
      deliveryStatusOccurredAt: new Date(baseTime - 1000),
      deliveryFailureCategory: 'PROVIDER_REJECTED'
    });
  });

  afterAll(async () => db.sequelize.close());

  test('materializes registered Message facts idempotently and supersedes changed conclusions', async () => {
    const requestId = crypto.randomUUID();
    const first = await request(app)
      .post('/api/integration-management/intelligence-facts/materialize')
      .set('Authorization', auth)
      .send({
        materializerKey: 'message.delivery.v1',
        subjectId: message.id,
        maxAgeSeconds: 3600,
        requestId,
        reason: 'Build fixture-backed delivery intelligence facts.'
      });
    expect(first.status).toBe(201);
    expect(first.body.duplicate).toBe(false);
    expect(first.body.run).toEqual(expect.objectContaining({
      materializerKey: 'message.delivery.v1',
      subjectType: 'MESSAGE',
      subjectId: message.id,
      status: 'COMPLETE',
      factsCreated: 2,
      factsSuperseded: 0
    }));
    const retry = await request(app)
      .post('/api/integration-management/intelligence-facts/materialize')
      .set('Authorization', auth)
      .send({
        materializerKey: 'message.delivery.v1',
        subjectId: message.id,
        maxAgeSeconds: 3600,
        requestId,
        reason: 'Build fixture-backed delivery intelligence facts.'
      });
    expect(retry.status).toBe(200);
    expect(retry.body.duplicate).toBe(true);
    expect(await db.IntelligenceFact.count()).toBe(2);

    await message.update({
      canonicalDeliveryStatus: 'DELIVERED',
      deliveryStatusOccurredAt: new Date(baseTime + 1000),
      deliveryFailureCategory: 'NONE'
    });
    const changed = await request(app)
      .post('/api/integration-management/intelligence-facts/materialize')
      .set('Authorization', auth)
      .send({
        materializerKey: 'message.delivery.v1',
        subjectId: message.id,
        maxAgeSeconds: 3600,
        requestId: crypto.randomUUID(),
        reason: 'Refresh delivery intelligence after new evidence.'
      });
    expect(changed.status).toBe(201);
    expect(changed.body.run).toEqual(expect.objectContaining({
      factsCreated: 2,
      factsSuperseded: 2
    }));
    expect(await db.IntelligenceFact.count()).toBe(4);

    const current = await request(app)
      .get('/api/integration-management/intelligence-facts')
      .query({ subjectType: 'MESSAGE', subjectId: message.id })
      .set('Authorization', auth);
    expect(current.status).toBe(200);
    expect(current.body.pagination.total).toBe(2);
    const byKey = new Map(current.body.intelligenceFacts.map(fact => [fact.factKey, fact]));
    expect(byKey.get('message.delivery_status')).toEqual(expect.objectContaining({
      valueJson: 'DELIVERED',
      freshness: 'CURRENT'
    }));
    expect(byKey.get('message.delivery_failure_active')).toEqual(expect.objectContaining({
      valueJson: false,
      freshness: 'CURRENT'
    }));
    expect(current.body.intelligenceFacts[0]).not.toHaveProperty('factIdentityKey');
    expect(current.body.intelligenceFacts[0]).not.toHaveProperty('factVersionKey');

    const history = await request(app)
      .get('/api/integration-management/intelligence-facts')
      .query({ subjectType: 'MESSAGE', subjectId: message.id, currentOnly: false })
      .set('Authorization', auth);
    expect(history.status).toBe(200);
    expect(history.body.pagination.total).toBe(4);

    const definitions = await request(app)
      .get('/api/integration-management/intelligence-fact-definitions')
      .set('Authorization', auth);
    expect(definitions.status).toBe(200);
    expect(definitions.body.factDefinitions.map(item => item.factKey)).toEqual(expect.arrayContaining([
      'booking.inventory_status',
      'shipment.exception_active',
      'message.delivery_failure_active'
    ]));
    expect(definitions.body.materializers.map(item => item.materializerKey)).toEqual([
      'booking.readiness.v1',
      'shipment.exception.v1',
      'message.delivery.v1'
    ]);
  });

  test('rejects unregistered, private, future, and cross-winery fact writes', async () => {
    await expect(db.sequelize.transaction(transaction => intelligenceFactService.writeFact({
      wineryId: winery.id,
      subjectType: 'MESSAGE',
      subjectId: message.id,
      factKey: 'message.arbitrary_fact',
      value: true,
      qualityClass: 'DETERMINISTIC_DERIVED',
      derivationType: 'DETERMINISTIC',
      derivationKey: 'test.materializer',
      derivationVersion: 'v1',
      observedAt: new Date(baseTime),
      transaction
    }))).rejects.toThrow('factKey is not registered');

    await expect(db.sequelize.transaction(transaction => intelligenceFactService.writeFact({
      wineryId: winery.id,
      subjectType: 'MESSAGE',
      subjectId: message.id,
      factKey: 'message.delivery_failure_active',
      value: true,
      qualityClass: 'DETERMINISTIC_DERIVED',
      derivationType: 'DETERMINISTIC',
      derivationKey: 'test.materializer',
      derivationVersion: 'v1',
      observedAt: new Date(baseTime),
      evidence: { recipientEmail: 'private@example.com' },
      transaction
    }))).rejects.toThrow('forbidden field');

    await expect(db.sequelize.transaction(transaction => intelligenceFactService.writeFact({
      wineryId: winery.id,
      subjectType: 'MESSAGE',
      subjectId: message.id,
      factKey: 'message.delivery_failure_active',
      value: true,
      qualityClass: 'DETERMINISTIC_DERIVED',
      derivationType: 'DETERMINISTIC',
      derivationKey: 'test.materializer',
      derivationVersion: 'v1',
      observedAt: new Date(baseTime + (10 * 60 * 1000)),
      transaction,
      now: new Date(baseTime)
    }))).rejects.toThrow('future');

    const otherWinery = await db.Winery.create({ name: 'Other Fact Winery' });
    const otherMessage = await db.Message.create({
      wineryId: otherWinery.id,
      source: 'sms',
      direction: 'inbound'
    });
    await expect(db.sequelize.transaction(transaction => intelligenceFactService.writeFact({
      wineryId: winery.id,
      subjectType: 'MESSAGE',
      subjectId: otherMessage.id,
      factKey: 'message.delivery_failure_active',
      value: false,
      qualityClass: 'DETERMINISTIC_DERIVED',
      derivationType: 'DETERMINISTIC',
      derivationKey: 'test.materializer',
      derivationVersion: 'v1',
      observedAt: new Date(baseTime),
      transaction
    }))).rejects.toThrow('not found in this winery');

    await db.sequelize.transaction(transaction => intelligenceFactService.writeFact({
      wineryId: winery.id,
      subjectType: 'MESSAGE',
      subjectId: message.id,
      factKey: 'message.delivery_failure_active',
      value: true,
      qualityClass: 'DETERMINISTIC_DERIVED',
      derivationType: 'DETERMINISTIC',
      derivationKey: 'test.temporal-order',
      derivationVersion: 'v1',
      observedAt: new Date(baseTime),
      transaction,
      now: new Date(baseTime + 1000)
    }));
    await expect(db.sequelize.transaction(transaction => intelligenceFactService.writeFact({
      wineryId: winery.id,
      subjectType: 'MESSAGE',
      subjectId: message.id,
      factKey: 'message.delivery_failure_active',
      value: false,
      qualityClass: 'DETERMINISTIC_DERIVED',
      derivationType: 'DETERMINISTIC',
      derivationKey: 'test.temporal-order',
      derivationVersion: 'v1',
      observedAt: new Date(baseTime - 1000),
      transaction,
      now: new Date(baseTime + 1000)
    }))).rejects.toThrow('cannot regress');
  });
});
