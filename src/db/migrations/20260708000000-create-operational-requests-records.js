'use strict';

async function hasTable(queryInterface, tableName) {
  const expected = String(tableName).toLowerCase();
  return (await queryInterface.showAllTables()).some(table => {
    const name = typeof table === 'object' ? table.tableName || table.name : table;
    return String(name).toLowerCase() === expected;
  });
}

const timestamps = Sequelize => ({
  createdAt: { allowNull: false, type: Sequelize.DATE },
  updatedAt: { allowNull: false, type: Sequelize.DATE }
});

const userReference = Sequelize => ({
  type: Sequelize.INTEGER,
  allowNull: true,
  references: { model: 'Users', key: 'id' },
  onUpdate: 'CASCADE',
  onDelete: 'SET NULL'
});

const requiredUserReference = Sequelize => ({
  type: Sequelize.INTEGER,
  allowNull: false,
  references: { model: 'Users', key: 'id' },
  onUpdate: 'CASCADE',
  onDelete: 'RESTRICT'
});

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await hasTable(queryInterface, 'OperationalRequests'))) {
      await queryInterface.createTable('OperationalRequests', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        title: { type: Sequelize.STRING, allowNull: false },
        body: { type: Sequelize.TEXT, allowNull: false },
        originalText: { type: Sequelize.TEXT, allowNull: true },
        subtype: { type: Sequelize.STRING, allowNull: true },
        status: { type: Sequelize.ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'), allowNull: false, defaultValue: 'PENDING' },
        priority: { type: Sequelize.ENUM('low', 'normal', 'high'), allowNull: false, defaultValue: 'normal' },
        response: { type: Sequelize.TEXT, allowNull: true },
        dueAt: { type: Sequelize.DATE, allowNull: true },
        decidedAt: { type: Sequelize.DATE, allowNull: true },
        sourceType: { type: Sequelize.ENUM('MANUAL', 'INTEGRATION', 'AI'), allowNull: false, defaultValue: 'MANUAL' },
        areaScope: { type: Sequelize.ENUM('ORGANISATION', 'AREAS'), allowNull: false, defaultValue: 'ORGANISATION' },
        aiSuggestedType: { type: Sequelize.ENUM('TASK', 'NOTICE', 'REQUEST', 'NOTE'), allowNull: true },
        aiConfidence: { type: Sequelize.DECIMAL(5, 4), allowNull: true },
        aiSuggestion: { type: Sequelize.JSON, allowNull: true },
        humanConfirmedType: { type: Sequelize.ENUM('TASK', 'NOTICE', 'REQUEST', 'NOTE'), allowNull: false, defaultValue: 'REQUEST' },
        wineryId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'Wineries', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        requestedFromUserId: userReference(Sequelize),
        decisionBy: userReference(Sequelize),
        confirmedBy: requiredUserReference(Sequelize),
        confirmedAt: { type: Sequelize.DATE, allowNull: false },
        sourceEventId: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'IntegrationEvents', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        createdBy: requiredUserReference(Sequelize),
        updatedBy: requiredUserReference(Sequelize),
        ...timestamps(Sequelize)
      });
      await queryInterface.addIndex('OperationalRequests', ['wineryId', 'status', 'createdAt'], { name: 'operational_requests_winery_status_created' });
      await queryInterface.addIndex('OperationalRequests', ['wineryId', 'areaScope'], { name: 'operational_requests_winery_scope' });
      await queryInterface.addIndex('OperationalRequests', ['wineryId', 'requestedFromUserId', 'status'], { name: 'operational_requests_target_status' });
    }

    if (!(await hasTable(queryInterface, 'OperationalRecords'))) {
      await queryInterface.createTable('OperationalRecords', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        title: { type: Sequelize.STRING, allowNull: false },
        body: { type: Sequelize.TEXT, allowNull: false },
        originalText: { type: Sequelize.TEXT, allowNull: true },
        recordType: { type: Sequelize.STRING, allowNull: true },
        sourceType: { type: Sequelize.ENUM('MANUAL', 'INTEGRATION', 'AI'), allowNull: false, defaultValue: 'MANUAL' },
        sourceReference: { type: Sequelize.STRING, allowNull: true },
        occurredAt: { type: Sequelize.DATE, allowNull: false },
        metadata: { type: Sequelize.JSON, allowNull: true },
        areaScope: { type: Sequelize.ENUM('ORGANISATION', 'AREAS'), allowNull: false, defaultValue: 'ORGANISATION' },
        aiSuggestedType: { type: Sequelize.ENUM('TASK', 'NOTICE', 'REQUEST', 'NOTE'), allowNull: true },
        aiConfidence: { type: Sequelize.DECIMAL(5, 4), allowNull: true },
        aiSuggestion: { type: Sequelize.JSON, allowNull: true },
        humanConfirmedType: { type: Sequelize.ENUM('TASK', 'NOTICE', 'REQUEST', 'NOTE'), allowNull: false, defaultValue: 'NOTE' },
        wineryId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'Wineries', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        memberId: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'Members', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        confirmedBy: requiredUserReference(Sequelize),
        confirmedAt: { type: Sequelize.DATE, allowNull: false },
        sourceEventId: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'IntegrationEvents', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        createdBy: requiredUserReference(Sequelize),
        updatedBy: requiredUserReference(Sequelize),
        ...timestamps(Sequelize)
      });
      await queryInterface.addIndex('OperationalRecords', ['wineryId', 'occurredAt'], { name: 'operational_records_winery_occurred' });
      await queryInterface.addIndex('OperationalRecords', ['wineryId', 'areaScope'], { name: 'operational_records_winery_scope' });
      await queryInterface.addIndex('OperationalRecords', ['wineryId', 'memberId', 'occurredAt'], { name: 'operational_records_member_occurred' });
    }

    if (!(await hasTable(queryInterface, 'OperationalRequestAreas'))) {
      await queryInterface.createTable('OperationalRequestAreas', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        relationshipType: { type: Sequelize.ENUM('PRIMARY', 'LINKED'), allowNull: false, defaultValue: 'LINKED' },
        wineryId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        requestId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'OperationalRequests', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        areaId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'OperationalAreas', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        ...timestamps(Sequelize)
      });
      await queryInterface.addIndex('OperationalRequestAreas', ['requestId', 'areaId'], { unique: true, name: 'operational_request_areas_request_area_unique' });
      await queryInterface.addIndex('OperationalRequestAreas', ['wineryId', 'areaId', 'requestId'], { name: 'operational_request_areas_winery_area_request' });
    }

    if (!(await hasTable(queryInterface, 'OperationalRecordAreas'))) {
      await queryInterface.createTable('OperationalRecordAreas', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        relationshipType: { type: Sequelize.ENUM('PRIMARY', 'LINKED'), allowNull: false, defaultValue: 'LINKED' },
        wineryId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        recordId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'OperationalRecords', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        areaId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'OperationalAreas', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        ...timestamps(Sequelize)
      });
      await queryInterface.addIndex('OperationalRecordAreas', ['recordId', 'areaId'], { unique: true, name: 'operational_record_areas_record_area_unique' });
      await queryInterface.addIndex('OperationalRecordAreas', ['wineryId', 'areaId', 'recordId'], { name: 'operational_record_areas_winery_area_record' });
    }

    if (!(await hasTable(queryInterface, 'OperationalItemAuditEvents'))) {
      await queryInterface.createTable('OperationalItemAuditEvents', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        itemType: { type: Sequelize.ENUM('REQUEST', 'NOTE'), allowNull: false },
        itemId: { type: Sequelize.INTEGER, allowNull: false },
        eventType: { type: Sequelize.ENUM('CREATED', 'UPDATED', 'APPROVED', 'REJECTED', 'CANCELLED'), allowNull: false },
        beforeSnapshot: { type: Sequelize.JSON, allowNull: true },
        afterSnapshot: { type: Sequelize.JSON, allowNull: true },
        metadata: { type: Sequelize.JSON, allowNull: true },
        wineryId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        actorUserId: requiredUserReference(Sequelize),
        createdAt: { allowNull: false, type: Sequelize.DATE }
      });
      await queryInterface.addIndex('OperationalItemAuditEvents', ['wineryId', 'itemType', 'itemId', 'createdAt'], { name: 'operational_item_audit_item_created' });
      await queryInterface.addIndex('OperationalItemAuditEvents', ['wineryId', 'actorUserId', 'createdAt'], { name: 'operational_item_audit_actor_created' });
    }
  },

  async down(queryInterface) {
    for (const tableName of [
      'OperationalItemAuditEvents',
      'OperationalRecordAreas',
      'OperationalRequestAreas',
      'OperationalRecords',
      'OperationalRequests'
    ]) {
      if (await hasTable(queryInterface, tableName)) await queryInterface.dropTable(tableName);
    }
  }
};
