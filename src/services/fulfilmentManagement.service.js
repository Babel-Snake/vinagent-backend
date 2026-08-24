const { Op } = require('sequelize');
const models = require('../models');
const { NotFoundError } = require('../utils/errors');

const includes = () => [
  { association: 'Member', attributes: ['id', 'firstName', 'lastName'] },
  { association: 'SalesOrder', attributes: ['id', 'orderNumber', 'canonicalStatus', 'fulfilmentStatus'] },
  { association: 'WineClubAllocation', attributes: ['id', 'cycleCode', 'canonicalStatus'] },
  { association: 'AuthorityConnection', attributes: ['id', 'connectionKey', 'providerKey', 'status'] },
  {
    association: 'PrimarySourceReference',
    attributes: ['id', 'providerVersion', 'providerUpdatedAt', 'observedAt', 'resolutionStatus']
  }
];

function publicShipment(record) {
  const plain = record.toJSON();
  delete plain.providerExtensions;
  delete plain.trackingReferenceHash;
  plain.trackingReferenceDisplay = plain.trackingReferenceLast4
    ? `••••${plain.trackingReferenceLast4}`
    : null;
  plain.Items = (plain.Items || []).map(item => {
    delete item.providerExtensions;
    return item;
  });
  return plain;
}

function publicPackage(record) {
  const plain = record.toJSON();
  delete plain.providerExtensions;
  delete plain.trackingReferenceHash;
  plain.trackingReferenceDisplay = plain.trackingReferenceLast4
    ? `••••${plain.trackingReferenceLast4}`
    : null;
  return plain;
}

async function listShipments({
  wineryId,
  page = 1,
  pageSize = 25,
  status = 'ALL',
  memberId,
  salesOrderId,
  wineClubAllocationId,
  connectionId,
  exceptionOnly = false,
  from,
  to
}) {
  const where = { wineryId };
  if (status !== 'ALL') where.canonicalStatus = status;
  if (memberId) where.memberId = memberId;
  if (salesOrderId) where.salesOrderId = salesOrderId;
  if (wineClubAllocationId) where.wineClubAllocationId = wineClubAllocationId;
  if (connectionId) where.authorityConnectionId = connectionId;
  if (exceptionOnly) where.latestExceptionCategory = { [Op.notIn]: ['NONE'] };
  if (from && to) where.estimatedDeliveryAt = { [Op.gte]: from, [Op.lt]: to };
  const result = await models.Shipment.findAndCountAll({
    where,
    include: includes(),
    order: [['latestTrackingOccurredAt', 'DESC'], ['id', 'DESC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
    distinct: true
  });
  return {
    shipments: result.rows.map(publicShipment),
    pagination: {
      page,
      pageSize,
      total: result.count,
      totalPages: Math.ceil(result.count / pageSize)
    }
  };
}

async function getShipment({ wineryId, shipmentId }) {
  const shipment = await models.Shipment.findOne({
    where: { id: shipmentId, wineryId },
    include: [
      ...includes(),
      {
        association: 'Packages',
        include: [{ association: 'Items', required: false }]
      },
      {
        association: 'Items',
        include: [
          { association: 'ProductVariant', attributes: ['id', 'code', 'name', 'sku', 'unitOfMeasure'] },
          { association: 'SalesOrderLine', attributes: ['id', 'lineKey', 'description', 'quantity', 'unit'] }
        ]
      },
      {
        association: 'TrackingEvents',
        include: [{ association: 'Package', attributes: ['id', 'packageKey'] }]
      }
    ],
    order: [
      [{ model: models.ShipmentPackage, as: 'Packages' }, 'id', 'ASC'],
      [{ model: models.ShipmentItem, as: 'Items' }, 'id', 'ASC'],
      [{ model: models.ShipmentTrackingEvent, as: 'TrackingEvents' }, 'occurredAt', 'DESC'],
      [{ model: models.ShipmentTrackingEvent, as: 'TrackingEvents' }, 'id', 'DESC']
    ]
  });
  if (!shipment) throw new NotFoundError('Shipment not found');
  const plain = publicShipment(shipment);
  plain.Packages = (shipment.Packages || []).map(publicPackage);
  plain.Items = (plain.Items || []).map(item => {
    delete item.providerExtensions;
    return item;
  });
  return plain;
}

module.exports = {
  publicShipment,
  publicPackage,
  listShipments,
  getShipment
};
