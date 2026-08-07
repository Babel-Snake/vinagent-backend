const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class TaskArea extends Model {
    static associate(models) {
      TaskArea.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      TaskArea.belongsTo(models.Task, { foreignKey: 'taskId' });
      TaskArea.belongsTo(models.OperationalArea, { foreignKey: 'areaId', as: 'Area' });
    }
  }

  TaskArea.init(
    {
      relationshipType: {
        type: DataTypes.ENUM('PRIMARY', 'LINKED'),
        allowNull: false,
        defaultValue: 'LINKED'
      },
      wineryId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'Wineries', key: 'id' }
      },
      taskId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'Tasks', key: 'id' }
      },
      areaId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'OperationalAreas', key: 'id' }
      }
    },
    {
      sequelize,
      modelName: 'TaskArea',
      tableName: 'TaskAreas',
      timestamps: true,
      indexes: [
        { unique: true, fields: ['taskId', 'areaId'] },
        { fields: ['wineryId', 'areaId', 'taskId'] },
        { fields: ['taskId', 'relationshipType'] }
      ]
    }
  );

  return TaskArea;
};
