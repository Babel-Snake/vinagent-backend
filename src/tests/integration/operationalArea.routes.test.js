process.env.ALLOW_TEST_AUTH_BYPASS = 'true';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../../app');
const integrationConnectionService = require('../../services/integrationConnection.service');
const {
  sequelize,
  AreaProductListing,
  IntegrationEvent,
  Notice,
  NoticeArea,
  Notification,
  OperationalArea,
  OperationalAreaBookingsConfig,
  OperationalAreaIntegrationConfig,
  OperationalAreaProfile,
  Task,
  TaskAction,
  TaskArea,
  TaskStep,
  User,
  UserAreaMembership,
  Winery,
  WineryBookingType,
  WineryContact,
  WineryContactArea,
  WineryFAQItem,
  WinerySop,
  WineryProduct
} = require('../../models');

describe('Operational Area Routes and Visibility', () => {
  const authToken = 'Bearer mock-token';
  let winery;
  let otherWinery;
  let currentUser;
  let otherStaff;
  let areaA;
  let areaB;

  beforeAll(async () => {
    await sequelize.sync({ force: true });
    winery = await Winery.create({ id: 1, name: 'Area Test Winery', timeZone: 'Australia/Adelaide' });
    otherWinery = await Winery.create({ id: 2, name: 'Other Area Winery', timeZone: 'Australia/Adelaide' });
    currentUser = await User.create({
      id: 7,
      firebaseUid: 'area-current-user',
      email: 'stub@example.com',
      displayName: 'Area Manager',
      role: 'manager',
      wineryId: winery.id
    });
    otherStaff = await User.create({
      id: 8,
      firebaseUid: 'area-other-staff',
      email: 'area-staff@example.com',
      displayName: 'Other Staff',
      role: 'staff',
      wineryId: winery.id
    });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  beforeEach(async () => {
    await TaskAction.destroy({ where: {} });
    await Notification.destroy({ where: {} });
    await TaskStep.destroy({ where: {} });
    await TaskArea.destroy({ where: {} });
    await NoticeArea.destroy({ where: {} });
    await UserAreaMembership.destroy({ where: {} });
    await Task.destroy({ where: {} });
    await Notice.destroy({ where: {} });
    await IntegrationEvent.destroy({ where: {} });
    await AreaProductListing.destroy({ where: {} });
    await OperationalAreaIntegrationConfig.destroy({ where: {} });
    await WineryContactArea.destroy({ where: {} });
    await WineryContact.destroy({ where: {} });
    await WineryFAQItem.destroy({ where: {} });
    await WinerySop.destroy({ where: {} });
    await WineryBookingType.destroy({ where: {} });
    await OperationalAreaBookingsConfig.destroy({ where: {} });
    await OperationalAreaProfile.destroy({ where: {} });
    await OperationalArea.destroy({ where: {} });
    await WineryProduct.destroy({ where: {} });
    await User.update({ role: 'manager', wineryId: winery.id }, { where: { id: currentUser.id } });

    areaA = await OperationalArea.create({ wineryId: winery.id, name: 'Cellar Door', sortOrder: 1 });
    areaB = await OperationalArea.create({ wineryId: winery.id, name: 'Restaurant', sortOrder: 2 });
  });

  it('lets managers configure areas and replace a staff member area membership set', async () => {
    const created = await request(app)
      .post('/api/operational-areas')
      .set('Authorization', authToken)
      .send({ name: 'Logistics', description: 'Deliveries and warehouse', sortOrder: 3 })
      .expect(201);

    const memberships = await request(app)
      .put(`/api/operational-areas/memberships/${otherStaff.id}`)
      .set('Authorization', authToken)
      .send({
        memberships: [
          { areaId: areaA.id, membershipRole: 'MEMBER', isPrimary: true },
          { areaId: created.body.area.id, membershipRole: 'MANAGER', isPrimary: false }
        ]
      })
      .expect(200);

    expect(memberships.body.memberships).toHaveLength(2);
    expect(memberships.body.memberships.find(item => item.areaId === created.body.area.id).membershipRole).toBe('MANAGER');

    const list = await request(app)
      .get('/api/operational-areas?includeInactive=true')
      .set('Authorization', authToken)
      .expect(200);

    expect(list.body.areas.map(area => area.name)).toEqual(['Cellar Door', 'Restaurant', 'Logistics']);
  });

  it('lets winery managers maintain shared and cross-area reporting contacts without hierarchy cycles', async () => {
    const owner = await request(app)
      .post('/api/winery/contacts')
      .set('Authorization', authToken)
      .send({ name: 'Winery Owner', role: 'Owner', primaryAreaId: null, linkedAreaIds: [] })
      .expect(201);
    const coordinator = await request(app)
      .post('/api/winery/contacts')
      .set('Authorization', authToken)
      .send({
        name: 'Guest Experience Coordinator',
        role: 'Coordinator',
        reportsToId: owner.body.data.id,
        primaryAreaId: areaA.id,
        linkedAreaIds: [areaB.id]
      })
      .expect(201);

    expect(coordinator.body.data.OperationalAreas).toHaveLength(2);
    expect(await WineryContactArea.count({ where: { contactId: coordinator.body.data.id } })).toBe(2);

    await request(app)
      .put(`/api/winery/contacts/${owner.body.data.id}`)
      .set('Authorization', authToken)
      .send({
        name: 'Winery Owner',
        role: 'Owner',
        reportsToId: coordinator.body.data.id,
        primaryAreaId: null,
        linkedAreaIds: []
      })
      .expect(400);
  });

  it('lets area managers read winery configuration and edit only their managed area', async () => {
    await User.update({ role: 'staff' }, { where: { id: currentUser.id } });
    await UserAreaMembership.bulkCreate([
      {
        wineryId: winery.id,
        userId: currentUser.id,
        areaId: areaA.id,
        membershipRole: 'MANAGER',
        isPrimary: true
      },
      {
        wineryId: winery.id,
        userId: currentUser.id,
        areaId: areaB.id,
        membershipRole: 'MEMBER',
        isPrimary: false
      }
    ]);

    const full = await request(app)
      .get('/api/winery/full')
      .set('Authorization', authToken)
      .expect(200);

    expect(full.body.data.configurationAccess.isGlobalManager).toBe(false);
    expect(full.body.data.configurationAccess.managedAreaIds).toEqual([areaA.id]);
    expect(full.body.data.OperationalAreas.map(area => area.name).sort()).toEqual(['Cellar Door', 'Restaurant']);

    const me = await request(app)
      .get('/api/public/me')
      .set('Authorization', authToken)
      .expect(200);
    expect(me.body.user.canAccessWineryConfig).toBe(true);
    expect(me.body.user.managedAreaIds).toEqual([areaA.id]);

    await request(app)
      .put(`/api/winery/areas/${areaA.id}/profile`)
      .set('Authorization', authToken)
      .send({ publicEmail: 'cellar@example.com', openingHoursText: 'Daily 10-5' })
      .expect(200);

    await request(app)
      .put(`/api/winery/areas/${areaA.id}/bookings-config`)
      .set('Authorization', authToken)
      .send({ walkInsAllowed: true, groupBookingThreshold: 6, leadTimeHours: 12 })
      .expect(200);

    const product = await WineryProduct.create({
      wineryId: winery.id,
      name: 'Shared Sparkling',
      category: 'Sparkling',
      price: 30
    });
    await request(app)
      .put(`/api/winery/areas/${areaA.id}/products/${product.id}`)
      .set('Authorization', authToken)
      .send({ isAvailable: true, priceOverride: 27, isFeatured: true, salesNotes: 'Area offer' })
      .expect(200);

    const integrationResponse = await request(app)
      .put(`/api/winery/areas/${areaA.id}/integration-config`)
      .set('Authorization', authToken)
      .send({
        providerConnections: {
          booking: {
            provider: 'nowbookit',
            authMethod: 'webhook',
            externalLocationId: 'cellar-bookings',
            webhookSecret: 'cellar-area-secret-123',
            capabilities: ['create_reservation', 'receive_webhook']
          }
        }
      })
      .expect(200);
    expect(integrationResponse.body.data.providerConnections.booking.webhookSigningConfigured).toBe(true);
    expect(integrationResponse.body.data.providerConnections.booking.webhookSecretHash).toBeUndefined();
    const executionConfig = await integrationConnectionService.resolveExecutionConfig({
      wineryId: winery.id,
      areaId: areaA.id,
      domain: 'booking'
    });
    expect(executionConfig).toMatchObject({
      provider: 'mock',
      source: 'area',
      config: { selectedProvider: 'nowbookit', externalLocationId: 'cellar-bookings' }
    });

    const faqResponse = await request(app)
      .post('/api/winery/faqs')
      .set('Authorization', authToken)
      .send({
        areaId: areaA.id,
        question: 'Can children join a tasting?',
        answer: 'Yes, when included in the booking guest count.',
        tags: ['cellar-door', 'children']
      })
      .expect(201);
    const sopResponse = await request(app)
      .post('/api/winery/sops')
      .set('Authorization', authToken)
      .send({
        areaId: areaA.id,
        title: 'Opening checklist',
        body: 'Review bookings and prepare the tasting spaces.'
      })
      .expect(201);

    await request(app)
      .put(`/api/winery/faqs/${faqResponse.body.data.id}`)
      .set('Authorization', authToken)
      .send({ answer: 'Yes, when included in guest numbers and supervised.' })
      .expect(200);
    await request(app)
      .put(`/api/winery/sops/${sopResponse.body.data.id}`)
      .set('Authorization', authToken)
      .send({ body: 'Review bookings, featured products and tasting spaces.' })
      .expect(200);

    await request(app)
      .post('/api/winery/faqs')
      .set('Authorization', authToken)
      .send({ areaId: areaB.id, question: 'Restaurant question', answer: 'Not editable.' })
      .expect(403);
    await request(app)
      .post('/api/winery/sops')
      .set('Authorization', authToken)
      .send({ title: 'Shared procedure', body: 'Only winery managers can create this.' })
      .expect(403);

    const contactResponse = await request(app)
      .post('/api/winery/contacts')
      .set('Authorization', authToken)
      .send({
        name: 'Cellar Door Escalation',
        role: 'Area Lead',
        email: 'cellar-lead@example.com',
        responsibilities: 'Owns Cellar Door service escalation.',
        primaryAreaId: areaA.id,
        linkedAreaIds: []
      })
      .expect(201);
    expect(contactResponse.body.data.OperationalAreas[0]).toMatchObject({ id: areaA.id, name: 'Cellar Door' });
    expect(contactResponse.body.data.OperationalAreas[0].WineryContactArea.relationshipType).toBe('PRIMARY');

    await request(app)
      .put(`/api/winery/contacts/${contactResponse.body.data.id}`)
      .set('Authorization', authToken)
      .send({
        name: 'Cellar Door Escalation',
        role: 'Area Lead',
        email: 'cellar-lead@example.com',
        responsibilities: 'Owns Cellar Door service and guest escalation.',
        primaryAreaId: areaA.id,
        linkedAreaIds: []
      })
      .expect(200);
    await request(app)
      .post('/api/winery/contacts')
      .set('Authorization', authToken)
      .send({ name: 'Shared Contact', role: 'Owner', primaryAreaId: null, linkedAreaIds: [] })
      .expect(403);
    await request(app)
      .post('/api/winery/contacts')
      .set('Authorization', authToken)
      .send({ name: 'Cross Area Contact', role: 'Coordinator', primaryAreaId: areaA.id, linkedAreaIds: [areaB.id] })
      .expect(403);

    const created = await request(app)
      .post('/api/winery/bookings/types')
      .set('Authorization', authToken)
      .send({ areaId: areaA.id, name: 'Cellar Experience', priceCents: 2500 })
      .expect(201);

    await request(app)
      .put(`/api/winery/bookings/types/${created.body.data.id}`)
      .set('Authorization', authToken)
      .send({ name: 'Updated Cellar Experience' })
      .expect(200);

    await request(app)
      .put(`/api/winery/areas/${areaB.id}/profile`)
      .set('Authorization', authToken)
      .send({ publicEmail: 'restaurant@example.com' })
      .expect(403);

    await request(app)
      .post('/api/winery/bookings/types')
      .set('Authorization', authToken)
      .send({ areaId: areaB.id, name: 'Restaurant Booking' })
      .expect(403);

    await request(app)
      .put(`/api/winery/areas/${areaB.id}/products/${product.id}`)
      .set('Authorization', authToken)
      .send({ isAvailable: true })
      .expect(403);

    await request(app)
      .put(`/api/winery/areas/${areaB.id}/integration-config`)
      .set('Authorization', authToken)
      .send({ providerConnections: { booking: { provider: 'opentable' } } })
      .expect(403);

    await request(app)
      .put('/api/winery')
      .set('Authorization', authToken)
      .send({ name: 'Forbidden Organisation Rename' })
      .expect(403);

    expect(await OperationalAreaProfile.count({ where: { areaId: areaA.id } })).toBe(1);
    expect(await OperationalAreaBookingsConfig.count({ where: { areaId: areaA.id } })).toBe(1);
    expect(await WineryBookingType.count({ where: { areaId: areaA.id } })).toBe(1);
    expect(await AreaProductListing.count({ where: { areaId: areaA.id, productId: product.id } })).toBe(1);
    expect(await OperationalAreaIntegrationConfig.count({ where: { areaId: areaA.id } })).toBe(1);
    expect(await WineryFAQItem.count({ where: { areaId: areaA.id } })).toBe(1);
    expect(await WinerySop.count({ where: { areaId: areaA.id } })).toBe(1);
    expect(await WineryContactArea.count({ where: { areaId: areaA.id, relationshipType: 'PRIMARY' } })).toBe(1);

    const refreshed = await request(app)
      .get('/api/winery/full')
      .set('Authorization', authToken)
      .expect(200);
    const areaConfig = refreshed.body.data.OperationalAreas.find(area => area.id === areaA.id).IntegrationConfig;
    expect(areaConfig.providerConnections.booking.provider).toBe('nowbookit');
    expect(areaConfig.providerConnections.booking.webhookSecretHash).toBeUndefined();
    expect(refreshed.body.data.faqs.find(faq => faq.id === faqResponse.body.data.id).areaId).toBe(areaA.id);
    expect(refreshed.body.data.sops.find(sop => sop.id === sopResponse.body.data.id).areaId).toBe(areaA.id);
    const refreshedContact = refreshed.body.data.contacts.find(contact => contact.id === contactResponse.body.data.id);
    expect(refreshedContact.OperationalAreas[0].name).toBe('Cellar Door');

    await request(app)
      .delete(`/api/winery/areas/${areaA.id}/integration-config/booking`)
      .set('Authorization', authToken)
      .expect(200);
    expect(await OperationalAreaIntegrationConfig.count({ where: { areaId: areaA.id } })).toBe(0);
  });

  it('does not expose Winery configuration to an area member without management authority', async () => {
    await User.update({ role: 'staff' }, { where: { id: currentUser.id } });
    await UserAreaMembership.create({
      wineryId: winery.id,
      userId: currentUser.id,
      areaId: areaA.id,
      membershipRole: 'MEMBER',
      isPrimary: true
    });

    await request(app)
      .get('/api/winery/full')
      .set('Authorization', authToken)
      .expect(403);
  });

  it('enforces area-aware task list and direct-detail visibility for staff', async () => {
    await User.update({ role: 'staff' }, { where: { id: currentUser.id } });
    await UserAreaMembership.create({
      wineryId: winery.id,
      userId: currentUser.id,
      areaId: areaA.id,
      membershipRole: 'MEMBER',
      isPrimary: true
    });

    const areaATask = await Task.create({
      wineryId: winery.id,
      category: 'INTERNAL',
      subType: 'AREA_A_TASK',
      type: 'AREA_A_TASK',
      areaScope: 'AREAS'
    });
    const areaBTask = await Task.create({
      wineryId: winery.id,
      category: 'INTERNAL',
      subType: 'AREA_B_TASK',
      type: 'AREA_B_TASK',
      areaScope: 'AREAS'
    });
    const hiddenAreaBTask = await Task.create({
      wineryId: winery.id,
      category: 'INTERNAL',
      subType: 'HIDDEN_AREA_B_TASK',
      type: 'HIDDEN_AREA_B_TASK',
      areaScope: 'AREAS'
    });
    const organisationTask = await Task.create({
      wineryId: winery.id,
      category: 'INTERNAL',
      subType: 'ORGANISATION_TASK',
      type: 'ORGANISATION_TASK',
      areaScope: 'ORGANISATION'
    });
    const directlyAssignedTask = await Task.create({
      wineryId: winery.id,
      category: 'INTERNAL',
      subType: 'DIRECT_TASK',
      type: 'DIRECT_TASK',
      areaScope: 'AREAS',
      assigneeId: currentUser.id
    });
    await TaskArea.bulkCreate([
      { wineryId: winery.id, taskId: areaATask.id, areaId: areaA.id, relationshipType: 'PRIMARY' },
      { wineryId: winery.id, taskId: areaBTask.id, areaId: areaB.id, relationshipType: 'PRIMARY' },
      { wineryId: winery.id, taskId: hiddenAreaBTask.id, areaId: areaB.id, relationshipType: 'PRIMARY' },
      { wineryId: winery.id, taskId: directlyAssignedTask.id, areaId: areaB.id, relationshipType: 'PRIMARY' }
    ]);
    await Notification.create({
      userId: currentUser.id,
      type: 'MENTION',
      message: 'You were mentioned in a task note',
      data: { taskId: areaBTask.id }
    });

    const list = await request(app)
      .get('/api/tasks?status=all')
      .set('Authorization', authToken)
      .expect(200);
    const visibleIds = list.body.tasks.map(task => task.id);
    expect(visibleIds).toEqual(expect.arrayContaining([areaATask.id, organisationTask.id, directlyAssignedTask.id, areaBTask.id]));
    expect(visibleIds).not.toContain(hiddenAreaBTask.id);

    await request(app)
      .get(`/api/tasks/${hiddenAreaBTask.id}`)
      .set('Authorization', authToken)
      .expect(404);
    await request(app)
      .get(`/api/tasks/${areaBTask.id}`)
      .set('Authorization', authToken)
      .expect(200);
    await request(app)
      .get(`/api/tasks/${directlyAssignedTask.id}`)
      .set('Authorization', authToken)
      .expect(200);
  });

  it('allows an area manager to publish only inside areas they manage', async () => {
    await User.update({ role: 'staff' }, { where: { id: currentUser.id } });
    await UserAreaMembership.create({
      wineryId: winery.id,
      userId: currentUser.id,
      areaId: areaA.id,
      membershipRole: 'MANAGER',
      isPrimary: true
    });
    const me = await request(app)
      .get('/api/public/me')
      .set('Authorization', authToken)
      .expect(200);
    expect(me.body.user.role).toBe('staff');
    const memberships = await UserAreaMembership.findAll({ where: { userId: currentUser.id } });
    expect(memberships.map(item => [item.areaId, item.membershipRole])).toEqual([[areaA.id, 'MANAGER']]);

    const created = await request(app)
      .post('/api/notices')
      .set('Authorization', authToken)
      .send({
        title: 'Cellar door briefing',
        body: 'Brief the Saturday team before opening.',
        category: 'STAFF',
        priority: 'normal',
        areaScope: 'AREAS',
        primaryAreaId: areaA.id
      })
      .expect(201);
    expect(created.body.notice.OperationalAreas.map(area => area.id)).toEqual([areaA.id]);

    await request(app)
      .post('/api/notices')
      .set('Authorization', authToken)
      .send({
        title: 'Restaurant briefing',
        body: 'This area is outside the manager scope.',
        category: 'STAFF',
        priority: 'normal',
        areaScope: 'AREAS',
        primaryAreaId: areaB.id
      })
      .expect(403);

    await request(app)
      .post('/api/notices')
      .set('Authorization', authToken)
      .send({
        title: 'Whole organisation',
        body: 'Area managers cannot publish organisation-wide notices.',
        category: 'STAFF',
        priority: 'normal',
        areaScope: 'ORGANISATION'
      })
      .expect(403);

    const managedTask = await request(app)
      .post('/api/tasks')
      .set('Authorization', authToken)
      .send({
        category: 'INTERNAL',
        subType: 'AREA_MANAGER_TASK',
        taskOrigin: 'INTERNAL',
        areaScope: 'AREAS',
        primaryAreaId: areaA.id,
        assigneeId: otherStaff.id
      })
      .expect(201);
    expect(managedTask.body.task.assigneeId).toBe(otherStaff.id);

    await request(app)
      .patch(`/api/tasks/${managedTask.body.task.id}`)
      .set('Authorization', authToken)
      .send({ status: 'REJECTED' })
      .expect(200);
  });

  it('confirms a suggested event area and carries it into the created task', async () => {
    const intake = await request(app)
      .post('/api/integration-events')
      .set('Authorization', authToken)
      .send({
        provider: 'voice-agent',
        intakeMethod: 'manual',
        eventType: 'call.intake',
        externalEventId: 'area-call-1',
        suggestedAreaId: areaB.id,
        areaConfidence: 0.91,
        areaMappingSource: 'AI',
        rawPayload: {
          callerName: 'Sarah Booker',
          callerPhone: '+61400111222',
          summary: 'Change a restaurant booking.',
          intent: 'booking change'
        }
      })
      .expect(201);

    const reviewed = await request(app)
      .post(`/api/integration-events/${intake.body.event.id}/review`)
      .set('Authorization', authToken)
      .send({ action: 'create_task', confirmedAreaId: areaB.id })
      .expect(200);

    expect(reviewed.body.event.confirmedAreaId).toBe(areaB.id);
    expect(reviewed.body.task.areaScope).toBe('AREAS');
    expect(reviewed.body.task.OperationalAreas.map(area => area.id)).toEqual([areaB.id]);
    const primaryLink = await TaskArea.findOne({ where: { taskId: reviewed.body.taskId, areaId: areaB.id } });
    expect(primaryLink.relationshipType).toBe('PRIMARY');
  });

  it('rejects area IDs owned by another winery', async () => {
    const foreignArea = await OperationalArea.create({ wineryId: otherWinery.id, name: 'Foreign Area' });
    await request(app)
      .post('/api/tasks')
      .set('Authorization', authToken)
      .send({
        category: 'INTERNAL',
        subType: 'FOREIGN_AREA_ATTEMPT',
        taskOrigin: 'INTERNAL',
        areaScope: 'AREAS',
        primaryAreaId: foreignArea.id
      })
      .expect(400);
  });
});
