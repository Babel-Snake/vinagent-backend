const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class WineClubAllocationItem extends Model {
    static associate(models) {
      WineClubAllocationItem.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      WineClubAllocationItem.belongsTo(models.WineClubAllocation, { foreignKey: 'allocationId', as: 'Allocation' });
      WineClubAllocationItem.belongsTo(models.ProductVariant, { foreignKey: 'productVariantId', as: 'ProductVariant' });
    }
  }

  WineClubAllocationItem.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' } },
    allocationId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'WineClubAllocations', key: 'id' }
    },
    lineKey: { type: DataTypes.STRING(160), allowNull: false },
    productVariantId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'ProductVariants', key: 'id' } },
    providerSku: DataTypes.STRING(160),
    description: { type: DataTypes.STRING(255), allowNull: false },
    quantity: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
    unit: { type: DataTypes.STRING(40), allowNull: false },
    substitutionAllowed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    substitutedFromSku: DataTypes.STRING(160),
    currency: DataTypes.STRING(3),
    unitPriceMinor: DataTypes.INTEGER,
    totalMinor: DataTypes.INTEGER,
    providerExtensions: DataTypes.JSON
  }, {
    sequelize,
    modelName: 'WineClubAllocationItem',
    tableName: 'WineClubAllocationItems',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['allocationId', 'lineKey'], name: 'wine_club_allocation_items_unique_line' },
      { fields: ['wineryId', 'providerSku'], name: 'wine_club_allocation_items_sku' },
      { fields: ['wineryId', 'productVariantId'], name: 'wine_club_allocation_items_variant' }
    ]
  });

  return WineClubAllocationItem;
};
