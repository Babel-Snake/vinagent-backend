const BookingAdapter = require('../booking.adapter');

class MockBookingProvider extends BookingAdapter {
    isAuthenticated() {
        return true;
    }

    async findAvailability({ date, time, pax }) {
        console.log(`[MockBooking] Checking availability for ${date} @ ${time} for ${pax} pax`);
        // Always return available for mock
        return {
            available: true,
            slots: [time, '19:00', '20:00']
        };
    }

    async createReservation(details) {
        console.log('[MockBooking] Creating reservation:', details);
        return {
            referenceCode: 'MOCK-' + Math.floor(Math.random() * 10000),
            status: 'CONFIRMED',
            provider: 'mock'
        };
    }
}

module.exports = MockBookingProvider;
