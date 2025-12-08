const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class User extends Model {
        static associate(models) {
            User.belongsTo(models.Winery, { foreignKey: 'wineryId' });
            User.hasMany(models.TaskAction, { foreignKey: 'userId' });
        }
    }

    User.init(
        {
            firebaseUid: {
                type: DataTypes.STRING,
                allowNull: false,
                unique: true
            },
            email: {
                type: DataTypes.STRING,
                allowNull: false,
                validate: {
                    isEmail: true
                }
            },
            displayName: {
                type: DataTypes.STRING,
                allowNull: true
            },
            role: {
                type: DataTypes.ENUM('admin', 'manager', 'staff'),
                allowNull: false,
                defaultValue: 'staff'
            },
            wineryId: {
                type: DataTypes.INTEGER,
                allowNull: true,
                references: {
                    model: 'Wineries',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'SET NULL'
            }
        },
        {
            sequelize,
            modelName: 'User',
            tableName: 'Users',
            timestamps: true
        }
    );
    return User;
};
