const integrationEventService = require('../services/integrationEvent.service');
const {
  validate,
  integrationEventCreateSchema,
  integrationEventListSchema,
  integrationEventReviewSchema
} = require('../utils/validation');

async function listEvents(req, res, next) {
  try {
    const query = validate(integrationEventListSchema, req.query);
    const result = await integrationEventService.listIntegrationEvents({
      wineryId: req.user.wineryId,
      filters: {
        status: query.status,
        eventType: query.eventType,
        provider: query.provider,
        search: query.search
      },
      pagination: {
        page: query.page,
        pageSize: query.pageSize
      }
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getEvent(req, res, next) {
  try {
    const event = await integrationEventService.getIntegrationEventById({
      eventId: req.params.id,
      wineryId: req.user.wineryId
    });

    res.json({ event });
  } catch (err) {
    next(err);
  }
}

async function createEvent(req, res, next) {
  try {
    const data = validate(integrationEventCreateSchema, req.body);
    const result = await integrationEventService.createIntegrationEvent({
      wineryId: req.user.wineryId,
      userId: req.user.id,
      data
    });

    res.status(result.duplicate ? 200 : 201).json(result);
  } catch (err) {
    next(err);
  }
}

async function reviewEvent(req, res, next) {
  try {
    const data = validate(integrationEventReviewSchema, req.body);
    const result = await integrationEventService.reviewIntegrationEvent({
      eventId: req.params.id,
      wineryId: req.user.wineryId,
      userId: req.user.id,
      userRole: req.user.role,
      data
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listEvents,
  getEvent,
  createEvent,
  reviewEvent
};
