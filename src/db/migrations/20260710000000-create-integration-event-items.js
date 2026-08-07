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
    if (!(await hasTable(queryInterface, 'IntegrationEventItems'))) {
      await queryInterface.createTable('IntegrationEventItems', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        eventId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'IntegrationEvents', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        wineryId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        itemType: { type: Sequelize.ENUM('TASK', 'NOTICE', 'REQUEST', 'NOTE'), allowNull: false },
        itemId: { type: Sequelize.INTEGER, allowNull: false },
        itemKey: { type: Sequelize.STRING(100), allowNull: true },
        linkType: { type: Sequelize.ENUM('CREATED', 'LINKED'), allowNull: false, defaultValue: 'CREATED' },
        createdBy: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'Users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
        createdAt: { allowNull: false, type: Sequelize.DATE }
      });
      await queryInterface.addIndex('IntegrationEventItems', ['eventId', 'itemType', 'itemId'], { unique: true, name: 'integration_event_items_target_unique' });
      await queryInterface.addIndex('IntegrationEventItems', ['eventId', 'itemKey'], { unique: true, name: 'integration_event_items_key_unique' });
      await queryInterface.addIndex('IntegrationEventItems', ['wineryId', 'itemType', 'itemId'], { name: 'integration_event_items_target' });
    }

    if (await hasTable(queryInterface, 'IntegrationEvents')) {
      const [events] = await queryInterface.sequelize.query(
        'SELECT id, wineryId, relatedRecordType, relatedRecordId, reviewedBy, createdBy, COALESCE(reviewedAt, processedAt, updatedAt, createdAt) AS linkedAt FROM IntegrationEvents WHERE relatedRecordType IS NOT NULL AND relatedRecordId IS NOT NULL'
      );
      const supported = new Set(['TASK', 'NOTICE', 'REQUEST', 'NOTE']);
      const rows = events.filter(event => supported.has(String(event.relatedRecordType).toUpperCase())).map(event => ({
        eventId: event.id,
        wineryId: event.wineryId,
        itemType: String(event.relatedRecordType).toUpperCase(),
        itemId: event.relatedRecordId,
        itemKey: 'legacy-primary',
        linkType: 'LINKED',
        createdBy: event.reviewedBy || event.createdBy || null,
        createdAt: event.linkedAt || new Date()
      }));
      if (rows.length > 0) {
        await queryInterface.bulkInsert('IntegrationEventItems', rows, { ignoreDuplicates: true });
      }
    }
  },

  async down(queryInterface) {
    if (await hasTable(queryInterface, 'IntegrationEventItems')) {
      await queryInterface.dropTable('IntegrationEventItems');
    }
  }
};
