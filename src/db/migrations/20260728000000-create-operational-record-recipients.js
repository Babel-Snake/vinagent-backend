'use strict';

async function hasTable(queryInterface, tableName) {
  const expected = String(tableName).toLowerCase();
  return (await queryInterface.showAllTables()).some(table => {
    const name = typeof table === 'object' ? table.tableName || table.name : table;
    return String(name).toLowerCase() === expected;
  });
}

module.exports = {
  async up(queryInterface, Sequelize) {
    if (await hasTable(queryInterface, 'OperationalRecordRecipients')) return;

    await queryInterface.createTable('OperationalRecordRecipients', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      wineryId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'Wineries', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      recordId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'OperationalRecords', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'Users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      createdAt: { allowNull: false, type: Sequelize.DATE },
      updatedAt: { allowNull: false, type: Sequelize.DATE }
    });

    await queryInterface.addIndex('OperationalRecordRecipients', ['recordId', 'userId'], {
      unique: true,
      name: 'operational_record_recipients_record_user_unique'
    });
    await queryInterface.addIndex('OperationalRecordRecipients', ['wineryId', 'userId', 'recordId'], {
      name: 'operational_record_recipients_winery_user_record'
    });
  },

  async down(queryInterface) {
    if (await hasTable(queryInterface, 'OperationalRecordRecipients')) {
      await queryInterface.dropTable('OperationalRecordRecipients');
    }
  }
};
