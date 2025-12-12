const { WinerySettings } = require('../../../models');
const MockBookingProvider = require('./providers/mock');
// const TockBookingProvider = require('./providers/tock'); // Future

class BookingIntegrationFactory {
    /**
     * Gets an initialized provider for the given winery.
     * @param {number} wineryId
     * @returns {Promise<BookingAdapter>}
     */
    async getProvider(wineryId) {
        const settings = await WinerySettings.findOne({ where: { wineryId } });

        const providerName = settings ? settings.bookingProvider : 'mock';
        const config = settings ? settings.bookingConfig : {};

        switch (providerName) {
            case 'mock':
                return new MockBookingProvider(config);
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
