const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Attachment extends Model {
    static associate(models) {
      Attachment.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      Attachment.belongsTo(models.User, { foreignKey: 'uploadedBy', as: 'Uploader' });
      Attachment.belongsTo(models.User, { foreignKey: 'deletedBy', as: 'Deleter' });
    }
  }

  Attachment.init(
    {
      entityType: {
        type: DataTypes.ENUM('TASK', 'TASK_STEP', 'TASK_OUTCOME', 'TASK_FOLLOW_UP', 'NOTICE', 'REQUEST', 'NOTE', 'PROJECT'),
        allowNull: false
      },
      entityId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      wineryId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'Wineries', key: 'id' }
      },
      filename: {
        type: DataTypes.STRING,
        allowNull: false
      },
      originalFilename: {
        type: DataTypes.STRING,
        allowNull: false
      },
      mimeType: {
        type: DataTypes.STRING,
        allowNull: false
      },
      sizeBytes: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      storageKey: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
      },
      uploadedBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'Users', key: 'id' }
      },
      deletedAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      deletedBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'Users', key: 'id' }
      }
    },
    {
      sequelize,
      modelName: 'Attachment',
      tableName: 'Attachments',
      timestamps: true
    }
  );

  return Attachment;
};
