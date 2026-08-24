const { UniqueConstraintError } = require('sequelize');
const models = require('../models');
const { ValidationError, NotFoundError } = require('../utils/errors');
const {
  CANONICAL_RESOURCE_TYPES,
  OPERATIONAL_RESOURCE_ITEM_TYPES,
  OPERATIONAL_RESOURCE_LINK_TYPES,
  includesRegistryValue
} = require('./integrationDataRegistry.service');

const ITEM_MODEL_NAMES = Object.freeze({
  TASK: 'Task',
  NOTICE: 'Notice',
  REQUEST: 'OperationalRequest',
  NOTE: 'OperationalRecord',
  PROJECT: 'Project',
  CALENDAR_EVENT: 'CalendarEvent'
});

const RESOURCE_MODEL_NAMES = Object.freeze({
  CUSTOMER: 'Member',
  BOOKING: 'Booking',
  WINE_CLUB_MEMBERSHIP: 'WineClubMembership',
  WINE_CLUB_ALLOCATION: 'WineClubAllocation',
  SALES_ORDER: 'SalesOrder',
  SHIPMENT: 'Shipment',
  WINERY_PRODUCT: 'WineryProduct',
  ROSTER_SHIFT: 'RosterShift'
});

const normalizeType = (registry, value, fieldName) => {
  const normalized = String(value || '').trim().toUpperCase();
  if (!includesRegistryValue(registry, normalized)) throw new ValidationError(`${fieldName} is not supported`);
  return normalized;
};

const positiveId = (value, fieldName) => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new ValidationError(`${fieldName} must be a positive integer`);
  return id;
};

const requireTenantRecord = async ({ model, id, wineryId, label, transaction }) => {
  if (!model) throw new ValidationError(`${label} is not available in the current canonical schema`);
  const record = await model.findOne({ where: { id, wineryId }, attributes: ['id'], transaction });
  if (!record) throw new NotFoundError(`${label} was not found in this winery`);
};

async function createOperationalResourceLink({
  wineryId,
  itemType,
  itemId,
  resourceType,
  resourceId,
  linkType,
  automationRuleId = null,
  automationRunId = null,
  sourceEventId = null,
  metadata = null,
  createdBy = null,
  transaction: externalTransaction = null
}) {
  const normalizedItemType = normalizeType(OPERATIONAL_RESOURCE_ITEM_TYPES, itemType, 'itemType');
  const normalizedResourceType = normalizeType(CANONICAL_RESOURCE_TYPES, resourceType, 'resourceType');
  const normalizedLinkType = normalizeType(OPERATIONAL_RESOURCE_LINK_TYPES, linkType, 'linkType');
  const normalizedItemId = positiveId(itemId, 'itemId');
  const normalizedResourceId = positiveId(resourceId, 'resourceId');

  const operation = async transaction => {
    await requireTenantRecord({
      model: models[ITEM_MODEL_NAMES[normalizedItemType]],
      id: normalizedItemId,
      wineryId,
      label: normalizedItemType,
      transaction
    });
    await requireTenantRecord({
      model: models[RESOURCE_MODEL_NAMES[normalizedResourceType]],
      id: normalizedResourceId,
      wineryId,
      label: normalizedResourceType,
      transaction
    });
    for (const [id, model, label] of [
      [automationRuleId, models.AutomationRule, 'Automation rule'],
      [automationRunId, models.AutomationRun, 'Automation run'],
      [sourceEventId, models.IntegrationEvent, 'Source event'],
      [createdBy, models.User, 'Creator']
    ]) {
      if (id != null) await requireTenantRecord({ model, id: positiveId(id, label), wineryId, label, transaction });
    }

    const values = {
      wineryId,
      itemType: normalizedItemType,
      itemId: normalizedItemId,
      resourceType: normalizedResourceType,
      resourceId: normalizedResourceId,
      linkType: normalizedLinkType,
      automationRuleId,
      automationRunId,
      sourceEventId,
      metadata,
      createdBy
    };
    const duplicateWhere = {
      wineryId,
      itemType: normalizedItemType,
      itemId: normalizedItemId,
      resourceType: normalizedResourceType,
      resourceId: normalizedResourceId,
      linkType: normalizedLinkType
    };
    const existing = await models.OperationalResourceLink.findOne({ where: duplicateWhere, transaction });
    if (existing) return { link: existing, duplicate: true };
    try {
      return { link: await models.OperationalResourceLink.create(values, { transaction }), duplicate: false };
    } catch (error) {
      if (error instanceof UniqueConstraintError || error.name === 'SequelizeUniqueConstraintError') {
        const duplicate = await models.OperationalResourceLink.findOne({ where: duplicateWhere, transaction });
        if (duplicate) return { link: duplicate, duplicate: true };
      }
      throw error;
    }
  };

  if (externalTransaction) return operation(externalTransaction);
  return models.sequelize.transaction(operation);
}

module.exports = {
  createOperationalResourceLink,
  ITEM_MODEL_NAMES,
  RESOURCE_MODEL_NAMES
};
