'use strict';

async function hasTable(queryInterface, tableName) {
  const expected = String(tableName).toLowerCase();
  return (await queryInterface.showAllTables()).some(table => {
    const name = typeof table === 'object' ? table.tableName || table.name : table;
    return String(name).toLowerCase() === expected;
  });
}

async function hasColumn(queryInterface, tableName, columnName) {
  if (!(await hasTable(queryInterface, tableName))) return false;
  return Boolean((await queryInterface.describeTable(tableName))[columnName]);
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

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await hasTable(queryInterface, 'Messages'))) {
      throw new Error('Messages must exist before communication lineage can be installed');
    }
    if (!(await hasColumn(queryInterface, 'Messages', 'primarySourceReferenceId'))) {
      await queryInterface.addColumn('Messages', 'primarySourceReferenceId',
        reference(Sequelize, 'ExternalResourceReferences', true, 'SET NULL'));
    }
    if (!(await hasColumn(queryInterface, 'Messages', 'canonicalDeliveryStatus'))) {
      await queryInterface.addColumn('Messages', 'canonicalDeliveryStatus', {
        type: Sequelize.STRING(40), allowNull: false, defaultValue: 'UNKNOWN'
      });
    }
    if (!(await hasColumn(queryInterface, 'Messages', 'deliveryStatusOccurredAt'))) {
      await queryInterface.addColumn('Messages', 'deliveryStatusOccurredAt', {
        type: Sequelize.DATE, allowNull: true
      });
    }
    if (!(await hasColumn(queryInterface, 'Messages', 'deliveryFailureCategory'))) {
      await queryInterface.addColumn('Messages', 'deliveryFailureCategory', {
        type: Sequelize.STRING(40), allowNull: false, defaultValue: 'NONE'
      });
    }
    await ensureIndex(queryInterface, 'Messages', ['primarySourceReferenceId'], {
      unique: true, name: 'messages_unique_primary_source'
    });
    await ensureIndex(queryInterface, 'Messages', ['wineryId', 'canonicalDeliveryStatus', 'deliveryStatusOccurredAt'], {
      name: 'messages_delivery_attention'
    });

    if (!(await hasTable(queryInterface, 'MessageDeliveryEvents'))) {
      await queryInterface.createTable('MessageDeliveryEvents', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: reference(Sequelize, 'Wineries'),
        messageId: reference(Sequelize, 'Messages'),
        sourceReferenceId: reference(Sequelize, 'ExternalResourceReferences', false, 'RESTRICT'),
        sourceEventId: reference(Sequelize, 'IntegrationEvents', true, 'SET NULL'),
        eventKey: { type: Sequelize.STRING(180), allowNull: false },
        canonicalStatus: { type: Sequelize.STRING(40), allowNull: false },
        providerStatus: { type: Sequelize.STRING(120), allowNull: true },
        occurredAt: { type: Sequelize.DATE, allowNull: false },
        failureCategory: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'NONE' },
        sourceHash: { type: Sequelize.STRING(64), allowNull: false },
        metadata: { type: Sequelize.JSON, allowNull: true },
        createdAt: { allowNull: false, type: Sequelize.DATE }
      });
    }
    await ensureIndex(queryInterface, 'MessageDeliveryEvents', ['sourceReferenceId', 'eventKey'], {
      unique: true, name: 'message_delivery_events_unique'
    });
    await ensureIndex(queryInterface, 'MessageDeliveryEvents', ['wineryId', 'canonicalStatus', 'occurredAt'], {
      name: 'message_delivery_events_status'
    });
    await ensureIndex(queryInterface, 'MessageDeliveryEvents', ['messageId', 'occurredAt'], {
      name: 'message_delivery_events_timeline'
    });
    await ensureIndex(queryInterface, 'MessageDeliveryEvents', ['sourceReferenceId', 'occurredAt'], {
      name: 'message_delivery_events_source'
    });
  },

  async down(queryInterface) {
    if (await hasTable(queryInterface, 'MessageDeliveryEvents')) {
      await queryInterface.dropTable('MessageDeliveryEvents');
    }
    for (const columnName of [
      'deliveryFailureCategory',
      'deliveryStatusOccurredAt',
      'canonicalDeliveryStatus',
      'primarySourceReferenceId'
    ]) {
      if (await hasColumn(queryInterface, 'Messages', columnName)) {
        await queryInterface.removeColumn('Messages', columnName);
      }
    }
  }
};
