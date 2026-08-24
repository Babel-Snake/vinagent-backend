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

async function backfillDefaultVariants(queryInterface) {
  const [products] = await queryInterface.sequelize.query(
    'SELECT id, wineryId, name FROM WineryProducts'
  );
  if (products.length === 0) return;
  const [existing] = await queryInterface.sequelize.query(
    'SELECT wineryProductId FROM ProductVariants WHERE wineryProductId IS NOT NULL AND isDefault = 1'
  );
  const existingIds = new Set(existing.map(row => Number(row.wineryProductId)));
  const now = new Date();
  const rows = products.filter(product => !existingIds.has(Number(product.id))).map(product => ({
    wineryId: product.wineryId,
    wineryProductId: product.id,
    code: `legacy-product-${product.id}`,
    name: product.name,
    sku: null,
    barcode: null,
    format: null,
    volume: null,
    volumeUnit: null,
    packSize: 1,
    unitOfMeasure: 'EACH',
    isSellable: true,
    isActive: true,
    isDefault: true,
    provenance: 'LEGACY_BACKFILL',
    createdBy: null,
    updatedBy: null,
    createdAt: now,
    updatedAt: now
  }));
  if (rows.length > 0) await queryInterface.bulkInsert('ProductVariants', rows);
}

async function backfillStockLocations(queryInterface) {
  const [locations] = await queryInterface.sequelize.query(
    'SELECT id, wineryId, name FROM WineryLocations'
  );
  if (locations.length === 0) return;
  const [existing] = await queryInterface.sequelize.query(
    'SELECT wineryLocationId FROM StockLocations WHERE wineryLocationId IS NOT NULL AND isDefault = 1'
  );
  const existingIds = new Set(existing.map(row => Number(row.wineryLocationId)));
  const now = new Date();
  const rows = locations.filter(location => !existingIds.has(Number(location.id))).map(location => ({
    wineryId: location.wineryId,
    wineryLocationId: location.id,
    code: `legacy-location-${location.id}`,
    name: location.name,
    locationType: 'GENERAL',
    isActive: true,
    isDefault: true,
    provenance: 'LEGACY_BACKFILL',
    createdBy: null,
    updatedBy: null,
    createdAt: now,
    updatedAt: now
  }));
  if (rows.length > 0) await queryInterface.bulkInsert('StockLocations', rows);
}

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await hasTable(queryInterface, 'ProductVariants'))) {
      await queryInterface.createTable('ProductVariants', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: reference(Sequelize, 'Wineries'),
        wineryProductId: reference(Sequelize, 'WineryProducts', false, 'RESTRICT'),
        code: { type: Sequelize.STRING(100), allowNull: false },
        name: { type: Sequelize.STRING(160), allowNull: false },
        sku: { type: Sequelize.STRING(160), allowNull: true },
        barcode: { type: Sequelize.STRING(160), allowNull: true },
        format: { type: Sequelize.STRING(80), allowNull: true },
        volume: { type: Sequelize.DECIMAL(12, 3), allowNull: true },
        volumeUnit: { type: Sequelize.STRING(40), allowNull: true },
        packSize: { type: Sequelize.DECIMAL(12, 3), allowNull: false, defaultValue: 1 },
        unitOfMeasure: { type: Sequelize.STRING(40), allowNull: false },
        isSellable: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        isActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        isDefault: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        provenance: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'MANAGER_CREATED' },
        createdBy: reference(Sequelize, 'Users', true, 'SET NULL'),
        updatedBy: reference(Sequelize, 'Users', true, 'SET NULL'),
        ...timestamps(Sequelize)
      });
    }
    await ensureIndex(queryInterface, 'ProductVariants', ['wineryId', 'code'], {
      unique: true, name: 'product_variants_unique_code'
    });
    await ensureIndex(queryInterface, 'ProductVariants', ['wineryId', 'sku'], {
      name: 'product_variants_sku'
    });
    await ensureIndex(queryInterface, 'ProductVariants', ['wineryProductId', 'isDefault'], {
      name: 'product_variants_product_default'
    });

    if (!(await hasTable(queryInterface, 'StockLocations'))) {
      await queryInterface.createTable('StockLocations', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: reference(Sequelize, 'Wineries'),
        wineryLocationId: reference(Sequelize, 'WineryLocations', true, 'SET NULL'),
        code: { type: Sequelize.STRING(100), allowNull: false },
        name: { type: Sequelize.STRING(160), allowNull: false },
        locationType: { type: Sequelize.STRING(80), allowNull: false, defaultValue: 'GENERAL' },
        isActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        isDefault: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        provenance: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'MANAGER_CREATED' },
        createdBy: reference(Sequelize, 'Users', true, 'SET NULL'),
        updatedBy: reference(Sequelize, 'Users', true, 'SET NULL'),
        ...timestamps(Sequelize)
      });
    }
    await ensureIndex(queryInterface, 'StockLocations', ['wineryId', 'code'], {
      unique: true, name: 'stock_locations_unique_code'
    });
    await ensureIndex(queryInterface, 'StockLocations', ['wineryLocationId', 'isDefault'], {
      name: 'stock_locations_winery_location_default'
    });

    await backfillDefaultVariants(queryInterface);
    await backfillStockLocations(queryInterface);

    if (!(await hasTable(queryInterface, 'InventoryPositions'))) {
      await queryInterface.createTable('InventoryPositions', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: reference(Sequelize, 'Wineries'),
        productVariantId: reference(Sequelize, 'ProductVariants', false, 'RESTRICT'),
        stockLocationId: reference(Sequelize, 'StockLocations', false, 'RESTRICT'),
        primarySourceReferenceId: reference(Sequelize, 'ExternalResourceReferences', false, 'RESTRICT'),
        authorityConnectionId: reference(Sequelize, 'IntegrationConnections', false, 'RESTRICT'),
        onHandQuantity: { type: Sequelize.DECIMAL(14, 3), allowNull: false },
        availableQuantity: { type: Sequelize.DECIMAL(14, 3), allowNull: false },
        reservedQuantity: { type: Sequelize.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
        incomingQuantity: { type: Sequelize.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
        damagedQuantity: { type: Sequelize.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
        heldQuantity: { type: Sequelize.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
        unit: { type: Sequelize.STRING(40), allowNull: false },
        incomingExpectedAt: { type: Sequelize.DATE, allowNull: true },
        sourceAssertedAt: { type: Sequelize.DATE, allowNull: false },
        sourceUpdatedAt: { type: Sequelize.DATE, allowNull: false },
        observedAt: { type: Sequelize.DATE, allowNull: false },
        staleAt: { type: Sequelize.DATE, allowNull: false },
        sourceRevision: { type: Sequelize.STRING(255), allowNull: false },
        sourceHash: { type: Sequelize.STRING(64), allowNull: false },
        authorityPolicyVersion: { type: Sequelize.STRING(120), allowNull: false },
        qualityState: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'SOURCE_ASSERTED' },
        deletedAtSource: { type: Sequelize.DATE, allowNull: true },
        providerExtensions: { type: Sequelize.JSON, allowNull: true },
        ...timestamps(Sequelize)
      });
    }
    await ensureIndex(queryInterface, 'InventoryPositions', ['wineryId', 'stockLocationId', 'productVariantId'], {
      unique: true, name: 'inventory_positions_unique_current'
    });
    await ensureIndex(queryInterface, 'InventoryPositions', ['primarySourceReferenceId'], {
      unique: true, name: 'inventory_positions_unique_source'
    });
    await ensureIndex(queryInterface, 'InventoryPositions', ['wineryId', 'staleAt', 'qualityState'], {
      name: 'inventory_positions_freshness'
    });

    if (!(await hasTable(queryInterface, 'InventorySnapshots'))) {
      await queryInterface.createTable('InventorySnapshots', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: reference(Sequelize, 'Wineries'),
        inventoryPositionId: reference(Sequelize, 'InventoryPositions'),
        productVariantId: reference(Sequelize, 'ProductVariants', false, 'RESTRICT'),
        stockLocationId: reference(Sequelize, 'StockLocations', false, 'RESTRICT'),
        sourceReferenceId: reference(Sequelize, 'ExternalResourceReferences', false, 'RESTRICT'),
        sourceEventId: reference(Sequelize, 'IntegrationEvents', true, 'SET NULL'),
        authorityConnectionId: reference(Sequelize, 'IntegrationConnections', false, 'RESTRICT'),
        snapshotKey: { type: Sequelize.STRING(180), allowNull: false },
        onHandQuantity: { type: Sequelize.DECIMAL(14, 3), allowNull: false },
        availableQuantity: { type: Sequelize.DECIMAL(14, 3), allowNull: false },
        reservedQuantity: { type: Sequelize.DECIMAL(14, 3), allowNull: false },
        incomingQuantity: { type: Sequelize.DECIMAL(14, 3), allowNull: false },
        damagedQuantity: { type: Sequelize.DECIMAL(14, 3), allowNull: false },
        heldQuantity: { type: Sequelize.DECIMAL(14, 3), allowNull: false },
        unit: { type: Sequelize.STRING(40), allowNull: false },
        incomingExpectedAt: { type: Sequelize.DATE, allowNull: true },
        sourceAssertedAt: { type: Sequelize.DATE, allowNull: false },
        sourceUpdatedAt: { type: Sequelize.DATE, allowNull: false },
        observedAt: { type: Sequelize.DATE, allowNull: false },
        staleAt: { type: Sequelize.DATE, allowNull: false },
        sourceRevision: { type: Sequelize.STRING(255), allowNull: false },
        sourceHash: { type: Sequelize.STRING(64), allowNull: false },
        authorityPolicyVersion: { type: Sequelize.STRING(120), allowNull: false },
        qualityState: { type: Sequelize.STRING(40), allowNull: false },
        createdAt: { allowNull: false, type: Sequelize.DATE }
      });
    }
    await ensureIndex(queryInterface, 'InventorySnapshots', ['inventoryPositionId', 'snapshotKey'], {
      unique: true, name: 'inventory_snapshots_unique_observation'
    });
    await ensureIndex(queryInterface, 'InventorySnapshots', ['wineryId', 'productVariantId', 'stockLocationId', 'observedAt'], {
      name: 'inventory_snapshots_history'
    });

    if (!(await hasTable(queryInterface, 'InventoryCommitments'))) {
      await queryInterface.createTable('InventoryCommitments', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        wineryId: reference(Sequelize, 'Wineries'),
        productVariantId: reference(Sequelize, 'ProductVariants', false, 'RESTRICT'),
        stockLocationId: reference(Sequelize, 'StockLocations', false, 'RESTRICT'),
        sourceType: { type: Sequelize.STRING(40), allowNull: false },
        sourceId: { type: Sequelize.INTEGER, allowNull: false },
        purposeKey: { type: Sequelize.STRING(180), allowNull: false },
        quantity: { type: Sequelize.DECIMAL(14, 3), allowNull: false },
        unit: { type: Sequelize.STRING(40), allowNull: false },
        requiredAt: { type: Sequelize.DATE, allowNull: false },
        status: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'EXPECTED' },
        confidence: { type: Sequelize.DECIMAL(5, 4), allowNull: false, defaultValue: 1 },
        derivation: { type: Sequelize.STRING(40), allowNull: false },
        derivationVersion: { type: Sequelize.STRING(120), allowNull: false },
        sourceReferenceId: reference(Sequelize, 'ExternalResourceReferences', true, 'SET NULL'),
        sourceEventId: reference(Sequelize, 'IntegrationEvents', true, 'SET NULL'),
        sourceUpdatedAt: { type: Sequelize.DATE, allowNull: false },
        observedAt: { type: Sequelize.DATE, allowNull: false },
        releasedAt: { type: Sequelize.DATE, allowNull: true },
        metadata: { type: Sequelize.JSON, allowNull: true },
        ...timestamps(Sequelize)
      });
    }
    await ensureIndex(queryInterface, 'InventoryCommitments', [
      'wineryId', 'sourceType', 'sourceId', 'productVariantId', 'stockLocationId', 'purposeKey'
    ], { unique: true, name: 'inventory_commitments_unique_demand' });
    await ensureIndex(queryInterface, 'InventoryCommitments', [
      'wineryId', 'productVariantId', 'stockLocationId', 'status', 'requiredAt'
    ], { name: 'inventory_commitments_atp' });
    await ensureIndex(queryInterface, 'InventoryCommitments', ['wineryId', 'sourceType', 'sourceId'], {
      name: 'inventory_commitments_source'
    });
  },

  async down(queryInterface) {
    for (const tableName of [
      'InventoryCommitments', 'InventorySnapshots', 'InventoryPositions', 'StockLocations', 'ProductVariants'
    ]) {
      if (await hasTable(queryInterface, tableName)) await queryInterface.dropTable(tableName);
    }
  }
};
