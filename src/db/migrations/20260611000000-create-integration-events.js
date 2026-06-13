'use strict';

async function hasTable(queryInterface, tableName) {
  const tables = await queryInterface.showAllTables();
  return tables.some((table) => {
    const name = typeof table === 'object' ? table.tableName || table.name : table;
    return name === tableName;
  });
}

async function hasColumn(queryInterface, tableName, columnName) {
  const table = await queryInterface.describeTable(tableName);
  return Boolean(table[columnName]);
}

async function hasIndex(queryInterface, tableName, indexName) {
  const indexes = await queryInterface.showIndex(tableName);
  return indexes.some((index) => index.name === indexName);
}

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await hasTable(queryInterface, 'IntegrationEvents'))) {
      await queryInterface.createTable('IntegrationEvents', {
        id: {
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
          type: Sequelize.INTEGER
        },
        provider: {
          type: Sequelize.STRING,
          allowNull: false
        },
        intakeMethod: {
          type: Sequelize.STRING,
          allowNull: false,
          defaultValue: 'manual'
        },
        eventType: {
          type: Sequelize.STRING,
          allowNull: false
        },
        externalEventId: {
          type: Sequelize.STRING,
          allowNull: true
        },
        rawPayload: {
          type: Sequelize.JSON,
          allowNull: true
        },
        normalizedPayload: {
          type: Sequelize.JSON,
          allowNull: true
        },
        status: {
          type: Sequelize.ENUM(
            'RECEIVED',
            'NORMALIZED',
            'PENDING_REVIEW',
            'PROCESSED',
            'IGNORED',
            'ARCHIVED',
            'FAILED',
            'DUPLICATE'
          ),
          allowNull: false,
          defaultValue: 'RECEIVED'
        },
        processingError: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        receivedAt: {
          type: Sequelize.DATE,
          allowNull: false
        },
        processedAt: {
          type: Sequelize.DATE,
          allowNull: true
        },
        reviewedAt: {
          type: Sequelize.DATE,
          allowNull: true
        },
        relatedRecordType: {
          type: Sequelize.STRING,
          allowNull: true
        },
        relatedRecordId: {
          type: Sequelize.INTEGER,
          allowNull: true
        },
        metadata: {
          type: Sequelize.JSON,
          allowNull: true
        },
        wineryId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'Wineries', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        createdBy: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'Users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        reviewedBy: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'Users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        createdAt: {
          allowNull: false,
          type: Sequelize.DATE
        },
        updatedAt: {
          allowNull: false,
          type: Sequelize.DATE
        }
      });
    }

    if (!(await hasIndex(queryInterface, 'IntegrationEvents', 'integration_events_winery_status'))) {
      await queryInterface.addIndex('IntegrationEvents', ['wineryId', 'status'], {
        name: 'integration_events_winery_status'
      });
    }
    if (!(await hasIndex(queryInterface, 'IntegrationEvents', 'integration_events_winery_type_status'))) {
      await queryInterface.addIndex('IntegrationEvents', ['wineryId', 'eventType', 'status'], {
        name: 'integration_events_winery_type_status'
      });
    }
    if (!(await hasIndex(queryInterface, 'IntegrationEvents', 'integration_events_external_unique'))) {
      await queryInterface.addIndex('IntegrationEvents', ['wineryId', 'provider', 'externalEventId'], {
        unique: true,
        name: 'integration_events_external_unique'
      });
    }

    if (await hasTable(queryInterface, 'Notices')) {
      if (!(await hasColumn(queryInterface, 'Notices', 'externalSource'))) {
        await queryInterface.addColumn('Notices', 'externalSource', {
          type: Sequelize.STRING,
          allowNull: true,
          after: 'archivedAt'
        });
      }
      if (!(await hasColumn(queryInterface, 'Notices', 'externalId'))) {
        await queryInterface.addColumn('Notices', 'externalId', {
          type: Sequelize.STRING,
          allowNull: true,
          after: 'externalSource'
        });
      }
      if (!(await hasColumn(queryInterface, 'Notices', 'externalPostedAt'))) {
        await queryInterface.addColumn('Notices', 'externalPostedAt', {
          type: Sequelize.DATE,
          allowNull: true,
          after: 'externalId'
        });
      }
      if (!(await hasColumn(queryInterface, 'Notices', 'externalAuthorName'))) {
        await queryInterface.addColumn('Notices', 'externalAuthorName', {
          type: Sequelize.STRING,
          allowNull: true,
          after: 'externalPostedAt'
        });
      }
      if (!(await hasColumn(queryInterface, 'Notices', 'sourceEventId'))) {
        await queryInterface.addColumn('Notices', 'sourceEventId', {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'IntegrationEvents', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
          after: 'externalAuthorName'
        });
      }

      if (!(await hasIndex(queryInterface, 'Notices', 'notices_winery_external_source_id'))) {
        await queryInterface.addIndex('Notices', ['wineryId', 'externalSource', 'externalId'], {
          name: 'notices_winery_external_source_id'
        });
      }
      if (!(await hasIndex(queryInterface, 'Notices', 'notices_source_event'))) {
        await queryInterface.addIndex('Notices', ['sourceEventId'], {
          name: 'notices_source_event'
        });
      }
    }
  },

  async down(queryInterface) {
    if (await hasTable(queryInterface, 'Notices')) {
      if (await hasIndex(queryInterface, 'Notices', 'notices_source_event')) {
        await queryInterface.removeIndex('Notices', 'notices_source_event');
      }
      if (await hasIndex(queryInterface, 'Notices', 'notices_winery_external_source_id')) {
        await queryInterface.removeIndex('Notices', 'notices_winery_external_source_id');
      }

      for (const columnName of ['sourceEventId', 'externalAuthorName', 'externalPostedAt', 'externalId', 'externalSource']) {
        if (await hasColumn(queryInterface, 'Notices', columnName)) {
          await queryInterface.removeColumn('Notices', columnName);
        }
      }
    }

    if (await hasTable(queryInterface, 'IntegrationEvents')) {
      await queryInterface.dropTable('IntegrationEvents');
    }
  }
};
