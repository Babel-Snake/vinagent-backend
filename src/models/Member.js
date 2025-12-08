const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class Member extends Model {
        static associate(models) {
            Member.belongsTo(models.Winery, { foreignKey: 'wineryId' });
            Member.hasMany(models.Message, { foreignKey: 'memberId' });
            Member.hasMany(models.Task, { foreignKey: 'memberId' });
        }
    }

    Member.init(
        {
            firstName: { type: DataTypes.STRING, allowNull: false },
            lastName: { type: DataTypes.STRING, allowNull: false },
            email: { type: DataTypes.STRING, allowNull: true },
            phone: { type: DataTypes.STRING, allowNull: true },
            addressLine1: { type: DataTypes.STRING, allowNull: true },
            addressLine2: { type: DataTypes.STRING, allowNull: true },
            suburb: { type: DataTypes.STRING, allowNull: true },
            state: { type: DataTypes.STRING, allowNull: true },
            postcode: { type: DataTypes.STRING, allowNull: true },
            country: { type: DataTypes.STRING, allowNull: true, defaultValue: 'Australia' },
            notes: { type: DataTypes.TEXT, allowNull: true },
            externalRef: { type: DataTypes.STRING, allowNull: true },
            wineryId: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: { model: 'Wineries', key: 'id' }
            }
        },
        {
            sequelize,
            modelName: 'Member',
            tableName: 'Members',
            timestamps: true
        }
    );

    return Member;
};
