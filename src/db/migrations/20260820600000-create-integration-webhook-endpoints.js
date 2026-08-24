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

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await hasTable(queryInterface, 'IntegrationWebhookEndpoints'))) {
      await queryInterface.createTable('IntegrationWebhookEndpoints', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        endpointKey: { type: Sequelize.STRING(36), allowNull: false },
        wineryId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'Wineries', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        connectionId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'IntegrationConnections', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        domain: { type: Sequelize.STRING(40), allowNull: false },
        adapterKey: { type: Sequelize.STRING(120), allowNull: false },
        adapterVersion: { type: Sequelize.STRING(40), allowNull: false },
        status: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'ACTIVE' },
        verificationSchemaVersion: { type: Sequelize.STRING(40), allowNull: false, defaultValue: '1' },
        encryptedVerificationMaterial: { type: Sequelize.TEXT, allowNull: true },
        initializationVector: { type: Sequelize.STRING, allowNull: true },
        authenticationTag: { type: Sequelize.STRING, allowNull: true },
        keyId: { type: Sequelize.STRING(80), allowNull: false },
        configuration: { type: Sequelize.JSON, allowNull: true },
        rotatedAt: { type: Sequelize.DATE, allowNull: true },
        disabledAt: { type: Sequelize.DATE, allowNull: true },
        revokedAt: { type: Sequelize.DATE, allowNull: true },
        lastReceivedAt: { type: Sequelize.DATE, allowNull: true },
        lastVerifiedAt: { type: Sequelize.DATE, allowNull: true },
        lastErrorCode: { type: Sequelize.STRING(120), allowNull: true },
        createdBy: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'Users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        updatedBy: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'Users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        createdAt: { allowNull: false, type: Sequelize.DATE },
        updatedAt: { allowNull: false, type: Sequelize.DATE }
      });
    }
    await ensureIndex(queryInterface, 'IntegrationWebhookEndpoints', ['endpointKey'], {
      unique: true,
      name: 'integration_webhook_endpoints_unique_key'
    });
    await ensureIndex(
      queryInterface,
      'IntegrationWebhookEndpoints',
      ['wineryId', 'connectionId', 'domain', 'status'],
      { name: 'integration_webhook_endpoints_connection_domain_status' }
    );
    await ensureIndex(queryInterface, 'IntegrationWebhookEndpoints', ['wineryId', 'lastReceivedAt'], {
      name: 'integration_webhook_endpoints_last_received'
    });
  },

  async down(queryInterface) {
    if (await hasTable(queryInterface, 'IntegrationWebhookEndpoints')) {
      await queryInterface.dropTable('IntegrationWebhookEndpoints');
    }
  }
};
