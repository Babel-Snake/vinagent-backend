// src/models/Task.js
// Sequelize model for Task, see DOMAIN_MODEL.md for fields and relationships.

module.exports = (sequelize, DataTypes) => {
  const Task = sequelize.define(
    'Task',
    {
      // TODO: Define fields based on DOMAIN_MODEL.md
      // e.g. type, status, payload (JSON), suggestedChannel, etc.
    },
    {
      tableName: 'Tasks'
    }
  );

  Task.associate = (models) => {
    // TODO: define associations
  };

  return Task;
};
