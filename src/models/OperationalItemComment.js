const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class OperationalItemComment extends Model {
    static associate(models) {
      OperationalItemComment.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      OperationalItemComment.belongsTo(models.User, { foreignKey: 'userId', as: 'Author' });
      OperationalItemComment.belongsTo(models.OperationalItemComment, { foreignKey: 'parentCommentId', as: 'ParentComment' });
      OperationalItemComment.hasMany(models.OperationalItemComment, { foreignKey: 'parentCommentId', as: 'Replies' });
    }
  }

  OperationalItemComment.init({
    itemType: { type: DataTypes.ENUM('REQUEST', 'NOTE'), allowNull: false },
    itemId: { type: DataTypes.INTEGER, allowNull: false },
    body: { type: DataTypes.TEXT, allowNull: false },
    wineryId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' } },
    userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Users', key: 'id' } },
    parentCommentId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'OperationalItemComments', key: 'id' } }
  }, {
    sequelize,
    modelName: 'OperationalItemComment',
    tableName: 'OperationalItemComments',
    timestamps: true,
    indexes: [
      { fields: ['wineryId', 'itemType', 'itemId', 'createdAt'] },
      { fields: ['parentCommentId'] }
    ]
  });

  return OperationalItemComment;
};
