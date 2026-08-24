const { Op } = require('sequelize');
const models = require('../models');
const { NotFoundError } = require('../utils/errors');

const sourceReferenceInclude = connectionId => ({
  association: 'SourceReference',
  attributes: [
    'id',
    'connectionId',
    'providerVersion',
    'providerUpdatedAt',
    'observedAt',
    'resolutionStatus'
  ],
  required: Boolean(connectionId),
  where: connectionId ? { connectionId } : undefined,
  include: [{
    association: 'Connection',
    attributes: ['id', 'connectionKey', 'providerKey', 'displayName', 'status']
  }]
});

function publicDeliveryEvent(record) {
  const plain = record.toJSON();
  delete plain.sourceHash;
  return plain;
}

function publicMessage(record) {
  const plain = record.toJSON();
  return {
    id: plain.id,
    wineryId: plain.wineryId,
    memberId: plain.memberId,
    taskId: plain.taskId,
    source: plain.source,
    direction: plain.direction,
    receivedAt: plain.receivedAt,
    canonicalDeliveryStatus: plain.canonicalDeliveryStatus,
    deliveryStatusOccurredAt: plain.deliveryStatusOccurredAt,
    deliveryFailureCategory: plain.deliveryFailureCategory,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
    Member: plain.Member || null,
    DeliveryEvents: (plain.DeliveryEvents || []).map(event => {
      delete event.sourceHash;
      return event;
    })
  };
}

async function listMessageDeliveryEvents({
  wineryId,
  page = 1,
  pageSize = 50,
  messageId,
  connectionId,
  status = 'ALL',
  failureCategory = 'ALL',
  failuresOnly = false,
  from,
  to
}) {
  const where = { wineryId };
  if (messageId) where.messageId = messageId;
  if (status !== 'ALL') where.canonicalStatus = status;
  if (failureCategory !== 'ALL') where.failureCategory = failureCategory;
  if (failuresOnly) where.failureCategory = { [Op.ne]: 'NONE' };
  if (from || to) {
    where.occurredAt = {};
    if (from) where.occurredAt[Op.gte] = new Date(from);
    if (to) where.occurredAt[Op.lt] = new Date(to);
  }
  const result = await models.MessageDeliveryEvent.findAndCountAll({
    where,
    include: [
      {
        association: 'Message',
        attributes: [
          'id',
          'memberId',
          'taskId',
          'source',
          'direction',
          'canonicalDeliveryStatus',
          'deliveryStatusOccurredAt',
          'deliveryFailureCategory'
        ]
      },
      sourceReferenceInclude(connectionId)
    ],
    order: [['occurredAt', 'DESC'], ['id', 'DESC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
    distinct: true
  });
  return {
    messageDeliveryEvents: result.rows.map(publicDeliveryEvent),
    pagination: {
      page,
      pageSize,
      total: result.count,
      totalPages: Math.ceil(result.count / pageSize)
    }
  };
}

async function getMessageDeliveryHistory({ wineryId, messageId }) {
  const message = await models.Message.findOne({
    where: { id: messageId, wineryId },
    attributes: [
      'id',
      'wineryId',
      'memberId',
      'taskId',
      'source',
      'direction',
      'receivedAt',
      'canonicalDeliveryStatus',
      'deliveryStatusOccurredAt',
      'deliveryFailureCategory',
      'createdAt',
      'updatedAt'
    ],
    include: [
      { association: 'Member', attributes: ['id', 'firstName', 'lastName'] },
      {
        association: 'DeliveryEvents',
        include: [sourceReferenceInclude()],
        separate: true,
        order: [['occurredAt', 'DESC'], ['id', 'DESC']]
      }
    ]
  });
  if (!message) throw new NotFoundError('Message not found');
  return { message: publicMessage(message) };
}

module.exports = {
  publicDeliveryEvent,
  publicMessage,
  listMessageDeliveryEvents,
  getMessageDeliveryHistory
};
