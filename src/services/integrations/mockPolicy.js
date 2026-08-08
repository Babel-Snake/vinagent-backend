function isMockIntegrationAllowed() {
  if (process.env.NODE_ENV === 'test') return true;
  return process.env.NODE_ENV === 'development'
    && process.env.ALLOW_MOCK_INTEGRATIONS === 'true';
}

function createProviderError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function assertMockIntegrationAllowed(domain, selectedProvider = 'mock') {
  if (isMockIntegrationAllowed()) return;
  throw createProviderError(
    `Mock ${domain} execution is disabled for provider '${selectedProvider}'. Configure a live adapter before executing this action.`,
    'MOCK_INTEGRATION_DISABLED'
  );
}

function unsupportedProviderError(domain, provider) {
  return createProviderError(
    `${domain} provider '${provider}' is not supported.`,
    'INTEGRATION_PROVIDER_UNSUPPORTED'
  );
}

module.exports = {
  assertMockIntegrationAllowed,
  isMockIntegrationAllowed,
  unsupportedProviderError
};
