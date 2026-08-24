/**
 * Base Booking Adapter Interface.
 * Read-only projection providers implement verifyReadAccess/fetchBookingsPage.
 * Transactional providers may separately implement availability and reservation writes.
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
     * Verifies read-only access without performing a booking mutation.
     */
    async verifyReadAccess() {
        throw new Error('verifyReadAccess() not implemented');
    }

    /**
     * Fetches one bounded page for shadow projection/hydration.
     */
    async fetchBookingsPage(_request) {
        throw new Error('fetchBookingsPage() not implemented');
    }

    /**
     * Checks availability for a given request.
     * @param {Object} criteria - { date, time, pax }
     * @returns {Promise<Object>} - { available: boolean, slots: [] }
     */
    async findAvailability(_criteria) {
        throw new Error('findAvailability() not implemented');
    }

    /**
     * Creates a reservation.
     * @param {Object} details - { memberId, firstName, lastName, phone, email, date, time, pax, notes }
     * @returns {Promise<Object>} - { referenceCode: string, status: 'CONFIRMED' }
     */
    async createReservation(_details) {
        throw new Error('createReservation() not implemented');
    }
}

module.exports = BookingAdapter;
