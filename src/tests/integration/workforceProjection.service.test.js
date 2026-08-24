process.env.NODE_ENV = 'test';
process.env.ALLOW_TEST_AUTH_BYPASS = 'true';

const crypto = require('crypto');
const request = require('supertest');
const app = require('../../app');
const db = require('../../models');
const workforceProjection = require('../../services/workforceProjection.service');
const workforceManagement = require('../../services/workforceManagement.service');
const bookingCoverageContext = require('../../services/bookingCoverageContext.service');
const bookingCoverageGapLifecycle = require('../../services/bookingCoverageGapLifecycle.service');

describe('canonical workforce shadow projection', () => {
  const auth = 'Bearer mock-token';
  let winery;
  let manager;
  let user;
  let staffIdentity;
  let location;
  let area;
  let role;
  let skill;
  let connection;
  let baseTime;

  const at = offset => new Date(baseTime + offset).toISOString();
  const shiftSnapshot = overrides => ({
    contractVersion: 'roster-shift-shadow.v1',
    externalId: 'shift-source-100',
    staffIdentityId: staffIdentity.id,
    location: { resolutionStatus: 'RESOLVED', id: location.id },
    area: { resolutionStatus: 'RESOLVED', id: area.id },
    role: { code: 'CELLAR_DOOR_HOST', resolutionStatus: 'RESOLVED', definitionId: role.id },
    canonicalStatus: 'CONFIRMED',
    providerStatus: 'confirmed',
    publishedState: 'PUBLISHED',
    startAt: at(60 * 60 * 1000),
    endAt: at(6 * 60 * 60 * 1000),
    breakMinutes: 30,
    sourceTimeZone: 'Australia/Adelaide',
    sourceRevision: 'shift-v1',
    sourceUpdatedAt: at(-60 * 1000),
    observedAt: at(-30 * 1000),
    skillsComplete: true,
    skills: [{
      code: 'PAIRED_TASTING',
      resolutionStatus: 'RESOLVED',
      definitionId: skill.id
    }],
    ...overrides
  });
  const availabilitySnapshot = overrides => ({
    contractVersion: 'staff-availability-shadow.v1',
    externalId: 'availability-source-100',
    eventKey: 'leave-window-100',
    staffIdentityId: staffIdentity.id,
    availabilityType: 'LEAVE',
    status: 'APPROVED',
    startAt: at(24 * 60 * 60 * 1000),
    endAt: at(48 * 60 * 60 * 1000),
    reasonCategory: 'ANNUAL_LEAVE',
    sourceRevision: 'availability-v1',
    sourceUpdatedAt: at(-60 * 1000),
    observedAt: at(-30 * 1000),
    ...overrides
  });

  beforeEach(async () => {
    baseTime = Date.now();
    await db.sequelize.sync({ force: true });
    winery = await db.Winery.create({ name: 'Workforce Graph Winery' });
    manager = await db.User.create({
      firebaseUid: 'workforce-manager-' + crypto.randomUUID(),
      email: 'stub@example.com',
      displayName: 'Workforce Manager',
      role: 'manager',
      wineryId: winery.id
    });
    user = await db.User.create({
      firebaseUid: 'workforce-staff-' + crypto.randomUUID(),
      email: 'workforce-staff@example.com',
      displayName: 'Tasting Host',
      role: 'staff',
      wineryId: winery.id
    });
    staffIdentity = await db.StaffIdentity.create({
      wineryId: winery.id,
      userId: user.id,
      displayName: 'Tasting Host',
      employmentStatus: 'ACTIVE',
      resolutionQuality: 'MANAGER_CONFIRMED',
      createdBy: manager.id,
      updatedBy: manager.id
    });
    location = await db.WineryLocation.create({
      wineryId: winery.id,
      code: 'cellar-door',
      name: 'Cellar Door',
      locationType: 'VENUE',
      timeZone: 'Australia/Adelaide'
    });
    area = await db.OperationalArea.create({
      wineryId: winery.id,
      name: 'Cellar Door'
    });
    role = await db.RoleSkillDefinition.create({
      wineryId: winery.id,
      definitionKind: 'ROLE',
      code: 'CELLAR_DOOR_HOST',
      normalizedCode: 'cellar_door_host',
      name: 'Cellar Door Host',
      createdBy: manager.id,
      updatedBy: manager.id
    });
    skill = await db.RoleSkillDefinition.create({
      wineryId: winery.id,
      definitionKind: 'SKILL',
      code: 'PAIRED_TASTING',
      normalizedCode: 'paired_tasting',
      name: 'Paired Tasting',
      createdBy: manager.id,
      updatedBy: manager.id
    });
    connection = await db.IntegrationConnection.create({
      wineryId: winery.id,
      connectionKey: 'roster-source',
      providerKey: 'generic-workforce',
      displayName: 'Generic Workforce',
      status: 'CONNECTED',
      createdBy: manager.id,
      updatedBy: manager.id
    });
    await db.IntegrationConnectionScope.create({
      wineryId: winery.id,
      connectionId: connection.id,
      domain: 'WORKFORCE',
      scopeKey: 'winery',
      isDefault: true,
      isActive: true
    });
  });

  afterAll(async () => db.sequelize.close());

  test('projects idempotent shift and availability state with complete skill reconciliation', async () => {
    const first = await workforceProjection.projectRosterShift({
      wineryId: winery.id,
      connectionId: connection.id,
      input: shiftSnapshot()
    });
    expect(first).toEqual(expect.objectContaining({
      status: 'PROJECTED_SHADOW',
      skillsProjected: 1,
      automationEligible: false
    }));
    const retry = await workforceProjection.projectRosterShift({
      wineryId: winery.id,
      connectionId: connection.id,
      input: shiftSnapshot({ observedAt: at(0) })
    });
    expect(retry.rosterShiftId).toBe(first.rosterShiftId);
    expect(new Date((await db.RosterShift.findByPk(first.rosterShiftId)).observedAt).getTime())
      .toBe(new Date(at(0)).getTime());
    expect(await db.RosterShift.count()).toBe(1);
    expect(await db.RosterShiftSkill.count({ where: { isActive: true } })).toBe(1);

    await workforceProjection.projectRosterShift({
      wineryId: winery.id,
      connectionId: connection.id,
      input: shiftSnapshot({
        sourceRevision: 'shift-v2',
        sourceUpdatedAt: at(60 * 1000),
        observedAt: at(90 * 1000),
        skills: []
      })
    });
    expect(await db.RosterShiftSkill.count({ where: { isActive: true } })).toBe(0);

    const availability = await workforceProjection.projectStaffAvailability({
      wineryId: winery.id,
      connectionId: connection.id,
      input: availabilitySnapshot()
    });
    expect(availability).toEqual(expect.objectContaining({
      status: 'PROJECTED_SHADOW',
      automationEligible: false
    }));
    const row = await db.StaffAvailabilityEvent.findByPk(availability.staffAvailabilityEventId);
    expect(row).toEqual(expect.objectContaining({
      staffIdentityId: staffIdentity.id,
      availabilityType: 'LEAVE',
      reasonCategory: 'ANNUAL_LEAVE'
    }));
    expect(await db.ExternalResourceReference.count({
      where: { connectionId: connection.id, resolutionStatus: 'RESOLVED' }
    })).toBe(2);

    const coverage = await workforceProjection.projectRosterCoverage({
      wineryId: winery.id,
      connectionId: connection.id,
      input: {
        contractVersion: 'roster-coverage-shadow.v1',
        location: { resolutionStatus: 'RESOLVED', id: location.id },
        area: { resolutionStatus: 'RESOLVED', id: area.id },
        windowStartAt: at(0),
        windowEndAt: at(8 * 60 * 60 * 1000),
        observedAt: at(-30 * 1000),
        staleAt: at(6 * 60 * 60 * 1000),
        sourceRevision: 'coverage-v1',
        isComplete: true
      }
    });
    expect(coverage).toEqual(expect.objectContaining({
      status: 'PROJECTED_SHADOW',
      automationEligible: false
    }));
    expect(await db.WorkforceCoverageObservation.count()).toBe(1);
  });

  test('rejects stale, conflicting, private, and cross-winery workforce facts', async () => {
    const first = await workforceProjection.projectRosterShift({
      wineryId: winery.id,
      connectionId: connection.id,
      input: shiftSnapshot()
    });
    const stale = await workforceProjection.projectRosterShift({
      wineryId: winery.id,
      connectionId: connection.id,
      input: shiftSnapshot({
        sourceRevision: 'shift-old',
        sourceUpdatedAt: at(-2 * 60 * 1000),
        observedAt: at(30 * 1000)
      })
    });
    expect(stale).toEqual(expect.objectContaining({
      status: 'STALE_IGNORED',
      rosterShiftId: first.rosterShiftId
    }));
    const conflict = await workforceProjection.projectRosterShift({
      wineryId: winery.id,
      connectionId: connection.id,
      input: shiftSnapshot({ breakMinutes: 45 })
    });
    expect(conflict.status).toBe('SOURCE_CONFLICT');
    expect((await db.RosterShift.findByPk(first.rosterShiftId)).projectionQuality).toBe('CONFLICTING');

    await expect(workforceProjection.projectStaffAvailability({
      wineryId: winery.id,
      connectionId: connection.id,
      input: availabilitySnapshot({
        providerExtensions: { medicalNote: 'private diagnosis' }
      })
    })).rejects.toThrow('forbidden field');

    const otherWinery = await db.Winery.create({ name: 'Other Workforce Winery' });
    const otherLocation = await db.WineryLocation.create({
      wineryId: otherWinery.id,
      code: 'other',
      name: 'Other Location',
      locationType: 'VENUE',
      timeZone: 'Australia/Adelaide'
    });
    await expect(workforceProjection.projectRosterShift({
      wineryId: winery.id,
      connectionId: connection.id,
      input: shiftSnapshot({
        externalId: 'cross-winery-shift',
        sourceRevision: 'cross-v1',
        sourceUpdatedAt: at(2 * 60 * 1000),
        location: { resolutionStatus: 'RESOLVED', id: otherLocation.id }
      })
    })).rejects.toThrow('Roster location is not active in this winery');
  });

  test('reports coverage and real gaps only from fresh complete roster evidence', async () => {
    const bookingConnection = await db.IntegrationConnection.create({
      wineryId: winery.id,
      connectionKey: 'booking-demand-source',
      providerKey: 'generic-booking',
      displayName: 'Generic Booking',
      status: 'CONNECTED',
      createdBy: manager.id,
      updatedBy: manager.id
    });
    await db.IntegrationConnectionScope.create({
      wineryId: winery.id,
      connectionId: bookingConnection.id,
      domain: 'BOOKING',
      scopeKey: 'winery',
      isDefault: true,
      isActive: true
    });
    const bookingReference = await db.ExternalResourceReference.create({
      wineryId: winery.id,
      connectionId: bookingConnection.id,
      resourceType: 'BOOKING',
      externalId: 'booking-workforce-100',
      providerVersion: 'booking-v1',
      sourceHash: 'b'.repeat(64),
      providerUpdatedAt: at(-60 * 1000),
      observedAt: at(-30 * 1000),
      resolutionStatus: 'RESOLVED'
    });
    const booking = await db.Booking.create({
      wineryId: winery.id,
      locationId: location.id,
      primarySourceReferenceId: bookingReference.id,
      authorityConnectionId: bookingConnection.id,
      canonicalStatus: 'CONFIRMED',
      providerStatus: 'confirmed',
      referenceCode: 'WF-BOOKING-100',
      sourceChannel: 'ONLINE',
      startAt: at(2 * 60 * 60 * 1000),
      endAt: at(4 * 60 * 60 * 1000),
      partySize: 8,
      qualityState: 'SOURCE_ASSERTED',
      authorityState: 'IMPLICIT_SINGLE_SOURCE',
      projectionRevision: 'booking-v1',
      sourceUpdatedAt: at(-60 * 1000),
      sourceHash: 'c'.repeat(64),
      resolvedAt: at(-30 * 1000)
    });
    await bookingReference.update({ canonicalType: 'BOOKING', canonicalId: booking.id });
    await db.BookingAreaLink.create({
      wineryId: winery.id,
      bookingId: booking.id,
      areaId: area.id,
      relationshipType: 'PRIMARY',
      sourceKind: 'MANAGER_CONFIRMED'
    });
    const itemReference = await db.ExternalResourceReference.create({
      wineryId: winery.id,
      connectionId: bookingConnection.id,
      resourceType: 'BOOKING_ITEM',
      externalId: 'booking-workforce-item-100',
      providerVersion: 'booking-v1',
      sourceHash: 'd'.repeat(64),
      providerUpdatedAt: at(-60 * 1000),
      observedAt: at(-30 * 1000),
      resolutionStatus: 'RESOLVED'
    });
    await db.BookingItem.create({
      wineryId: winery.id,
      bookingId: booking.id,
      sourceReferenceId: itemReference.id,
      itemKey: 'experience-100',
      itemType: 'EXPERIENCE',
      externalCode: 'TRUFFLE_EXPERIENCE',
      description: 'Paired truffle tasting',
      quantity: 1,
      unit: 'BOOKING',
      sourceRevision: 'booking-v1',
      isActive: true
    });
    const mappingData = {
      sourceRecordType: 'BOOKING_TYPE',
      sourceConnectionId: bookingConnection.id,
      sourceCode: 'truffle_experience',
      definitionId: skill.id,
      areaId: null,
      locationId: null,
      headcountMultiplier: 1,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      status: 'ACTIVE',
      requestId: crypto.randomUUID(),
      reason: 'Require one paired-tasting-skilled host.'
    };
    const mapping = await workforceManagement.upsertWorkforceDemandMapping({
      wineryId: winery.id,
      actorUserId: manager.id,
      data: mappingData
    });
    expect(mapping.duplicate).toBe(false);
    expect((await workforceManagement.upsertWorkforceDemandMapping({
      wineryId: winery.id,
      actorUserId: manager.id,
      data: mappingData
    })).duplicate).toBe(true);

    await workforceProjection.projectRosterShift({
      wineryId: winery.id,
      connectionId: connection.id,
      input: shiftSnapshot()
    });
    await workforceProjection.projectRosterCoverage({
      wineryId: winery.id,
      connectionId: connection.id,
      input: {
        contractVersion: 'roster-coverage-shadow.v1',
        location: { resolutionStatus: 'RESOLVED', id: location.id },
        area: { resolutionStatus: 'RESOLVED', id: area.id },
        windowStartAt: at(0),
        windowEndAt: at(8 * 60 * 60 * 1000),
        observedAt: at(-30 * 1000),
        staleAt: at(6 * 60 * 60 * 1000),
        sourceRevision: 'coverage-v1',
        isComplete: true
      }
    });
    const covered = await bookingCoverageContext.resolveBookingCoverage({
      wineryId: winery.id,
      input: { bookingId: booking.id, maxAgeSeconds: 3600 },
      now: new Date(baseTime)
    });
    expect(covered).toEqual(expect.objectContaining({
      status: 'COVERED',
      code: 'WORKFORCE_COVERED',
      calculationReliable: true,
      automationEligible: false,
      demandCount: 1,
      gapCount: 0
    }));
    expect(covered.checks[0]).toEqual(expect.objectContaining({
      requiredCount: 1,
      rosteredCount: 1,
      status: 'COVERED'
    }));

    await workforceProjection.projectStaffAvailability({
      wineryId: winery.id,
      connectionId: connection.id,
      input: availabilitySnapshot({
        externalId: 'availability-booking-window',
        eventKey: 'leave-booking-window',
        startAt: at(2.5 * 60 * 60 * 1000),
        endAt: at(3.5 * 60 * 60 * 1000)
      })
    });
    const gap = await bookingCoverageContext.resolveBookingCoverage({
      wineryId: winery.id,
      input: { bookingId: booking.id, maxAgeSeconds: 3600 },
      now: new Date(baseTime)
    });
    expect(gap).toEqual(expect.objectContaining({
      status: 'GAP',
      code: 'WORKFORCE_COVERAGE_GAP',
      calculationReliable: true
    }));
    expect(gap.checks[0]).toEqual(expect.objectContaining({
      rosteredCount: 0,
      status: 'GAP'
    }));

    const stale = await bookingCoverageContext.resolveBookingCoverage({
      wineryId: winery.id,
      input: { bookingId: booking.id, maxAgeSeconds: 3600 },
      now: new Date(baseTime + (7 * 60 * 60 * 1000))
    });
    expect(stale).toEqual(expect.objectContaining({
      status: 'STALE',
      calculationReliable: false
    }));

    const routeCoverage = await request(app)
      .get('/api/integration-management/bookings/' + booking.id + '/coverage?maxAgeSeconds=3600')
      .set('Authorization', auth);
    expect(routeCoverage.status).toBe(200);
    expect(routeCoverage.body.coverage.status).toBe('GAP');

    const identityUpsert = await request(app)
      .post('/api/integration-management/staff-identities')
      .set('Authorization', auth)
      .send({
        id: staffIdentity.id,
        userId: user.id,
        wineryContactId: null,
        displayName: 'Tasting Host',
        employmentStatus: 'ACTIVE',
        isActive: true,
        requestId: crypto.randomUUID(),
        reason: 'Confirm the roster identity mapping.'
      });
    expect(identityUpsert.status).toBe(201);

    const definitionUpsert = await request(app)
      .post('/api/integration-management/role-skill-definitions')
      .set('Authorization', auth)
      .send({
        id: skill.id,
        definitionKind: 'SKILL',
        code: 'PAIRED_TASTING',
        name: 'Paired Tasting',
        isActive: true,
        requestId: crypto.randomUUID(),
        reason: 'Confirm the paired tasting skill.'
      });
    expect(definitionUpsert.status).toBe(201);

    const assignmentUpsert = await request(app)
      .post('/api/integration-management/staff-role-skills')
      .set('Authorization', auth)
      .send({
        staffIdentityId: staffIdentity.id,
        definitionId: skill.id,
        status: 'ACTIVE',
        proficiencyLevel: 'CONFIRMED',
        requestId: crypto.randomUUID(),
        reason: 'Confirm this staff skill assignment.'
      });
    expect(assignmentUpsert.status).toBe(201);

    const identities = await request(app)
      .get('/api/integration-management/staff-identities')
      .set('Authorization', auth);
    expect(identities.status).toBe(200);
    expect(identities.body.staffIdentities).toHaveLength(1);
    expect(JSON.stringify(identities.body)).not.toContain('workforce-staff@example.com');

    const definitions = await request(app)
      .get('/api/integration-management/role-skill-definitions')
      .set('Authorization', auth);
    expect(definitions.status).toBe(200);
    expect(definitions.body.roleSkillDefinitions).toHaveLength(2);

    const shifts = await request(app)
      .get('/api/integration-management/roster-shifts')
      .set('Authorization', auth);
    expect(shifts.status).toBe(200);
    expect(shifts.body.rosterShifts).toHaveLength(1);
    expect(JSON.stringify(shifts.body)).not.toContain('sourceHash');

    const availability = await request(app)
      .get('/api/integration-management/staff-availability')
      .set('Authorization', auth);
    expect(availability.status).toBe(200);
    expect(availability.body.staffAvailabilityEvents).toHaveLength(1);

    const mappingRetry = await request(app)
      .post('/api/integration-management/workforce-demand-mappings')
      .set('Authorization', auth)
      .send(mappingData);
    expect(mappingRetry.status).toBe(200);
    expect(mappingRetry.body.duplicate).toBe(true);

    const templates = await request(app)
      .get('/api/automations/templates')
      .set('Authorization', auth);
    expect(templates.status).toBe(200);
    expect(templates.body.templates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'booking.workforce_coverage_gap.v1',
        contextPack: 'booking.coverage.v1'
      })
    ]));
    const installed = await request(app)
      .post('/api/automations/templates/booking.workforce_coverage_gap.v1/rules')
      .set('Authorization', auth)
      .send({
        assigneeId: user.id,
        areaId: area.id,
        leadTimeMinutes: 60
      });
    expect(installed.status).toBe(201);
    expect(installed.body.rule.status).toBe('DRAFT');
    expect(await db.IntegrationDomainActivation.count({
      where: { wineryId: winery.id, domain: 'WORKFORCE' }
    })).toBe(0);

    const gapIntent = await bookingCoverageGapLifecycle.resolveDesired({
      binding: {
        wineryId: winery.id,
        resourceId: booking.id,
        configurationSnapshot: {
          leadTimeMinutes: 60,
          category: 'OPERATIONS',
          subType: 'OPERATIONS_ESCALATION',
          priority: 'high',
          assigneeId: user.id
        }
      }
    });
    expect(gapIntent).toEqual(expect.objectContaining({
      intent: 'UPDATE',
      reason: 'WORKFORCE_COVERAGE_GAP_CHANGED',
      snapshot: expect.objectContaining({
        assigneeId: user.id,
        'payload.gapCount': 1
      })
    }));

    await workforceProjection.projectStaffAvailability({
      wineryId: winery.id,
      connectionId: connection.id,
      input: availabilitySnapshot({
        externalId: 'availability-booking-window',
        eventKey: 'leave-booking-window',
        startAt: at(2.5 * 60 * 60 * 1000),
        endAt: at(3.5 * 60 * 60 * 1000),
        status: 'CANCELLED',
        sourceRevision: 'availability-v2',
        sourceUpdatedAt: at(60 * 1000),
        observedAt: at(90 * 1000)
      })
    });
    const restoredIntent = await bookingCoverageGapLifecycle.resolveDesired({
      binding: {
        wineryId: winery.id,
        resourceId: booking.id,
        configurationSnapshot: {}
      }
    });
    expect(restoredIntent).toEqual(expect.objectContaining({
      intent: 'CANCEL',
      reason: 'WORKFORCE_COVERAGE_RESTORED'
    }));
  });
});
