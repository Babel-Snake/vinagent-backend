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
    if (!(await hasTable(queryInterface, 'IntegrationCredentials'))) {
      await queryInterface.createTable('IntegrationCredentials', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        credentialId: { type: Sequelize.STRING(36), allowNull: false },
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
        credentialType: { type: Sequelize.STRING(40), allowNull: false },
        status: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'ACTIVE' },
        schemaVersion: { type: Sequelize.STRING(40), allowNull: false, defaultValue: '1' },
        encryptedPayload: { type: Sequelize.TEXT, allowNull: true },
        initializationVector: { type: Sequelize.STRING(64), allowNull: true },
        authenticationTag: { type: Sequelize.STRING(64), allowNull: true },
        keyId: { type: Sequelize.STRING(80), allowNull: false },
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
        rotatedAt: { type: Sequelize.DATE, allowNull: true },
        revokedAt: { type: Sequelize.DATE, allowNull: true },
        lastUsedAt: { type: Sequelize.DATE, allowNull: true },
        lastVerifiedAt: { type: Sequelize.DATE, allowNull: true },
        lastVerificationStatus: { type: Sequelize.STRING(40), allowNull: true },
        lastVerificationErrorCode: { type: Sequelize.STRING(120), allowNull: true },
        createdAt: { allowNull: false, type: Sequelize.DATE },
        updatedAt: { allowNull: false, type: Sequelize.DATE }
      });
    }

    await ensureIndex(queryInterface, 'IntegrationCredentials', ['credentialId'], {
      unique: true,
      name: 'integration_credentials_unique_reference'
    });
    await ensureIndex(queryInterface, 'IntegrationCredentials', ['wineryId', 'connectionId', 'status'], {
      name: 'integration_credentials_connection_status'
    });
    await ensureIndex(queryInterface, 'IntegrationCredentials', ['wineryId', 'lastVerifiedAt'], {
      name: 'integration_credentials_verification'
    });
  },

  async down(queryInterface) {
    if (await hasTable(queryInterface, 'IntegrationCredentials')) {
      await queryInterface.dropTable('IntegrationCredentials');
    }
  }
};
