const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class MemberActionToken extends Model {
        static associate(models) {
            MemberActionToken.belongsTo(models.Member, { foreignKey: 'memberId' });
            MemberActionToken.belongsTo(models.Winery, { foreignKey: 'wineryId' });
            MemberActionToken.belongsTo(models.Task, { foreignKey: 'taskId' });
        }

        /**
         * Check if token is valid (not expired, not used)
         */
        isValid() {
            if (this.usedAt) return false;
            if (new Date() > new Date(this.expiresAt)) return false;
            return true;
        }
    }

    MemberActionToken.init(
        {
            memberId: {
                type: DataTypes.INTEGER,
                allowNull: false
            },
            wineryId: {
                type: DataTypes.INTEGER,
                allowNull: false
            },
            taskId: {
                type: DataTypes.INTEGER,
                allowNull: true
            },
            type: {
                type: DataTypes.ENUM('ADDRESS_CHANGE', 'PAYMENT_METHOD_UPDATE', 'PREFERENCE_UPDATE'),
                allowNull: false
            },
            channel: {
                type: DataTypes.ENUM('sms', 'email', 'voice'),
                allowNull: false,
                defaultValue: 'sms'
            },
            token: {
                type: DataTypes.STRING(64),
                allowNull: false,
                unique: true
            },
            target: {
                type: DataTypes.STRING(255),
                allowNull: true
            },
            payload: {
                type: DataTypes.JSON,
                allowNull: true
            },
            expiresAt: {
                type: DataTypes.DATE,
                allowNull: false
            },
            usedAt: {
                type: DataTypes.DATE,
                allowNull: true
            }
        },
        {
            sequelize,
            modelName: 'MemberActionToken',
            tableName: 'MemberActionTokens',
            timestamps: true
        }
    );

    return MemberActionToken;
};
