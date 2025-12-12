/**
 * Base CRM Adapter Interface.
 * All providers (Commerce7, WineDirect, Mock) must extend this.
 */
class CrmAdapter {
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
     * Fetches a member by email or phone.
     * @param {Object} query - { email, phone }
     * @returns {Promise<Object|null>} - Member details or null
     */
    async getMember(query) {
        throw new Error('getMember() not implemented');
    }

    /**
     * Updates a member's profile.
     * @param {string} externalId - The CRM's ID for the member
     * @param {Object} updates - Fields to update
     * @returns {Promise<Object>} - Updated member details
     */
    async updateMember(externalId, updates) {
        throw new Error('updateMember() not implemented');
    }

    /**
     * Adds a note or interaction log to the member's CRM profile.
     * @param {string} externalId
     * @param {string} note
     * @returns {Promise<void>}
     */
    async addNote(externalId, note) {
        throw new Error('addNote() not implemented');
    }
}

module.exports = CrmAdapter;
