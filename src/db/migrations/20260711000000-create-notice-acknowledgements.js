'use strict';

async function hasTable(queryInterface, tableName) {
  const expected = String(tableName).toLowerCase();
  return (await queryInterface.showAllTables()).some(table => {
    const name = typeof table === 'object' ? table.tableName || table.name : table;
    return String(name).toLowerCase() === expected;
  });
}

async function hasColumn(queryInterface, tableName, columnName) {
  if (!(await hasTable(queryInterface, tableName))) return false;
  const columns = await queryInterface.describeTable(tableName);
  return Object.prototype.hasOwnProperty.call(columns, columnName);
}

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await hasColumn(queryInterface, 'Notices', 'requiresAcknowledgement'))) {
      await queryInterface.addColumn('Notices', 'requiresAcknowledgement', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false });
    }
    if (!(await hasColumn(queryInterface, 'Notices', 'acknowledgementDueAt'))) {
      await queryInterface.addColumn('Notices', 'acknowledgementDueAt', { type: Sequelize.DATE, allowNull: true });
    }
    if (!(await hasTable(queryInterface, 'NoticeAcknowledgements'))) {
      await queryInterface.createTable('NoticeAcknowledgements', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        noticeId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Notices', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        wineryId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        userId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        acknowledgedAt: { type: Sequelize.DATE, allowNull: false },
        createdAt: { type: Sequelize.DATE, allowNull: false }
      });
      await queryInterface.addIndex('NoticeAcknowledgements', ['noticeId', 'userId'], { unique: true, name: 'notice_acknowledgements_user_unique' });
      await queryInterface.addIndex('NoticeAcknowledgements', ['wineryId', 'acknowledgedAt'], { name: 'notice_acknowledgements_winery_date' });
    }
  },

  async down(queryInterface) {
    if (await hasTable(queryInterface, 'NoticeAcknowledgements')) await queryInterface.dropTable('NoticeAcknowledgements');
    if (await hasColumn(queryInterface, 'Notices', 'acknowledgementDueAt')) await queryInterface.removeColumn('Notices', 'acknowledgementDueAt');
    if (await hasColumn(queryInterface, 'Notices', 'requiresAcknowledgement')) await queryInterface.removeColumn('Notices', 'requiresAcknowledgement');
  }
};
