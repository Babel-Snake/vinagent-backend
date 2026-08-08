const BookingAdapter = require('../booking.adapter');
const logger = require('../../../../config/logger');

class MockBookingProvider extends BookingAdapter {
    isAuthenticated() {
        return true;
    }

    async findAvailability({ date: _date, time, pax }) {
        logger.info('Mock booking availability checked', { pax });
        // Always return available for mock
        return {
            available: true,
            slots: [time, '19:00', '20:00']
        };
    }

    async createReservation(details) {
        logger.info('Mock booking reservation created', {
            pax: details.pax || null,
            hasCustomerContact: Boolean(details.email || details.phone)
        });
        return {
            referenceCode: 'MOCK-' + Math.floor(Math.random() * 10000),
            status: 'CONFIRMED',
            provider: 'mock'
        };
    }
}

module.exports = MockBookingProvider;
