const MockCrmProvider = require('./providers/mock');
const integrationConnectionService = require('../../integrationConnection.service');
const { assertMockIntegrationAllowed, unsupportedProviderError } = require('../mockPolicy');
// const Commerce7Provider = require('./providers/commerce7'); // Future

class CrmIntegrationFactory {
    /**
     * Gets an initialized provider for the given winery.
     * @param {number} wineryId
     * @returns {Promise<CrmAdapter>}
     */
    async getProvider(wineryId, { areaId = null, transaction = null } = {}) {
        const resolved = await integrationConnectionService.resolveExecutionConfig({
            wineryId,
            areaId,
            domain: 'crm',
            transaction
        });
        const providerName = resolved.provider;
        const config = resolved.config;

        switch (providerName) {
            case 'mock':
                assertMockIntegrationAllowed('CRM', config.selectedProvider || providerName);
                return new MockCrmProvider(config);
            case 'commerce7':
                throw new Error('Commerce7 provider not yet implemented');
            case 'winedirect':
                throw new Error('WineDirect provider not yet implemented');
            default:
                throw unsupportedProviderError('CRM', providerName);
        }
    }
}

module.exports = new CrmIntegrationFactory();
