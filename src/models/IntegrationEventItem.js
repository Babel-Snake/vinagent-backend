const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class IntegrationEventItem extends Model {
    static associate(models) {
      IntegrationEventItem.belongsTo(models.IntegrationEvent, { foreignKey: 'eventId', as: 'Event' });
      IntegrationEventItem.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      IntegrationEventItem.belongsTo(models.User, { foreignKey: 'createdBy', as: 'Creator' });
    }
  }

  IntegrationEventItem.init({
    eventId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'IntegrationEvents', key: 'id' }
    },
    wineryId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'Wineries', key: 'id' }
    },
    itemType: {
      type: DataTypes.ENUM('TASK', 'NOTICE', 'REQUEST', 'NOTE'),
      allowNull: false
    },
    itemId: { type: DataTypes.INTEGER, allowNull: false },
    itemKey: { type: DataTypes.STRING(100), allowNull: true },
    linkType: {
      type: DataTypes.ENUM('CREATED', 'LINKED'),
      allowNull: false,
      defaultValue: 'CREATED'
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'Users', key: 'id' }
    }
  }, {
    sequelize,
    modelName: 'IntegrationEventItem',
    tableName: 'IntegrationEventItems',
    timestamps: true,
    updatedAt: false,
    indexes: [
      { unique: true, fields: ['eventId', 'itemType', 'itemId'] },
      { unique: true, fields: ['eventId', 'itemKey'] },
      { fields: ['wineryId', 'itemType', 'itemId'] }
    ]
  });

  return IntegrationEventItem;
};
