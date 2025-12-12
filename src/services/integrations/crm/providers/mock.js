const CrmAdapter = require('../crm.adapter');

class MockCrmProvider extends CrmAdapter {
    isAuthenticated() {
        return true;
    }

    async getMember({ email, phone }) {
        console.log(`[MockCRM] Searching for member: ${email || phone}`);
        // Simulate finding a member if phone ends in '99'
        if (phone && phone.endsWith('99')) {
            return {
                id: 'crm-mock-12345',
                firstName: 'Mock',
                lastName: 'Member',
                email: email || 'mock@example.com',
                phone: phone,
                lifetimeValue: 1500.00,
                clubStatus: 'active'
            };
        }
        return null;
    }

    async updateMember(externalId, updates) {
        console.log(`[MockCRM] Updating member ${externalId}:`, updates);
        return {
            id: externalId,
            ...updates,
            updatedAt: new Date().toISOString()
        };
    }

    async addNote(externalId, note) {
        console.log(`[MockCRM] Adding note to ${externalId}: "${note}"`);
        return true;
    }
}

module.exports = MockCrmProvider;
