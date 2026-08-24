const models = require('../models');
const { NotFoundError, ValidationError } = require('../utils/errors');
const {
  CANONICAL_RESOURCE_TYPES,
  includesRegistryValue
} = require('./integrationDataRegistry.service');

const RESOURCE_MODEL_NAMES = Object.freeze({
  CUSTOMER: 'Member',
  BOOKING: 'Booking',
  WINE_CLUB_MEMBERSHIP: 'WineClubMembership',
  WINE_CLUB_ALLOCATION: 'WineClubAllocation',
  SALES_ORDER: 'SalesOrder',
  PRODUCT_VARIANT: 'ProductVariant',
  STOCK_LOCATION: 'StockLocation',
  INVENTORY_POSITION: 'InventoryPosition',
  INVENTORY_COMMITMENT: 'InventoryCommitment',
  SHIPMENT: 'Shipment',
  STAFF_IDENTITY: 'StaffIdentity',
  WINERY_PRODUCT: 'WineryProduct',
  ROSTER_SHIFT: 'RosterShift',
  MESSAGE: 'Message'
});

function normalizeResourceType(value, fieldName = 'resourceType') {
  const normalized = String(value || '').trim().toUpperCase();
  if (!includesRegistryValue(CANONICAL_RESOURCE_TYPES, normalized)) {
    throw new ValidationError(fieldName + ' is not supported');
  }
  if (!RESOURCE_MODEL_NAMES[normalized]) {
    throw new ValidationError(fieldName + ' is not available in the current canonical schema');
  }
  return normalized;
}

function positiveId(value, fieldName = 'resourceId') {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new ValidationError(fieldName + ' must be a positive integer');
  }
  return id;
}

async function requireCanonicalResource({
  wineryId,
  resourceType,
  resourceId,
  attributes = ['id'],
  transaction
}) {
  const normalizedType = normalizeResourceType(resourceType);
  const normalizedId = positiveId(resourceId);
  const model = models[RESOURCE_MODEL_NAMES[normalizedType]];
  const record = await model.findOne({
    where: { id: normalizedId, wineryId },
    attributes,
    transaction
  });
  if (!record) throw new NotFoundError(normalizedType + ' was not found in this winery');
  return { resourceType: normalizedType, resourceId: normalizedId, record };
}

module.exports = {
  RESOURCE_MODEL_NAMES,
  normalizeResourceType,
  positiveId,
  requireCanonicalResource
};
