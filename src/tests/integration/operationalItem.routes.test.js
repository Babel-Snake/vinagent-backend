process.env.ALLOW_TEST_AUTH_BYPASS = 'true';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../../app');
const {
  sequelize,
  Attachment,
  OperationalArea,
  OperationalItemAuditEvent,
  OperationalItemComment,
  OperationalItemRelation,
  OperationalRecord,
  OperationalRecordRecipient,
  OperationalRequest,
  Notice,
  NoticeArea,
  Task,
  TaskArea,
  User,
  UserAreaMembership,
  Winery
} = require('../../models');

describe('Operational Request and Record Routes', () => {
  const auth = 'Bearer mock-token';
  let areaA;
  let areaB;

  beforeAll(async () => {
    await sequelize.sync({ force: true });
    await Winery.create({ id: 1, name: 'Operations Winery', timeZone: 'Australia/Adelaide' });
    await Winery.create({ id: 2, name: 'Other Winery', timeZone: 'Australia/Adelaide' });
    await User.create({
      id: 7,
      firebaseUid: 'operations-current-user',
      email: 'stub@example.com',
      displayName: 'Current User',
      role: 'manager',
      wineryId: 1
    });
    await User.create({
      id: 8,
      firebaseUid: 'operations-target-user',
      email: 'target@example.com',
      displayName: 'Target User',
      role: 'staff',
      wineryId: 1
    });
    await User.create({
      id: 9,
      firebaseUid: 'operations-other-winery-user',
      email: 'other@example.com',
      displayName: 'Other Winery User',
      role: 'manager',
      wineryId: 2
    });
    areaA = await OperationalArea.create({ wineryId: 1, name: 'Cellar Door', sortOrder: 1 });
    areaB = await OperationalArea.create({ wineryId: 1, name: 'Restaurant', sortOrder: 2 });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  test('creates a human-confirmed request and records AI provenance and audit history', async () => {
    const response = await request(app)
      .post('/api/requests')
      .set('Authorization', auth)
      .send({
        title: 'Request more takeaway bags',
        body: 'Cellar Door needs additional takeaway bags.',
        originalText: 'We need more takeaway bags.',
        subtype: 'STOCK_SUPPLIES',
        requestedFromUserId: 8,
        areaScope: 'AREAS',
        primaryAreaId: areaA.id,
        aiSuggestedType: 'REQUEST',
        aiConfidence: 0.87,
        aiSuggestion: { suggestedTitle: 'Request more takeaway bags' }
      })
      .expect(201);

    expect(response.body.request.humanConfirmedType).toBe('REQUEST');
    expect(response.body.request.confirmedBy).toBe(7);
    expect(response.body.request.aiConfidence).toBe(0.87);
    expect(response.body.request.primaryAreaId).toBe(areaA.id);
    expect(await OperationalItemAuditEvent.count({ where: { itemType: 'REQUEST', itemId: response.body.request.id } })).toBe(1);
  });

  test('enforces area visibility and lets an area manager decide a request', async () => {
    const hidden = await OperationalRequest.create({
      wineryId: 1,
      title: 'Restaurant decision',
      body: 'Approve replacement glassware.',
      status: 'PENDING',
      priority: 'normal',
      sourceType: 'MANUAL',
      areaScope: 'AREAS',
      humanConfirmedType: 'REQUEST',
      confirmedBy: 7,
      confirmedAt: new Date(),
      createdBy: 7,
      updatedBy: 7
    });
    await hidden.addOperationalArea(areaB, { through: { wineryId: 1, relationshipType: 'PRIMARY' } });

    await User.update({ role: 'staff' }, { where: { id: 7 } });
    await UserAreaMembership.create({ wineryId: 1, userId: 7, areaId: areaA.id, membershipRole: 'MANAGER', isPrimary: true });

    const list = await request(app).get('/api/requests').set('Authorization', auth).expect(200);
    expect(list.body.requests.some(item => item.id === hidden.id)).toBe(false);

    const visible = await request(app)
      .post('/api/requests')
      .set('Authorization', auth)
      .send({
        title: 'Cellar Door refund',
        body: 'Approve a customer refund.',
        areaScope: 'AREAS',
        primaryAreaId: areaA.id
      })
      .expect(201);

    const decided = await request(app)
      .post(`/api/requests/${visible.body.request.id}/decision`)
      .set('Authorization', auth)
      .send({ status: 'APPROVED', response: 'Approved within policy.' })
      .expect(200);

    expect(decided.body.request.status).toBe('APPROVED');
    expect(decided.body.request.DecisionMaker.id).toBe(7);
  });

  test('creates searchable operational records and preserves original text', async () => {
    await User.update({ role: 'manager' }, { where: { id: 7 } });
    const created = await request(app)
      .post('/api/operational-records')
      .set('Authorization', auth)
      .send({
        title: 'POS instability during lunch',
        body: 'The POS terminal froze twice during lunch service.',
        originalText: 'POS froze twice during lunch.',
        recordType: 'SYSTEM_ISSUE',
        areaScope: 'AREAS',
        primaryAreaId: areaA.id,
        aiSuggestedType: 'NOTE',
        aiConfidence: 0.83
      })
      .expect(201);

    expect(created.body.record.humanConfirmedType).toBe('NOTE');
    expect(created.body.record.originalText).toBe('POS froze twice during lunch.');

    const results = await request(app)
      .get('/api/operational-records?search=terminal')
      .set('Authorization', auth)
      .expect(200);

    expect(results.body.records.map(item => item.id)).toContain(created.body.record.id);
    expect(await OperationalRecord.count()).toBeGreaterThan(0);
  });

  test('directs a Note to multiple people and supports the Home-targeted filter', async () => {
    await User.update({ role: 'manager' }, { where: { id: 7 } });
    const created = await request(app)
      .post('/api/operational-records')
      .set('Authorization', auth)
      .send({
        title: 'Shared festival handover',
        body: 'Please review the updated arrival plan.',
        areaScope: 'ORGANISATION',
        recipientUserIds: [7, 8]
      })
      .expect(201);

    expect(created.body.record.recipientUserIds).toEqual(expect.arrayContaining([7, 8]));
    expect(created.body.record.Recipients.map(user => user.id)).toEqual(expect.arrayContaining([7, 8]));
    expect(await OperationalRecordRecipient.count({ where: { recordId: created.body.record.id } })).toBe(2);

    const targeted = await request(app)
      .get('/api/operational-records?directedToMe=true')
      .set('Authorization', auth)
      .expect(200);

    expect(targeted.body.records.map(record => record.id)).toContain(created.body.record.id);
  });

  test('rejects Note recipients from another winery', async () => {
    await request(app)
      .post('/api/operational-records')
      .set('Authorization', auth)
      .send({
        title: 'Invalid recipient Note',
        body: 'This must remain within the winery.',
        areaScope: 'ORGANISATION',
        recipientUserIds: [9]
      })
      .expect(400);
  });

  test('returns a four-way classification suggestion without creating an item', async () => {
    const before = await OperationalRequest.count();
    const response = await request(app)
      .post('/api/operations/classify')
      .set('Authorization', auth)
      .send({ text: 'Can someone approve this refund?', taskOrigin: 'INTERNAL', inboundMethod: 'internal' })
      .expect(200);

    expect(response.body.suggestedType).toBe('REQUEST');
    expect(response.body.confidence).toBeGreaterThan(0);
    expect(await OperationalRequest.count()).toBe(before);
  });

  test('does not expose out-of-area or cross-tenant records through direct URLs', async () => {
    await User.update({ role: 'staff' }, { where: { id: 7 } });
    await UserAreaMembership.destroy({ where: { userId: 7 } });
    await UserAreaMembership.create({ wineryId: 1, userId: 7, areaId: areaA.id, membershipRole: 'MEMBER', isPrimary: true });

    const outOfArea = await OperationalRecord.create({
      wineryId: 1,
      title: 'Restaurant private handover',
      body: 'Area-limited context.',
      sourceType: 'MANUAL',
      occurredAt: new Date(),
      areaScope: 'AREAS',
      humanConfirmedType: 'NOTE',
      confirmedBy: 7,
      confirmedAt: new Date(),
      createdBy: 7,
      updatedBy: 7
    });
    await outOfArea.addOperationalArea(areaB, { through: { wineryId: 1, relationshipType: 'PRIMARY' } });

    const otherTenant = await OperationalRequest.create({
      wineryId: 2,
      title: 'Other winery request',
      body: 'Must never cross the tenant boundary.',
      sourceType: 'MANUAL',
      areaScope: 'ORGANISATION',
      humanConfirmedType: 'REQUEST',
      confirmedBy: 9,
      confirmedAt: new Date(),
      createdBy: 9,
      updatedBy: 9
    });

    await request(app).get(`/api/operational-records/${outOfArea.id}`).set('Authorization', auth).expect(404);
    await request(app).get(`/api/requests/${otherTenant.id}`).set('Authorization', auth).expect(404);
  });

  test('supports comments and attachments on Requests and Notes', async () => {
    await User.update({ role: 'manager' }, { where: { id: 7 } });
    const created = await request(app)
      .post('/api/operational-records')
      .set('Authorization', auth)
      .send({ title: 'Supplier delivery note', body: 'Three cartons were damaged.', areaScope: 'AREAS', primaryAreaId: areaA.id })
      .expect(201);
    const recordId = created.body.record.id;

    await request(app)
      .post(`/api/operational-records/${recordId}/comments`)
      .set('Authorization', auth)
      .send({ body: 'Photos have been added for the supplier.' })
      .expect(201);

    const comments = await request(app)
      .get(`/api/operational-records/${recordId}/comments`)
      .set('Authorization', auth)
      .expect(200);
    expect(comments.body.comments[0].body).toContain('Photos');
    expect(await OperationalItemComment.count({ where: { itemType: 'NOTE', itemId: recordId } })).toBe(1);

    await request(app)
      .post('/api/attachments')
      .set('Authorization', auth)
      .send({
        entityType: 'NOTE',
        entityId: recordId,
        filename: 'damage.txt',
        mimeType: 'text/plain',
        contentBase64: Buffer.from('three damaged cartons').toString('base64')
      })
      .expect(201);
    expect(await Attachment.count({ where: { entityType: 'NOTE', entityId: recordId } })).toBe(1);
  });

  test('preserves an approved Request and creates a linked Task', async () => {
    await User.update({ role: 'manager' }, { where: { id: 7 } });
    const created = await request(app)
      .post('/api/requests')
      .set('Authorization', auth)
      .send({
        title: 'Order replacement glassware',
        body: 'Approve 48 replacement tasting glasses.',
        subtype: 'STOCK_SUPPLIES',
        areaScope: 'AREAS',
        primaryAreaId: areaA.id
      })
      .expect(201);
    const requestId = created.body.request.id;

    await request(app)
      .post(`/api/requests/${requestId}/create-task`)
      .set('Authorization', auth)
      .send({})
      .expect(400);

    await request(app)
      .post(`/api/requests/${requestId}/decision`)
      .set('Authorization', auth)
      .send({ status: 'APPROVED', response: 'Approved.' })
      .expect(200);

    const converted = await request(app)
      .post(`/api/requests/${requestId}/create-task`)
      .set('Authorization', auth)
      .send({ priority: 'high' })
      .expect(201);

    expect(converted.body.task.payload.operationalSource).toEqual({ itemType: 'REQUEST', itemId: requestId });
    expect(await OperationalRequest.count({ where: { id: requestId, status: 'APPROVED' } })).toBe(1);
    expect(await Task.count({ where: { id: converted.body.task.id } })).toBe(1);
    expect(await OperationalItemRelation.count({ where: { sourceType: 'REQUEST', sourceId: requestId, targetType: 'TASK', relationType: 'GENERATED_TASK' } })).toBe(1);

    const repeated = await request(app)
      .post(`/api/requests/${requestId}/create-task`)
      .set('Authorization', auth)
      .send({ priority: 'high' })
      .expect(201);
    expect(repeated.body.duplicate).toBe(true);
    expect(repeated.body.task.id).toBe(converted.body.task.id);
    expect(await Task.count({ where: { id: converted.body.task.id } })).toBe(1);
  });

  test('creates and lists explicit cross-object relationships without exposing hidden targets', async () => {
    await User.update({ role: 'manager' }, { where: { id: 7 } });
    const note = await request(app)
      .post('/api/operational-records')
      .set('Authorization', auth)
      .send({ title: 'Recurring POS issue', body: 'POS froze again.', areaScope: 'AREAS', primaryAreaId: areaA.id })
      .expect(201);
    const relatedRequest = await request(app)
      .post('/api/requests')
      .set('Authorization', auth)
      .send({ title: 'Request POS support', body: 'Ask the provider to investigate.', areaScope: 'AREAS', primaryAreaId: areaA.id })
      .expect(201);

    await request(app)
      .post(`/api/operational-records/${note.body.record.id}/relations`)
      .set('Authorization', auth)
      .send({ targetType: 'REQUEST', targetId: relatedRequest.body.request.id, relationType: 'RELATES_TO' })
      .expect(201);

    const relations = await request(app)
      .get(`/api/operational-records/${note.body.record.id}/relations`)
      .set('Authorization', auth)
      .expect(200);
    expect(relations.body.relations).toHaveLength(1);
    expect(relations.body.relations[0].targetId).toBe(relatedRequest.body.request.id);
  });

  test('returns a permission-scoped unified feed and searches bodies, comments, and attachment metadata', async () => {
    await User.update({ role: 'manager' }, { where: { id: 7 } });
    const marker = 'unified-vintage-marker';
    const task = await Task.create({
      wineryId: 1,
      category: 'INTERNAL',
      subType: 'UNIFIED_SEARCH_TEST',
      status: 'PENDING',
      priority: 'normal',
      payload: { summary: 'Unified task', originalText: marker },
      areaScope: 'AREAS',
      assigneeId: 7,
      createdBy: 7,
      updatedBy: 7
    });
    await TaskArea.create({ wineryId: 1, taskId: task.id, areaId: areaA.id, relationshipType: 'PRIMARY' });
    const notice = await Notice.create({ wineryId: 1, title: 'Unified notice', body: marker, areaScope: 'AREAS', audienceType: 'users', audienceUserIds: [7], createdBy: 7, updatedBy: 7 });
    await NoticeArea.create({ wineryId: 1, noticeId: notice.id, areaId: areaA.id });
    const requestItem = await request(app)
      .post('/api/requests').set('Authorization', auth)
      .send({ title: 'Unified request', body: marker, areaScope: 'AREAS', primaryAreaId: areaA.id, requestedFromUserId: 7 })
      .expect(201);
    const noteItem = await request(app)
      .post('/api/operational-records').set('Authorization', auth)
      .send({ title: 'Unified note', body: marker, areaScope: 'AREAS', primaryAreaId: areaA.id, recipientUserIds: [7] })
      .expect(201);

    const allTypes = await request(app)
      .get(`/api/operations?search=${marker}&pageSize=20`)
      .set('Authorization', auth)
      .expect(200);
    expect(new Set(allTypes.body.operations.map(item => item.type))).toEqual(new Set(['TASK', 'NOTICE', 'REQUEST', 'NOTE']));
    expect(allTypes.body.operations.every(item => item.involvement?.kind === 'DIRECT')).toBe(true);
    expect(allTypes.body.pagination.total).toBe(4);
    const oldest = await request(app)
      .get(`/api/operations?search=${marker}&pageSize=20&sortBy=oldest`)
      .set('Authorization', auth)
      .expect(200);
    const eventTimes = oldest.body.operations.map(item => new Date(item.eventAt).getTime());
    expect(eventTimes).toEqual([...eventTimes].sort((left, right) => left - right));

    await request(app)
      .get('/api/operations?types=TASK,UNKNOWN')
      .set('Authorization', auth)
      .expect(400);

    await request(app)
      .post(`/api/operational-records/${noteItem.body.record.id}/comments`)
      .set('Authorization', auth)
      .send({ body: 'comment-only-search-token' })
      .expect(201);
    const commentSearch = await request(app)
      .get('/api/operations?search=comment-only-search-token')
      .set('Authorization', auth)
      .expect(200);
    expect(commentSearch.body.operations.map(item => item.key)).toContain(`NOTE:${noteItem.body.record.id}`);

    await request(app)
      .post('/api/attachments')
      .set('Authorization', auth)
      .send({
        entityType: 'REQUEST',
        entityId: requestItem.body.request.id,
        filename: 'attachment-only-search-token.txt',
        mimeType: 'text/plain',
        contentBase64: Buffer.from('evidence').toString('base64')
      })
      .expect(201);
    const attachmentSearch = await request(app)
      .get('/api/operations?search=attachment-only-search-token')
      .set('Authorization', auth)
      .expect(200);
    expect(attachmentSearch.body.operations.map(item => item.key)).toContain(`REQUEST:${requestItem.body.request.id}`);

    const page = await request(app)
      .get(`/api/operations?types=REQUEST,NOTE&search=${marker}&pageSize=1&page=2`)
      .set('Authorization', auth)
      .expect(200);
    expect(page.body.operations).toHaveLength(1);
    expect(page.body.pagination.total).toBe(2);

    const hidden = await OperationalRecord.create({
      wineryId: 1,
      title: 'Hidden unified note',
      body: 'area-hidden-unified-token',
      sourceType: 'MANUAL',
      occurredAt: new Date(),
      areaScope: 'AREAS',
      humanConfirmedType: 'NOTE',
      confirmedBy: 7,
      confirmedAt: new Date(),
      createdBy: 7,
      updatedBy: 7
    });
    await hidden.addOperationalArea(areaB, { through: { wineryId: 1, relationshipType: 'PRIMARY' } });
    await User.update({ role: 'staff' }, { where: { id: 7 } });
    await UserAreaMembership.destroy({ where: { userId: 7 } });
    await UserAreaMembership.create({ wineryId: 1, userId: 7, areaId: areaA.id, membershipRole: 'MEMBER', isPrimary: true });
    const hiddenSearch = await request(app)
      .get('/api/operations?search=area-hidden-unified-token')
      .set('Authorization', auth)
      .expect(200);
    expect(hiddenSearch.body.operations).toHaveLength(0);
  });
});
