const { WinerySettings } = require('../../../models');
const MockCrmProvider = require('./providers/mock');
// const Commerce7Provider = require('./providers/commerce7'); // Future

class CrmIntegrationFactory {
    /**
     * Gets an initialized provider for the given winery.
     * @param {number} wineryId
     * @returns {Promise<CrmAdapter>}
     */
    async getProvider(wineryId) {
        const settings = await WinerySettings.findOne({ where: { wineryId } });

        const providerName = settings ? settings.crmProvider : 'mock';
        const config = settings ? settings.crmConfig : {};

        switch (providerName) {
            case 'mock':
                return new MockCrmProvider(config);
            case 'commerce7':
                throw new Error('Commerce7 provider not yet implemented');
            default:
                console.warn(`Unknown CRM provider '${providerName}', falling back to Mock.`);
                return new MockCrmProvider(config);
        }
    }
}

module.exports = new CrmIntegrationFactory();
