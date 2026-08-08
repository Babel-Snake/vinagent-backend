const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class UserActivityDaily extends Model {
    static associate(models) {
      UserActivityDaily.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      UserActivityDaily.belongsTo(models.User, { foreignKey: 'userId' });
    }
  }

  UserActivityDaily.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    activityDate: { type: DataTypes.DATEONLY, allowNull: false },
    engagedSeconds: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    sessionCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    requestCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    lastActiveAt: { type: DataTypes.DATE, allowNull: true }
  }, {
    sequelize,
    modelName: 'UserActivityDaily',
    tableName: 'UserActivityDaily',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['wineryId', 'userId', 'activityDate'] },
      { fields: ['wineryId', 'activityDate'] }
    ]
  });

  return UserActivityDaily;
};
