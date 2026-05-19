'use strict';

async function hasColumn(queryInterface, tableName, columnName) {
  const table = await queryInterface.describeTable(tableName);
  return Boolean(table[columnName]);
}

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await hasColumn(queryInterface, 'Users', 'pinHash'))) {
      await queryInterface.addColumn('Users', 'pinHash', {
        type: Sequelize.STRING,
        allowNull: true,
        after: 'responsibilities'
      });
    }

    if (!(await hasColumn(queryInterface, 'Users', 'pinUpdatedAt'))) {
      await queryInterface.addColumn('Users', 'pinUpdatedAt', {
        type: Sequelize.DATE,
        allowNull: true,
        after: 'pinHash'
      });
    }

    if (!(await hasColumn(queryInterface, 'Users', 'pinFailedAttempts'))) {
      await queryInterface.addColumn('Users', 'pinFailedAttempts', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        after: 'pinUpdatedAt'
      });
    }

    if (!(await hasColumn(queryInterface, 'Users', 'pinLockedUntil'))) {
      await queryInterface.addColumn('Users', 'pinLockedUntil', {
        type: Sequelize.DATE,
        allowNull: true,
        after: 'pinFailedAttempts'
      });
    }

    if (!(await hasColumn(queryInterface, 'Users', 'pinLastLoginAt'))) {
      await queryInterface.addColumn('Users', 'pinLastLoginAt', {
        type: Sequelize.DATE,
        allowNull: true,
        after: 'pinLockedUntil'
      });
    }

    if (!(await hasColumn(queryInterface, 'WinerySettings', 'authConfig'))) {
      await queryInterface.addColumn('WinerySettings', 'authConfig', {
        type: Sequelize.JSON,
        allowNull: true,
        after: 'identityMatchingConfig'
      });
    }
  },

  async down(queryInterface) {
    if (await hasColumn(queryInterface, 'WinerySettings', 'authConfig')) {
      await queryInterface.removeColumn('WinerySettings', 'authConfig');
    }

    for (const column of ['pinLastLoginAt', 'pinLockedUntil', 'pinFailedAttempts', 'pinUpdatedAt', 'pinHash']) {
      if (await hasColumn(queryInterface, 'Users', column)) {
        await queryInterface.removeColumn('Users', column);
      }
    }
  }
};
