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
    if (!(await hasTable(queryInterface, 'SalesOrders'))) {
      await queryInterface.createTable('SalesOrders', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: reference(Sequelize, 'Wineries'),
        memberId: reference(Sequelize, 'Members', true, 'SET NULL'),
        locationId: reference(Sequelize, 'WineryLocations', true, 'SET NULL'),
        primarySourceReferenceId: reference(Sequelize, 'ExternalResourceReferences', false, 'RESTRICT'),
        authorityConnectionId: reference(Sequelize, 'IntegrationConnections', false, 'RESTRICT'),
        customerResolutionStatus: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'UNRESOLVED' },
        canonicalStatus: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'UNKNOWN' },
        providerStatus: { type: Sequelize.STRING(120), allowNull: true },
        orderNumber: { type: Sequelize.STRING(255), allowNull: false },
        sourceChannel: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'UNKNOWN' },
        paymentStatus: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'UNKNOWN' },
        fulfilmentStatus: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'UNKNOWN' },
        placedAt: { type: Sequelize.DATE, allowNull: true },
        paidAt: { type: Sequelize.DATE, allowNull: true },
        cancelledAt: { type: Sequelize.DATE, allowNull: true },
        fulfilledAt: { type: Sequelize.DATE, allowNull: true },
        currency: { type: Sequelize.STRING(3), allowNull: true },
        subtotalMinor: { type: Sequelize.INTEGER, allowNull: true },
        discountMinor: { type: Sequelize.INTEGER, allowNull: true },
        taxMinor: { type: Sequelize.INTEGER, allowNull: true },
        shippingMinor: { type: Sequelize.INTEGER, allowNull: true },
        totalMinor: { type: Sequelize.INTEGER, allowNull: true },
        paidMinor: { type: Sequelize.INTEGER, allowNull: true },
        refundedMinor: { type: Sequelize.INTEGER, allowNull: true },
        outstandingMinor: { type: Sequelize.INTEGER, allowNull: true },
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
    await ensureIndex(queryInterface, 'SalesOrders', ['primarySourceReferenceId'], {
      unique: true,
      name: 'sales_orders_unique_source'
    });
    await ensureIndex(queryInterface, 'SalesOrders', ['authorityConnectionId', 'orderNumber'], {
      unique: true,
      name: 'sales_orders_unique_connection_number'
    });
    await ensureIndex(queryInterface, 'SalesOrders', ['wineryId', 'canonicalStatus', 'placedAt'], {
      name: 'sales_orders_status_placed'
    });
    await ensureIndex(queryInterface, 'SalesOrders', ['wineryId', 'memberId', 'placedAt'], {
      name: 'sales_orders_member_placed'
    });
    await ensureIndex(queryInterface, 'SalesOrders', ['wineryId', 'paymentStatus', 'fulfilmentStatus'], {
      name: 'sales_orders_attention'
    });

    if (!(await hasTable(queryInterface, 'SalesOrderLines'))) {
      await queryInterface.createTable('SalesOrderLines', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: reference(Sequelize, 'Wineries'),
        salesOrderId: reference(Sequelize, 'SalesOrders'),
        wineryProductId: reference(Sequelize, 'WineryProducts', true, 'SET NULL'),
        productVariantId: { type: Sequelize.INTEGER, allowNull: true },
        productResolutionStatus: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'UNRESOLVED' },
        lineKey: { type: Sequelize.STRING(160), allowNull: false },
        lineType: { type: Sequelize.STRING(40), allowNull: false },
        providerSku: { type: Sequelize.STRING(160), allowNull: true },
        description: { type: Sequelize.STRING(255), allowNull: false },
        quantity: { type: Sequelize.DECIMAL(12, 3), allowNull: false },
        fulfilledQuantity: { type: Sequelize.DECIMAL(12, 3), allowNull: false, defaultValue: 0 },
        refundedQuantity: { type: Sequelize.DECIMAL(12, 3), allowNull: false, defaultValue: 0 },
        unit: { type: Sequelize.STRING(40), allowNull: false },
        currency: { type: Sequelize.STRING(3), allowNull: true },
        unitPriceMinor: { type: Sequelize.INTEGER, allowNull: true },
        discountMinor: { type: Sequelize.INTEGER, allowNull: true },
        taxMinor: { type: Sequelize.INTEGER, allowNull: true },
        totalMinor: { type: Sequelize.INTEGER, allowNull: true },
        providerExtensions: { type: Sequelize.JSON, allowNull: true },
        ...timestamps(Sequelize)
      });
    }
    await ensureIndex(queryInterface, 'SalesOrderLines', ['salesOrderId', 'lineKey'], {
      unique: true,
      name: 'sales_order_lines_unique_line'
    });
    await ensureIndex(queryInterface, 'SalesOrderLines', ['wineryId', 'providerSku'], {
      name: 'sales_order_lines_sku'
    });
    await ensureIndex(queryInterface, 'SalesOrderLines', ['wineryId', 'wineryProductId'], {
      name: 'sales_order_lines_product'
    });
    await ensureIndex(queryInterface, 'SalesOrderLines', ['wineryId', 'productVariantId'], {
      name: 'sales_order_lines_variant'
    });

    if (!(await hasTable(queryInterface, 'PaymentSummaryEvents'))) {
      await queryInterface.createTable('PaymentSummaryEvents', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: reference(Sequelize, 'Wineries'),
        salesOrderId: reference(Sequelize, 'SalesOrders'),
        eventKey: { type: Sequelize.STRING(180), allowNull: false },
        eventType: { type: Sequelize.STRING(40), allowNull: false },
        canonicalStatus: { type: Sequelize.STRING(40), allowNull: false },
        providerTransactionReference: { type: Sequelize.STRING(255), allowNull: true },
        paymentMethodClass: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'UNKNOWN' },
        amountMinor: { type: Sequelize.INTEGER, allowNull: true },
        currency: { type: Sequelize.STRING(3), allowNull: true },
        effectiveAt: { type: Sequelize.DATE, allowNull: false },
        failureCategory: { type: Sequelize.STRING(120), allowNull: true },
        sourceReferenceId: reference(Sequelize, 'ExternalResourceReferences', true, 'SET NULL'),
        sourceEventId: reference(Sequelize, 'IntegrationEvents', true, 'SET NULL'),
        sourceHash: { type: Sequelize.STRING(64), allowNull: false },
        metadata: { type: Sequelize.JSON, allowNull: true },
        createdAt: { allowNull: false, type: Sequelize.DATE }
      });
    }
    await ensureIndex(queryInterface, 'PaymentSummaryEvents', ['salesOrderId', 'eventKey'], {
      unique: true,
      name: 'payment_summary_events_unique'
    });
    await ensureIndex(queryInterface, 'PaymentSummaryEvents', ['wineryId', 'canonicalStatus', 'effectiveAt'], {
      name: 'payment_summary_events_attention'
    });

    if (!(await hasTable(queryInterface, 'RefundSummaries'))) {
      await queryInterface.createTable('RefundSummaries', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: reference(Sequelize, 'Wineries'),
        salesOrderId: reference(Sequelize, 'SalesOrders'),
        salesOrderLineId: reference(Sequelize, 'SalesOrderLines', true, 'SET NULL'),
        primarySourceReferenceId: reference(Sequelize, 'ExternalResourceReferences', false, 'RESTRICT'),
        authorityConnectionId: reference(Sequelize, 'IntegrationConnections', false, 'RESTRICT'),
        canonicalStatus: { type: Sequelize.STRING(40), allowNull: false },
        providerStatus: { type: Sequelize.STRING(120), allowNull: true },
        providerTransactionReference: { type: Sequelize.STRING(255), allowNull: true },
        amountMinor: { type: Sequelize.INTEGER, allowNull: false },
        currency: { type: Sequelize.STRING(3), allowNull: false },
        reasonCategory: { type: Sequelize.STRING(120), allowNull: true },
        requestedAt: { type: Sequelize.DATE, allowNull: true },
        effectiveAt: { type: Sequelize.DATE, allowNull: false },
        completedAt: { type: Sequelize.DATE, allowNull: true },
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
    await ensureIndex(queryInterface, 'RefundSummaries', ['primarySourceReferenceId'], {
      unique: true,
      name: 'refund_summaries_unique_source'
    });
    await ensureIndex(queryInterface, 'RefundSummaries', ['wineryId', 'canonicalStatus', 'effectiveAt'], {
      name: 'refund_summaries_attention'
    });
    await ensureIndex(queryInterface, 'RefundSummaries', ['salesOrderId', 'salesOrderLineId'], {
      name: 'refund_summaries_order_line'
    });
  },

  async down(queryInterface) {
    for (const tableName of ['RefundSummaries', 'PaymentSummaryEvents', 'SalesOrderLines', 'SalesOrders']) {
      if (await hasTable(queryInterface, tableName)) await queryInterface.dropTable(tableName);
    }
  }
};
