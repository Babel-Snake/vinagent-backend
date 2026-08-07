'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('OperationalIntelligenceConfigAuditEvents', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      eventType: {
        type: Sequelize.ENUM('CONFIG_UPDATED'),
        allowNull: false,
        defaultValue: 'CONFIG_UPDATED'
      },
      preset: { type: Sequelize.STRING, allowNull: true },
      beforeSnapshot: { type: Sequelize.JSON, allowNull: true },
      afterSnapshot: { type: Sequelize.JSON, allowNull: true },
      changedKeys: { type: Sequelize.JSON, allowNull: true },
      metadata: { type: Sequelize.JSON, allowNull: true },
      wineryId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'Wineries', key: 'id' },
        onDelete: 'CASCADE'
      },
      actorUserId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'Users', key: 'id' },
        onDelete: 'RESTRICT'
      },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    });
    await queryInterface.addIndex('OperationalIntelligenceConfigAuditEvents', ['wineryId', 'createdAt'], { name: 'oi_config_audit_winery_created' });
    await queryInterface.addIndex('OperationalIntelligenceConfigAuditEvents', ['wineryId', 'actorUserId', 'createdAt'], { name: 'oi_config_audit_winery_actor_created' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('OperationalIntelligenceConfigAuditEvents');
    if (queryInterface.sequelize.getDialect() === 'postgres') {
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_OperationalIntelligenceConfigAuditEvents_eventType";');
    }
  }
};
