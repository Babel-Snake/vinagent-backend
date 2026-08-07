const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class NoticeAcknowledgement extends Model {
    static associate(models) {
      NoticeAcknowledgement.belongsTo(models.Notice, { foreignKey: 'noticeId', as: 'Notice' });
      NoticeAcknowledgement.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      NoticeAcknowledgement.belongsTo(models.User, { foreignKey: 'userId', as: 'User' });
    }
  }

  NoticeAcknowledgement.init({
    noticeId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Notices', key: 'id' } },
    wineryId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' } },
    userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Users', key: 'id' } },
    acknowledgedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, {
    sequelize,
    modelName: 'NoticeAcknowledgement',
    tableName: 'NoticeAcknowledgements',
    timestamps: true,
    updatedAt: false,
    indexes: [
      { unique: true, fields: ['noticeId', 'userId'] },
      { fields: ['wineryId', 'acknowledgedAt'] }
    ]
  });

  return NoticeAcknowledgement;
};
