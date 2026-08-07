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
    // MySQL may use messages_task_id_idx to enforce the taskId foreign key.
    // Removing the column drops the constraint and supporting index together.
    await queryInterface.removeColumn('Messages', 'taskId');
  }
};
