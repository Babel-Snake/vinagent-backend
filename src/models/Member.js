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
            // --- Core Identity ---
            firstName: { type: DataTypes.STRING, allowNull: false },
            lastName: { type: DataTypes.STRING, allowNull: false },
            email: { type: DataTypes.STRING, allowNull: true },
            phone: { type: DataTypes.STRING, allowNull: true },

            // --- Address ---
            addressLine1: { type: DataTypes.STRING, allowNull: true },
            addressLine2: { type: DataTypes.STRING, allowNull: true },
            suburb: { type: DataTypes.STRING, allowNull: true },
            state: { type: DataTypes.STRING, allowNull: true },
            postcode: { type: DataTypes.STRING, allowNull: true },
            country: { type: DataTypes.STRING, allowNull: true, defaultValue: 'Australia' },

            // --- Demographics ---
            dateOfBirth: { type: DataTypes.DATEONLY, allowNull: true },
            gender: { type: DataTypes.STRING, allowNull: true },
            preferredLanguage: { type: DataTypes.STRING, allowNull: true, defaultValue: 'en' },

            // --- Source & Acquisition ---
            source: {
                type: DataTypes.ENUM('manual', 'sms', 'email', 'booking', 'wine_club', 'pos', 'import', 'website', 'referral', 'walk_in'),
                defaultValue: 'manual'
            },
            externalRef: { type: DataTypes.STRING, allowNull: true }, // ID from external CRM/POS

            // --- Wine Preferences ---
            winePreferences: { type: DataTypes.JSON, allowNull: true },
            // Structure: { varietals: ['Shiraz','Riesling'], styles: ['Bold Red','Sparkling'],
            //              priceRange: { min: 20, max: 80 }, dietaryNotes: 'Vegan' }

            // --- Engagement & Spending ---
            lifetimeSpend: { type: DataTypes.DECIMAL(10, 2), allowNull: true, defaultValue: 0 },
            totalOrders: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 },
            visitCount: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 },
            lastContactAt: { type: DataTypes.DATE, allowNull: true },
            lastVisitAt: { type: DataTypes.DATE, allowNull: true },
            lastPurchaseAt: { type: DataTypes.DATE, allowNull: true },

            // --- Loyalty & Segmentation ---
            loyaltyTier: {
                type: DataTypes.ENUM('none', 'bronze', 'silver', 'gold', 'platinum'),
                defaultValue: 'none'
            },
            isWineClubMember: { type: DataTypes.BOOLEAN, defaultValue: false },
            tags: { type: DataTypes.JSON, allowNull: true }, // ["VIP", "trade", "local", ...]

            // --- Communication ---
            preferredContactMethod: {
                type: DataTypes.ENUM('email', 'sms', 'phone', 'any'),
                defaultValue: 'any'
            },
            marketingOptIn: { type: DataTypes.BOOLEAN, defaultValue: false },

            // --- Internal ---
            notes: { type: DataTypes.TEXT, allowNull: true },
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
