const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class NoticeComment extends Model {
    static associate(models) {
      NoticeComment.belongsTo(models.Notice, { foreignKey: 'noticeId' });
      NoticeComment.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      NoticeComment.belongsTo(models.User, { foreignKey: 'userId', as: 'Author' });
      NoticeComment.belongsTo(models.NoticeComment, { foreignKey: 'parentCommentId', as: 'ParentComment' });
      NoticeComment.hasMany(models.NoticeComment, { foreignKey: 'parentCommentId', as: 'Replies' });
    }
  }

  NoticeComment.init(
    {
      noticeId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'Notices', key: 'id' }
      },
      wineryId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'Wineries', key: 'id' }
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'Users', key: 'id' }
      },
      parentCommentId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'NoticeComments', key: 'id' }
      },
      body: {
        type: DataTypes.TEXT,
        allowNull: false
      }
    },
    {
      sequelize,
      modelName: 'NoticeComment',
      tableName: 'NoticeComments',
      timestamps: true
    }
  );

  return NoticeComment;
};
