'use strict';

const INDEXES = [
    { name: 'idx_members_winery_customer_type', fields: ['wineryId', 'isWineClubMember'] },
    { name: 'idx_members_winery_source', fields: ['wineryId', 'source'] },
    { name: 'idx_members_winery_state', fields: ['wineryId', 'state'] },
    { name: 'idx_members_winery_loyalty_tier', fields: ['wineryId', 'loyaltyTier'] },
    { name: 'idx_members_winery_name', fields: ['wineryId', 'lastName', 'firstName'] },
    { name: 'idx_members_winery_email', fields: ['wineryId', 'email'] },
    { name: 'idx_members_winery_phone', fields: ['wineryId', 'phone'] },
    { name: 'idx_members_winery_last_contact', fields: ['wineryId', 'lastContactAt'] },
    { name: 'idx_members_winery_lifetime_spend', fields: ['wineryId', 'lifetimeSpend'] },
    { name: 'idx_members_winery_visit_count', fields: ['wineryId', 'visitCount'] }
];

function profileColumns(Sequelize) {
    return {
        dateOfBirth: { type: Sequelize.DATEONLY, allowNull: true },
        gender: { type: Sequelize.STRING, allowNull: true },
        preferredLanguage: { type: Sequelize.STRING, allowNull: true, defaultValue: 'en' },
        source: {
            type: Sequelize.ENUM('manual', 'sms', 'email', 'booking', 'wine_club', 'pos', 'import', 'website', 'referral', 'walk_in'),
            allowNull: false,
            defaultValue: 'manual'
        },
        winePreferences: { type: Sequelize.JSON, allowNull: true },
        lifetimeSpend: { type: Sequelize.DECIMAL(10, 2), allowNull: true, defaultValue: 0 },
        totalOrders: { type: Sequelize.INTEGER, allowNull: true, defaultValue: 0 },
        visitCount: { type: Sequelize.INTEGER, allowNull: true, defaultValue: 0 },
        lastContactAt: { type: Sequelize.DATE, allowNull: true },
        lastVisitAt: { type: Sequelize.DATE, allowNull: true },
        lastPurchaseAt: { type: Sequelize.DATE, allowNull: true },
        loyaltyTier: {
            type: Sequelize.ENUM('none', 'bronze', 'silver', 'gold', 'platinum'),
            allowNull: false,
            defaultValue: 'none'
        },
        isWineClubMember: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        tags: { type: Sequelize.JSON, allowNull: true },
        preferredContactMethod: {
            type: Sequelize.ENUM('email', 'sms', 'phone', 'any'),
            allowNull: false,
            defaultValue: 'any'
        },
        marketingOptIn: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false }
    };
}

module.exports = {
    async up(queryInterface, Sequelize) {
        const description = await queryInterface.describeTable('Members');
        const columns = profileColumns(Sequelize);

        for (const [name, definition] of Object.entries(columns)) {
            if (!description[name]) {
                await queryInterface.addColumn('Members', name, definition);
            }
        }

        const currentColumns = new Set(Object.keys(await queryInterface.describeTable('Members')));
        const existingIndexes = new Set((await queryInterface.showIndex('Members')).map(index => index.name));
        if (!existingIndexes.has('members_winery_id_fk')) {
            await queryInterface.addIndex('Members', ['wineryId'], { name: 'members_winery_id_fk' });
            existingIndexes.add('members_winery_id_fk');
        }
        for (const index of INDEXES) {
            if (!existingIndexes.has(index.name) && index.fields.every(field => currentColumns.has(field))) {
                await queryInterface.addIndex('Members', index.fields, { name: index.name });
            }
        }
    },

    async down() {
        // This compatibility migration intentionally preserves customer data columns on partial rollback.
        // It also preserves shared indexes so older migrations can roll back without orphaning
        // the wineryId foreign key. A full rollback subsequently drops the Members table.
    }
};
