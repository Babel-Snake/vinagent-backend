'use strict';

async function hasTable(queryInterface, tableName) {
  const expected = String(tableName).toLowerCase();
  return (await queryInterface.showAllTables()).some(table => {
    const name = typeof table === 'object' ? table.tableName || table.name : table;
    return String(name).toLowerCase() === expected;
  });
}

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await hasTable(queryInterface, 'WineryBillingProfiles'))) {
      await queryInterface.createTable('WineryBillingProfiles', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          unique: true,
          references: { model: 'Wineries', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        lifecycleStatus: { type: Sequelize.STRING(32), allowNull: false, defaultValue: 'PILOT' },
        planCode: { type: Sequelize.STRING(64), allowNull: false, defaultValue: 'pilot' },
        billingProvider: { type: Sequelize.STRING(32), allowNull: false, defaultValue: 'none' },
        providerCustomerId: { type: Sequelize.STRING(191), allowNull: true },
        providerSubscriptionId: { type: Sequelize.STRING(191), allowNull: true },
        trialStartedAt: { type: Sequelize.DATE, allowNull: true },
        trialEndsAt: { type: Sequelize.DATE, allowNull: true },
        currentPeriodStart: { type: Sequelize.DATE, allowNull: true },
        currentPeriodEnd: { type: Sequelize.DATE, allowNull: true },
        meteringStartedAt: { type: Sequelize.DATE, allowNull: false },
        createdAt: { allowNull: false, type: Sequelize.DATE },
        updatedAt: { allowNull: false, type: Sequelize.DATE }
      });
    }

    if (!(await hasTable(queryInterface, 'UsageEvents'))) {
      await queryInterface.createTable('UsageEvents', {
        id: { allowNull: false, primaryKey: true, type: Sequelize.STRING(36) },
        wineryId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'Wineries', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        actorUserId: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'Users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        metricKey: { type: Sequelize.STRING(80), allowNull: false },
        schemaVersion: { type: Sequelize.SMALLINT, allowNull: false, defaultValue: 1 },
        quantity: { type: Sequelize.DECIMAL(20, 6), allowNull: false },
        unit: { type: Sequelize.STRING(32), allowNull: false },
        occurredAt: { type: Sequelize.DATE, allowNull: false },
        sourceType: { type: Sequelize.STRING(48), allowNull: false },
        sourceId: { type: Sequelize.STRING(191), allowNull: true },
        idempotencyKey: { type: Sequelize.STRING(191), allowNull: false },
        dimensions: { type: Sequelize.JSON, allowNull: true },
        createdAt: { allowNull: false, type: Sequelize.DATE }
      });
      await queryInterface.addIndex('UsageEvents', ['wineryId', 'idempotencyKey'], {
        unique: true,
        name: 'usage_events_winery_idempotency_unique'
      });
      await queryInterface.addIndex('UsageEvents', ['wineryId', 'metricKey', 'occurredAt'], {
        name: 'usage_events_winery_metric_occurred'
      });
      await queryInterface.addIndex('UsageEvents', ['wineryId', 'actorUserId', 'occurredAt'], {
        name: 'usage_events_winery_actor_occurred'
      });
    }

    if (!(await hasTable(queryInterface, 'UsageCounterBuckets'))) {
      await queryInterface.createTable('UsageCounterBuckets', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'Wineries', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        metricKey: { type: Sequelize.STRING(80), allowNull: false },
        bucketStart: { type: Sequelize.DATE, allowNull: false },
        bucketSeconds: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 3600 },
        dimensionsKey: { type: Sequelize.STRING(64), allowNull: false },
        dimensions: { type: Sequelize.JSON, allowNull: true },
        eventCount: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
        quantity: { type: Sequelize.DECIMAL(20, 6), allowNull: false, defaultValue: 0 },
        durationMs: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
        responseBytes: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
        createdAt: { allowNull: false, type: Sequelize.DATE },
        updatedAt: { allowNull: false, type: Sequelize.DATE }
      });
      await queryInterface.addIndex('UsageCounterBuckets', ['wineryId', 'metricKey', 'bucketStart', 'dimensionsKey'], {
        unique: true,
        name: 'usage_counter_bucket_unique'
      });
    }

    if (!(await hasTable(queryInterface, 'UsageGaugeSnapshots'))) {
      await queryInterface.createTable('UsageGaugeSnapshots', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'Wineries', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        metricKey: { type: Sequelize.STRING(80), allowNull: false },
        snapshotDate: { type: Sequelize.DATEONLY, allowNull: false },
        value: { type: Sequelize.DECIMAL(20, 6), allowNull: false },
        unit: { type: Sequelize.STRING(32), allowNull: false },
        dimensionsKey: { type: Sequelize.STRING(64), allowNull: false },
        dimensions: { type: Sequelize.JSON, allowNull: true },
        capturedAt: { type: Sequelize.DATE, allowNull: false },
        createdAt: { allowNull: false, type: Sequelize.DATE },
        updatedAt: { allowNull: false, type: Sequelize.DATE }
      });
      await queryInterface.addIndex('UsageGaugeSnapshots', ['wineryId', 'metricKey', 'snapshotDate', 'dimensionsKey'], {
        unique: true,
        name: 'usage_gauge_snapshot_unique'
      });
    }

    if (!(await hasTable(queryInterface, 'UserActivityDaily'))) {
      await queryInterface.createTable('UserActivityDaily', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'Wineries', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        userId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'Users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        activityDate: { type: Sequelize.DATEONLY, allowNull: false },
        engagedSeconds: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        sessionCount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        requestCount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        lastActiveAt: { type: Sequelize.DATE, allowNull: true },
        createdAt: { allowNull: false, type: Sequelize.DATE },
        updatedAt: { allowNull: false, type: Sequelize.DATE }
      });
      await queryInterface.addIndex('UserActivityDaily', ['wineryId', 'userId', 'activityDate'], {
        unique: true,
        name: 'user_activity_daily_unique'
      });
      await queryInterface.addIndex('UserActivityDaily', ['wineryId', 'activityDate'], {
        name: 'user_activity_daily_winery_date'
      });
    }

    if (!(await hasTable(queryInterface, 'UsageExportDeliveries'))) {
      await queryInterface.createTable('UsageExportDeliveries', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'Wineries', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        usageEventId: {
          type: Sequelize.STRING(36),
          allowNull: false,
          references: { model: 'UsageEvents', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        destination: { type: Sequelize.STRING(32), allowNull: false },
        externalIdentifier: { type: Sequelize.STRING(191), allowNull: true },
        status: { type: Sequelize.STRING(24), allowNull: false, defaultValue: 'PENDING' },
        attemptCount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        lastAttemptAt: { type: Sequelize.DATE, allowNull: true },
        lastErrorCode: { type: Sequelize.STRING(80), allowNull: true },
        createdAt: { allowNull: false, type: Sequelize.DATE },
        updatedAt: { allowNull: false, type: Sequelize.DATE }
      });
      await queryInterface.addIndex('UsageExportDeliveries', ['usageEventId', 'destination'], {
        unique: true,
        name: 'usage_export_event_destination_unique'
      });
      await queryInterface.addIndex('UsageExportDeliveries', ['wineryId', 'status', 'createdAt'], {
        name: 'usage_export_winery_status_created'
      });
    }

    const now = new Date();
    await queryInterface.sequelize.query(`
      INSERT INTO WineryBillingProfiles
        (wineryId, lifecycleStatus, planCode, billingProvider, meteringStartedAt, createdAt, updatedAt)
      SELECT Wineries.id, 'PILOT', 'pilot', 'none', :now, :now, :now
      FROM Wineries
      LEFT JOIN WineryBillingProfiles ON WineryBillingProfiles.wineryId = Wineries.id
      WHERE WineryBillingProfiles.id IS NULL
    `, { replacements: { now } });
  },

  async down(queryInterface) {
    for (const table of [
      'UsageExportDeliveries',
      'UserActivityDaily',
      'UsageGaugeSnapshots',
      'UsageCounterBuckets',
      'UsageEvents',
      'WineryBillingProfiles'
    ]) {
      if (await hasTable(queryInterface, table)) await queryInterface.dropTable(table);
    }
  }
};
