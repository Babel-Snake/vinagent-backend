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

const timestamps = Sequelize => ({
  createdAt: { allowNull: false, type: Sequelize.DATE },
  updatedAt: { allowNull: false, type: Sequelize.DATE }
});

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await hasTable(queryInterface, 'Shipments'))) {
      await queryInterface.createTable('Shipments', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: reference(Sequelize, 'Wineries'),
        memberId: reference(Sequelize, 'Members', true, 'SET NULL'),
        customerResolutionStatus: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'UNRESOLVED' },
        salesOrderId: reference(Sequelize, 'SalesOrders', true, 'SET NULL'),
        orderResolutionStatus: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'UNRESOLVED' },
        wineClubAllocationId: reference(Sequelize, 'WineClubAllocations', true, 'SET NULL'),
        allocationResolutionStatus: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'UNRESOLVED' },
        restrictedAddressId: reference(Sequelize, 'CustomerAddresses', true, 'SET NULL'),
        primarySourceReferenceId: reference(Sequelize, 'ExternalResourceReferences', false, 'RESTRICT'),
        authorityConnectionId: reference(Sequelize, 'IntegrationConnections', false, 'RESTRICT'),
        carrierKey: { type: Sequelize.STRING(120), allowNull: false },
        serviceLevel: { type: Sequelize.STRING(120), allowNull: true },
        trackingReferenceHash: { type: Sequelize.STRING(64), allowNull: true },
        trackingReferenceLast4: { type: Sequelize.STRING(4), allowNull: true },
        canonicalStatus: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'UNKNOWN' },
        providerStatus: { type: Sequelize.STRING(120), allowNull: true },
        promisedDeliveryAt: { type: Sequelize.DATE, allowNull: true },
        shippedAt: { type: Sequelize.DATE, allowNull: true },
        estimatedDeliveryAt: { type: Sequelize.DATE, allowNull: true },
        deliveredAt: { type: Sequelize.DATE, allowNull: true },
        returnedAt: { type: Sequelize.DATE, allowNull: true },
        latestTrackingOccurredAt: { type: Sequelize.DATE, allowNull: true },
        latestExceptionCategory: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'NONE' },
        latestExceptionCode: { type: Sequelize.STRING(120), allowNull: true },
        latestExceptionSummary: { type: Sequelize.STRING(255), allowNull: true },
        destinationCountry: { type: Sequelize.STRING(2), allowNull: true },
        destinationRegion: { type: Sequelize.STRING(80), allowNull: true },
        destinationPostcodePrefix: { type: Sequelize.STRING(4), allowNull: true },
        sourceRevision: { type: Sequelize.STRING(255), allowNull: false },
        sourceUpdatedAt: { type: Sequelize.DATE, allowNull: false },
        observedAt: { type: Sequelize.DATE, allowNull: false },
        sourceHash: { type: Sequelize.STRING(64), allowNull: false },
        projectionQuality: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'SOURCE_ASSERTED' },
        deletedAtSource: { type: Sequelize.DATE, allowNull: true },
        providerExtensions: { type: Sequelize.JSON, allowNull: true },
        ...timestamps(Sequelize)
      });
    }
    await ensureIndex(queryInterface, 'Shipments', ['primarySourceReferenceId'], {
      unique: true, name: 'shipments_unique_source'
    });
    await ensureIndex(queryInterface, 'Shipments', ['authorityConnectionId', 'trackingReferenceHash'], {
      unique: true, name: 'shipments_unique_tracking_reference'
    });
    await ensureIndex(queryInterface, 'Shipments', ['wineryId', 'canonicalStatus', 'estimatedDeliveryAt'], {
      name: 'shipments_status_delivery'
    });
    await ensureIndex(queryInterface, 'Shipments', ['wineryId', 'latestExceptionCategory', 'latestTrackingOccurredAt'], {
      name: 'shipments_exception_attention'
    });
    await ensureIndex(queryInterface, 'Shipments', ['wineryId', 'memberId', 'createdAt'], {
      name: 'shipments_member_history'
    });
    await ensureIndex(queryInterface, 'Shipments', ['wineryId', 'salesOrderId'], {
      name: 'shipments_order'
    });
    await ensureIndex(queryInterface, 'Shipments', ['wineryId', 'wineClubAllocationId'], {
      name: 'shipments_allocation'
    });

    if (!(await hasTable(queryInterface, 'ShipmentPackages'))) {
      await queryInterface.createTable('ShipmentPackages', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: reference(Sequelize, 'Wineries'),
        shipmentId: reference(Sequelize, 'Shipments'),
        packageKey: { type: Sequelize.STRING(160), allowNull: false },
        trackingReferenceHash: { type: Sequelize.STRING(64), allowNull: true },
        trackingReferenceLast4: { type: Sequelize.STRING(4), allowNull: true },
        packageType: { type: Sequelize.STRING(80), allowNull: true },
        weight: { type: Sequelize.DECIMAL(12, 3), allowNull: true },
        weightUnit: { type: Sequelize.STRING(20), allowNull: true },
        length: { type: Sequelize.DECIMAL(12, 3), allowNull: true },
        width: { type: Sequelize.DECIMAL(12, 3), allowNull: true },
        height: { type: Sequelize.DECIMAL(12, 3), allowNull: true },
        dimensionUnit: { type: Sequelize.STRING(20), allowNull: true },
        isActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        removedAt: { type: Sequelize.DATE, allowNull: true },
        providerExtensions: { type: Sequelize.JSON, allowNull: true },
        ...timestamps(Sequelize)
      });
    }
    await ensureIndex(queryInterface, 'ShipmentPackages', ['shipmentId', 'packageKey'], {
      unique: true, name: 'shipment_packages_unique_key'
    });
    await ensureIndex(queryInterface, 'ShipmentPackages', ['wineryId', 'trackingReferenceHash'], {
      name: 'shipment_packages_tracking'
    });

    if (!(await hasTable(queryInterface, 'ShipmentItems'))) {
      await queryInterface.createTable('ShipmentItems', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: reference(Sequelize, 'Wineries'),
        shipmentId: reference(Sequelize, 'Shipments'),
        packageId: reference(Sequelize, 'ShipmentPackages', true, 'SET NULL'),
        salesOrderLineId: reference(Sequelize, 'SalesOrderLines', true, 'SET NULL'),
        lineResolutionStatus: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'UNRESOLVED' },
        productVariantId: reference(Sequelize, 'ProductVariants', true, 'SET NULL'),
        productResolutionStatus: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'UNRESOLVED' },
        itemKey: { type: Sequelize.STRING(160), allowNull: false },
        providerSku: { type: Sequelize.STRING(160), allowNull: true },
        description: { type: Sequelize.STRING(255), allowNull: false },
        quantity: { type: Sequelize.DECIMAL(12, 3), allowNull: false },
        unit: { type: Sequelize.STRING(40), allowNull: false },
        isActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        removedAt: { type: Sequelize.DATE, allowNull: true },
        providerExtensions: { type: Sequelize.JSON, allowNull: true },
        ...timestamps(Sequelize)
      });
    }
    await ensureIndex(queryInterface, 'ShipmentItems', ['shipmentId', 'itemKey'], {
      unique: true, name: 'shipment_items_unique_key'
    });
    await ensureIndex(queryInterface, 'ShipmentItems', ['wineryId', 'productVariantId', 'isActive'], {
      name: 'shipment_items_variant'
    });
    await ensureIndex(queryInterface, 'ShipmentItems', ['wineryId', 'salesOrderLineId'], {
      name: 'shipment_items_order_line'
    });

    if (!(await hasTable(queryInterface, 'ShipmentTrackingEvents'))) {
      await queryInterface.createTable('ShipmentTrackingEvents', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: reference(Sequelize, 'Wineries'),
        shipmentId: reference(Sequelize, 'Shipments'),
        packageId: reference(Sequelize, 'ShipmentPackages', true, 'SET NULL'),
        sourceReferenceId: reference(Sequelize, 'ExternalResourceReferences', false, 'RESTRICT'),
        sourceEventId: reference(Sequelize, 'IntegrationEvents', true, 'SET NULL'),
        eventKey: { type: Sequelize.STRING(180), allowNull: false },
        canonicalCode: { type: Sequelize.STRING(40), allowNull: false },
        providerCode: { type: Sequelize.STRING(120), allowNull: true },
        description: { type: Sequelize.STRING(255), allowNull: true },
        occurredAt: { type: Sequelize.DATE, allowNull: false },
        locationSummary: { type: Sequelize.STRING(160), allowNull: true },
        exceptionCategory: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'NONE' },
        sourceHash: { type: Sequelize.STRING(64), allowNull: false },
        metadata: { type: Sequelize.JSON, allowNull: true },
        createdAt: { allowNull: false, type: Sequelize.DATE }
      });
    }
    await ensureIndex(queryInterface, 'ShipmentTrackingEvents', ['shipmentId', 'eventKey'], {
      unique: true, name: 'shipment_tracking_events_unique'
    });
    await ensureIndex(queryInterface, 'ShipmentTrackingEvents', ['wineryId', 'exceptionCategory', 'occurredAt'], {
      name: 'shipment_tracking_events_exception'
    });
    await ensureIndex(queryInterface, 'ShipmentTrackingEvents', ['shipmentId', 'occurredAt'], {
      name: 'shipment_tracking_events_timeline'
    });
  },

  async down(queryInterface) {
    for (const tableName of ['ShipmentTrackingEvents', 'ShipmentItems', 'ShipmentPackages', 'Shipments']) {
      if (await hasTable(queryInterface, tableName)) await queryInterface.dropTable(tableName);
    }
  }
};
