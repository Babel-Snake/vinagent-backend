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
    if (!(await hasTable(queryInterface, 'CustomerRollupRuns'))) {
      await queryInterface.createTable('CustomerRollupRuns', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: reference(Sequelize, 'Wineries'),
        requestId: { type: Sequelize.STRING(36), allowNull: false },
        previewToken: { type: Sequelize.STRING(64), allowNull: false },
        inputHash: { type: Sequelize.STRING(64), allowNull: false },
        calculationVersion: { type: Sequelize.STRING(80), allowNull: false },
        status: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'RUNNING' },
        initiatedBy: reference(Sequelize, 'Users', false, 'RESTRICT'),
        reason: { type: Sequelize.TEXT, allowNull: false },
        memberCount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        relationshipRollupCount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        monetaryRollupCount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        contributionCount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        startedAt: { type: Sequelize.DATE, allowNull: false },
        completedAt: { type: Sequelize.DATE, allowNull: true },
        ...timestamps(Sequelize)
      });
    }
    await ensureIndex(queryInterface, 'CustomerRollupRuns', ['wineryId', 'requestId'], {
      unique: true,
      name: 'customer_rollup_runs_unique_request'
    });
    await ensureIndex(queryInterface, 'CustomerRollupRuns', ['wineryId', 'status', 'startedAt'], {
      name: 'customer_rollup_runs_status'
    });

    if (!(await hasTable(queryInterface, 'CustomerRelationshipRollups'))) {
      await queryInterface.createTable('CustomerRelationshipRollups', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: reference(Sequelize, 'Wineries'),
        memberId: reference(Sequelize, 'Members'),
        lastRunId: reference(Sequelize, 'CustomerRollupRuns', false, 'RESTRICT'),
        activeClubMembershipCount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        isCurrentClubMember: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        completedBookingCount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        purchaseOrderCount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        lastVisitAt: { type: Sequelize.DATE, allowNull: true },
        lastPurchaseAt: { type: Sequelize.DATE, allowNull: true },
        sourceOverlapStatus: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'CLEAR' },
        authorityStatus: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'SHADOW_UNVERIFIED' },
        calculationVersion: { type: Sequelize.STRING(80), allowNull: false },
        calculatedAt: { type: Sequelize.DATE, allowNull: false },
        automationEligible: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        ...timestamps(Sequelize)
      });
    }
    await ensureIndex(queryInterface, 'CustomerRelationshipRollups', ['wineryId', 'memberId'], {
      unique: true,
      name: 'customer_relationship_rollups_unique_member'
    });
    await ensureIndex(
      queryInterface,
      'CustomerRelationshipRollups',
      ['wineryId', 'isCurrentClubMember', 'lastPurchaseAt'],
      { name: 'customer_relationship_rollups_activity' }
    );
    await ensureIndex(queryInterface, 'CustomerRelationshipRollups', ['wineryId', 'sourceOverlapStatus'], {
      name: 'customer_relationship_rollups_overlap'
    });

    if (!(await hasTable(queryInterface, 'CustomerMonetaryRollups'))) {
      await queryInterface.createTable('CustomerMonetaryRollups', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: reference(Sequelize, 'Wineries'),
        memberId: reference(Sequelize, 'Members'),
        currency: { type: Sequelize.STRING(3), allowNull: false },
        lastRunId: reference(Sequelize, 'CustomerRollupRuns', false, 'RESTRICT'),
        grossPaidMinor: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
        refundedMinor: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
        netPaidMinor: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
        contributingOrderCount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        sourceOverlapStatus: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'CLEAR' },
        authorityStatus: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'SHADOW_UNVERIFIED' },
        calculationVersion: { type: Sequelize.STRING(80), allowNull: false },
        calculatedAt: { type: Sequelize.DATE, allowNull: false },
        automationEligible: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        ...timestamps(Sequelize)
      });
    }
    await ensureIndex(queryInterface, 'CustomerMonetaryRollups', ['wineryId', 'memberId', 'currency'], {
      unique: true,
      name: 'customer_monetary_rollups_unique_currency'
    });
    await ensureIndex(queryInterface, 'CustomerMonetaryRollups', ['wineryId', 'currency', 'netPaidMinor'], {
      name: 'customer_monetary_rollups_value'
    });

    if (!(await hasTable(queryInterface, 'CustomerRollupContributions'))) {
      await queryInterface.createTable('CustomerRollupContributions', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: reference(Sequelize, 'Wineries'),
        runId: reference(Sequelize, 'CustomerRollupRuns'),
        contributionKey: { type: Sequelize.STRING(64), allowNull: false },
        subjectMemberId: { type: Sequelize.INTEGER, allowNull: false },
        resourceType: { type: Sequelize.STRING(120), allowNull: false },
        resourceId: { type: Sequelize.INTEGER, allowNull: false },
        contributionType: { type: Sequelize.STRING(80), allowNull: false },
        currency: { type: Sequelize.STRING(3), allowNull: true },
        amountMinor: { type: Sequelize.BIGINT, allowNull: true },
        effectiveAt: { type: Sequelize.DATE, allowNull: true },
        authorityConnectionId: reference(Sequelize, 'IntegrationConnections', true, 'SET NULL'),
        metadata: { type: Sequelize.JSON, allowNull: true },
        createdAt: { allowNull: false, type: Sequelize.DATE }
      });
    }
    await ensureIndex(queryInterface, 'CustomerRollupContributions', ['runId', 'contributionKey'], {
      unique: true,
      name: 'customer_rollup_contributions_unique'
    });
    await ensureIndex(queryInterface, 'CustomerRollupContributions', ['wineryId', 'subjectMemberId', 'runId'], {
      name: 'customer_rollup_contributions_member'
    });
    await ensureIndex(queryInterface, 'CustomerRollupContributions', ['wineryId', 'resourceType', 'resourceId'], {
      name: 'customer_rollup_contributions_resource'
    });
  },

  async down(queryInterface) {
    for (const tableName of [
      'CustomerRollupContributions',
      'CustomerMonetaryRollups',
      'CustomerRelationshipRollups',
      'CustomerRollupRuns'
    ]) {
      if (await hasTable(queryInterface, tableName)) await queryInterface.dropTable(tableName);
    }
  }
};
