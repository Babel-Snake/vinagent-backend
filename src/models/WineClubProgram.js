const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class WineClubProgram extends Model {
    static associate(models) {
      WineClubProgram.belongsTo(models.Winery, { foreignKey: 'wineryId' });
      WineClubProgram.belongsTo(models.User, { foreignKey: 'createdBy', as: 'Creator' });
      WineClubProgram.belongsTo(models.User, { foreignKey: 'updatedBy', as: 'Updater' });
      WineClubProgram.hasMany(models.WineClubMembership, { foreignKey: 'programId', as: 'Memberships' });
      WineClubProgram.hasMany(models.WineClubAllocation, { foreignKey: 'programId', as: 'Allocations' });
    }
  }

  WineClubProgram.init({
    wineryId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Wineries', key: 'id' } },
    code: { type: DataTypes.STRING(100), allowNull: false },
    name: { type: DataTypes.STRING(160), allowNull: false },
    tier: DataTypes.STRING(80),
    cadence: DataTypes.STRING(80),
    benefitsSummary: DataTypes.TEXT,
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdBy: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'Users', key: 'id' } },
    updatedBy: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'Users', key: 'id' } }
  }, {
    sequelize,
    modelName: 'WineClubProgram',
    tableName: 'WineClubPrograms',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['wineryId', 'code'], name: 'wine_club_programs_unique_code' },
      { fields: ['wineryId', 'isActive', 'name'], name: 'wine_club_programs_active' }
    ]
  });

  return WineClubProgram;
};
