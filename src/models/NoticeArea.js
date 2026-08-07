const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class NoticeArea extends Model {
    static associate(models) {
      NoticeArea.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      NoticeArea.belongsTo(models.Notice, { foreignKey: 'noticeId' });
      NoticeArea.belongsTo(models.OperationalArea, { foreignKey: 'areaId', as: 'Area' });
    }
  }

  NoticeArea.init(
    {
      wineryId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'Wineries', key: 'id' }
      },
      noticeId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'Notices', key: 'id' }
      },
      areaId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'OperationalAreas', key: 'id' }
      }
    },
    {
      sequelize,
      modelName: 'NoticeArea',
      tableName: 'NoticeAreas',
      timestamps: true,
      indexes: [
        { unique: true, fields: ['noticeId', 'areaId'] },
        { fields: ['wineryId', 'areaId', 'noticeId'] }
      ]
    }
  );

  return NoticeArea;
};
