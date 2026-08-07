const MockBookingProvider = require('./providers/mock');
const integrationConnectionService = require('../../integrationConnection.service');
// const TockBookingProvider = require('./providers/tock'); // Future

class BookingIntegrationFactory {
    /**
     * Gets an initialized provider for the given winery.
     * @param {number} wineryId
     * @returns {Promise<BookingAdapter>}
     */
    async getProvider(wineryId, { areaId = null, transaction = null } = {}) {
        const resolved = await integrationConnectionService.resolveExecutionConfig({
            wineryId,
            areaId,
            domain: 'booking',
            transaction
        });
        const providerName = resolved.provider;
        const config = resolved.config;

        switch (providerName) {
            case 'mock':
                return new MockBookingProvider(config);
            case 'sevenrooms':
                throw new Error('SevenRooms provider not yet implemented');
            case 'tock':
                // return new TockBookingProvider(config);
                throw new Error('Tock provider not yet implemented');
            default:
                console.warn(`Unknown provider '${providerName}', falling back to Mock.`);
                return new MockBookingProvider(config);
        }
    }
}

module.exports = new BookingIntegrationFactory();
