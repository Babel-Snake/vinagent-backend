'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('Members', {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.INTEGER
            },
            wineryId: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'Wineries', key: 'id' },
                onDelete: 'CASCADE'
            },
            firstName: { type: Sequelize.STRING, allowNull: false },
            lastName: { type: Sequelize.STRING, allowNull: false },
            email: { type: Sequelize.STRING, allowNull: true },
            phone: { type: Sequelize.STRING, allowNull: true },
            addressLine1: { type: Sequelize.STRING, allowNull: true },
            addressLine2: { type: Sequelize.STRING, allowNull: true },
            suburb: { type: Sequelize.STRING, allowNull: true },
            state: { type: Sequelize.STRING, allowNull: true },
            postcode: { type: Sequelize.STRING, allowNull: true },
            country: { type: Sequelize.STRING, allowNull: true, defaultValue: 'Australia' },
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
            marketingOptIn: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
            notes: { type: Sequelize.TEXT, allowNull: true },
            externalRef: { type: Sequelize.STRING, allowNull: true },
            createdAt: { allowNull: false, type: Sequelize.DATE },
            updatedAt: { allowNull: false, type: Sequelize.DATE }
        });

        await queryInterface.addIndex('Members', ['wineryId'], {
            name: 'members_winery_id_fk'
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable('Members');
    }
};
