/**
 * Base Booking Adapter Interface.
 * All providers (Tock, SevenRooms, Mock) must extend this.
 */
class BookingAdapter {
    constructor(config = {}) {
        this.config = config;
    }

    /**
     * Checks if the provider is properly configured.
     * @returns {boolean}
     */
    isAuthenticated() {
        return false;
    }

    /**
     * Checks availability for a given request.
     * @param {Object} criteria - { date, time, pax }
     * @returns {Promise<Object>} - { available: boolean, slots: [] }
     */
    async findAvailability(criteria) {
        throw new Error('findAvailability() not implemented');
    }

    /**
     * Creates a reservation.
     * @param {Object} details - { memberId, firstName, lastName, phone, email, date, time, pax, notes }
     * @returns {Promise<Object>} - { referenceCode: string, status: 'CONFIRMED' }
     */
    async createReservation(details) {
        throw new Error('createReservation() not implemented');
    }
}

module.exports = BookingAdapter;
