process.env.ALLOW_TEST_AUTH_BYPASS = 'true';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../../app');
const { Notification, sequelize, Task, User, Winery } = require('../../models');

describe('Notification tenant isolation', () => {
  const auth = 'Bearer mock-token';

  beforeAll(async () => {
    await sequelize.sync({ force: true });
    await Winery.bulkCreate([
      { id: 1, name: 'Notification Winery', timeZone: 'Australia/Adelaide' },
      { id: 2, name: 'Other Notification Winery', timeZone: 'Australia/Adelaide' }
    ]);
    await User.create({
      id: 7,
      firebaseUid: 'notification-current-user',
      email: 'stub@example.com',
      displayName: 'Notification User',
      role: 'manager',
      wineryId: 1
    });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  test('filters and refuses notifications that resolve to another winery', async () => {
    const localTask = await Task.create({
      wineryId: 1,
      category: 'GENERAL',
      subType: 'LOCAL_NOTIFICATION',
      status: 'PENDING'
    });
    const foreignTask = await Task.create({
      wineryId: 2,
      category: 'GENERAL',
      subType: 'FOREIGN_NOTIFICATION',
      status: 'PENDING'
    });
    const localNotification = await Notification.create({
      userId: 7,
      type: 'ASSIGNMENT',
      message: 'Local task assignment',
      data: { taskId: localTask.id }
    });
    const foreignNotification = await Notification.create({
      userId: 7,
      type: 'ASSIGNMENT',
      message: 'Foreign task assignment',
      data: { taskId: foreignTask.id }
    });
    const explicitForeignNotification = await Notification.create({
      userId: 7,
      type: 'SYSTEM',
      message: 'Foreign project update',
      data: { wineryId: 2, projectId: 999 }
    });
    const orphanedNotification = await Notification.create({
      userId: 7,
      type: 'ASSIGNMENT',
      message: 'Orphaned task assignment',
      data: { taskId: 999999, cachedCustomerName: 'Must not be exposed' }
    });
    const unscopedNotification = await Notification.create({
      userId: 7,
      type: 'SYSTEM',
      message: 'Legacy notification without tenant evidence',
      data: {}
    });

    const list = await request(app)
      .get('/api/notifications')
      .set('Authorization', auth)
      .expect(200);
    expect(list.body.notifications.map(item => item.id)).toEqual([localNotification.id]);

    await request(app)
      .patch(`/api/notifications/${foreignNotification.id}/read`)
      .set('Authorization', auth)
      .expect(404);
    await request(app)
      .delete(`/api/notifications/${explicitForeignNotification.id}`)
      .set('Authorization', auth)
      .expect(404);
    await request(app)
      .patch(`/api/notifications/${orphanedNotification.id}/read`)
      .set('Authorization', auth)
      .expect(404);
    await request(app)
      .delete(`/api/notifications/${unscopedNotification.id}`)
      .set('Authorization', auth)
      .expect(404);
    expect(await Notification.count({
      where: { id: [foreignNotification.id, explicitForeignNotification.id, orphanedNotification.id, unscopedNotification.id] }
    })).toBe(4);
  });
});
