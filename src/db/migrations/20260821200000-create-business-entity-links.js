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

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await hasTable(queryInterface, 'BusinessEntityLinks'))) {
      await queryInterface.createTable('BusinessEntityLinks', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: reference(Sequelize, 'Wineries'),
        linkKey: { type: Sequelize.STRING(64), allowNull: false },
        sourceType: { type: Sequelize.STRING(120), allowNull: false },
        sourceId: { type: Sequelize.INTEGER, allowNull: false },
        targetType: { type: Sequelize.STRING(120), allowNull: false },
        targetId: { type: Sequelize.INTEGER, allowNull: false },
        relationshipType: { type: Sequelize.STRING(120), allowNull: false },
        confirmationStatus: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'UNREVIEWED' },
        confidence: { type: Sequelize.DECIMAL(5, 4), allowNull: true },
        isActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        validFrom: { type: Sequelize.DATE, allowNull: false },
        validTo: { type: Sequelize.DATE, allowNull: true },
        createdBy: reference(Sequelize, 'Users', true, 'SET NULL'),
        confirmedBy: reference(Sequelize, 'Users', true, 'SET NULL'),
        confirmedAt: { type: Sequelize.DATE, allowNull: true },
        invalidatedBy: reference(Sequelize, 'Users', true, 'SET NULL'),
        invalidatedAt: { type: Sequelize.DATE, allowNull: true },
        invalidationReason: { type: Sequelize.TEXT, allowNull: true },
        createdAt: { allowNull: false, type: Sequelize.DATE },
        updatedAt: { allowNull: false, type: Sequelize.DATE }
      });
    }
    await ensureIndex(queryInterface, 'BusinessEntityLinks', ['wineryId', 'linkKey'], {
      unique: true,
      name: 'business_entity_links_unique_key'
    });
    await ensureIndex(queryInterface, 'BusinessEntityLinks', ['wineryId', 'sourceType', 'sourceId', 'isActive'], {
      name: 'business_entity_links_source'
    });
    await ensureIndex(queryInterface, 'BusinessEntityLinks', ['wineryId', 'targetType', 'targetId', 'isActive'], {
      name: 'business_entity_links_target'
    });
    await ensureIndex(queryInterface, 'BusinessEntityLinks', ['wineryId', 'relationshipType', 'confirmationStatus'], {
      name: 'business_entity_links_review'
    });

    if (!(await hasTable(queryInterface, 'BusinessEntityLinkEvidence'))) {
      await queryInterface.createTable('BusinessEntityLinkEvidence', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: reference(Sequelize, 'Wineries'),
        businessEntityLinkId: reference(Sequelize, 'BusinessEntityLinks'),
        evidenceKey: { type: Sequelize.STRING(180), allowNull: false },
        derivationType: { type: Sequelize.STRING(40), allowNull: false },
        derivationVersion: { type: Sequelize.STRING(120), allowNull: true },
        evidenceSummary: { type: Sequelize.STRING(1000), allowNull: false },
        evidenceHash: { type: Sequelize.STRING(64), allowNull: false },
        confidence: { type: Sequelize.DECIMAL(5, 4), allowNull: true },
        sourceConnectionId: reference(Sequelize, 'IntegrationConnections', true, 'SET NULL'),
        sourceEventId: reference(Sequelize, 'IntegrationEvents', true, 'SET NULL'),
        sourceReferenceId: reference(Sequelize, 'ExternalResourceReferences', true, 'SET NULL'),
        observedAt: { type: Sequelize.DATE, allowNull: false },
        metadata: { type: Sequelize.JSON, allowNull: true },
        createdBy: reference(Sequelize, 'Users', true, 'SET NULL'),
        createdAt: { allowNull: false, type: Sequelize.DATE }
      });
    }
    await ensureIndex(queryInterface, 'BusinessEntityLinkEvidence', ['businessEntityLinkId', 'evidenceKey'], {
      unique: true,
      name: 'business_entity_link_evidence_unique'
    });
    await ensureIndex(queryInterface, 'BusinessEntityLinkEvidence', ['wineryId', 'sourceReferenceId'], {
      name: 'business_entity_link_evidence_reference'
    });
    await ensureIndex(queryInterface, 'BusinessEntityLinkEvidence', ['wineryId', 'observedAt'], {
      name: 'business_entity_link_evidence_observed'
    });
  },

  async down(queryInterface) {
    if (await hasTable(queryInterface, 'BusinessEntityLinkEvidence')) {
      await queryInterface.dropTable('BusinessEntityLinkEvidence');
    }
    if (await hasTable(queryInterface, 'BusinessEntityLinks')) {
      await queryInterface.dropTable('BusinessEntityLinks');
    }
  }
};
