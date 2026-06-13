const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class IntegrationEvent extends Model {
    static associate(models) {
      IntegrationEvent.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      IntegrationEvent.belongsTo(models.User, { foreignKey: 'createdBy', as: 'Creator' });
      IntegrationEvent.belongsTo(models.User, { foreignKey: 'reviewedBy', as: 'Reviewer' });

      if (models.Notice) {
        IntegrationEvent.hasMany(models.Notice, { foreignKey: 'sourceEventId', as: 'Notices' });
      }
    }
  }

  IntegrationEvent.init(
    {
      provider: {
        type: DataTypes.STRING,
        allowNull: false
      },
      intakeMethod: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'manual'
      },
      eventType: {
        type: DataTypes.STRING,
        allowNull: false
      },
      externalEventId: {
        type: DataTypes.STRING,
        allowNull: true
      },
      rawPayload: {
        type: DataTypes.JSON,
        allowNull: true
      },
      normalizedPayload: {
        type: DataTypes.JSON,
        allowNull: true
      },
      status: {
        type: DataTypes.ENUM(
          'RECEIVED',
          'NORMALIZED',
          'PENDING_REVIEW',
          'PROCESSED',
          'IGNORED',
          'ARCHIVED',
          'FAILED',
          'DUPLICATE'
        ),
        allowNull: false,
        defaultValue: 'RECEIVED'
      },
      processingError: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      receivedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      processedAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      reviewedAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      relatedRecordType: {
        type: DataTypes.STRING,
        allowNull: true
      },
      relatedRecordId: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      metadata: {
        type: DataTypes.JSON,
        allowNull: true
      },
      wineryId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'Wineries', key: 'id' }
      },
      createdBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'Users', key: 'id' }
      },
      reviewedBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'Users', key: 'id' }
      }
    },
    {
      sequelize,
      modelName: 'IntegrationEvent',
      tableName: 'IntegrationEvents',
      timestamps: true
    }
  );

  return IntegrationEvent;
};
