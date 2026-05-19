'use strict';

const INDEXES = [
    {
        name: 'idx_members_winery_customer_type',
        fields: ['wineryId', 'isWineClubMember']
    },
    {
        name: 'idx_members_winery_source',
        fields: ['wineryId', 'source']
    },
    {
        name: 'idx_members_winery_state',
        fields: ['wineryId', 'state']
    },
    {
        name: 'idx_members_winery_loyalty_tier',
        fields: ['wineryId', 'loyaltyTier']
    },
    {
        name: 'idx_members_winery_name',
        fields: ['wineryId', 'lastName', 'firstName']
    },
    {
        name: 'idx_members_winery_email',
        fields: ['wineryId', 'email']
    },
    {
        name: 'idx_members_winery_phone',
        fields: ['wineryId', 'phone']
    },
    {
        name: 'idx_members_winery_last_contact',
        fields: ['wineryId', 'lastContactAt']
    },
    {
        name: 'idx_members_winery_lifetime_spend',
        fields: ['wineryId', 'lifetimeSpend']
    },
    {
        name: 'idx_members_winery_visit_count',
        fields: ['wineryId', 'visitCount']
    }
];

async function tableColumns(queryInterface) {
    const description = await queryInterface.describeTable('Members');
    return new Set(Object.keys(description));
}

async function tableIndexNames(queryInterface) {
    const indexes = await queryInterface.showIndex('Members');
    return new Set(indexes.map((index) => index.name));
}

module.exports = {
    async up(queryInterface) {
        const columns = await tableColumns(queryInterface);
        const existingIndexes = await tableIndexNames(queryInterface);

        for (const index of INDEXES) {
            if (existingIndexes.has(index.name)) continue;
            if (!index.fields.every((field) => columns.has(field))) continue;
            await queryInterface.addIndex('Members', index.fields, { name: index.name });
        }
    },

    async down(queryInterface) {
        for (const index of INDEXES) {
            try {
                await queryInterface.removeIndex('Members', index.name);
            } catch (error) {
                if (!/not found|does not exist|Can't DROP/i.test(error.message || '')) {
                    throw error;
                }
            }
        }
    }
};
