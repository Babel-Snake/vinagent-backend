const { DataTypes, QueryTypes, Sequelize } = require('sequelize');
const migration = require('../../db/migrations/20260807000000-add-immutable-staff-username');

describe('immutable staff username migration', () => {
    let sequelize;
    let queryInterface;

    beforeEach(async () => {
        sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
        queryInterface = sequelize.getQueryInterface();
        await queryInterface.createTable('Users', {
            id: { type: DataTypes.INTEGER, primaryKey: true },
            role: { type: DataTypes.STRING, allowNull: false },
            wineryId: { type: DataTypes.INTEGER, allowNull: true },
            email: { type: DataTypes.STRING, allowNull: false },
            displayName: { type: DataTypes.STRING, allowNull: true }
        });
        await queryInterface.bulkInsert('Users', [
            { id: 1, role: 'staff', wineryId: 1, email: 'Sarah.w1@vinagent.internal', displayName: 'Renamed Sarah' },
            { id: 2, role: 'staff', wineryId: 1, email: 'personal@example.com', displayName: 'Cellar Host' },
            { id: 3, role: 'staff', wineryId: 1, email: 'wrong.w2@vinagent.internal', displayName: 'Wrong Scope' },
            { id: 4, role: 'manager', wineryId: 1, email: 'manager.w1@vinagent.internal', displayName: 'Manager' },
            { id: 5, role: 'staff', wineryId: 1, email: 'duplicate1@example.com', displayName: 'Shared Login' },
            { id: 6, role: 'staff', wineryId: 1, email: 'duplicate2@example.com', displayName: 'Shared Login' },
            { id: 7, role: 'staff', wineryId: 1, email: 'staff@vinagent.com', displayName: null },
            { id: 8, role: 'staff', wineryId: 1, email: '@example.com', displayName: null }
        ]);
    });

    afterEach(async () => {
        await sequelize.close();
    });

    it('backfills every legacy staff identity and adds a scoped unique index', async () => {
        await migration.up(queryInterface, DataTypes);

        const users = await sequelize.query('SELECT id, username FROM Users ORDER BY id', {
            type: QueryTypes.SELECT
        });
        expect(users).toEqual([
            { id: 1, username: 'sarah' },
            { id: 2, username: 'cellarhost' },
            { id: 3, username: 'wrongscope' },
            { id: 4, username: null },
            { id: 5, username: 'sharedlogin' },
            { id: 6, username: 'sharedlogin6' },
            { id: 7, username: 'staff' },
            { id: 8, username: 'staff8' }
        ]);

        const indexes = await queryInterface.showIndex('Users');
        expect(indexes).toEqual(expect.arrayContaining([
            expect.objectContaining({
                name: 'users_winery_username_unique',
                unique: true
            })
        ]));

        await migration.down(queryInterface);
        const columns = await queryInterface.describeTable('Users');
        expect(columns.username).toBeUndefined();
    });
});
