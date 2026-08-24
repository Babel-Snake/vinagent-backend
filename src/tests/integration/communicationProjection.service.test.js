process.env.NODE_ENV = 'test';
process.env.ALLOW_TEST_AUTH_BYPASS = 'true';

const crypto = require('crypto');
const request = require('supertest');
const app = require('../../app');
const db = require('../../models');
const communicationProjection = require('../../services/communicationProjection.service');

describe('canonical communication lineage and delivery history', () => {
  const auth = 'Bearer mock-token';
  let winery;
  let manager;
  let connection;
  let message;
  let baseTime;

  const at = offset => new Date(baseTime + offset).toISOString();
  const snapshot = overrides => ({
    contractVersion: 'message-delivery-shadow.v1',
    externalMessageId: 'provider-message-100',
    messageId: message.id,
    channel: 'EMAIL',
    direction: 'OUTBOUND',
    sourceRevision: 'delivery-v1',
    sourceUpdatedAt: at(-2000),
    observedAt: at(-1000),
    providerExtensions: { transport: 'transactional' },
    events: [
      {
        eventKey: 'queued-100',
        canonicalStatus: 'QUEUED',
        providerStatus: 'queued',
        occurredAt: at(-5000),
        failureCategory: 'NONE',
        metadata: { attempt: 1 }
      },
      {
        eventKey: 'sent-100',
        canonicalStatus: 'SENT',
        providerStatus: 'accepted',
        occurredAt: at(-4000),
        failureCategory: 'NONE',
        metadata: { attempt: 1 }
      }
    ],
    ...overrides
  });

  beforeEach(async () => {
    baseTime = Date.now();
    await db.sequelize.sync({ force: true });
    winery = await db.Winery.create({ name: 'Communication Graph Winery' });
    manager = await db.User.create({
      firebaseUid: 'communication-manager-' + crypto.randomUUID(),
      email: 'stub@example.com',
      displayName: 'Communication Manager',
      role: 'manager',
      wineryId: winery.id
    });
    connection = await db.IntegrationConnection.create({
      wineryId: winery.id,
      connectionKey: 'email-delivery-source',
      providerKey: 'generic-email',
      displayName: 'Generic Email',
      status: 'CONNECTED',
      createdBy: manager.id,
      updatedBy: manager.id
    });
    await db.IntegrationConnectionScope.create({
      wineryId: winery.id,
      connectionId: connection.id,
      domain: 'COMMUNICATION',
      scopeKey: 'winery',
      isDefault: true,
      isActive: true
    });
    message = await db.Message.create({
      wineryId: winery.id,
      source: 'email',
      direction: 'outbound',
      subject: 'Private subject',
      body: 'Private message body',
      rawPayload: { recipient: 'private@example.com' },
      externalId: 'legacy-provider-message-100'
    });
  });

  afterAll(async () => db.sequelize.close());

  test('links a Message, appends idempotent events, and never regresses its current state', async () => {
    const first = await communicationProjection.projectMessageDelivery({
      wineryId: winery.id,
      connectionId: connection.id,
      input: snapshot()
    });
    expect(first).toEqual(expect.objectContaining({
      status: 'PROJECTED_SHADOW',
      messageId: message.id,
      messageDeliveryEventsCreated: 2,
      duplicateEvents: 0,
      currentDeliveryStatus: 'SENT',
      automationEligible: false
    }));
    const retry = await communicationProjection.projectMessageDelivery({
      wineryId: winery.id,
      connectionId: connection.id,
      input: snapshot({ observedAt: at(1000) })
    });
    expect(retry).toEqual(expect.objectContaining({
      messageDeliveryEventsCreated: 0,
      duplicateEvents: 2
    }));
    expect(await db.ExternalResourceReference.count({
      where: {
        connectionId: connection.id,
        resourceType: 'MESSAGE',
        canonicalType: 'MESSAGE',
        canonicalId: message.id
      }
    })).toBe(1);
    expect(await db.MessageDeliveryEvent.count()).toBe(2);

    await communicationProjection.projectMessageDelivery({
      wineryId: winery.id,
      connectionId: connection.id,
      input: snapshot({
        sourceRevision: 'delivery-v2',
        sourceUpdatedAt: at(3000),
        observedAt: at(4000),
        events: [{
          eventKey: 'failed-100',
          canonicalStatus: 'FAILED',
          providerStatus: 'provider_rejected',
          occurredAt: at(2000),
          failureCategory: 'PROVIDER_REJECTED',
          metadata: { attempt: 2 }
        }]
      })
    });
    await communicationProjection.projectMessageDelivery({
      wineryId: winery.id,
      connectionId: connection.id,
      input: snapshot({
        sourceRevision: 'delivery-history-v1',
        sourceUpdatedAt: at(-10000),
        observedAt: at(5000),
        events: [{
          eventKey: 'delivered-history-100',
          canonicalStatus: 'DELIVERED',
          providerStatus: 'delivered',
          occurredAt: at(-3000),
          failureCategory: 'NONE'
        }]
      })
    });
    const stored = await db.Message.findByPk(message.id);
    expect(stored).toEqual(expect.objectContaining({
      canonicalDeliveryStatus: 'FAILED',
      deliveryFailureCategory: 'PROVIDER_REJECTED'
    }));
    expect(await db.MessageDeliveryEvent.count()).toBe(4);

    const listResponse = await request(app)
      .get('/api/integration-management/message-deliveries')
      .query({ messageId: message.id, failuresOnly: true })
      .set('Authorization', auth);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.messageDeliveryEvents).toHaveLength(1);
    expect(listResponse.body.messageDeliveryEvents[0]).not.toHaveProperty('sourceHash');

    const historyResponse = await request(app)
      .get('/api/integration-management/messages/' + message.id + '/delivery-history')
      .set('Authorization', auth);
    expect(historyResponse.status).toBe(200);
    expect(historyResponse.body.message).toEqual(expect.objectContaining({
      id: message.id,
      canonicalDeliveryStatus: 'FAILED'
    }));
    expect(historyResponse.body.message).not.toHaveProperty('body');
    expect(historyResponse.body.message).not.toHaveProperty('subject');
    expect(historyResponse.body.message).not.toHaveProperty('rawPayload');
    expect(historyResponse.body.message).not.toHaveProperty('externalId');
    expect(historyResponse.body.message.DeliveryEvents).toHaveLength(4);
  });

  test('keeps mappings tenant-safe and rejects private or conflicting delivery evidence', async () => {
    await expect(communicationProjection.projectMessageDelivery({
      wineryId: winery.id,
      connectionId: connection.id,
      input: snapshot({
        providerExtensions: { recipientEmail: 'private@example.com' }
      })
    })).rejects.toThrow('forbidden field');

    const otherWinery = await db.Winery.create({ name: 'Other Communication Winery' });
    const otherMessage = await db.Message.create({
      wineryId: otherWinery.id,
      source: 'email',
      direction: 'outbound'
    });
    await expect(communicationProjection.projectMessageDelivery({
      wineryId: winery.id,
      connectionId: connection.id,
      input: snapshot({ messageId: otherMessage.id })
    })).rejects.toThrow('Message not found');

    await communicationProjection.projectMessageDelivery({
      wineryId: winery.id,
      connectionId: connection.id,
      input: snapshot()
    });
    const eventConflict = await communicationProjection.projectMessageDelivery({
      wineryId: winery.id,
      connectionId: connection.id,
      input: snapshot({
        sourceRevision: 'delivery-conflict-v1',
        sourceUpdatedAt: at(2000),
        observedAt: at(3000),
        events: [{
          eventKey: 'sent-100',
          canonicalStatus: 'DELIVERED',
          providerStatus: 'delivered',
          occurredAt: at(1000),
          failureCategory: 'NONE'
        }]
      })
    });
    expect(eventConflict.status).toBe('SOURCE_CONFLICT');
    expect(await db.ProjectionIssue.count({
      where: { wineryId: winery.id, issueType: 'SOURCE_CONFLICT' }
    })).toBe(1);

    const secondMessage = await db.Message.create({
      wineryId: winery.id,
      source: 'email',
      direction: 'outbound'
    });
    const mappingConflict = await communicationProjection.projectMessageDelivery({
      wineryId: winery.id,
      connectionId: connection.id,
      input: snapshot({
        messageId: secondMessage.id,
        sourceRevision: 'mapping-conflict-v1',
        sourceUpdatedAt: at(4000),
        observedAt: at(5000),
        events: [{
          eventKey: 'queued-second',
          canonicalStatus: 'QUEUED',
          providerStatus: 'queued',
          occurredAt: at(3500),
          failureCategory: 'NONE'
        }]
      })
    });
    expect(mappingConflict.status).toBe('SOURCE_CONFLICT');
    expect(await db.MessageDeliveryEvent.count()).toBe(2);
  });
});
