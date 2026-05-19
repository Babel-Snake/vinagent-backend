module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Messages', 'taskId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'Tasks',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    await queryInterface.addIndex('Messages', ['taskId'], {
      name: 'messages_task_id_idx'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('Messages', 'messages_task_id_idx');
    await queryInterface.removeColumn('Messages', 'taskId');
  }
};
