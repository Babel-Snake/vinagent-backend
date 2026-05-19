const CrmAdapter = require('../crm.adapter');

function normalizeEmail(email) {
    return email ? String(email).trim().toLowerCase() : null;
}

function normalizePhone(phone) {
    if (!phone) return null;
    const digits = String(phone).replace(/\D/g, '');
    return digits || null;
}

class MockCrmProvider extends CrmAdapter {
    constructor(config = {}) {
        super(config);
        if (!MockCrmProvider.records) {
            MockCrmProvider.records = new Map();
            MockCrmProvider.emailIndex = new Map();
            MockCrmProvider.phoneIndex = new Map();
            MockCrmProvider.orderEvents = new Map();
        }
    }

    isAuthenticated() {
        return true;
    }

    _saveRecord(record) {
        MockCrmProvider.records.set(record.id, record);
        const email = normalizeEmail(record.email);
        const phone = normalizePhone(record.phone);
        if (email) MockCrmProvider.emailIndex.set(email, record.id);
        if (phone) MockCrmProvider.phoneIndex.set(phone, record.id);
        return record;
    }

    _findById(id) {
        return id ? MockCrmProvider.records.get(id) || null : null;
    }

    async getMember({ email, phone }) {
        const emailKey = normalizeEmail(email);
        const phoneKey = normalizePhone(phone);
        const emailMatch = emailKey ? MockCrmProvider.emailIndex.get(emailKey) : null;
        const phoneMatch = phoneKey ? MockCrmProvider.phoneIndex.get(phoneKey) : null;
        const recordId = emailMatch || phoneMatch || null;
        return recordId ? this._findById(recordId) : null;
    }

    async updateMember(externalId, updates) {
        const existing = this._findById(externalId);
        if (!existing) {
            throw new Error(`MockCRM member ${externalId} not found`);
        }
        const nextRecord = {
            ...existing,
            ...updates,
            updatedAt: new Date().toISOString()
        };
        return this._saveRecord(nextRecord);
    }

    async addNote(externalId, note) {
        const existing = this._findById(externalId);
        if (!existing) {
            throw new Error(`MockCRM member ${externalId} not found`);
        }
        const notes = Array.isArray(existing.notes) ? [...existing.notes] : [];
        notes.push({
            note,
            createdAt: new Date().toISOString()
        });
        this._saveRecord({
            ...existing,
            notes,
            updatedAt: new Date().toISOString()
        });
        return true;
    }

    async upsertMember(profile) {
        const existing = await this.getMember(profile);
        if (existing) {
            const updated = await this.updateMember(existing.id, {
                firstName: profile.firstName || existing.firstName,
                lastName: profile.lastName || existing.lastName,
                email: profile.email || existing.email,
                phone: profile.phone || existing.phone
            });
            return { ...updated, created: false };
        }

        const record = this._saveRecord({
            id: `crm-mock-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            firstName: profile.firstName || 'Unknown',
            lastName: profile.lastName || 'Customer',
            email: profile.email || null,
            phone: profile.phone || null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lifetimeValue: 0,
            clubStatus: 'unknown',
            notes: []
        });
        return { ...record, created: true };
    }

    async recordOrderEvent(externalId, event) {
        const existing = this._findById(externalId);
        if (!existing) {
            throw new Error(`MockCRM member ${externalId} not found`);
        }

        const orderReference = event.orderId || `ORDER-${Date.now()}`;
        const orderEvent = {
            referenceCode: `CRM-${orderReference}`,
            externalId,
            status: 'RECORDED',
            provider: 'mock',
            recordedAt: new Date().toISOString(),
            event
        };

        const events = MockCrmProvider.orderEvents.get(externalId) || [];
        events.push(orderEvent);
        MockCrmProvider.orderEvents.set(externalId, events);

        return orderEvent;
    }
}

module.exports = MockCrmProvider;
