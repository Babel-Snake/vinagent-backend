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

const wineryReference = () => ({
  type: null,
  allowNull: false,
  references: { model: 'Wineries', key: 'id' },
  onUpdate: 'CASCADE',
  onDelete: 'CASCADE'
});

module.exports = {
  async up(queryInterface, Sequelize) {
    const wineryId = { ...wineryReference(), type: Sequelize.INTEGER };
    const memberId = {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: { model: 'Members', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    };
    const externalReference = {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'ExternalResourceReferences', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    };
    const timestamps = {
      createdAt: { allowNull: false, type: Sequelize.DATE },
      updatedAt: { allowNull: false, type: Sequelize.DATE }
    };

    if (!(await hasTable(queryInterface, 'CustomerContactPoints'))) {
      await queryInterface.createTable('CustomerContactPoints', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId,
        memberId,
        contactType: { type: Sequelize.STRING(24), allowNull: false },
        normalizedValue: { type: Sequelize.STRING(320), allowNull: false },
        displayValue: { type: Sequelize.STRING(320), allowNull: false },
        verificationStatus: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'UNKNOWN' },
        verifiedAt: { type: Sequelize.DATE, allowNull: true },
        isPrimary: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        isValid: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        validFrom: { type: Sequelize.DATE, allowNull: true },
        validTo: { type: Sequelize.DATE, allowNull: true },
        suppressedAt: { type: Sequelize.DATE, allowNull: true },
        suppressionReason: { type: Sequelize.STRING(160), allowNull: true },
        sourceReferenceId: externalReference,
        sourceKind: { type: Sequelize.STRING(80), allowNull: false },
        sourceKey: { type: Sequelize.STRING(180), allowNull: false },
        ...timestamps
      });
    }
    await ensureIndex(queryInterface, 'CustomerContactPoints', ['wineryId', 'memberId', 'contactType', 'normalizedValue'], {
      unique: true,
      name: 'customer_contact_points_unique_value'
    });
    await ensureIndex(queryInterface, 'CustomerContactPoints', ['wineryId', 'sourceKey'], {
      unique: true,
      name: 'customer_contact_points_unique_source'
    });
    await ensureIndex(queryInterface, 'CustomerContactPoints', ['wineryId', 'contactType', 'normalizedValue', 'isValid'], {
      name: 'customer_contact_points_identity_lookup'
    });
    await ensureIndex(queryInterface, 'CustomerContactPoints', ['wineryId', 'memberId', 'isPrimary'], {
      name: 'customer_contact_points_member'
    });

    if (!(await hasTable(queryInterface, 'CustomerAddresses'))) {
      await queryInterface.createTable('CustomerAddresses', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: { ...wineryReference(), type: Sequelize.INTEGER },
        memberId: { ...memberId },
        addressType: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'PRIMARY' },
        fingerprint: { type: Sequelize.STRING(64), allowNull: false },
        addressLine1: { type: Sequelize.STRING, allowNull: true },
        addressLine2: { type: Sequelize.STRING, allowNull: true },
        suburb: { type: Sequelize.STRING(120), allowNull: true },
        state: { type: Sequelize.STRING(120), allowNull: true },
        postcode: { type: Sequelize.STRING(24), allowNull: true },
        country: { type: Sequelize.STRING(120), allowNull: true },
        isPrimary: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        isValid: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        validFrom: { type: Sequelize.DATE, allowNull: true },
        validTo: { type: Sequelize.DATE, allowNull: true },
        sourceReferenceId: { ...externalReference },
        sourceKind: { type: Sequelize.STRING(80), allowNull: false },
        sourceKey: { type: Sequelize.STRING(180), allowNull: false },
        ...timestamps
      });
    }
    await ensureIndex(queryInterface, 'CustomerAddresses', ['wineryId', 'memberId', 'fingerprint'], {
      unique: true,
      name: 'customer_addresses_unique_fingerprint'
    });
    await ensureIndex(queryInterface, 'CustomerAddresses', ['wineryId', 'sourceKey'], {
      unique: true,
      name: 'customer_addresses_unique_source'
    });
    await ensureIndex(queryInterface, 'CustomerAddresses', ['wineryId', 'memberId', 'isPrimary', 'isValid'], {
      name: 'customer_addresses_member'
    });

    if (!(await hasTable(queryInterface, 'CustomerConsents'))) {
      await queryInterface.createTable('CustomerConsents', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: { ...wineryReference(), type: Sequelize.INTEGER },
        memberId: { ...memberId },
        channel: { type: Sequelize.STRING(40), allowNull: false },
        purpose: { type: Sequelize.STRING(80), allowNull: false },
        state: { type: Sequelize.STRING(40), allowNull: false },
        effectiveAt: { type: Sequelize.DATE, allowNull: false },
        expiresAt: { type: Sequelize.DATE, allowNull: true },
        collectionSource: { type: Sequelize.STRING(120), allowNull: false },
        evidenceReferenceId: { ...externalReference },
        supersedesConsentId: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'CustomerConsents', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        recordedBy: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'Users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        sourceKey: { type: Sequelize.STRING(180), allowNull: false },
        metadata: { type: Sequelize.JSON, allowNull: true },
        createdAt: { allowNull: false, type: Sequelize.DATE }
      });
    }
    await ensureIndex(queryInterface, 'CustomerConsents', ['wineryId', 'sourceKey'], {
      unique: true,
      name: 'customer_consents_unique_source'
    });
    await ensureIndex(queryInterface, 'CustomerConsents', ['wineryId', 'memberId', 'channel', 'purpose', 'effectiveAt'], {
      name: 'customer_consents_timeline'
    });
    await ensureIndex(queryInterface, 'CustomerConsents', ['supersedesConsentId'], {
      name: 'customer_consents_supersedes'
    });

    if (!(await hasTable(queryInterface, 'CustomerLifecycleMilestones'))) {
      await queryInterface.createTable('CustomerLifecycleMilestones', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: { ...wineryReference(), type: Sequelize.INTEGER },
        memberId: { ...memberId },
        milestoneKey: { type: Sequelize.STRING(120), allowNull: false },
        occurredAt: { type: Sequelize.DATE, allowNull: false },
        sourceType: { type: Sequelize.STRING(120), allowNull: false },
        sourceId: { type: Sequelize.INTEGER, allowNull: true },
        sourceReferenceId: { ...externalReference },
        derivationType: { type: Sequelize.STRING(40), allowNull: false },
        derivationVersion: { type: Sequelize.STRING(40), allowNull: false },
        sourceKey: { type: Sequelize.STRING(180), allowNull: false },
        metadata: { type: Sequelize.JSON, allowNull: true },
        ...timestamps
      });
    }
    await ensureIndex(queryInterface, 'CustomerLifecycleMilestones', ['wineryId', 'sourceKey'], {
      unique: true,
      name: 'customer_lifecycle_milestones_unique_source'
    });
    await ensureIndex(queryInterface, 'CustomerLifecycleMilestones', ['wineryId', 'memberId', 'milestoneKey', 'occurredAt'], {
      name: 'customer_lifecycle_milestones_timeline'
    });
  },

  async down(queryInterface) {
    for (const tableName of [
      'CustomerLifecycleMilestones',
      'CustomerConsents',
      'CustomerAddresses',
      'CustomerContactPoints'
    ]) {
      if (await hasTable(queryInterface, tableName)) await queryInterface.dropTable(tableName);
    }
  }
};
