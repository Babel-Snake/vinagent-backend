const {
  WineryIntegrationConfig,
  OperationalAreaIntegrationConfig
} = require('../models');
const AppError = require('../utils/AppError');
const { parseJsonObject } = require('./integrationConnection.service');
const { configuredWineryId } = require('./deploymentWinery.service');

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function identifier(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function extractTrustedRetellIdentity(payload = {}) {
  const call = objectValue(payload.call);

  // Only Retell-owned, signed fields participate in tenant routing. Call
  // metadata, dynamic variables and arbitrary winery IDs are intentionally
  // excluded because callers or client integrations can populate them.
  return {
    agentId: identifier(call.agent_id),
    accountId: identifier(call.account_id || payload.account_id)
  };
}

function getRetellConnections(providerConnections) {
  return Object.entries(parseJsonObject(providerConnections))
    .map(([domain, value]) => ({ domain, connection: parseJsonObject(value) }))
    .filter(({ domain, connection }) => (
      String(domain).trim().toLowerCase() === 'retell'
      && String(connection.provider || '').trim().toLowerCase() === 'retell'
    ));
}

function connectionMatchesIdentity(connection, identity) {
  const configuredAgentId = identifier(connection.externalLocationId);
  const configuredAccountId = identifier(connection.externalAccountId);

  if (!configuredAgentId && !configuredAccountId) return false;

  if (configuredAgentId) {
    if (!identity.agentId || identity.agentId !== configuredAgentId) return false;

    // Retell call webhooks currently identify the agent but do not always
    // include an account ID. When one is present, enforce it as an additional
    // boundary instead of silently accepting a mismatch.
    if (configuredAccountId && identity.accountId && identity.accountId !== configuredAccountId) {
      return false;
    }
    return true;
  }

  return Boolean(identity.accountId && identity.accountId === configuredAccountId);
}

function collectMatches(configs, identity, scope) {
  const matches = [];

  for (const config of configs) {
    for (const { domain, connection } of getRetellConnections(config.providerConnections)) {
      if (!connectionMatchesIdentity(connection, identity)) continue;

      matches.push({
        wineryId: Number(config.wineryId),
        areaId: scope === 'area' ? Number(config.areaId) : null,
        domain,
        scope
      });
    }
  }

  return matches;
}

async function resolveRetellWebhookContext(payload = {}) {
  const identity = extractTrustedRetellIdentity(payload);
  if (!identity.agentId && !identity.accountId) {
    throw new AppError(
      'Retell webhook does not contain a trusted agent or account identifier.',
      400,
      'RETELL_WINERY_MAPPING_REQUIRED'
    );
  }

  const deploymentWineryId = configuredWineryId();
  const where = deploymentWineryId ? { wineryId: deploymentWineryId } : undefined;
  const [wineryConfigs, areaConfigs] = await Promise.all([
    WineryIntegrationConfig.findAll({
      attributes: ['wineryId', 'providerConnections'],
      ...(where ? { where } : {})
    }),
    OperationalAreaIntegrationConfig.findAll({
      attributes: ['wineryId', 'areaId', 'providerConnections'],
      ...(where ? { where } : {})
    })
  ]);

  const matches = [
    ...collectMatches(wineryConfigs, identity, 'winery'),
    ...collectMatches(areaConfigs, identity, 'area')
  ];
  const wineryIds = [...new Set(matches.map(match => match.wineryId).filter(Number.isInteger))];

  if (wineryIds.length === 0) {
    throw new AppError(
      'Retell webhook agent/account is not mapped to a winery.',
      400,
      'RETELL_WINERY_MAPPING_REQUIRED'
    );
  }

  if (wineryIds.length > 1) {
    throw new AppError(
      'Retell webhook agent/account mapping is ambiguous.',
      400,
      'RETELL_WINERY_MAPPING_AMBIGUOUS'
    );
  }

  return {
    wineryId: wineryIds[0],
    identity,
    matches
  };
}

module.exports = {
  extractTrustedRetellIdentity,
  connectionMatchesIdentity,
  resolveRetellWebhookContext
};
