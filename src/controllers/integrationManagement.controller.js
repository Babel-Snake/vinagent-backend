const integrationManagementService = require('../services/integrationManagement.service');
const { listConfiguredIntegrationJobKinds } = require('../services/integrationJobHandlers.service');
const { getIntegrationWorkerConfig } = require('../services/integrationWorker.service');
const { ValidationError } = require('../utils/errors');
const { validate } = require('../utils/validation');
const schemas = require('../utils/integrationManagementValidation');

function positiveId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new ValidationError('Resource ID must be a positive integer');
  return id;
}

async function listConnections(req, res, next) {
  try {
    const query = validate(schemas.connectionListSchema, req.query);
    res.json(await integrationManagementService.listConnections({ wineryId: req.user.wineryId, ...query }));
  } catch (error) { next(error); }
}

async function getConnection(req, res, next) {
  try {
    const connection = await integrationManagementService.getConnection({
      wineryId: req.user.wineryId,
      connectionId: positiveId(req.params.id)
    });
    res.json({ connection });
  } catch (error) { next(error); }
}

async function createConnection(req, res, next) {
  try {
    const connection = await integrationManagementService.createConnection({
      wineryId: req.user.wineryId,
      userId: req.user.id,
      data: validate(schemas.connectionCreateSchema, req.body)
    });
    res.status(201).json({ connection });
  } catch (error) { next(error); }
}

async function updateConnection(req, res, next) {
  try {
    const connection = await integrationManagementService.updateConnection({
      wineryId: req.user.wineryId,
      userId: req.user.id,
      connectionId: positiveId(req.params.id),
      data: validate(schemas.connectionUpdateSchema, req.body)
    });
    res.json({ connection });
  } catch (error) { next(error); }
}

async function addConnectionScope(req, res, next) {
  try {
    const scope = await integrationManagementService.addConnectionScope({
      wineryId: req.user.wineryId,
      connectionId: positiveId(req.params.id),
      data: validate(schemas.connectionScopeSchema, req.body)
    });
    res.status(201).json({ scope });
  } catch (error) { next(error); }
}

async function deleteConnectionScope(req, res, next) {
  try {
    await integrationManagementService.deleteConnectionScope({
      wineryId: req.user.wineryId,
      connectionId: positiveId(req.params.id),
      scopeId: positiveId(req.params.scopeId)
    });
    res.json({ success: true });
  } catch (error) { next(error); }
}

async function listLocations(req, res, next) {
  try {
    res.json({ locations: await integrationManagementService.listLocations({ wineryId: req.user.wineryId }) });
  } catch (error) { next(error); }
}

async function createLocation(req, res, next) {
  try {
    const location = await integrationManagementService.createLocation({
      wineryId: req.user.wineryId,
      data: validate(schemas.locationCreateSchema, req.body)
    });
    res.status(201).json({ location });
  } catch (error) { next(error); }
}

async function updateLocation(req, res, next) {
  try {
    const location = await integrationManagementService.updateLocation({
      wineryId: req.user.wineryId,
      locationId: positiveId(req.params.id),
      data: validate(schemas.locationUpdateSchema, req.body)
    });
    res.json({ location });
  } catch (error) { next(error); }
}

async function addLocationAreaLink(req, res, next) {
  try {
    const link = await integrationManagementService.addLocationAreaLink({
      wineryId: req.user.wineryId,
      locationId: positiveId(req.params.id),
      userId: req.user.id,
      data: validate(schemas.locationAreaLinkSchema, req.body)
    });
    res.status(201).json({ link });
  } catch (error) { next(error); }
}

async function deleteLocationAreaLink(req, res, next) {
  try {
    await integrationManagementService.deleteLocationAreaLink({
      wineryId: req.user.wineryId,
      locationId: positiveId(req.params.id),
      linkId: positiveId(req.params.linkId)
    });
    res.json({ success: true });
  } catch (error) { next(error); }
}

async function listAuthorityPolicySets(req, res, next) {
  try {
    const query = validate(schemas.authorityPolicyListSchema, req.query);
    res.json(await integrationManagementService.listAuthorityPolicySets({ wineryId: req.user.wineryId, ...query }));
  } catch (error) { next(error); }
}

async function createAuthorityPolicyVersion(req, res, next) {
  try {
    const policy = await integrationManagementService.createAuthorityPolicyVersion({
      wineryId: req.user.wineryId,
      userId: req.user.id,
      data: validate(schemas.authorityPolicyCreateSchema, req.body)
    });
    res.status(201).json({ policy });
  } catch (error) { next(error); }
}

async function activateAuthorityPolicy(req, res, next) {
  try {
    const data = validate(schemas.authorityPolicyActivateSchema, req.body || {});
    const policy = await integrationManagementService.activateAuthorityPolicy({
      wineryId: req.user.wineryId,
      userId: req.user.id,
      policyId: positiveId(req.params.id),
      effectiveAt: data.effectiveAt
    });
    res.json({ policy });
  } catch (error) { next(error); }
}

async function listJobs(req, res, next) {
  try {
    const query = validate(schemas.jobListSchema, req.query);
    res.json(await integrationManagementService.listJobs({ wineryId: req.user.wineryId, ...query }));
  } catch (error) { next(error); }
}

async function listOutbox(req, res, next) {
  try {
    const query = validate(schemas.outboxListSchema, req.query);
    res.json(await integrationManagementService.listOutbox({ wineryId: req.user.wineryId, ...query }));
  } catch (error) { next(error); }
}

async function listSyncStreams(req, res, next) {
  try {
    const query = validate(schemas.syncStreamListSchema, req.query);
    res.json(await integrationManagementService.listSyncStreams({ wineryId: req.user.wineryId, ...query }));
  } catch (error) { next(error); }
}

async function pauseSyncStream(req, res, next) {
  try {
    const result = await integrationManagementService.pauseSyncStream({
      wineryId: req.user.wineryId,
      syncStateId: positiveId(req.params.id),
      userId: req.user.id,
      data: validate(schemas.integrationOperationCommandSchema, req.body)
    });
    res.status(result.duplicate ? 200 : 201).json(result);
  } catch (error) { next(error); }
}

async function resumeSyncStream(req, res, next) {
  try {
    const result = await integrationManagementService.resumeSyncStream({
      wineryId: req.user.wineryId,
      syncStateId: positiveId(req.params.id),
      userId: req.user.id,
      data: validate(schemas.integrationOperationCommandSchema, req.body)
    });
    res.status(result.duplicate ? 200 : 201).json(result);
  } catch (error) { next(error); }
}

async function cancelIntegrationJob(req, res, next) {
  try {
    const result = await integrationManagementService.cancelIntegrationJob({
      wineryId: req.user.wineryId,
      jobId: positiveId(req.params.id),
      userId: req.user.id,
      data: validate(schemas.integrationOperationCommandSchema, req.body)
    });
    res.status(result.duplicate ? 200 : 201).json(result);
  } catch (error) { next(error); }
}

async function replayIntegrationJob(req, res, next) {
  try {
    const result = await integrationManagementService.replayIntegrationJob({
      wineryId: req.user.wineryId,
      jobId: positiveId(req.params.id),
      userId: req.user.id,
      data: validate(schemas.integrationOperationCommandSchema, req.body),
      registeredJobKinds: listConfiguredIntegrationJobKinds()
    });
    res.status(result.duplicate ? 200 : 202).json(result);
  } catch (error) { next(error); }
}

async function replayOutboxEntry(req, res, next) {
  try {
    const result = await integrationManagementService.replayOutboxEntry({
      wineryId: req.user.wineryId,
      outboxId: positiveId(req.params.id),
      userId: req.user.id,
      data: validate(schemas.integrationOperationCommandSchema, req.body)
    });
    res.status(result.duplicate ? 200 : 202).json(result);
  } catch (error) { next(error); }
}

async function listOperationAuditEvents(req, res, next) {
  try {
    const query = validate(schemas.integrationOperationAuditListSchema, req.query);
    res.json(await integrationManagementService.listOperationAuditEvents({
      wineryId: req.user.wineryId,
      ...query
    }));
  } catch (error) { next(error); }
}

async function getRuntimeSummary(req, res, next) {
  try {
    res.json(await integrationManagementService.getRuntimeSummary({
      wineryId: req.user.wineryId,
      handlerRegistry: { list: listConfiguredIntegrationJobKinds },
      workerConfig: getIntegrationWorkerConfig()
    }));
  } catch (error) { next(error); }
}

async function listConnectorManifests(_req, res, next) {
  try {
    res.json({ connectors: integrationManagementService.listConnectorManifests() });
  } catch (error) { next(error); }
}

async function getConnectionCredential(req, res, next) {
  try {
    const credential = await integrationManagementService.getConnectionCredential({
      wineryId: req.user.wineryId,
      connectionId: positiveId(req.params.id)
    });
    res.json({ credential });
  } catch (error) { next(error); }
}

async function upsertConnectionCredential(req, res, next) {
  try {
    const credential = await integrationManagementService.upsertConnectionCredential({
      wineryId: req.user.wineryId,
      connectionId: positiveId(req.params.id),
      userId: req.user.id,
      data: validate(schemas.credentialUpsertSchema, req.body)
    });
    res.status(201).json({ credential });
  } catch (error) { next(error); }
}

async function revokeConnectionCredential(req, res, next) {
  try {
    const result = await integrationManagementService.revokeConnectionCredential({
      wineryId: req.user.wineryId,
      connectionId: positiveId(req.params.id),
      userId: req.user.id
    });
    res.json(result);
  } catch (error) { next(error); }
}

async function listWebhookEndpoints(req, res, next) {
  try {
    const endpoints = await integrationManagementService.listWebhookEndpoints({
      wineryId: req.user.wineryId,
      connectionId: positiveId(req.params.id)
    });
    res.json({ endpoints });
  } catch (error) { next(error); }
}

async function createWebhookEndpoint(req, res, next) {
  try {
    const result = await integrationManagementService.createWebhookEndpoint({
      wineryId: req.user.wineryId,
      connectionId: positiveId(req.params.id),
      userId: req.user.id,
      data: validate(schemas.webhookEndpointCreateSchema, req.body)
    });
    res.status(201).json(result);
  } catch (error) { next(error); }
}

async function rotateWebhookEndpoint(req, res, next) {
  try {
    const result = await integrationManagementService.rotateWebhookEndpoint({
      wineryId: req.user.wineryId,
      connectionId: positiveId(req.params.id),
      endpointId: positiveId(req.params.endpointId),
      userId: req.user.id
    });
    res.status(201).json(result);
  } catch (error) { next(error); }
}

async function updateWebhookEndpointLifecycle(req, res, next) {
  try {
    const endpoint = await integrationManagementService.updateWebhookEndpointLifecycle({
      wineryId: req.user.wineryId,
      connectionId: positiveId(req.params.id),
      endpointId: positiveId(req.params.endpointId),
      userId: req.user.id,
      data: validate(schemas.webhookEndpointLifecycleSchema, req.body)
    });
    res.json({ endpoint });
  } catch (error) { next(error); }
}

async function listWebhookAdapterManifests(_req, res, next) {
  try {
    res.json({ adapters: integrationManagementService.listWebhookAdapterManifests() });
  } catch (error) { next(error); }
}

async function previewLegacyIntegrationBackfill(req, res, next) {
  try {
    res.json(await integrationManagementService.previewLegacyIntegrationBackfill({
      wineryId: req.user.wineryId
    }));
  } catch (error) { next(error); }
}

async function applyLegacyIntegrationBackfill(req, res, next) {
  try {
    const result = await integrationManagementService.applyLegacyIntegrationBackfill({
      wineryId: req.user.wineryId,
      userId: req.user.id,
      data: validate(schemas.integrationOperationCommandSchema, req.body)
    });
    res.status(result.duplicate ? 200 : 201).json(result);
  } catch (error) { next(error); }
}

async function listLegacyIntegrationBackfillIssues(req, res, next) {
  try {
    const query = validate(schemas.compatibilityBackfillIssueListSchema, req.query);
    res.json(await integrationManagementService.listLegacyIntegrationBackfillIssues({
      wineryId: req.user.wineryId,
      ...query
    }));
  } catch (error) { next(error); }
}

async function listProjectionIssues(req, res, next) {
  try {
    const query = validate(schemas.projectionIssueListSchema, req.query);
    res.json(await integrationManagementService.listProjectionIssues({ wineryId: req.user.wineryId, ...query }));
  } catch (error) { next(error); }
}

async function getProjectionIssue(req, res, next) {
  try {
    res.json({ issue: await integrationManagementService.getProjectionIssue({
      wineryId: req.user.wineryId,
      issueId: positiveId(req.params.issueId)
    }) });
  } catch (error) { next(error); }
}

async function projectionIssueTransition(req, res, next, action, schema) {
  try {
    const result = await integrationManagementService.transitionProjectionIssue({
      wineryId: req.user.wineryId,
      issueId: positiveId(req.params.issueId),
      userId: req.user.id,
      action,
      data: validate(schema, req.body)
    });
    res.status(result.duplicate ? 200 : 201).json(result);
  } catch (error) { next(error); }
}

const acknowledgeProjectionIssue = (req, res, next) => projectionIssueTransition(
  req, res, next, 'ACKNOWLEDGE', schemas.integrationOperationCommandSchema
);
const resolveProjectionIssue = (req, res, next) => projectionIssueTransition(
  req, res, next, 'RESOLVE', schemas.projectionIssueResolveSchema
);
const ignoreProjectionIssue = (req, res, next) => projectionIssueTransition(
  req, res, next, 'IGNORE', schemas.integrationOperationCommandSchema
);

async function listProjectionIssueResolvers(_req, res, next) {
  try {
    res.json({ issueTypes: integrationManagementService.listProjectionIssueResolvers() });
  } catch (error) { next(error); }
}

async function listConfigurationAuthorities(req, res, next) {
  try {
    const query = validate(schemas.configurationAuthorityListSchema, req.query);
    res.json(await integrationManagementService.listConfigurationAuthorities({
      wineryId: req.user.wineryId,
      ...query
    }));
  } catch (error) { next(error); }
}

async function getConfigurationAuthorityPreview(req, res, next) {
  try {
    res.json(await integrationManagementService.getConfigurationAuthorityPreview({
      wineryId: req.user.wineryId,
      domain: req.params.domain
    }));
  } catch (error) { next(error); }
}

async function configurationAuthorityTransition(req, res, next, action, schema) {
  try {
    const result = await integrationManagementService.transitionConfigurationAuthority({
      wineryId: req.user.wineryId,
      domain: req.params.domain,
      userId: req.user.id,
      action,
      data: validate(schema, req.body)
    });
    res.status(result.duplicate ? 200 : 201).json(result);
  } catch (error) { next(error); }
}

const prepareConfigurationAuthority = (req, res, next) => configurationAuthorityTransition(
  req, res, next, 'PREPARE', schemas.configurationAuthorityPrepareSchema
);
const activateConfigurationAuthority = (req, res, next) => configurationAuthorityTransition(
  req, res, next, 'ACTIVATE', schemas.configurationAuthorityActivateSchema
);
const rollbackConfigurationAuthority = (req, res, next) => configurationAuthorityTransition(
  req, res, next, 'ROLLBACK', schemas.configurationAuthorityRollbackSchema
);

async function previewCustomerProfileBackfill(req, res, next) {
  try {
    res.json(await integrationManagementService.previewCustomerProfileBackfill({
      wineryId: req.user.wineryId
    }));
  } catch (error) { next(error); }
}

async function applyCustomerProfileBackfill(req, res, next) {
  try {
    const data = validate(schemas.customerProfileBackfillApplySchema, req.body);
    const result = await integrationManagementService.applyCustomerProfileBackfill({
      wineryId: req.user.wineryId,
      userId: req.user.id,
      data
    });
    res.status(result.duplicate ? 200 : 201).json(result);
  } catch (error) { next(error); }
}

async function createWineClubProgram(req, res, next) {
  try {
    const data = validate(schemas.wineClubProgramCreateSchema, req.body);
    const program = await integrationManagementService.createWineClubProgram({
      wineryId: req.user.wineryId,
      userId: req.user.id,
      data
    });
    res.status(201).json({ program });
  } catch (error) { next(error); }
}

async function listWineClubPrograms(req, res, next) {
  try {
    const query = validate(schemas.wineClubProgramListSchema, req.query);
    res.json(await integrationManagementService.listWineClubPrograms({
      wineryId: req.user.wineryId,
      ...query
    }));
  } catch (error) { next(error); }
}

async function listWineClubMemberships(req, res, next) {
  try {
    const query = validate(schemas.wineClubMembershipListSchema, req.query);
    res.json(await integrationManagementService.listWineClubMemberships({
      wineryId: req.user.wineryId,
      ...query
    }));
  } catch (error) { next(error); }
}

async function getWineClubMembership(req, res, next) {
  try {
    res.json(await integrationManagementService.getWineClubMembership({
      wineryId: req.user.wineryId,
      membershipId: positiveId(req.params.membershipId)
    }));
  } catch (error) { next(error); }
}

async function listSalesOrders(req, res, next) {
  try {
    const query = validate(schemas.salesOrderListSchema, req.query);
    res.json(await integrationManagementService.listSalesOrders({
      wineryId: req.user.wineryId,
      ...query
    }));
  } catch (error) { next(error); }
}

async function getSalesOrder(req, res, next) {
  try {
    res.json(await integrationManagementService.getSalesOrder({
      wineryId: req.user.wineryId,
      salesOrderId: positiveId(req.params.salesOrderId)
    }));
  } catch (error) { next(error); }
}

function listBusinessEntityLinkDefinitions(req, res) {
  res.json(integrationManagementService.listBusinessEntityLinkDefinitions());
}

async function listBusinessEntityLinks(req, res, next) {
  try {
    const query = validate(schemas.businessEntityLinkListSchema, req.query);
    res.json(await integrationManagementService.listBusinessEntityLinks({
      wineryId: req.user.wineryId,
      ...query
    }));
  } catch (error) { next(error); }
}

async function getBusinessEntityLink(req, res, next) {
  try {
    res.json(await integrationManagementService.getBusinessEntityLink({
      wineryId: req.user.wineryId,
      linkId: positiveId(req.params.linkId)
    }));
  } catch (error) { next(error); }
}

async function createBusinessEntityLink(req, res, next) {
  try {
    const data = validate(schemas.businessEntityLinkCreateSchema, req.body);
    const result = await integrationManagementService.createBusinessEntityLink({
      wineryId: req.user.wineryId,
      userId: req.user.id,
      data
    });
    res.status(result.duplicate ? 200 : 201).json(result);
  } catch (error) { next(error); }
}

const businessEntityLinkTransition = action => async (req, res, next) => {
  try {
    const data = validate(schemas.businessEntityLinkCommandSchema, req.body);
    const result = await integrationManagementService.transitionBusinessEntityLink({
      wineryId: req.user.wineryId,
      linkId: positiveId(req.params.linkId),
      userId: req.user.id,
      action,
      data
    });
    res.status(result.duplicate ? 200 : 201).json(result);
  } catch (error) { next(error); }
};

const confirmBusinessEntityLink = businessEntityLinkTransition('CONFIRM');
const rejectBusinessEntityLink = businessEntityLinkTransition('REJECT');
const invalidateBusinessEntityLink = businessEntityLinkTransition('INVALIDATE');

async function previewCustomerRollups(req, res, next) {
  try {
    res.json(await integrationManagementService.previewCustomerRollups({ wineryId: req.user.wineryId }));
  } catch (error) { next(error); }
}

async function rebuildCustomerRollups(req, res, next) {
  try {
    const data = validate(schemas.customerRollupRebuildSchema, req.body);
    const result = await integrationManagementService.rebuildCustomerRollups({
      wineryId: req.user.wineryId,
      userId: req.user.id,
      data
    });
    res.status(result.duplicate ? 200 : 201).json(result);
  } catch (error) { next(error); }
}

async function listCustomerRollupRuns(req, res, next) {
  try {
    const query = validate(schemas.customerRollupRunListSchema, req.query);
    res.json(await integrationManagementService.listCustomerRollupRuns({
      wineryId: req.user.wineryId,
      ...query
    }));
  } catch (error) { next(error); }
}

async function getCustomerRollupRun(req, res, next) {
  try {
    const query = validate(schemas.customerRollupRunListSchema, req.query);
    res.json(await integrationManagementService.getCustomerRollupRun({
      wineryId: req.user.wineryId,
      runId: positiveId(req.params.runId),
      ...query
    }));
  } catch (error) { next(error); }
}

async function createProductVariant(req, res, next) {
  try {
    const data = validate(schemas.productVariantCreateSchema, req.body);
    const productVariant = await integrationManagementService.createProductVariant({
      wineryId: req.user.wineryId,
      userId: req.user.id,
      data
    });
    res.status(201).json({ productVariant });
  } catch (error) { next(error); }
}

async function listProductVariants(req, res, next) {
  try {
    const query = validate(schemas.productVariantListSchema, req.query);
    res.json(await integrationManagementService.listProductVariants({
      wineryId: req.user.wineryId,
      ...query
    }));
  } catch (error) { next(error); }
}

async function createStockLocation(req, res, next) {
  try {
    const data = validate(schemas.stockLocationCreateSchema, req.body);
    const stockLocation = await integrationManagementService.createStockLocation({
      wineryId: req.user.wineryId,
      userId: req.user.id,
      data
    });
    res.status(201).json({ stockLocation });
  } catch (error) { next(error); }
}

async function listStockLocations(req, res, next) {
  try {
    const query = validate(schemas.stockLocationListSchema, req.query);
    res.json(await integrationManagementService.listStockLocations({
      wineryId: req.user.wineryId,
      ...query
    }));
  } catch (error) { next(error); }
}

async function listInventoryPositions(req, res, next) {
  try {
    const query = validate(schemas.inventoryPositionListSchema, req.query);
    res.json(await integrationManagementService.listInventoryPositions({
      wineryId: req.user.wineryId,
      ...query
    }));
  } catch (error) { next(error); }
}

async function getInventoryPosition(req, res, next) {
  try {
    const query = validate(schemas.inventoryPositionDetailSchema, req.query);
    res.json(await integrationManagementService.getInventoryPosition({
      wineryId: req.user.wineryId,
      inventoryPositionId: positiveId(req.params.inventoryPositionId),
      ...query
    }));
  } catch (error) { next(error); }
}

async function listInventoryCommitments(req, res, next) {
  try {
    const query = validate(schemas.inventoryCommitmentListSchema, req.query);
    res.json(await integrationManagementService.listInventoryCommitments({
      wineryId: req.user.wineryId,
      ...query
    }));
  } catch (error) { next(error); }
}

async function calculateInventoryAvailability(req, res, next) {
  try {
    const query = validate(schemas.inventoryAvailabilitySchema, req.query);
    res.json({ availability: await integrationManagementService.calculateInventoryAvailability({
      wineryId: req.user.wineryId,
      ...query
    }) });
  } catch (error) { next(error); }
}

async function upsertInventoryDemandMapping(req, res, next) {
  try {
    const data = validate(schemas.inventoryDemandMappingUpsertSchema, req.body);
    const result = await integrationManagementService.upsertInventoryDemandMapping({
      wineryId: req.user.wineryId,
      userId: req.user.id,
      data
    });
    res.status(result.duplicate ? 200 : 201).json(result);
  } catch (error) { next(error); }
}

async function listInventoryDemandMappings(req, res, next) {
  try {
    const query = validate(schemas.inventoryDemandMappingListSchema, req.query);
    res.json(await integrationManagementService.listInventoryDemandMappings({
      wineryId: req.user.wineryId,
      ...query
    }));
  } catch (error) { next(error); }
}

async function listShipments(req, res, next) {
  try {
    const query = validate(schemas.shipmentListSchema, req.query);
    res.json(await integrationManagementService.listShipments({
      wineryId: req.user.wineryId,
      ...query
    }));
  } catch (error) { next(error); }
}

async function getShipment(req, res, next) {
  try {
    res.json(await integrationManagementService.getShipment({
      wineryId: req.user.wineryId,
      shipmentId: positiveId(req.params.shipmentId)
    }));
  } catch (error) { next(error); }
}

async function upsertStaffIdentity(req, res, next) {
  try {
    const result = await integrationManagementService.upsertStaffIdentity({
      wineryId: req.user.wineryId,
      userId: req.user.id,
      data: validate(schemas.staffIdentityUpsertSchema, req.body)
    });
    res.status(result.duplicate ? 200 : 201).json(result);
  } catch (error) { next(error); }
}

async function listStaffIdentities(req, res, next) {
  try {
    const query = validate(schemas.staffIdentityListSchema, req.query);
    res.json(await integrationManagementService.listStaffIdentities({
      wineryId: req.user.wineryId,
      ...query
    }));
  } catch (error) { next(error); }
}

async function upsertRoleSkillDefinition(req, res, next) {
  try {
    const result = await integrationManagementService.upsertRoleSkillDefinition({
      wineryId: req.user.wineryId,
      userId: req.user.id,
      data: validate(schemas.roleSkillDefinitionUpsertSchema, req.body)
    });
    res.status(result.duplicate ? 200 : 201).json(result);
  } catch (error) { next(error); }
}

async function listRoleSkillDefinitions(req, res, next) {
  try {
    const query = validate(schemas.roleSkillDefinitionListSchema, req.query);
    res.json(await integrationManagementService.listRoleSkillDefinitions({
      wineryId: req.user.wineryId,
      ...query
    }));
  } catch (error) { next(error); }
}

async function upsertStaffRoleSkill(req, res, next) {
  try {
    const result = await integrationManagementService.upsertStaffRoleSkill({
      wineryId: req.user.wineryId,
      userId: req.user.id,
      data: validate(schemas.staffRoleSkillUpsertSchema, req.body)
    });
    res.status(result.duplicate ? 200 : 201).json(result);
  } catch (error) { next(error); }
}

async function listRosterShifts(req, res, next) {
  try {
    const query = validate(schemas.rosterShiftListSchema, req.query);
    res.json(await integrationManagementService.listRosterShifts({
      wineryId: req.user.wineryId,
      ...query
    }));
  } catch (error) { next(error); }
}

async function listStaffAvailability(req, res, next) {
  try {
    const query = validate(schemas.staffAvailabilityListSchema, req.query);
    res.json(await integrationManagementService.listStaffAvailability({
      wineryId: req.user.wineryId,
      ...query
    }));
  } catch (error) { next(error); }
}

async function upsertWorkforceDemandMapping(req, res, next) {
  try {
    const result = await integrationManagementService.upsertWorkforceDemandMapping({
      wineryId: req.user.wineryId,
      userId: req.user.id,
      data: validate(schemas.workforceDemandMappingUpsertSchema, req.body)
    });
    res.status(result.duplicate ? 200 : 201).json(result);
  } catch (error) { next(error); }
}

async function listWorkforceDemandMappings(req, res, next) {
  try {
    const query = validate(schemas.workforceDemandMappingListSchema, req.query);
    res.json(await integrationManagementService.listWorkforceDemandMappings({
      wineryId: req.user.wineryId,
      ...query
    }));
  } catch (error) { next(error); }
}

async function getBookingCoverage(req, res, next) {
  try {
    const query = validate(schemas.bookingCoverageSchema, req.query);
    res.json(await integrationManagementService.getBookingCoverage({
      wineryId: req.user.wineryId,
      bookingId: positiveId(req.params.id),
      ...query
    }));
  } catch (error) { next(error); }
}

async function listMessageDeliveryEvents(req, res, next) {
  try {
    const query = validate(schemas.messageDeliveryListSchema, req.query);
    res.json(await integrationManagementService.listMessageDeliveryEvents({
      wineryId: req.user.wineryId,
      ...query
    }));
  } catch (error) { next(error); }
}

async function getMessageDeliveryHistory(req, res, next) {
  try {
    res.json(await integrationManagementService.getMessageDeliveryHistory({
      wineryId: req.user.wineryId,
      messageId: positiveId(req.params.messageId)
    }));
  } catch (error) { next(error); }
}

async function listIntelligenceFactDefinitions(req, res, next) {
  try {
    res.json(integrationManagementService.listIntelligenceFactDefinitions());
  } catch (error) { next(error); }
}

async function listIntelligenceFacts(req, res, next) {
  try {
    const query = validate(schemas.intelligenceFactListSchema, req.query);
    res.json(await integrationManagementService.listIntelligenceFacts({
      wineryId: req.user.wineryId,
      ...query
    }));
  } catch (error) { next(error); }
}

async function materializeIntelligenceFacts(req, res, next) {
  try {
    const result = await integrationManagementService.materializeIntelligenceFacts({
      wineryId: req.user.wineryId,
      userId: req.user.id,
      data: validate(schemas.intelligenceFactMaterializeSchema, req.body)
    });
    res.status(result.duplicate ? 200 : 201).json(result);
  } catch (error) { next(error); }
}

async function listIntelligenceFactRuns(req, res, next) {
  try {
    const query = validate(schemas.intelligenceFactRunListSchema, req.query);
    res.json(await integrationManagementService.listIntelligenceFactRuns({
      wineryId: req.user.wineryId,
      ...query
    }));
  } catch (error) { next(error); }
}

async function getCustomerRelationshipContext(req, res, next) {
  try {
    const query = validate(schemas.customerRelationshipContextSchema, req.query);
    res.json(await integrationManagementService.getCustomerRelationshipContext({
      wineryId: req.user.wineryId,
      memberId: positiveId(req.params.memberId),
      ...query
    }));
  } catch (error) { next(error); }
}

async function getClubFulfilmentContext(req, res, next) {
  try {
    const query = validate(schemas.clubFulfilmentContextSchema, req.query);
    res.json(await integrationManagementService.getClubFulfilmentContext({
      wineryId: req.user.wineryId,
      allocationId: positiveId(req.params.allocationId),
      ...query
    }));
  } catch (error) { next(error); }
}

async function getAreaCapacityContext(req, res, next) {
  try {
    const data = validate(schemas.areaCapacityContextSchema, req.query);
    res.json(await integrationManagementService.getAreaCapacityContext({
      wineryId: req.user.wineryId,
      areaId: positiveId(req.params.areaId),
      data
    }));
  } catch (error) { next(error); }
}

async function getIntegrationHealth(req, res, next) {
  try {
    const query = validate(schemas.integrationHealthSchema, req.query);
    res.json(await integrationManagementService.getIntegrationHealth({
      wineryId: req.user.wineryId,
      ...query
    }));
  } catch (error) { next(error); }
}

async function getDomainActivationPreview(req, res, next) {
  try {
    const query = validate(schemas.domainActivationPreviewSchema, req.query);
    res.json(await integrationManagementService.getDomainActivationPreview({
      wineryId: req.user.wineryId,
      connectionId: positiveId(req.params.id),
      domain: req.params.domain,
      ...query
    }));
  } catch (error) { next(error); }
}

async function activateDomain(req, res, next) {
  try {
    const data = validate(schemas.domainActivationSchema, req.body);
    const result = await integrationManagementService.activateDomain({
      wineryId: req.user.wineryId,
      connectionId: positiveId(req.params.id),
      domain: req.params.domain,
      actorUserId: req.user.id,
      data
    });
    res.status(result.duplicate ? 200 : 201).json(result);
  } catch (error) { next(error); }
}

async function disableDomain(req, res, next) {
  try {
    const data = validate(schemas.domainActivationDisableSchema, req.body);
    const result = await integrationManagementService.disableDomain({
      wineryId: req.user.wineryId,
      connectionId: positiveId(req.params.id),
      domain: req.params.domain,
      actorUserId: req.user.id,
      ...data
    });
    res.status(result.duplicate ? 200 : 201).json(result);
  } catch (error) { next(error); }
}

async function enqueueConnectionVerification(req, res, next) {
  try {
    const result = await integrationManagementService.enqueueConnectionVerification({
      wineryId: req.user.wineryId,
      connectionId: positiveId(req.params.id),
      data: validate(schemas.connectionVerificationSchema, req.body)
    });
    res.status(202).json(result);
  } catch (error) { next(error); }
}

async function enqueueBookingHydration(req, res, next) {
  try {
    const result = await integrationManagementService.enqueueBookingHydration({
      wineryId: req.user.wineryId,
      connectionId: positiveId(req.params.id),
      data: validate(schemas.hydrationRunCreateSchema, req.body)
    });
    res.status(202).json(result);
  } catch (error) { next(error); }
}

async function enqueueBookingIncremental(req, res, next) {
  try {
    const result = await integrationManagementService.enqueueBookingIncremental({
      wineryId: req.user.wineryId,
      connectionId: positiveId(req.params.id),
      data: validate(schemas.incrementalRunCreateSchema, req.body)
    });
    res.status(202).json(result);
  } catch (error) { next(error); }
}

async function enqueueBookingReconciliation(req, res, next) {
  try {
    const result = await integrationManagementService.enqueueBookingReconciliation({
      wineryId: req.user.wineryId,
      connectionId: positiveId(req.params.id),
      data: validate(schemas.reconciliationRunCreateSchema, req.body)
    });
    res.status(202).json(result);
  } catch (error) { next(error); }
}

async function getBookingActivationPreview(req, res, next) {
  try {
    res.json(await integrationManagementService.getBookingActivationPreview({
      wineryId: req.user.wineryId,
      connectionId: positiveId(req.params.id)
    }));
  } catch (error) { next(error); }
}

async function activateBookingDomain(req, res, next) {
  try {
    const result = await integrationManagementService.activateBookingDomain({
      wineryId: req.user.wineryId,
      connectionId: positiveId(req.params.id),
      userId: req.user.id,
      data: validate(schemas.bookingActivationSchema, req.body)
    });
    res.status(result.duplicate ? 200 : 201).json(result);
  } catch (error) { next(error); }
}

async function listCanonicalBookings(req, res, next) {
  try {
    const query = validate(schemas.canonicalBookingListSchema, req.query);
    res.json(await integrationManagementService.listCanonicalBookings({
      wineryId: req.user.wineryId,
      ...query
    }));
  } catch (error) { next(error); }
}

async function getCanonicalBooking(req, res, next) {
  try {
    res.json({ booking: await integrationManagementService.getCanonicalBooking({
      wineryId: req.user.wineryId,
      bookingId: positiveId(req.params.id)
    }) });
  } catch (error) { next(error); }
}

module.exports = {
  listConnections,
  getConnection,
  createConnection,
  updateConnection,
  addConnectionScope,
  deleteConnectionScope,
  listLocations,
  createLocation,
  updateLocation,
  addLocationAreaLink,
  deleteLocationAreaLink,
  listAuthorityPolicySets,
  createAuthorityPolicyVersion,
  activateAuthorityPolicy,
  listJobs,
  listOutbox,
  listSyncStreams,
  pauseSyncStream,
  resumeSyncStream,
  cancelIntegrationJob,
  replayIntegrationJob,
  replayOutboxEntry,
  listOperationAuditEvents,
  getRuntimeSummary,
  listConnectorManifests,
  getConnectionCredential,
  upsertConnectionCredential,
  revokeConnectionCredential,
  listWebhookEndpoints,
  createWebhookEndpoint,
  rotateWebhookEndpoint,
  updateWebhookEndpointLifecycle,
  listWebhookAdapterManifests,
  previewLegacyIntegrationBackfill,
  applyLegacyIntegrationBackfill,
  listLegacyIntegrationBackfillIssues,
  listProjectionIssues,
  getProjectionIssue,
  acknowledgeProjectionIssue,
  resolveProjectionIssue,
  ignoreProjectionIssue,
  listProjectionIssueResolvers,
  listConfigurationAuthorities,
  getConfigurationAuthorityPreview,
  prepareConfigurationAuthority,
  activateConfigurationAuthority,
  rollbackConfigurationAuthority,
  previewCustomerProfileBackfill,
  applyCustomerProfileBackfill,
  createWineClubProgram,
  listWineClubPrograms,
  listWineClubMemberships,
  getWineClubMembership,
  listSalesOrders,
  getSalesOrder,
  listBusinessEntityLinkDefinitions,
  listBusinessEntityLinks,
  getBusinessEntityLink,
  createBusinessEntityLink,
  confirmBusinessEntityLink,
  rejectBusinessEntityLink,
  invalidateBusinessEntityLink,
  previewCustomerRollups,
  rebuildCustomerRollups,
  listCustomerRollupRuns,
  getCustomerRollupRun,
  createProductVariant,
  listProductVariants,
  createStockLocation,
  listStockLocations,
  listInventoryPositions,
  getInventoryPosition,
  listInventoryCommitments,
  calculateInventoryAvailability,
  upsertInventoryDemandMapping,
  listInventoryDemandMappings,
  listShipments,
  getShipment,
  upsertStaffIdentity,
  listStaffIdentities,
  upsertRoleSkillDefinition,
  listRoleSkillDefinitions,
  upsertStaffRoleSkill,
  listRosterShifts,
  listStaffAvailability,
  upsertWorkforceDemandMapping,
  listWorkforceDemandMappings,
  getBookingCoverage,
  listMessageDeliveryEvents,
  getMessageDeliveryHistory,
  listIntelligenceFactDefinitions,
  listIntelligenceFacts,
  materializeIntelligenceFacts,
  listIntelligenceFactRuns,
  getCustomerRelationshipContext,
  getClubFulfilmentContext,
  getAreaCapacityContext,
  getIntegrationHealth,
  getDomainActivationPreview,
  activateDomain,
  disableDomain,
  enqueueConnectionVerification,
  enqueueBookingHydration,
  enqueueBookingIncremental,
  enqueueBookingReconciliation,
  getBookingActivationPreview,
  activateBookingDomain,
  listCanonicalBookings,
  getCanonicalBooking
};
