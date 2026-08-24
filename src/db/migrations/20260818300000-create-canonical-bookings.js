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

const timestamps = Sequelize => ({
  createdAt: { allowNull: false, type: Sequelize.DATE },
  updatedAt: { allowNull: false, type: Sequelize.DATE }
});

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await hasTable(queryInterface, 'IntegrationDomainActivations'))) {
      await queryInterface.createTable('IntegrationDomainActivations', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: {
          type: Sequelize.INTEGER, allowNull: false,
          references: { model: 'Wineries', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE'
        },
        connectionId: {
          type: Sequelize.INTEGER, allowNull: false,
          references: { model: 'IntegrationConnections', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE'
        },
        domain: { type: Sequelize.STRING(80), allowNull: false },
        scopeKey: { type: Sequelize.STRING(180), allowNull: false, defaultValue: 'winery' },
        locationId: {
          type: Sequelize.INTEGER, allowNull: true,
          references: { model: 'WineryLocations', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL'
        },
        status: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'ACTIVE' },
        sourceWatermarkAt: { type: Sequelize.DATE, allowNull: false },
        activatedAt: { type: Sequelize.DATE, allowNull: false },
        activatedBy: {
          type: Sequelize.INTEGER, allowNull: true,
          references: { model: 'Users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL'
        },
        activationReason: { type: Sequelize.TEXT, allowNull: false },
        requestId: { type: Sequelize.STRING(36), allowNull: false },
        previewHash: { type: Sequelize.STRING(64), allowNull: false },
        previewSnapshot: { type: Sequelize.JSON, allowNull: false },
        authorityPolicyId: {
          type: Sequelize.INTEGER, allowNull: false,
          references: { model: 'DataAuthorityPolicies', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT'
        },
        disabledAt: { type: Sequelize.DATE, allowNull: true },
        disabledBy: {
          type: Sequelize.INTEGER, allowNull: true,
          references: { model: 'Users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL'
        },
        disabledReason: { type: Sequelize.TEXT, allowNull: true },
        ...timestamps(Sequelize)
      });
    }
    await ensureIndex(queryInterface, 'IntegrationDomainActivations', ['connectionId', 'domain', 'scopeKey'], {
      unique: true, name: 'integration_domain_activations_unique'
    });
    await ensureIndex(queryInterface, 'IntegrationDomainActivations', ['wineryId', 'requestId'], {
      unique: true, name: 'integration_domain_activations_request'
    });
    await ensureIndex(queryInterface, 'IntegrationDomainActivations', ['wineryId', 'domain', 'status'], {
      name: 'integration_domain_activations_status'
    });

    if (!(await hasTable(queryInterface, 'Bookings'))) {
      await queryInterface.createTable('Bookings', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: {
          type: Sequelize.INTEGER, allowNull: false,
          references: { model: 'Wineries', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE'
        },
        locationId: {
          type: Sequelize.INTEGER, allowNull: true,
          references: { model: 'WineryLocations', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL'
        },
        memberId: {
          type: Sequelize.INTEGER, allowNull: true,
          references: { model: 'Members', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL'
        },
        primaryBookingTypeId: {
          type: Sequelize.INTEGER, allowNull: true,
          references: { model: 'WineryBookingTypes', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL'
        },
        primarySourceReferenceId: {
          type: Sequelize.INTEGER, allowNull: false,
          references: { model: 'ExternalResourceReferences', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT'
        },
        authorityPolicyId: {
          type: Sequelize.INTEGER, allowNull: true,
          references: { model: 'DataAuthorityPolicies', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL'
        },
        authorityConnectionId: {
          type: Sequelize.INTEGER, allowNull: false,
          references: { model: 'IntegrationConnections', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT'
        },
        lastCanonicalEventId: {
          type: Sequelize.INTEGER, allowNull: true,
          references: { model: 'IntegrationEvents', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL'
        },
        canonicalStatus: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'UNKNOWN' },
        providerStatus: { type: Sequelize.STRING(80), allowNull: false },
        referenceCode: { type: Sequelize.STRING(255), allowNull: false },
        sourceChannel: { type: Sequelize.STRING(120), allowNull: false },
        startAt: { type: Sequelize.DATE, allowNull: false },
        endAt: { type: Sequelize.DATE, allowNull: true },
        sourceTimeZone: { type: Sequelize.STRING(80), allowNull: true },
        partySize: { type: Sequelize.INTEGER, allowNull: false },
        bookedAt: { type: Sequelize.DATE, allowNull: true },
        confirmedAt: { type: Sequelize.DATE, allowNull: true },
        cancelledAt: { type: Sequelize.DATE, allowNull: true },
        checkedInAt: { type: Sequelize.DATE, allowNull: true },
        completedAt: { type: Sequelize.DATE, allowNull: true },
        totalAmountCents: { type: Sequelize.INTEGER, allowNull: true },
        depositAmountCents: { type: Sequelize.INTEGER, allowNull: true },
        paymentStatus: { type: Sequelize.STRING(40), allowNull: true },
        currency: { type: Sequelize.STRING(3), allowNull: true },
        qualityState: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'SOURCE_ASSERTED' },
        authorityState: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'IMPLICIT_SINGLE_SOURCE' },
        authoritySourceOrder: { type: Sequelize.INTEGER, allowNull: true },
        projectionRevision: { type: Sequelize.STRING(120), allowNull: false },
        sourceUpdatedAt: { type: Sequelize.DATE, allowNull: false },
        sourceHash: { type: Sequelize.STRING(64), allowNull: false },
        resolvedAt: { type: Sequelize.DATE, allowNull: false },
        isSourceDeleted: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        providerExtensions: { type: Sequelize.JSON, allowNull: true },
        lockVersion: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        ...timestamps(Sequelize)
      });
    }
    await ensureIndex(queryInterface, 'Bookings', ['primarySourceReferenceId'], {
      unique: true, name: 'bookings_primary_source_unique'
    });
    await ensureIndex(queryInterface, 'Bookings', ['wineryId', 'canonicalStatus', 'startAt'], {
      name: 'bookings_winery_status_start'
    });
    await ensureIndex(queryInterface, 'Bookings', ['wineryId', 'locationId', 'startAt'], {
      name: 'bookings_location_start'
    });
    await ensureIndex(queryInterface, 'Bookings', ['wineryId', 'memberId', 'startAt'], {
      name: 'bookings_member_start'
    });
    await ensureIndex(queryInterface, 'Bookings', ['authorityConnectionId', 'sourceUpdatedAt'], {
      name: 'bookings_authority_source_date'
    });

    if (!(await hasTable(queryInterface, 'BookingAreaLinks'))) {
      await queryInterface.createTable('BookingAreaLinks', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: {
          type: Sequelize.INTEGER, allowNull: false,
          references: { model: 'Wineries', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE'
        },
        bookingId: {
          type: Sequelize.INTEGER, allowNull: false,
          references: { model: 'Bookings', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE'
        },
        areaId: {
          type: Sequelize.INTEGER, allowNull: false,
          references: { model: 'OperationalAreas', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE'
        },
        relationshipType: { type: Sequelize.STRING(40), allowNull: false },
        ...timestamps(Sequelize)
      });
    }
    await ensureIndex(queryInterface, 'BookingAreaLinks', ['bookingId', 'areaId', 'relationshipType'], {
      unique: true, name: 'booking_area_links_unique'
    });
    await ensureIndex(queryInterface, 'BookingAreaLinks', ['wineryId', 'areaId', 'relationshipType'], {
      name: 'booking_area_links_area'
    });

    if (!(await hasTable(queryInterface, 'BookingItems'))) {
      await queryInterface.createTable('BookingItems', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: {
          type: Sequelize.INTEGER, allowNull: false,
          references: { model: 'Wineries', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE'
        },
        bookingId: {
          type: Sequelize.INTEGER, allowNull: false,
          references: { model: 'Bookings', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE'
        },
        bookingTypeId: {
          type: Sequelize.INTEGER, allowNull: true,
          references: { model: 'WineryBookingTypes', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL'
        },
        itemKey: { type: Sequelize.STRING(255), allowNull: false },
        itemType: { type: Sequelize.STRING(40), allowNull: false },
        externalCode: { type: Sequelize.STRING(120), allowNull: true },
        description: { type: Sequelize.STRING(255), allowNull: false },
        quantity: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        unit: { type: Sequelize.STRING(40), allowNull: true },
        unitPriceCents: { type: Sequelize.INTEGER, allowNull: true },
        currency: { type: Sequelize.STRING(3), allowNull: true },
        fulfilmentStatus: { type: Sequelize.STRING(40), allowNull: true },
        sourceRevision: { type: Sequelize.STRING(255), allowNull: false },
        isActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        removedAt: { type: Sequelize.DATE, allowNull: true },
        ...timestamps(Sequelize)
      });
    }
    await ensureIndex(queryInterface, 'BookingItems', ['bookingId', 'itemKey'], {
      unique: true, name: 'booking_items_unique_key'
    });
    await ensureIndex(queryInterface, 'BookingItems', ['wineryId', 'itemType', 'externalCode', 'isActive'], {
      name: 'booking_items_operational_lookup'
    });

    if (!(await hasTable(queryInterface, 'BookingRequirements'))) {
      await queryInterface.createTable('BookingRequirements', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: {
          type: Sequelize.INTEGER, allowNull: false,
          references: { model: 'Wineries', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE'
        },
        bookingId: {
          type: Sequelize.INTEGER, allowNull: false,
          references: { model: 'Bookings', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE'
        },
        responsibleAreaId: {
          type: Sequelize.INTEGER, allowNull: true,
          references: { model: 'OperationalAreas', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL'
        },
        sourceReferenceId: {
          type: Sequelize.INTEGER, allowNull: false,
          references: { model: 'ExternalResourceReferences', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT'
        },
        requirementKey: { type: Sequelize.STRING(255), allowNull: false },
        kind: { type: Sequelize.STRING(40), allowNull: false },
        sourceKind: { type: Sequelize.STRING(40), allowNull: false },
        code: { type: Sequelize.STRING(120), allowNull: false },
        description: { type: Sequelize.STRING(255), allowNull: false },
        quantity: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        unit: { type: Sequelize.STRING(40), allowNull: true },
        importance: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'NORMAL' },
        fulfilmentStatus: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'UNCONFIRMED' },
        qualityState: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'SOURCE_ASSERTED' },
        sensitivityClass: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'OPERATIONAL' },
        sourceRevision: { type: Sequelize.STRING(255), allowNull: false },
        isActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        removedAt: { type: Sequelize.DATE, allowNull: true },
        ...timestamps(Sequelize)
      });
    }
    await ensureIndex(queryInterface, 'BookingRequirements', ['bookingId', 'requirementKey'], {
      unique: true, name: 'booking_requirements_unique_key'
    });
    await ensureIndex(queryInterface, 'BookingRequirements', ['wineryId', 'kind', 'code', 'isActive'], {
      name: 'booking_requirements_operational_lookup'
    });
    await ensureIndex(queryInterface, 'BookingRequirements', ['wineryId', 'sensitivityClass', 'isActive'], {
      name: 'booking_requirements_sensitivity'
    });

    if (!(await hasTable(queryInterface, 'BookingStatusEvents'))) {
      await queryInterface.createTable('BookingStatusEvents', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: {
          type: Sequelize.INTEGER, allowNull: false,
          references: { model: 'Wineries', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE'
        },
        bookingId: {
          type: Sequelize.INTEGER, allowNull: false,
          references: { model: 'Bookings', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE'
        },
        sourceEventId: {
          type: Sequelize.INTEGER, allowNull: false,
          references: { model: 'IntegrationEvents', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT'
        },
        eventKey: { type: Sequelize.STRING(120), allowNull: false },
        fromStatus: { type: Sequelize.STRING(40), allowNull: true },
        toStatus: { type: Sequelize.STRING(40), allowNull: false },
        providerStatus: { type: Sequelize.STRING(80), allowNull: false },
        sourceRevision: { type: Sequelize.STRING(255), allowNull: false },
        effectiveAt: { type: Sequelize.DATE, allowNull: false },
        reason: { type: Sequelize.STRING(255), allowNull: true },
        ...timestamps(Sequelize)
      });
    }
    await ensureIndex(queryInterface, 'BookingStatusEvents', ['bookingId', 'eventKey'], {
      unique: true, name: 'booking_status_events_unique_event'
    });
    await ensureIndex(queryInterface, 'BookingStatusEvents', ['wineryId', 'effectiveAt'], {
      name: 'booking_status_events_winery_date'
    });
  },

  async down(queryInterface) {
    for (const tableName of [
      'BookingStatusEvents',
      'BookingRequirements',
      'BookingItems',
      'BookingAreaLinks',
      'Bookings',
      'IntegrationDomainActivations'
    ]) {
      if (await hasTable(queryInterface, tableName)) await queryInterface.dropTable(tableName);
    }
  }
};
