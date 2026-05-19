'use strict';

async function hasColumn(queryInterface, columnName) {
    const description = await queryInterface.describeTable('Members');
    return Boolean(description[columnName]);
}

async function hasIndex(queryInterface, indexName) {
    const indexes = await queryInterface.showIndex('Members');
    return indexes.some((index) => index.name === indexName);
}

module.exports = {
    async up(queryInterface, Sequelize) {
        if (!(await hasColumn(queryInterface, 'customerType'))) {
            await queryInterface.addColumn('Members', 'customerType', {
                type: Sequelize.ENUM('guest', 'member', 'tour_operator'),
                allowNull: false,
                defaultValue: 'guest',
                after: 'lastPurchaseAt'
            });
        }

        await queryInterface.sequelize.query(`
            UPDATE Members
            SET customerType = CASE
                WHEN isWineClubMember = true THEN 'member'
                ELSE 'guest'
            END
            WHERE customerType IS NULL OR customerType = 'guest'
        `);

        if (!(await hasIndex(queryInterface, 'idx_members_winery_customer_type_v2'))) {
            await queryInterface.addIndex('Members', ['wineryId', 'customerType'], {
                name: 'idx_members_winery_customer_type_v2'
            });
        }
    },

    async down(queryInterface) {
        if (await hasIndex(queryInterface, 'idx_members_winery_customer_type_v2')) {
            await queryInterface.removeIndex('Members', 'idx_members_winery_customer_type_v2');
        }

        if (await hasColumn(queryInterface, 'customerType')) {
            await queryInterface.removeColumn('Members', 'customerType');
        }
    }
};
