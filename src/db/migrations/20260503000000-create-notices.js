'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Notices', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      title: {
        type: Sequelize.STRING,
        allowNull: false
      },
      body: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      category: {
        type: Sequelize.ENUM(
          'GENERAL',
          'WINE',
          'VINTAGE_CHANGE',
          'PRICING',
          'STOCK',
          'CUSTOMERS',
          'MAINTENANCE',
          'EVENTS',
          'STAFF',
          'WINE_CLUB',
          'URGENT'
        ),
        allowNull: false,
        defaultValue: 'GENERAL'
      },
      priority: {
        type: Sequelize.ENUM('normal', 'important', 'urgent'),
        allowNull: false,
        defaultValue: 'normal'
      },
      isPinned: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      effectiveFrom: {
        type: Sequelize.DATE,
        allowNull: true
      },
      expiresAt: {
        type: Sequelize.DATE,
        allowNull: true
      },
      archivedAt: {
        type: Sequelize.DATE,
        allowNull: true
      },
      wineryId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'Wineries', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      createdBy: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'Users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      updatedBy: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'Users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      archivedBy: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'Users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    await queryInterface.addIndex('Notices', ['wineryId', 'archivedAt']);
    await queryInterface.addIndex('Notices', ['wineryId', 'expiresAt']);
    await queryInterface.addIndex('Notices', ['wineryId', 'isPinned']);
    await queryInterface.addIndex('Notices', ['wineryId', 'priority']);
    await queryInterface.addIndex('Notices', ['wineryId', 'category']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('Notices');
  }
};
