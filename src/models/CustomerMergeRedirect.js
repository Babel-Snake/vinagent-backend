const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CustomerMergeRedirect extends Model {
    static associate(models) {
      CustomerMergeRedirect.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      CustomerMergeRedirect.belongsTo(models.Member, { foreignKey: 'targetMemberId', as: 'TargetMember' });
      CustomerMergeRedirect.belongsTo(models.User, { foreignKey: 'mergedBy', as: 'MergedByUser' });
    }
  }

  CustomerMergeRedirect.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' } },
    sourceMemberId: { type: DataTypes.INTEGER, allowNull: false },
    targetMemberId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Members', key: 'id' } },
    mergedBy: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'Users', key: 'id' } },
    reason: DataTypes.STRING,
    mergedAt: { type: DataTypes.DATE, allowNull: false },
    metadata: DataTypes.JSON
  }, {
    sequelize,
    modelName: 'CustomerMergeRedirect',
    tableName: 'CustomerMergeRedirects',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['wineryId', 'sourceMemberId'], name: 'customer_merge_redirects_unique_source' },
      { fields: ['wineryId', 'targetMemberId'], name: 'customer_merge_redirects_target' }
    ]
  });

  return CustomerMergeRedirect;
};
