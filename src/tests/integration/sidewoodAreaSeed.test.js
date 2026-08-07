const db = require('../../models');
const recordVisibility = require('../../services/recordVisibility.service');
const wineryService = require('../../services/winery.service');
const {
  AREA_SEED_SOURCE,
  SIDEWOOD_AREAS,
  SIDEWOOD_USERS,
  seedSidewoodAreaDemo
} = require('../../scripts/sidewoodAreaSeed');

describe('Sidewood operational-area seed', () => {
  let winery;
  let usersByUsername;

  beforeAll(async () => {
    await db.sequelize.sync({ force: true });
    winery = await db.Winery.create({ name: 'Sidewood Estate', shortName: 'Sidewood' });
    usersByUsername = {};

    for (const definition of SIDEWOOD_USERS) {
      const email = definition.email || `${definition.username}.w${winery.id}@vinagent.internal`;
      usersByUsername[definition.username] = await db.User.create({
        wineryId: winery.id,
        firebaseUid: `sidewood-seed-test:${definition.username}`,
        email,
        displayName: definition.displayName,
        role: definition.role,
        responsibilities: definition.responsibilities,
        isActive: true
      });
    }

    await db.WineryProduct.bulkCreate([
      { wineryId: winery.id, name: 'NV Sidewood Estate Sparkling', category: 'Sparkling', price: 28 },
      ...Array.from({ length: 10 }, (_, index) => ({
        wineryId: winery.id,
        name: `Sidewood Test Wine ${index + 1}`,
        category: index % 2 === 0 ? 'Red' : 'White',
        price: 30 + index
      })),
      { wineryId: winery.id, name: 'Sidewood Cap', category: 'Merchandise', price: 20 }
    ]);

    await runSeed();
  });

  afterAll(async () => {
    await db.sequelize.close();
  });

  async function runSeed() {
    const transaction = await db.sequelize.transaction();
    try {
      const result = await seedSidewoodAreaDemo({ db, winery, usersByUsername, transaction });
      await transaction.commit();
      return result;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  it('creates the requested areas, scoped staff and reporting hierarchy', async () => {
    const areasByKey = Object.fromEntries((await db.OperationalArea.findAll({ where: { wineryId: winery.id } }))
      .map(area => [SIDEWOOD_AREAS.find(definition => definition.name === area.name).key, area]));
    const areas = await db.OperationalArea.findAll({
      where: { wineryId: winery.id },
      order: [['sortOrder', 'ASC']]
    });

    expect(areas.map(area => area.name)).toEqual(SIDEWOOD_AREAS.map(area => area.name));
    expect(usersByUsername.serena.role).toBe('staff');
    expect(usersByUsername.owen.role).toBe('manager');
    expect(await db.UserAreaMembership.count({ where: { wineryId: winery.id } })).toBe(17);
    expect(await db.OperationalAreaProfile.count({ where: { wineryId: winery.id } })).toBe(2);
    expect(await db.OperationalAreaBookingsConfig.count({ where: { wineryId: winery.id } })).toBe(2);
    expect(await db.WineryBookingType.count({ where: { wineryId: winery.id, areaId: areasByKey.restaurant.id } })).toBe(3);
    expect(await db.AreaProductListing.count({ where: { wineryId: winery.id, areaId: areasByKey['cellar-door'].id } })).toBe(12);
    expect(await db.AreaProductListing.count({ where: { wineryId: winery.id, areaId: areasByKey.restaurant.id } })).toBe(11);
    expect(await db.AreaProductListing.count({ where: { wineryId: winery.id, areaId: areasByKey['wine-club'].id } })).toBe(11);
    expect(await db.OperationalAreaIntegrationConfig.count({ where: { wineryId: winery.id } })).toBe(4);
    expect(await db.WineryFAQItem.count({ where: { wineryId: winery.id, areaId: { [db.Sequelize.Op.ne]: null } } })).toBe(6);
    expect(await db.WinerySop.count({ where: { wineryId: winery.id, areaId: { [db.Sequelize.Op.ne]: null } } })).toBe(6);

    const restaurantIntegrations = await db.OperationalAreaIntegrationConfig.findOne({
      where: { wineryId: winery.id, areaId: areasByKey.restaurant.id }
    });
    expect(restaurantIntegrations.providerConnections.booking.provider).toBe('opentable');
    expect(restaurantIntegrations.providerConnections.pos.provider).toBe('lightspeed');

    const cellarDoorMemberships = await db.UserAreaMembership.findAll({
      where: { wineryId: winery.id, areaId: areasByKey['cellar-door'].id, isPrimary: true }
    });
    expect(cellarDoorMemberships.map(row => row.userId).sort((a, b) => a - b)).toEqual([
      usersByUsername.serena.id,
      usersByUsername.jacob.id,
      usersByUsername.nick.id,
      usersByUsername.james.id,
      usersByUsername.joanna.id
    ].sort((a, b) => a - b));

    const clareWineClub = await db.UserAreaMembership.findOne({
      where: { userId: usersByUsername.clare.id, areaId: areasByKey['wine-club'].id }
    });
    expect(usersByUsername.clare.role).toBe('staff');
    expect(clareWineClub.membershipRole).toBe('MANAGER');
    expect(clareWineClub.isPrimary).toBe(true);

    const owen = await db.WineryContact.findOne({ where: { wineryId: winery.id, email: usersByUsername.owen.email } });
    const serena = await db.WineryContact.findOne({ where: { wineryId: winery.id, email: usersByUsername.serena.email } });
    const kirri = await db.WineryContact.findOne({ where: { wineryId: winery.id, email: 'kirri@sidewood.com.au' } });
    expect(await db.WineryContact.count({ where: { wineryId: winery.id } })).toBe(11);
    expect(await db.WineryContactArea.count({ where: { wineryId: winery.id } })).toBe(17);
    expect(serena.reportsToId).toBe(owen.id);
    expect(kirri.name).toBe('Kirri');
    expect(kirri.reportsToId).toBe(owen.id);
    const kirriAreas = await db.WineryContactArea.findAll({ where: { contactId: kirri.id } });
    expect(kirriAreas.find(link => link.relationshipType === 'PRIMARY').areaId).toBe(areasByKey.restaurant.id);
    expect(kirriAreas.find(link => link.relationshipType === 'LINKED').areaId).toBe(areasByKey['cellar-door'].id);
  });

  it('creates independent, cross-area and organisation-level demo records', async () => {
    const cellarTask = await db.Task.findOne({ where: { wineryId: winery.id, subType: 'SIDEWOOD_AREA_CELLAR_ROSTER' } });
    const restaurantTask = await db.Task.findOne({ where: { wineryId: winery.id, subType: 'SIDEWOOD_AREA_RESTAURANT_FLOOR_PLAN' } });
    const dinnerTask = await db.Task.findOne({ where: { wineryId: winery.id, subType: 'SIDEWOOD_AREA_PRIVATE_MEMBER_DINNER' } });
    const dinnerLinks = await db.TaskArea.findAll({ where: { taskId: dinnerTask.id } });

    expect(await db.Task.count({ where: { wineryId: winery.id, type: 'SIDEWOOD_AREA_DEMO' } })).toBe(10);
    expect(dinnerLinks).toHaveLength(5);
    expect(dinnerLinks.filter(link => link.relationshipType === 'PRIMARY')).toHaveLength(1);

    const jacobContext = {
      wineryId: winery.id,
      userId: usersByUsername.jacob.id,
      userRole: usersByUsername.jacob.role
    };
    const joannaContext = {
      wineryId: winery.id,
      userId: usersByUsername.joanna.id,
      userRole: usersByUsername.joanna.role
    };
    expect(await recordVisibility.canViewTask(cellarTask, jacobContext)).toBe(true);
    expect(await recordVisibility.canViewTask(restaurantTask, jacobContext)).toBe(false);
    expect(await recordVisibility.canViewTask(restaurantTask, joannaContext)).toBe(true);

    const seededNotices = await db.Notice.findAll({ where: { wineryId: winery.id, externalSource: AREA_SEED_SOURCE } });
    const organisationNotice = seededNotices.find(notice => notice.externalId === 'weekly-operational-priorities');
    expect(seededNotices).toHaveLength(10);
    expect(organisationNotice.areaScope).toBe('ORGANISATION');
    expect(await db.NoticeArea.count({ where: { wineryId: winery.id } })).toBe(16);
    expect(await db.NoticeTask.count({ where: { wineryId: winery.id } })).toBe(10);

    const dinnerNotice = seededNotices.find(notice => notice.externalId === 'member-dinner-run-sheet');
    const dinnerNoticeLinks = await db.NoticeTask.findAll({ where: { wineryId: winery.id, noticeId: dinnerNotice.id } });
    expect(dinnerNoticeLinks.map(link => link.taskId)).toContain(dinnerTask.id);

    const requests = await db.OperationalRequest.findAll({ where: { wineryId: winery.id } });
    const records = await db.OperationalRecord.findAll({ where: { wineryId: winery.id } });
    expect(requests).toHaveLength(3);
    expect(records).toHaveLength(3);
    expect(await db.OperationalRequestArea.count({ where: { wineryId: winery.id } })).toBe(9);
    expect(await db.OperationalRecordArea.count({ where: { wineryId: winery.id } })).toBe(11);
    expect(await db.OperationalItemRelation.count({ where: { wineryId: winery.id } })).toBe(6);

    const invoiceApprovalRequest = requests.find(request => request.subtype === 'SIDEWOOD_DEMO_MEMBER_DINNER_INVOICE_APPROVAL');
    const invoiceApprovalAreas = await db.OperationalRequestArea.findAll({ where: { requestId: invoiceApprovalRequest.id } });
    expect(invoiceApprovalRequest.status).toBe('PENDING');
    expect(invoiceApprovalRequest.requestedFromUserId).toBe(usersByUsername.lisa.id);
    expect(invoiceApprovalAreas).toHaveLength(3);
    expect(invoiceApprovalAreas.filter(link => link.relationshipType === 'PRIMARY')).toHaveLength(1);

    const blockingRelation = await db.OperationalItemRelation.findOne({
      where: {
        wineryId: winery.id,
        sourceType: 'REQUEST',
        sourceId: invoiceApprovalRequest.id,
        targetType: 'TASK',
        targetId: dinnerTask.id,
        relationType: 'BLOCKS'
      }
    });
    expect(blockingRelation.metadata.scenario).toBe('invoice approval blocks event readiness');

    const events = await db.IntegrationEvent.findAll({ where: { wineryId: winery.id } });
    expect(events).toHaveLength(5);
    expect(events.every(event => event.suggestedAreaId && event.status === 'PENDING_REVIEW')).toBe(true);

    const aiContext = await wineryService.getAiContext(winery.id);
    const restaurantContext = aiContext.areas.find(area => area.name === 'Restaurant');
    expect(restaurantContext.publicProfile.email).toBe('bookings@sidewood.com.au');
    expect(restaurantContext.bookings.experiences).toHaveLength(3);
    expect(restaurantContext.integrations.map(item => item.domain).sort()).toEqual(['booking', 'pos']);
    expect(restaurantContext.knowledge.faqs).toHaveLength(1);
    expect(restaurantContext.knowledge.sops).toHaveLength(1);

    const restaurantArea = await db.OperationalArea.findOne({ where: { wineryId: winery.id, name: 'Restaurant' } });
    const scopedRestaurantContext = await wineryService.getAiContext(winery.id, { areaIds: [restaurantArea.id] });
    expect(scopedRestaurantContext.organisation.map(contact => contact.name)).toEqual(expect.arrayContaining(['Kirri', 'Owen']));
    expect(scopedRestaurantContext.organisation.map(contact => contact.name)).not.toContain('Bradley');
  });

  it('is repeatable without duplicating the demo data', async () => {
    await runSeed();

    expect(await db.OperationalArea.count({ where: { wineryId: winery.id } })).toBe(7);
    expect(await db.UserAreaMembership.count({ where: { wineryId: winery.id } })).toBe(17);
    expect(await db.WineryContact.count({ where: { wineryId: winery.id } })).toBe(11);
    expect(await db.WineryContactArea.count({ where: { wineryId: winery.id } })).toBe(17);
    expect(await db.Task.count({ where: { wineryId: winery.id, type: 'SIDEWOOD_AREA_DEMO' } })).toBe(10);
    expect(await db.Notice.count({ where: { wineryId: winery.id, externalSource: AREA_SEED_SOURCE } })).toBe(10);
    expect(await db.NoticeTask.count({ where: { wineryId: winery.id } })).toBe(10);
    expect(await db.OperationalRequest.count({ where: { wineryId: winery.id } })).toBe(3);
    expect(await db.OperationalRequestArea.count({ where: { wineryId: winery.id } })).toBe(9);
    expect(await db.OperationalRecord.count({ where: { wineryId: winery.id } })).toBe(3);
    expect(await db.OperationalRecordArea.count({ where: { wineryId: winery.id } })).toBe(11);
    expect(await db.OperationalItemRelation.count({ where: { wineryId: winery.id } })).toBe(6);
    expect(await db.IntegrationEvent.count({ where: { wineryId: winery.id } })).toBe(5);
    expect(await db.OperationalAreaIntegrationConfig.count({ where: { wineryId: winery.id } })).toBe(4);
    expect(await db.WineryFAQItem.count({ where: { wineryId: winery.id, areaId: { [db.Sequelize.Op.ne]: null } } })).toBe(6);
    expect(await db.WinerySop.count({ where: { wineryId: winery.id, areaId: { [db.Sequelize.Op.ne]: null } } })).toBe(6);
  });
});
