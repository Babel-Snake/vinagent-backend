const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class UserAreaMembership extends Model {
    static associate(models) {
      UserAreaMembership.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      UserAreaMembership.belongsTo(models.User, { foreignKey: 'userId', as: 'User' });
      UserAreaMembership.belongsTo(models.OperationalArea, { foreignKey: 'areaId', as: 'Area' });
    }
  }

  UserAreaMembership.init(
    {
      membershipRole: {
        type: DataTypes.ENUM('MEMBER', 'MANAGER'),
        allowNull: false,
        defaultValue: 'MEMBER'
      },
      isPrimary: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      wineryId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'Wineries', key: 'id' }
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'Users', key: 'id' }
      },
      areaId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'OperationalAreas', key: 'id' }
      }
    },
    {
      sequelize,
      modelName: 'UserAreaMembership',
      tableName: 'UserAreaMemberships',
      timestamps: true,
      indexes: [
        { unique: true, fields: ['userId', 'areaId'] },
        { fields: ['wineryId', 'userId'] },
        { fields: ['wineryId', 'areaId', 'membershipRole'] }
      ]
    }
  );

  return UserAreaMembership;
};
