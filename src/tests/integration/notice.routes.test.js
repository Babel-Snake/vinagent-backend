process.env.ALLOW_TEST_AUTH_BYPASS = 'true';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../../app');
const { sequelize, Winery, User, Notice, NoticeAcknowledgement, NoticeComment, NoticeTask, Task } = require('../../models');

describe('Notice Routes', () => {
  const authToken = 'Bearer mock-token';
  let winery;
  let otherWinery;
  let manager;
  let staff;

  beforeAll(async () => {
    await sequelize.sync({ force: true });

    winery = await Winery.create({
      id: 1,
      name: 'Notice Test Winery',
      timeZone: 'Australia/Adelaide',
      contactEmail: 'notices@example.com'
    });

    otherWinery = await Winery.create({
      id: 2,
      name: 'Other Notice Winery',
      timeZone: 'Australia/Adelaide',
      contactEmail: 'other-notices@example.com'
    });

    manager = await User.create({
      id: 7,
      firebaseUid: 'notice-manager-uid',
      email: 'stub@example.com',
      displayName: 'Notice Manager',
      role: 'manager',
      wineryId: winery.id
    });

    staff = await User.create({
      id: 8,
      firebaseUid: 'notice-staff-uid',
      email: 'staff@example.com',
      displayName: 'Notice Staff',
      role: 'staff',
      wineryId: winery.id
    });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  beforeEach(async () => {
    await NoticeAcknowledgement.destroy({ where: {}, truncate: true });
    await NoticeComment.destroy({ where: {}, truncate: true });
    await NoticeTask.destroy({ where: {}, truncate: true });
    await Task.destroy({ where: {}, truncate: true });
    await Notice.destroy({ where: {}, truncate: true });
    await User.update({ role: 'manager', wineryId: winery.id }, { where: { id: manager.id } });
  });

  it('allows managers to create notices scoped to their winery', async () => {
    const effectiveFrom = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

    const res = await request(app)
      .post('/api/notices')
      .set('Authorization', authToken)
      .send({
        title: 'Cleaner arriving tomorrow',
        body: 'Cleaner arriving tomorrow at 8am. Please keep the back room accessible.',
        category: 'MAINTENANCE',
        priority: 'important',
        isPinned: true,
        effectiveFrom,
        expiresAt
      })
      .expect(201);

    expect(res.body.notice.title).toBe('Cleaner arriving tomorrow');
    expect(res.body.notice.wineryId).toBe(winery.id);
    expect(res.body.notice.createdBy).toBe(manager.id);
    expect(res.body.notice.Author.displayName).toBe('Notice Manager');
    expect(res.body.notice.status).toBe('active');
  });

  it('tracks required acknowledgements idempotently and exposes manager completion details', async () => {
    const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const createRes = await request(app)
      .post('/api/notices')
      .set('Authorization', authToken)
      .send({
        title: 'New tasting policy',
        body: 'Read the updated tasting procedure before your next shift.',
        category: 'STAFF',
        priority: 'important',
        requiresAcknowledgement: true,
        acknowledgementDueAt: dueAt,
        audienceType: 'all_staff'
      })
      .expect(201);

    expect(createRes.body.notice.requiresAcknowledgement).toBe(true);
    expect(createRes.body.notice.acknowledgement.expectedCount).toBe(2);
    await User.update({ role: 'staff' }, { where: { id: manager.id } });

    const first = await request(app)
      .put(`/api/notices/${createRes.body.notice.id}/acknowledgement`)
      .set('Authorization', authToken)
      .expect(200);
    expect(first.body.notice.acknowledgement.currentUserAcknowledgedAt).toBeTruthy();

    await request(app)
      .put(`/api/notices/${createRes.body.notice.id}/acknowledgement`)
      .set('Authorization', authToken)
      .expect(200);
    expect(await NoticeAcknowledgement.count({ where: { noticeId: createRes.body.notice.id, userId: manager.id } })).toBe(1);

    await request(app)
      .get(`/api/notices/${createRes.body.notice.id}/acknowledgements`)
      .set('Authorization', authToken)
      .expect(403);

    await User.update({ role: 'manager' }, { where: { id: manager.id } });
    const summary = await request(app)
      .get(`/api/notices/${createRes.body.notice.id}/acknowledgements`)
      .set('Authorization', authToken)
      .expect(200);
    expect(summary.body.acknowledgement).toMatchObject({ expectedCount: 2, acknowledgedCount: 1, outstandingCount: 1, completionRate: 50 });
    expect(summary.body.acknowledgement.recipients).toHaveLength(2);
  });

  it('does not let a manager acknowledge a notice when they are outside its directed audience', async () => {
    const notice = await Notice.create({
      title: 'Staff-only acknowledgement',
      body: 'Only the selected staff member is expected to acknowledge.',
      category: 'STAFF',
      priority: 'normal',
      requiresAcknowledgement: true,
      audienceType: 'users',
      audienceUserIds: [staff.id],
      wineryId: winery.id,
      createdBy: manager.id
    });

    await request(app)
      .put(`/api/notices/${notice.id}/acknowledgement`)
      .set('Authorization', authToken)
      .expect(403);
    expect(await NoticeAcknowledgement.count({ where: { noticeId: notice.id } })).toBe(0);
  });

  it('prevents staff from creating notices but lets staff view them', async () => {
    await Notice.create({
      title: 'Tasting flight changed',
      body: 'Use the new tasting flight from Friday.',
      category: 'WINE',
      priority: 'normal',
      wineryId: winery.id,
      createdBy: manager.id
    });

    await User.update({ role: 'staff' }, { where: { id: manager.id } });

    await request(app)
      .post('/api/notices')
      .set('Authorization', authToken)
      .send({
        title: 'Staff attempt',
        body: 'This should not be created.',
        category: 'GENERAL',
        priority: 'normal'
      })
      .expect(403);

    const listRes = await request(app)
      .get('/api/notices')
      .set('Authorization', authToken)
      .expect(200);

    expect(listRes.body.notices).toHaveLength(1);
    expect(listRes.body.notices[0].title).toBe('Tasting flight changed');
  });

  it('returns stable pagination metadata and distinct notice pages', async () => {
    const firstCreatedAt = new Date('2026-07-01T08:00:00.000Z');
    const secondCreatedAt = new Date('2026-07-01T08:01:00.000Z');
    const firstNotice = await Notice.create({
      title: 'NOTICE_PAGINATION_MATCH first',
      body: 'First pagination notice.',
      category: 'GENERAL',
      priority: 'normal',
      wineryId: winery.id,
      createdBy: manager.id,
      createdAt: firstCreatedAt,
      updatedAt: firstCreatedAt
    });
    const secondNotice = await Notice.create({
      title: 'NOTICE_PAGINATION_MATCH second',
      body: 'Second pagination notice.',
      category: 'GENERAL',
      priority: 'normal',
      wineryId: winery.id,
      createdBy: manager.id,
      createdAt: secondCreatedAt,
      updatedAt: secondCreatedAt
    });

    const firstPage = await request(app)
      .get('/api/notices?search=NOTICE_PAGINATION_MATCH&sortBy=oldest&page=1&pageSize=1')
      .set('Authorization', authToken)
      .expect(200);
    const secondPage = await request(app)
      .get('/api/notices?search=NOTICE_PAGINATION_MATCH&sortBy=oldest&page=2&pageSize=1')
      .set('Authorization', authToken)
      .expect(200);

    expect(firstPage.body.pagination).toEqual({ page: 1, pageSize: 1, total: 2, totalPages: 2 });
    expect(secondPage.body.pagination).toEqual({ page: 2, pageSize: 1, total: 2, totalPages: 2 });
    expect(firstPage.body.notices.map((notice) => notice.id)).toEqual([firstNotice.id]);
    expect(secondPage.body.notices.map((notice) => notice.id)).toEqual([secondNotice.id]);
  });

  it('filters notices by directed audience for non-manager users', async () => {
    const allStaffNotice = await Notice.create({
      title: 'All staff notice',
      body: 'Visible to everyone.',
      category: 'GENERAL',
      priority: 'normal',
      wineryId: winery.id,
      createdBy: manager.id
    });

    const staffRoleNotice = await Notice.create({
      title: 'Staff role notice',
      body: 'Visible to staff role users.',
      category: 'STAFF',
      priority: 'normal',
      audienceType: 'roles',
      audienceRoles: ['staff'],
      wineryId: winery.id,
      createdBy: manager.id
    });

    const managerRoleNotice = await Notice.create({
      title: 'Manager role notice',
      body: 'Visible to managers.',
      category: 'STAFF',
      priority: 'normal',
      audienceType: 'roles',
      audienceRoles: ['manager'],
      wineryId: winery.id,
      createdBy: manager.id
    });

    const directCurrentUserNotice = await Notice.create({
      title: 'Direct current user notice',
      body: 'Visible to this user by id.',
      category: 'GENERAL',
      priority: 'normal',
      audienceType: 'users',
      audienceUserIds: [manager.id],
      wineryId: winery.id,
      createdBy: manager.id
    });

    const directOtherUserNotice = await Notice.create({
      title: 'Direct other user notice',
      body: 'Visible only to another user.',
      category: 'GENERAL',
      priority: 'normal',
      audienceType: 'users',
      audienceUserIds: [staff.id],
      wineryId: winery.id,
      createdBy: manager.id
    });

    await User.update({ role: 'staff' }, { where: { id: manager.id } });

    const listRes = await request(app)
      .get('/api/notices')
      .set('Authorization', authToken)
      .expect(200);

    const visibleIds = listRes.body.notices.map((notice) => notice.id);
    expect(visibleIds).toContain(allStaffNotice.id);
    expect(visibleIds).toContain(staffRoleNotice.id);
    expect(visibleIds).toContain(directCurrentUserNotice.id);
    expect(visibleIds).not.toContain(managerRoleNotice.id);
    expect(visibleIds).not.toContain(directOtherUserNotice.id);

    await request(app)
      .get(`/api/notices/${directOtherUserNotice.id}`)
      .set('Authorization', authToken)
      .expect(404);
  });

  it('only lists and fetches notices for the authenticated winery', async () => {
    const ownNotice = await Notice.create({
      title: 'Own winery notice',
      body: 'Visible to this winery.',
      category: 'GENERAL',
      priority: 'normal',
      wineryId: winery.id,
      createdBy: manager.id
    });

    const otherNotice = await Notice.create({
      title: 'Other winery notice',
      body: 'Must not leak across organisations.',
      category: 'GENERAL',
      priority: 'urgent',
      wineryId: otherWinery.id,
      createdBy: staff.id
    });

    const res = await request(app)
      .get('/api/notices')
      .set('Authorization', authToken)
      .expect(200);

    expect(res.body.notices.map((notice) => notice.id)).toContain(ownNotice.id);
    expect(res.body.notices.map((notice) => notice.id)).not.toContain(otherNotice.id);

    await request(app)
      .get(`/api/notices/${otherNotice.id}`)
      .set('Authorization', authToken)
      .expect(404);
  });

  it('supports searching, filtering, and default ordering without expired or archived clutter', async () => {
    const expired = await Notice.create({
      title: 'Old supplier delivery',
      body: 'This delivery note has expired.',
      category: 'GENERAL',
      priority: 'normal',
      expiresAt: new Date(Date.now() - 60 * 60 * 1000),
      wineryId: winery.id,
      createdBy: manager.id
    });

    const archived = await Notice.create({
      title: 'Archived pricing note',
      body: 'Archived note.',
      category: 'PRICING',
      priority: 'important',
      archivedAt: new Date(),
      archivedBy: manager.id,
      wineryId: winery.id,
      createdBy: manager.id
    });

    const pinned = await Notice.create({
      title: 'Do not sell Riesling',
      body: 'Do not sell the current Riesling until stock has been checked.',
      category: 'STOCK',
      priority: 'normal',
      isPinned: true,
      wineryId: winery.id,
      createdBy: manager.id
    });

    const urgent = await Notice.create({
      title: 'Short staffed Saturday',
      body: 'The cellar door will be short-staffed on Saturday.',
      category: 'STAFF',
      priority: 'urgent',
      wineryId: winery.id,
      createdBy: manager.id
    });

    const defaultRes = await request(app)
      .get('/api/notices')
      .set('Authorization', authToken)
      .expect(200);

    expect(defaultRes.body.notices.map((notice) => notice.id)).toEqual([pinned.id, urgent.id]);
    expect(defaultRes.body.notices.map((notice) => notice.id)).not.toContain(expired.id);
    expect(defaultRes.body.notices.map((notice) => notice.id)).not.toContain(archived.id);

    const searchRes = await request(app)
      .get('/api/notices?search=Riesling&category=STOCK&pinned=true')
      .set('Authorization', authToken)
      .expect(200);

    expect(searchRes.body.notices).toHaveLength(1);
    expect(searchRes.body.notices[0].id).toBe(pinned.id);

    const expiredRes = await request(app)
      .get('/api/notices?status=expired')
      .set('Authorization', authToken)
      .expect(200);

    expect(expiredRes.body.notices).toHaveLength(1);
    expect(expiredRes.body.notices[0].id).toBe(expired.id);

    const archivedRes = await request(app)
      .get('/api/notices?status=archived')
      .set('Authorization', authToken)
      .expect(200);

    expect(archivedRes.body.notices).toHaveLength(1);
    expect(archivedRes.body.notices[0].id).toBe(archived.id);
  });

  it('allows managers to edit and archive notices', async () => {
    const notice = await Notice.create({
      title: 'Prices increase next month',
      body: 'Current draft.',
      category: 'PRICING',
      priority: 'important',
      wineryId: winery.id,
      createdBy: manager.id
    });

    const updateRes = await request(app)
      .patch(`/api/notices/${notice.id}`)
      .set('Authorization', authToken)
      .send({
        title: 'Prices increase from June 1',
        body: 'New pricing applies from June 1.',
        priority: 'urgent',
        isPinned: true
      })
      .expect(200);

    expect(updateRes.body.notice.title).toBe('Prices increase from June 1');
    expect(updateRes.body.notice.priority).toBe('urgent');
    expect(updateRes.body.notice.isPinned).toBe(true);
    expect(updateRes.body.notice.updatedBy).toBe(manager.id);

    const archiveRes = await request(app)
      .delete(`/api/notices/${notice.id}`)
      .set('Authorization', authToken)
      .expect(200);

    expect(archiveRes.body.notice.isArchived).toBe(true);
    expect(archiveRes.body.notice.archivedBy).toBe(manager.id);

    const defaultRes = await request(app)
      .get('/api/notices')
      .set('Authorization', authToken)
      .expect(200);

    expect(defaultRes.body.notices.map((entry) => entry.id)).not.toContain(notice.id);
  });

  it('allows managers to link and unlink tasks from either notice or task routes after creation', async () => {
    const notice = await Notice.create({
      title: 'Prices increase from June 1',
      body: 'New pricing applies from June 1.',
      category: 'PRICING',
      priority: 'important',
      wineryId: winery.id,
      createdBy: manager.id
    });

    const task = await Task.create({
      wineryId: winery.id,
      category: 'GENERAL',
      subType: 'UPDATE_PRICE_LIST',
      status: 'PENDING',
      priority: 'normal'
    });

    const linkFromNoticeRes = await request(app)
      .post(`/api/notices/${notice.id}/tasks`)
      .set('Authorization', authToken)
      .send({ taskId: task.id })
      .expect(201);

    expect(linkFromNoticeRes.body.notice.LinkedTasks).toHaveLength(1);
    expect(linkFromNoticeRes.body.notice.LinkedTasks[0].id).toBe(task.id);

    const taskRes = await request(app)
      .get(`/api/tasks/${task.id}`)
      .set('Authorization', authToken)
      .expect(200);

    expect(taskRes.body.task.LinkedNotices).toHaveLength(1);
    expect(taskRes.body.task.LinkedNotices[0].id).toBe(notice.id);

    await request(app)
      .delete(`/api/tasks/${task.id}/notices/${notice.id}`)
      .set('Authorization', authToken)
      .expect(200);

    const unlinkedTaskRes = await request(app)
      .get(`/api/tasks/${task.id}`)
      .set('Authorization', authToken)
      .expect(200);

    expect(unlinkedTaskRes.body.task.LinkedNotices).toHaveLength(0);

    const linkFromTaskRes = await request(app)
      .post(`/api/tasks/${task.id}/notices`)
      .set('Authorization', authToken)
      .send({ noticeId: notice.id })
      .expect(201);

    expect(linkFromTaskRes.body.task.LinkedNotices).toHaveLength(1);
    expect(linkFromTaskRes.body.task.LinkedNotices[0].id).toBe(notice.id);

    const noticeAfterTaskLink = await request(app)
      .get(`/api/notices/${notice.id}`)
      .set('Authorization', authToken)
      .expect(200);

    expect(noticeAfterTaskLink.body.notice.LinkedTasks).toHaveLength(1);
    expect(noticeAfterTaskLink.body.notice.LinkedTasks[0].id).toBe(task.id);
  });

  it('prevents staff and cross-winery records from linking notices and tasks', async () => {
    const notice = await Notice.create({
      title: 'Stock check',
      body: 'Do not sell Riesling until checked.',
      category: 'STOCK',
      priority: 'urgent',
      wineryId: winery.id,
      createdBy: manager.id
    });

    const task = await Task.create({
      wineryId: winery.id,
      category: 'GENERAL',
      subType: 'CHECK_RIESLING_STOCK',
      status: 'PENDING',
      priority: 'normal'
    });

    const otherTask = await Task.create({
      wineryId: otherWinery.id,
      category: 'GENERAL',
      subType: 'OTHER_WINERY_TASK',
      status: 'PENDING',
      priority: 'normal'
    });

    await User.update({ role: 'staff' }, { where: { id: manager.id } });

    await request(app)
      .post(`/api/notices/${notice.id}/tasks`)
      .set('Authorization', authToken)
      .send({ taskId: task.id })
      .expect(403);

    await User.update({ role: 'manager' }, { where: { id: manager.id } });

    await request(app)
      .post(`/api/notices/${notice.id}/tasks`)
      .set('Authorization', authToken)
      .send({ taskId: otherTask.id })
      .expect(404);

    const linkCount = await NoticeTask.count();
    expect(linkCount).toBe(0);
  });

  it('allows staff to add and list notice comments', async () => {
    const notice = await Notice.create({
      title: 'Barrel room access',
      body: 'Keep the barrel room clear for the contractor.',
      category: 'MAINTENANCE',
      priority: 'important',
      wineryId: winery.id,
      createdBy: manager.id
    });

    await User.update({ role: 'staff' }, { where: { id: manager.id } });

    const createRes = await request(app)
      .post(`/api/notices/${notice.id}/comments`)
      .set('Authorization', authToken)
      .send({ body: 'Can we still access the dry goods shelves after 2pm?' })
      .expect(201);

    expect(createRes.body.comment.body).toBe('Can we still access the dry goods shelves after 2pm?');
    expect(createRes.body.comment.userId).toBe(manager.id);
    expect(createRes.body.comment.Author.displayName).toBe('Notice Manager');

    await User.update({ role: 'manager' }, { where: { id: manager.id } });
    await request(app)
      .post(`/api/notices/${notice.id}/comments`)
      .set('Authorization', authToken)
      .send({ body: 'Yes, shelves are clear after lunch.' })
      .expect(201);

    const listRes = await request(app)
      .get(`/api/notices/${notice.id}/comments`)
      .set('Authorization', authToken)
      .expect(200);

    expect(listRes.body.comments.map(comment => comment.body)).toEqual([
      'Can we still access the dry goods shelves after 2pm?',
      'Yes, shelves are clear after lunch.'
    ]);
  });

  it('allows staff to reply to a specific notice comment', async () => {
    const notice = await Notice.create({
      title: 'Delivery timing',
      body: 'Supplier delivery is due tomorrow morning.',
      category: 'STOCK',
      priority: 'normal',
      wineryId: winery.id,
      createdBy: manager.id
    });

    await User.update({ role: 'staff' }, { where: { id: manager.id } });

    const questionRes = await request(app)
      .post(`/api/notices/${notice.id}/comments`)
      .set('Authorization', authToken)
      .send({ body: 'Should we clear the loading bay before opening?' })
      .expect(201);

    await User.update({ role: 'manager' }, { where: { id: manager.id } });

    const replyRes = await request(app)
      .post(`/api/notices/${notice.id}/comments`)
      .set('Authorization', authToken)
      .send({
        body: 'Yes, please keep the bay clear until 10am.',
        parentCommentId: questionRes.body.comment.id
      })
      .expect(201);

    expect(replyRes.body.comment.parentCommentId).toBe(questionRes.body.comment.id);

    const listRes = await request(app)
      .get(`/api/notices/${notice.id}/comments`)
      .set('Authorization', authToken)
      .expect(200);

    expect(listRes.body.comments).toHaveLength(1);
    expect(listRes.body.comments[0].body).toBe('Should we clear the loading bay before opening?');
    expect(listRes.body.comments[0].Replies).toHaveLength(1);
    expect(listRes.body.comments[0].Replies[0].body).toBe('Yes, please keep the bay clear until 10am.');
    expect(listRes.body.comments[0].Replies[0].parentCommentId).toBe(questionRes.body.comment.id);
  });

  it('only allows managers to delete notice comments', async () => {
    const notice = await Notice.create({
      title: 'Roster note',
      body: 'Roster has changed for Saturday.',
      category: 'STAFF',
      priority: 'normal',
      wineryId: winery.id,
      createdBy: manager.id
    });

    const comment = await NoticeComment.create({
      noticeId: notice.id,
      wineryId: winery.id,
      userId: staff.id,
      body: 'I can cover the afternoon shift.'
    });

    await User.update({ role: 'staff' }, { where: { id: manager.id } });

    await request(app)
      .delete(`/api/notices/${notice.id}/comments/${comment.id}`)
      .set('Authorization', authToken)
      .expect(403);

    expect(await NoticeComment.findByPk(comment.id)).toBeDefined();

    await User.update({ role: 'manager' }, { where: { id: manager.id } });

    await request(app)
      .delete(`/api/notices/${notice.id}/comments/${comment.id}`)
      .set('Authorization', authToken)
      .expect(200);

    expect(await NoticeComment.findByPk(comment.id)).toBeNull();
  });
});
