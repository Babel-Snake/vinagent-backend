process.env.ALLOW_TEST_AUTH_BYPASS = 'true';
process.env.NODE_ENV = 'test';
process.env.ATTACHMENT_STORAGE_ROOT = require('path').join(require('os').tmpdir(), 'vinagent-attachment-route-tests');

const fs = require('fs/promises');
const request = require('supertest');
const app = require('../../app');
const { Attachment, Notice, Task, TaskAction, TaskStep, User, Winery, sequelize } = require('../../models');

describe('Attachment Routes', () => {
  const authToken = 'Bearer mock-token';
  let winery;

  beforeAll(async () => {
    await fs.rm(process.env.ATTACHMENT_STORAGE_ROOT, { recursive: true, force: true });
    await sequelize.sync({ force: true });

    winery = await Winery.create({
      id: 1,
      name: 'Attachment Test Winery',
      timeZone: 'Australia/Adelaide',
      contactEmail: 'attachments@example.com'
    });
    await Winery.create({
      id: 2,
      name: 'Other Attachment Winery',
      timeZone: 'Australia/Adelaide'
    });

    await User.create({
      id: 7,
      firebaseUid: 'attachment-user-7',
      email: 'stub@example.com',
      displayName: 'Attachment User',
      role: 'manager',
      wineryId: winery.id
    });

    await User.create({
      id: 9,
      firebaseUid: 'attachment-foreign-user-9',
      email: 'attachment-foreign@example.com',
      displayName: 'Foreign Attachment User',
      role: 'manager',
      wineryId: 2
    });

    await User.create({
      id: 8,
      firebaseUid: 'attachment-staff-8',
      email: 'attachment-staff@example.com',
      displayName: 'Attachment Staff',
      role: 'staff',
      wineryId: winery.id
    });
  });

  afterAll(async () => {
    await sequelize.close();
    await fs.rm(process.env.ATTACHMENT_STORAGE_ROOT, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await TaskAction.destroy({ where: {}, truncate: true });
    await Attachment.destroy({ where: {}, truncate: true });
    await TaskStep.destroy({ where: {}, truncate: true });
    await Task.destroy({ where: {}, truncate: true });
    await Notice.destroy({ where: {}, truncate: true });
    await User.update({ role: 'manager' }, { where: { id: 7 } });
    await fs.rm(process.env.ATTACHMENT_STORAGE_ROOT, { recursive: true, force: true });
  });

  function uploadPayload(overrides = {}) {
    return {
      entityType: 'TASK',
      entityId: 1,
      filename: 'receipt.txt',
      mimeType: 'text/plain',
      sizeBytes: Buffer.byteLength('receipt proof'),
      contentBase64: Buffer.from('receipt proof').toString('base64'),
      ...overrides
    };
  }

  it('uploads, lists, downloads, and deletes a task attachment', async () => {
    const task = await Task.create({
      id: 1,
      wineryId: winery.id,
      status: 'PENDING',
      category: 'GENERAL',
      subType: 'GENERAL_ENQUIRY',
      assigneeId: 7
    });

    const createRes = await request(app)
      .post('/api/attachments')
      .set('Authorization', authToken)
      .send(uploadPayload({ entityId: task.id }))
      .expect(201);

    expect(createRes.body.attachment.filename).toBe('receipt.txt');
    expect(createRes.body.attachment.entityType).toBe('TASK');

    const listRes = await request(app)
      .get(`/api/attachments?entityType=TASK&entityId=${task.id}`)
      .set('Authorization', authToken)
      .expect(200);

    expect(listRes.body.attachments).toHaveLength(1);
    expect(listRes.body.attachments[0].Uploader.displayName).toBe('Attachment User');

    const downloadRes = await request(app)
      .get(`/api/attachments/${createRes.body.attachment.id}/download`)
      .set('Authorization', authToken)
      .expect(200);

    expect(downloadRes.text).toBe('receipt proof');

    await request(app)
      .delete(`/api/attachments/${createRes.body.attachment.id}`)
      .set('Authorization', authToken)
      .expect(200);

    const deleted = await Attachment.findByPk(createRes.body.attachment.id);
    expect(deleted.deletedAt).toBeTruthy();

    const actions = await TaskAction.findAll({ where: { taskId: task.id }, order: [['id', 'ASC']] });
    expect(actions.map(action => action.actionType)).toEqual(['ATTACHMENT_ADDED', 'ATTACHMENT_DELETED']);
  });

  it('allows staff to attach to unassigned tasks but not tasks assigned to another staff member', async () => {
    await User.update({ role: 'staff' }, { where: { id: 7 } });
    const unassignedTask = await Task.create({
      wineryId: winery.id,
      status: 'PENDING',
      category: 'GENERAL',
      subType: 'GENERAL_ENQUIRY'
    });
    const assignedTask = await Task.create({
      wineryId: winery.id,
      status: 'PENDING',
      category: 'GENERAL',
      subType: 'GENERAL_ENQUIRY',
      assigneeId: 8
    });

    await request(app)
      .post('/api/attachments')
      .set('Authorization', authToken)
      .send(uploadPayload({ entityId: unassignedTask.id }))
      .expect(201);

    const denied = await request(app)
      .post('/api/attachments')
      .set('Authorization', authToken)
      .send(uploadPayload({ entityId: assignedTask.id }))
      .expect(403);

    expect(denied.body.error.message).toMatch(/assigned to another staff member/i);
  });

  it('enforces workflow step ownership for step attachments', async () => {
    await User.update({ role: 'staff' }, { where: { id: 7 } });
    const task = await Task.create({
      wineryId: winery.id,
      status: 'PENDING',
      category: 'GENERAL',
      subType: 'GENERAL_ENQUIRY',
      assigneeId: 7
    });
    const step = await TaskStep.create({
      taskId: task.id,
      title: 'Owned proof step',
      stepType: 'INTERNAL',
      waitingOn: 'STAFF',
      ownerUserId: 8,
      sortOrder: 0
    });

    const denied = await request(app)
      .post('/api/attachments')
      .set('Authorization', authToken)
      .send(uploadPayload({ entityType: 'TASK_STEP', entityId: step.id }))
      .expect(403);

    expect(denied.body.error.message).toMatch(/workflow step is assigned/i);
  });

  it('lets notice audiences view attachments while only managers can upload them', async () => {
    const notice = await Notice.create({
      title: 'Event run sheet',
      body: 'Attached run sheet.',
      category: 'EVENTS',
      priority: 'important',
      audienceType: 'all_staff',
      wineryId: winery.id,
      createdBy: 7
    });

    const createRes = await request(app)
      .post('/api/attachments')
      .set('Authorization', authToken)
      .send(uploadPayload({ entityType: 'NOTICE', entityId: notice.id, filename: 'run-sheet.txt' }))
      .expect(201);

    await User.update({ role: 'staff' }, { where: { id: 7 } });

    const listRes = await request(app)
      .get(`/api/attachments?entityType=NOTICE&entityId=${notice.id}`)
      .set('Authorization', authToken)
      .expect(200);

    expect(listRes.body.attachments).toHaveLength(1);

    await request(app)
      .get(`/api/attachments/${createRes.body.attachment.id}/download`)
      .set('Authorization', authToken)
      .expect(200);

    await request(app)
      .post('/api/attachments')
      .set('Authorization', authToken)
      .send(uploadPayload({ entityType: 'NOTICE', entityId: notice.id, filename: 'staff-upload.txt' }))
      .expect(403);
  });

  it('does not hydrate a foreign uploader or follow a storage key into another winery', async () => {
    const task = await Task.create({
      wineryId: winery.id,
      status: 'PENDING',
      category: 'GENERAL',
      subType: 'TENANT_STORAGE',
      assigneeId: 7
    });
    const created = await request(app)
      .post('/api/attachments')
      .set('Authorization', authToken)
      .send(uploadPayload({ entityId: task.id }))
      .expect(201);
    const attachment = await Attachment.findByPk(created.body.attachment.id);
    await attachment.update({
      uploadedBy: 9,
      storageKey: require('path').join('2', 'foreign-file.txt')
    });

    const list = await request(app)
      .get(`/api/attachments?entityType=TASK&entityId=${task.id}`)
      .set('Authorization', authToken)
      .expect(200);
    expect(list.body.attachments[0].Uploader).toBeNull();
    expect(JSON.stringify(list.body)).not.toContain('attachment-foreign@example.com');

    await request(app)
      .get(`/api/attachments/${attachment.id}/download`)
      .set('Authorization', authToken)
      .expect(400);
  });
});
