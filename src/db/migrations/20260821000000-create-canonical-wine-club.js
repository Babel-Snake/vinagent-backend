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
    if (!(await hasTable(queryInterface, 'WineClubPrograms'))) {
      await queryInterface.createTable('WineClubPrograms', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: reference(Sequelize, 'Wineries'),
        code: { type: Sequelize.STRING(100), allowNull: false },
        name: { type: Sequelize.STRING(160), allowNull: false },
        tier: { type: Sequelize.STRING(80), allowNull: true },
        cadence: { type: Sequelize.STRING(80), allowNull: true },
        benefitsSummary: { type: Sequelize.TEXT, allowNull: true },
        isActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        createdBy: reference(Sequelize, 'Users', true, 'SET NULL'),
        updatedBy: reference(Sequelize, 'Users', true, 'SET NULL'),
        ...timestamps(Sequelize)
      });
    }
    await ensureIndex(queryInterface, 'WineClubPrograms', ['wineryId', 'code'], {
      unique: true,
      name: 'wine_club_programs_unique_code'
    });
    await ensureIndex(queryInterface, 'WineClubPrograms', ['wineryId', 'isActive', 'name'], {
      name: 'wine_club_programs_active'
    });

    if (!(await hasTable(queryInterface, 'WineClubMemberships'))) {
      await queryInterface.createTable('WineClubMemberships', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: reference(Sequelize, 'Wineries'),
        memberId: reference(Sequelize, 'Members'),
        programId: reference(Sequelize, 'WineClubPrograms'),
        primarySourceReferenceId: reference(Sequelize, 'ExternalResourceReferences', false, 'RESTRICT'),
        authorityConnectionId: reference(Sequelize, 'IntegrationConnections', false, 'RESTRICT'),
        canonicalStatus: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'UNKNOWN' },
        providerStatus: { type: Sequelize.STRING(120), allowNull: true },
        joinedAt: { type: Sequelize.DATE, allowNull: true },
        activatedAt: { type: Sequelize.DATE, allowNull: true },
        pausedAt: { type: Sequelize.DATE, allowNull: true },
        nextReviewAt: { type: Sequelize.DATE, allowNull: true },
        nextChargeAt: { type: Sequelize.DATE, allowNull: true },
        cancelledAt: { type: Sequelize.DATE, allowNull: true },
        endedAt: { type: Sequelize.DATE, allowNull: true },
        statusReason: { type: Sequelize.STRING(255), allowNull: true },
        preferences: { type: Sequelize.JSON, allowNull: true },
        fulfilmentMethod: { type: Sequelize.STRING(80), allowNull: true },
        sourceRevision: { type: Sequelize.STRING(255), allowNull: true },
        sourceUpdatedAt: { type: Sequelize.DATE, allowNull: true },
        observedAt: { type: Sequelize.DATE, allowNull: false },
        projectionQuality: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'SOURCE_ASSERTED' },
        deletedAtSource: { type: Sequelize.DATE, allowNull: true },
        providerExtensions: { type: Sequelize.JSON, allowNull: true },
        ...timestamps(Sequelize)
      });
    }
    await ensureIndex(queryInterface, 'WineClubMemberships', ['wineryId', 'programId', 'memberId'], {
      unique: true,
      name: 'wine_club_memberships_unique_member'
    });
    await ensureIndex(queryInterface, 'WineClubMemberships', ['primarySourceReferenceId'], {
      unique: true,
      name: 'wine_club_memberships_unique_source'
    });
    await ensureIndex(queryInterface, 'WineClubMemberships', ['wineryId', 'canonicalStatus', 'nextChargeAt'], {
      name: 'wine_club_memberships_status_charge'
    });
    await ensureIndex(queryInterface, 'WineClubMemberships', ['wineryId', 'memberId', 'canonicalStatus'], {
      name: 'wine_club_memberships_member'
    });

    if (!(await hasTable(queryInterface, 'WineClubMembershipEvents'))) {
      await queryInterface.createTable('WineClubMembershipEvents', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: reference(Sequelize, 'Wineries'),
        membershipId: reference(Sequelize, 'WineClubMemberships'),
        eventKey: { type: Sequelize.STRING(180), allowNull: false },
        eventType: { type: Sequelize.STRING(80), allowNull: false },
        fromStatus: { type: Sequelize.STRING(40), allowNull: true },
        toStatus: { type: Sequelize.STRING(40), allowNull: true },
        effectiveAt: { type: Sequelize.DATE, allowNull: false },
        reason: { type: Sequelize.STRING(255), allowNull: true },
        sourceReferenceId: reference(Sequelize, 'ExternalResourceReferences', true, 'SET NULL'),
        sourceEventId: reference(Sequelize, 'IntegrationEvents', true, 'SET NULL'),
        metadata: { type: Sequelize.JSON, allowNull: true },
        createdAt: { allowNull: false, type: Sequelize.DATE }
      });
    }
    await ensureIndex(queryInterface, 'WineClubMembershipEvents', ['membershipId', 'eventKey'], {
      unique: true,
      name: 'wine_club_membership_events_unique'
    });
    await ensureIndex(queryInterface, 'WineClubMembershipEvents', ['wineryId', 'membershipId', 'effectiveAt'], {
      name: 'wine_club_membership_events_timeline'
    });

    if (!(await hasTable(queryInterface, 'WineClubAllocations'))) {
      await queryInterface.createTable('WineClubAllocations', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: reference(Sequelize, 'Wineries'),
        membershipId: reference(Sequelize, 'WineClubMemberships'),
        programId: reference(Sequelize, 'WineClubPrograms'),
        primarySourceReferenceId: reference(Sequelize, 'ExternalResourceReferences', false, 'RESTRICT'),
        authorityConnectionId: reference(Sequelize, 'IntegrationConnections', false, 'RESTRICT'),
        cycleCode: { type: Sequelize.STRING(120), allowNull: false },
        canonicalStatus: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'UNKNOWN' },
        providerStatus: { type: Sequelize.STRING(120), allowNull: true },
        opensAt: { type: Sequelize.DATE, allowNull: true },
        closesAt: { type: Sequelize.DATE, allowNull: true },
        chargesAt: { type: Sequelize.DATE, allowNull: true },
        fulfilsAt: { type: Sequelize.DATE, allowNull: true },
        fulfilmentMethod: { type: Sequelize.STRING(80), allowNull: true },
        currency: { type: Sequelize.STRING(3), allowNull: true },
        totalMinor: { type: Sequelize.INTEGER, allowNull: true },
        salesOrderId: { type: Sequelize.INTEGER, allowNull: true },
        sourceRevision: { type: Sequelize.STRING(255), allowNull: true },
        sourceUpdatedAt: { type: Sequelize.DATE, allowNull: true },
        observedAt: { type: Sequelize.DATE, allowNull: false },
        projectionQuality: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'SOURCE_ASSERTED' },
        deletedAtSource: { type: Sequelize.DATE, allowNull: true },
        providerExtensions: { type: Sequelize.JSON, allowNull: true },
        ...timestamps(Sequelize)
      });
    }
    await ensureIndex(queryInterface, 'WineClubAllocations', ['wineryId', 'membershipId', 'cycleCode'], {
      unique: true,
      name: 'wine_club_allocations_unique_cycle'
    });
    await ensureIndex(queryInterface, 'WineClubAllocations', ['primarySourceReferenceId'], {
      unique: true,
      name: 'wine_club_allocations_unique_source'
    });
    await ensureIndex(queryInterface, 'WineClubAllocations', ['wineryId', 'canonicalStatus', 'chargesAt'], {
      name: 'wine_club_allocations_status_charge'
    });

    if (!(await hasTable(queryInterface, 'WineClubAllocationItems'))) {
      await queryInterface.createTable('WineClubAllocationItems', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: reference(Sequelize, 'Wineries'),
        allocationId: reference(Sequelize, 'WineClubAllocations'),
        lineKey: { type: Sequelize.STRING(160), allowNull: false },
        productVariantId: { type: Sequelize.INTEGER, allowNull: true },
        providerSku: { type: Sequelize.STRING(160), allowNull: true },
        description: { type: Sequelize.STRING(255), allowNull: false },
        quantity: { type: Sequelize.DECIMAL(12, 3), allowNull: false },
        unit: { type: Sequelize.STRING(40), allowNull: false },
        substitutionAllowed: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        substitutedFromSku: { type: Sequelize.STRING(160), allowNull: true },
        currency: { type: Sequelize.STRING(3), allowNull: true },
        unitPriceMinor: { type: Sequelize.INTEGER, allowNull: true },
        totalMinor: { type: Sequelize.INTEGER, allowNull: true },
        providerExtensions: { type: Sequelize.JSON, allowNull: true },
        ...timestamps(Sequelize)
      });
    }
    await ensureIndex(queryInterface, 'WineClubAllocationItems', ['allocationId', 'lineKey'], {
      unique: true,
      name: 'wine_club_allocation_items_unique_line'
    });
    await ensureIndex(queryInterface, 'WineClubAllocationItems', ['wineryId', 'providerSku'], {
      name: 'wine_club_allocation_items_sku'
    });
    await ensureIndex(queryInterface, 'WineClubAllocationItems', ['wineryId', 'productVariantId'], {
      name: 'wine_club_allocation_items_variant'
    });
  },

  async down(queryInterface) {
    for (const tableName of [
      'WineClubAllocationItems',
      'WineClubAllocations',
      'WineClubMembershipEvents',
      'WineClubMemberships',
      'WineClubPrograms'
    ]) {
      if (await hasTable(queryInterface, tableName)) await queryInterface.dropTable(tableName);
    }
  }
};
