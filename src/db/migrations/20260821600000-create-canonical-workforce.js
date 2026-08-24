'use strict';

async function hasTable(queryInterface, tableName) {
  const expected = String(tableName).toLowerCase();
  return (await queryInterface.showAllTables()).some(table => {
    const name = typeof table === 'object' ? table.tableName || table.name : table;
    return String(name).toLowerCase() === expected;
  });
}

async function hasIndex(queryInterface, tableName, indexName) {
  if (!(await hasTable(queryInterface, tableName))) return false;
  return (await queryInterface.showIndex(tableName)).some(index => index.name === indexName);
}

async function ensureIndex(queryInterface, tableName, fields, options) {
  if (!(await hasIndex(queryInterface, tableName, options.name))) {
    await queryInterface.addIndex(tableName, fields, options);
  }
}

const reference = (Sequelize, model, allowNull = false, onDelete = 'CASCADE') => ({
  type: Sequelize.INTEGER,
  allowNull,
  references: { model, key: 'id' },
  onUpdate: 'CASCADE',
  onDelete
});

const timestamps = Sequelize => ({
  createdAt: { allowNull: false, type: Sequelize.DATE },
  updatedAt: { allowNull: false, type: Sequelize.DATE }
});

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await hasTable(queryInterface, 'StaffIdentities'))) {
      await queryInterface.createTable('StaffIdentities', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: reference(Sequelize, 'Wineries'),
        userId: reference(Sequelize, 'Users', true, 'SET NULL'),
        wineryContactId: reference(Sequelize, 'WineryContacts', true, 'SET NULL'),
        displayName: { type: Sequelize.STRING(160), allowNull: false },
        employmentStatus: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'UNRESOLVED' },
        isActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        resolutionQuality: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'MANAGER_CONFIRMED' },
        createdBy: reference(Sequelize, 'Users', true, 'SET NULL'),
        updatedBy: reference(Sequelize, 'Users', true, 'SET NULL'),
        ...timestamps(Sequelize)
      });
    }
    await ensureIndex(queryInterface, 'StaffIdentities', ['userId'], {
      unique: true, name: 'staff_identities_unique_user'
    });
    await ensureIndex(queryInterface, 'StaffIdentities', ['wineryContactId'], {
      unique: true, name: 'staff_identities_unique_contact'
    });
    await ensureIndex(queryInterface, 'StaffIdentities', ['wineryId', 'employmentStatus', 'isActive'], {
      name: 'staff_identities_winery_status'
    });

    if (!(await hasTable(queryInterface, 'RoleSkillDefinitions'))) {
      await queryInterface.createTable('RoleSkillDefinitions', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: reference(Sequelize, 'Wineries'),
        definitionKind: { type: Sequelize.STRING(20), allowNull: false },
        code: { type: Sequelize.STRING(120), allowNull: false },
        normalizedCode: { type: Sequelize.STRING(120), allowNull: false },
        name: { type: Sequelize.STRING(160), allowNull: false },
        description: { type: Sequelize.TEXT, allowNull: true },
        isActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        createdBy: reference(Sequelize, 'Users', true, 'SET NULL'),
        updatedBy: reference(Sequelize, 'Users', true, 'SET NULL'),
        ...timestamps(Sequelize)
      });
    }
    await ensureIndex(queryInterface, 'RoleSkillDefinitions', ['wineryId', 'definitionKind', 'normalizedCode'], {
      unique: true, name: 'role_skill_definitions_unique_code'
    });
    await ensureIndex(queryInterface, 'RoleSkillDefinitions', ['wineryId', 'definitionKind', 'isActive'], {
      name: 'role_skill_definitions_winery_kind'
    });

    if (!(await hasTable(queryInterface, 'StaffRoleSkills'))) {
      await queryInterface.createTable('StaffRoleSkills', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: reference(Sequelize, 'Wineries'),
        staffIdentityId: reference(Sequelize, 'StaffIdentities'),
        definitionId: reference(Sequelize, 'RoleSkillDefinitions'),
        sourceReferenceId: reference(Sequelize, 'ExternalResourceReferences', true, 'SET NULL'),
        status: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'ACTIVE' },
        proficiencyLevel: { type: Sequelize.STRING(80), allowNull: true },
        validFrom: { type: Sequelize.DATE, allowNull: true },
        validTo: { type: Sequelize.DATE, allowNull: true },
        confirmationStatus: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'MANAGER_CONFIRMED' },
        confirmedBy: reference(Sequelize, 'Users', true, 'SET NULL'),
        metadata: { type: Sequelize.JSON, allowNull: true },
        ...timestamps(Sequelize)
      });
    }
    await ensureIndex(queryInterface, 'StaffRoleSkills', ['staffIdentityId', 'definitionId'], {
      unique: true, name: 'staff_role_skills_unique_assignment'
    });
    await ensureIndex(queryInterface, 'StaffRoleSkills', ['wineryId', 'definitionId', 'status'], {
      name: 'staff_role_skills_definition_status'
    });

    if (!(await hasTable(queryInterface, 'RosterShifts'))) {
      await queryInterface.createTable('RosterShifts', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: reference(Sequelize, 'Wineries'),
        staffIdentityId: reference(Sequelize, 'StaffIdentities'),
        locationId: reference(Sequelize, 'WineryLocations', true, 'SET NULL'),
        areaId: reference(Sequelize, 'OperationalAreas', true, 'SET NULL'),
        roleDefinitionId: reference(Sequelize, 'RoleSkillDefinitions', true, 'SET NULL'),
        roleResolutionStatus: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'UNRESOLVED' },
        externalRoleCode: { type: Sequelize.STRING(120), allowNull: true },
        primarySourceReferenceId: reference(Sequelize, 'ExternalResourceReferences', false, 'RESTRICT'),
        authorityConnectionId: reference(Sequelize, 'IntegrationConnections', false, 'RESTRICT'),
        canonicalStatus: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'UNKNOWN' },
        providerStatus: { type: Sequelize.STRING(120), allowNull: true },
        publishedState: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'UNKNOWN' },
        startAt: { type: Sequelize.DATE, allowNull: false },
        endAt: { type: Sequelize.DATE, allowNull: false },
        breakMinutes: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        sourceTimeZone: { type: Sequelize.STRING(80), allowNull: true },
        sourceRevision: { type: Sequelize.STRING(255), allowNull: false },
        sourceUpdatedAt: { type: Sequelize.DATE, allowNull: false },
        observedAt: { type: Sequelize.DATE, allowNull: false },
        sourceHash: { type: Sequelize.STRING(64), allowNull: false },
        projectionQuality: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'SOURCE_ASSERTED' },
        deletedAtSource: { type: Sequelize.DATE, allowNull: true },
        providerExtensions: { type: Sequelize.JSON, allowNull: true },
        ...timestamps(Sequelize)
      });
    }
    await ensureIndex(queryInterface, 'RosterShifts', ['primarySourceReferenceId'], {
      unique: true, name: 'roster_shifts_unique_source'
    });
    await ensureIndex(queryInterface, 'RosterShifts', ['wineryId', 'staffIdentityId', 'startAt'], {
      name: 'roster_shifts_staff_time'
    });
    await ensureIndex(queryInterface, 'RosterShifts', ['wineryId', 'areaId', 'startAt', 'endAt'], {
      name: 'roster_shifts_area_time'
    });
    await ensureIndex(queryInterface, 'RosterShifts', ['wineryId', 'locationId', 'startAt', 'endAt'], {
      name: 'roster_shifts_location_time'
    });
    await ensureIndex(queryInterface, 'RosterShifts', ['wineryId', 'canonicalStatus', 'publishedState', 'startAt'], {
      name: 'roster_shifts_coverage'
    });

    if (!(await hasTable(queryInterface, 'RosterShiftSkills'))) {
      await queryInterface.createTable('RosterShiftSkills', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: reference(Sequelize, 'Wineries'),
        rosterShiftId: reference(Sequelize, 'RosterShifts'),
        definitionId: reference(Sequelize, 'RoleSkillDefinitions', true, 'SET NULL'),
        skillCode: { type: Sequelize.STRING(120), allowNull: false },
        skillResolutionStatus: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'UNRESOLVED' },
        sourceRevision: { type: Sequelize.STRING(255), allowNull: false },
        isActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        removedAt: { type: Sequelize.DATE, allowNull: true },
        ...timestamps(Sequelize)
      });
    }
    await ensureIndex(queryInterface, 'RosterShiftSkills', ['rosterShiftId', 'skillCode'], {
      unique: true, name: 'roster_shift_skills_unique_code'
    });
    await ensureIndex(queryInterface, 'RosterShiftSkills', ['wineryId', 'definitionId', 'isActive'], {
      name: 'roster_shift_skills_definition'
    });

    if (!(await hasTable(queryInterface, 'StaffAvailabilityEvents'))) {
      await queryInterface.createTable('StaffAvailabilityEvents', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: reference(Sequelize, 'Wineries'),
        staffIdentityId: reference(Sequelize, 'StaffIdentities'),
        primarySourceReferenceId: reference(Sequelize, 'ExternalResourceReferences', false, 'RESTRICT'),
        authorityConnectionId: reference(Sequelize, 'IntegrationConnections', false, 'RESTRICT'),
        eventKey: { type: Sequelize.STRING(180), allowNull: false },
        availabilityType: { type: Sequelize.STRING(40), allowNull: false },
        status: { type: Sequelize.STRING(40), allowNull: false },
        startAt: { type: Sequelize.DATE, allowNull: false },
        endAt: { type: Sequelize.DATE, allowNull: false },
        reasonCategory: { type: Sequelize.STRING(80), allowNull: true },
        sourceRevision: { type: Sequelize.STRING(255), allowNull: false },
        sourceUpdatedAt: { type: Sequelize.DATE, allowNull: false },
        observedAt: { type: Sequelize.DATE, allowNull: false },
        sourceHash: { type: Sequelize.STRING(64), allowNull: false },
        projectionQuality: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'SOURCE_ASSERTED' },
        deletedAtSource: { type: Sequelize.DATE, allowNull: true },
        providerExtensions: { type: Sequelize.JSON, allowNull: true },
        ...timestamps(Sequelize)
      });
    }
    await ensureIndex(queryInterface, 'StaffAvailabilityEvents', ['primarySourceReferenceId'], {
      unique: true, name: 'staff_availability_events_unique_source'
    });
    await ensureIndex(queryInterface, 'StaffAvailabilityEvents', ['wineryId', 'staffIdentityId', 'startAt', 'endAt'], {
      name: 'staff_availability_events_staff_time'
    });
    await ensureIndex(queryInterface, 'StaffAvailabilityEvents', ['wineryId', 'availabilityType', 'status', 'startAt'], {
      name: 'staff_availability_events_coverage'
    });

    if (!(await hasTable(queryInterface, 'WorkforceCoverageObservations'))) {
      await queryInterface.createTable('WorkforceCoverageObservations', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: reference(Sequelize, 'Wineries'),
        authorityConnectionId: reference(Sequelize, 'IntegrationConnections', false, 'RESTRICT'),
        locationId: reference(Sequelize, 'WineryLocations', true, 'SET NULL'),
        areaId: reference(Sequelize, 'OperationalAreas', true, 'SET NULL'),
        coverageKey: { type: Sequelize.STRING(64), allowNull: false },
        windowStartAt: { type: Sequelize.DATE, allowNull: false },
        windowEndAt: { type: Sequelize.DATE, allowNull: false },
        observedAt: { type: Sequelize.DATE, allowNull: false },
        staleAt: { type: Sequelize.DATE, allowNull: false },
        sourceRevision: { type: Sequelize.STRING(255), allowNull: false },
        sourceHash: { type: Sequelize.STRING(64), allowNull: false },
        isComplete: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        projectionQuality: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'SOURCE_ASSERTED' },
        ...timestamps(Sequelize)
      });
    }
    await ensureIndex(queryInterface, 'WorkforceCoverageObservations', [
      'wineryId', 'authorityConnectionId', 'coverageKey'
    ], {
      unique: true, name: 'workforce_coverage_observations_unique_window'
    });
    await ensureIndex(queryInterface, 'WorkforceCoverageObservations', [
      'wineryId', 'locationId', 'areaId', 'windowStartAt', 'windowEndAt'
    ], {
      name: 'workforce_coverage_observations_scope_window'
    });
    await ensureIndex(queryInterface, 'WorkforceCoverageObservations', [
      'wineryId', 'staleAt', 'isComplete'
    ], {
      name: 'workforce_coverage_observations_freshness'
    });

    if (!(await hasTable(queryInterface, 'WorkforceDemandMappings'))) {
      await queryInterface.createTable('WorkforceDemandMappings', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: reference(Sequelize, 'Wineries'),
        sourceRecordType: { type: Sequelize.STRING(40), allowNull: false },
        sourceConnectionId: reference(Sequelize, 'IntegrationConnections', true, 'CASCADE'),
        sourceCode: { type: Sequelize.STRING(160), allowNull: false },
        sourceCodeNormalized: { type: Sequelize.STRING(160), allowNull: false },
        mappingKey: { type: Sequelize.STRING(64), allowNull: false },
        definitionId: reference(Sequelize, 'RoleSkillDefinitions'),
        areaId: reference(Sequelize, 'OperationalAreas', true, 'SET NULL'),
        locationId: reference(Sequelize, 'WineryLocations', true, 'SET NULL'),
        headcountMultiplier: { type: Sequelize.DECIMAL(12, 3), allowNull: false, defaultValue: 1 },
        bufferBeforeMinutes: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        bufferAfterMinutes: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        status: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'ACTIVE' },
        confirmationStatus: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'MANAGER_CONFIRMED' },
        createdBy: reference(Sequelize, 'Users', true, 'SET NULL'),
        updatedBy: reference(Sequelize, 'Users', true, 'SET NULL'),
        ...timestamps(Sequelize)
      });
    }
    await ensureIndex(queryInterface, 'WorkforceDemandMappings', ['wineryId', 'mappingKey'], {
      unique: true, name: 'workforce_demand_mappings_unique_key'
    });
    await ensureIndex(queryInterface, 'WorkforceDemandMappings', [
      'wineryId', 'sourceRecordType', 'sourceCodeNormalized', 'status'
    ], {
      name: 'workforce_demand_mappings_lookup'
    });
    await ensureIndex(queryInterface, 'WorkforceDemandMappings', ['wineryId', 'definitionId', 'status'], {
      name: 'workforce_demand_mappings_definition'
    });
  },

  async down(queryInterface) {
    for (const tableName of [
      'WorkforceDemandMappings',
      'WorkforceCoverageObservations',
      'StaffAvailabilityEvents',
      'RosterShiftSkills',
      'RosterShifts',
      'StaffRoleSkills',
      'RoleSkillDefinitions',
      'StaffIdentities'
    ]) {
      if (await hasTable(queryInterface, tableName)) await queryInterface.dropTable(tableName);
    }
  }
};
