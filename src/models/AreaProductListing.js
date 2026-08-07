const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AreaProductListing extends Model {
    static associate(models) {
      AreaProductListing.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      AreaProductListing.belongsTo(models.OperationalArea, { foreignKey: 'areaId', as: 'Area' });
      AreaProductListing.belongsTo(models.WineryProduct, { foreignKey: 'productId', as: 'Product' });
    }
  }

  AreaProductListing.init(
    {
      isAvailable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      priceOverride: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      stockStatusOverride: {
        type: DataTypes.ENUM('IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'),
        allowNull: true
      },
      isFeatured: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      salesNotes: { type: DataTypes.TEXT, allowNull: true },
      wineryId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'Wineries', key: 'id' }
      },
      areaId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'OperationalAreas', key: 'id' }
      },
      productId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'WineryProducts', key: 'id' }
      }
    },
    {
      sequelize,
      modelName: 'AreaProductListing',
      tableName: 'AreaProductListings',
      timestamps: true,
      indexes: [
        { unique: true, fields: ['areaId', 'productId'] },
        { fields: ['wineryId', 'areaId', 'isAvailable'] },
        { fields: ['wineryId', 'productId'] }
      ]
    }
  );

  return AreaProductListing;
};
