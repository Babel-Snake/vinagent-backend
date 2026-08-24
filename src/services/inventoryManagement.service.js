const { Op } = require('sequelize');
const models = require('../models');
const { NotFoundError, ValidationError } = require('../utils/errors');
const inventoryProjectionService = require('./inventoryProjection.service');

const pagination = (result, page, pageSize) => ({
  page,
  pageSize,
  total: result.count,
  totalPages: Math.ceil(result.count / pageSize)
});

async function requireActor({ wineryId, actorUserId, transaction }) {
  const actor = await models.User.findOne({
    where: { id: actorUserId, wineryId },
    attributes: ['id'],
    transaction
  });
  if (!actor) throw new ValidationError('Inventory catalogue actor does not belong to the winery');
}

async function createProductVariant({ wineryId, actorUserId, data }) {
  return models.sequelize.transaction(async transaction => {
    await requireActor({ wineryId, actorUserId, transaction });
    const product = await models.WineryProduct.findOne({
      where: { id: data.wineryProductId, wineryId },
      attributes: ['id'],
      transaction
    });
    if (!product) throw new ValidationError('Product variant parent product does not belong to the winery');
    if (data.isDefault) {
      await models.ProductVariant.update({ isDefault: false, updatedBy: actorUserId }, {
        where: { wineryId, wineryProductId: data.wineryProductId, isDefault: true },
        transaction
      });
    }
    try {
      return await models.ProductVariant.create({
        ...data,
        wineryId,
        provenance: 'MANAGER_CREATED',
        createdBy: actorUserId,
        updatedBy: actorUserId
      }, { transaction });
    } catch (error) {
      if (error.name === 'SequelizeUniqueConstraintError') {
        throw new ValidationError('Product variant code already exists in this winery');
      }
      throw error;
    }
  });
}

async function listProductVariants({ wineryId, page = 1, pageSize = 25, includeInactive = false, wineryProductId }) {
  const where = { wineryId };
  if (!includeInactive) where.isActive = true;
  if (wineryProductId) where.wineryProductId = wineryProductId;
  const result = await models.ProductVariant.findAndCountAll({
    where,
    include: [{ association: 'WineryProduct', attributes: ['id', 'name', 'category', 'vintage', 'isActive'] }],
    order: [['name', 'ASC'], ['id', 'ASC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
    distinct: true
  });
  return { productVariants: result.rows, pagination: pagination(result, page, pageSize) };
}

async function createStockLocation({ wineryId, actorUserId, data }) {
  return models.sequelize.transaction(async transaction => {
    await requireActor({ wineryId, actorUserId, transaction });
    if (data.wineryLocationId) {
      const location = await models.WineryLocation.findOne({
        where: { id: data.wineryLocationId, wineryId },
        attributes: ['id'],
        transaction
      });
      if (!location) throw new ValidationError('Stock location venue does not belong to the winery');
    }
    if (data.isDefault && !data.wineryLocationId) {
      throw new ValidationError('A default stock location requires a wineryLocationId');
    }
    if (data.isDefault) {
      await models.StockLocation.update({ isDefault: false, updatedBy: actorUserId }, {
        where: { wineryId, wineryLocationId: data.wineryLocationId, isDefault: true },
        transaction
      });
    }
    try {
      return await models.StockLocation.create({
        ...data,
        wineryId,
        provenance: 'MANAGER_CREATED',
        createdBy: actorUserId,
        updatedBy: actorUserId
      }, { transaction });
    } catch (error) {
      if (error.name === 'SequelizeUniqueConstraintError') {
        throw new ValidationError('Stock location code already exists in this winery');
      }
      throw error;
    }
  });
}

async function listStockLocations({ wineryId, page = 1, pageSize = 25, includeInactive = false, wineryLocationId }) {
  const where = { wineryId };
  if (!includeInactive) where.isActive = true;
  if (wineryLocationId) where.wineryLocationId = wineryLocationId;
  const result = await models.StockLocation.findAndCountAll({
    where,
    include: [{ association: 'WineryLocation', attributes: ['id', 'code', 'name', 'locationType', 'isActive'] }],
    order: [['name', 'ASC'], ['id', 'ASC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
    distinct: true
  });
  return { stockLocations: result.rows, pagination: pagination(result, page, pageSize) };
}

function inventoryPositionWhere({ wineryId, productVariantId, stockLocationId, freshness, now = new Date() }) {
  const where = { wineryId };
  if (productVariantId) where.productVariantId = productVariantId;
  if (stockLocationId) where.stockLocationId = stockLocationId;
  if (freshness === 'FRESH') {
    where.staleAt = { [Op.gt]: now };
    where.deletedAtSource = null;
    where.qualityState = { [Op.in]: ['SOURCE_ASSERTED', 'MANAGER_CONFIRMED'] };
  } else if (freshness === 'STALE') {
    where.staleAt = { [Op.lte]: now };
  } else if (freshness === 'CONFLICTING') {
    where.qualityState = 'CONFLICTING';
  } else if (freshness === 'DELETED') {
    where.deletedAtSource = { [Op.ne]: null };
  }
  return where;
}

const positionIncludes = () => [
  { association: 'ProductVariant', attributes: ['id', 'code', 'name', 'sku', 'unitOfMeasure', 'isActive'] },
  { association: 'StockLocation', attributes: ['id', 'code', 'name', 'locationType', 'isActive'] },
  { association: 'AuthorityConnection', attributes: ['id', 'connectionKey', 'providerKey', 'status'] },
  { association: 'PrimarySourceReference', attributes: ['id', 'externalId', 'providerVersion', 'providerUpdatedAt', 'resolutionStatus'] }
];

function publicPosition(row, now = new Date()) {
  const plain = row.toJSON();
  delete plain.providerExtensions;
  plain.freshnessStatus = plain.deletedAtSource
    ? 'DELETED'
    : (plain.qualityState === 'CONFLICTING'
      ? 'CONFLICTING'
      : (new Date(plain.staleAt) <= new Date(now) ? 'STALE' : 'FRESH'));
  return plain;
}

async function listInventoryPositions({
  wineryId,
  page = 1,
  pageSize = 25,
  productVariantId,
  stockLocationId,
  freshness = 'ALL',
  now = new Date()
}) {
  const result = await models.InventoryPosition.findAndCountAll({
    where: inventoryPositionWhere({ wineryId, productVariantId, stockLocationId, freshness, now }),
    include: positionIncludes(),
    order: [['staleAt', 'ASC'], ['id', 'ASC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
    distinct: true
  });
  return {
    inventoryPositions: result.rows.map(row => publicPosition(row, now)),
    pagination: pagination(result, page, pageSize),
    evaluatedAt: new Date(now)
  };
}

async function getInventoryPosition({ wineryId, inventoryPositionId, snapshotLimit = 25, now = new Date() }) {
  const position = await models.InventoryPosition.findOne({
    where: { id: inventoryPositionId, wineryId },
    include: positionIncludes()
  });
  if (!position) throw new NotFoundError('Inventory position not found');
  const [snapshots, availability] = await Promise.all([
    models.InventorySnapshot.findAll({
      where: { wineryId, inventoryPositionId },
      order: [['observedAt', 'DESC'], ['id', 'DESC']],
      limit: snapshotLimit
    }),
    inventoryProjectionService.calculateAvailableToPromise({
      wineryId,
      productVariantId: position.productVariantId,
      stockLocationId: position.stockLocationId,
      requiredAt: now,
      now
    })
  ]);
  return {
    inventoryPosition: publicPosition(position, now),
    snapshots,
    availability
  };
}

async function listInventoryCommitments({
  wineryId,
  page = 1,
  pageSize = 25,
  productVariantId,
  stockLocationId,
  sourceType,
  sourceId,
  status = 'ALL'
}) {
  const where = { wineryId };
  if (productVariantId) where.productVariantId = productVariantId;
  if (stockLocationId) where.stockLocationId = stockLocationId;
  if (sourceType) where.sourceType = sourceType;
  if (sourceId) where.sourceId = sourceId;
  if (status !== 'ALL') where.status = status;
  const result = await models.InventoryCommitment.findAndCountAll({
    where,
    include: [
      { association: 'ProductVariant', attributes: ['id', 'code', 'name', 'sku', 'unitOfMeasure'] },
      { association: 'StockLocation', attributes: ['id', 'code', 'name', 'locationType'] }
    ],
    order: [['requiredAt', 'ASC'], ['id', 'ASC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
    distinct: true
  });
  return { inventoryCommitments: result.rows, pagination: pagination(result, page, pageSize) };
}

module.exports = {
  createProductVariant,
  listProductVariants,
  createStockLocation,
  listStockLocations,
  listInventoryPositions,
  getInventoryPosition,
  listInventoryCommitments,
  calculateAvailableToPromise: inventoryProjectionService.calculateAvailableToPromise
};
