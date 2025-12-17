'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class WineryBrandProfile extends Model {
        static associate(models) {
            WineryBrandProfile.belongsTo(models.Winery, { foreignKey: 'wineryId' });
        }
    }
    WineryBrandProfile.init({
        wineryId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
        brandStoryShort: DataTypes.TEXT,
        tonePreset: DataTypes.ENUM('warm', 'premium', 'playful', 'rustic', 'formal'),
        voiceGuidelines: DataTypes.TEXT,
        doSayExamples: DataTypes.JSON,
        dontSayExamples: DataTypes.JSON,
        signOffDefault: DataTypes.STRING,
        spellingLocale: { type: DataTypes.STRING, defaultValue: 'AU' },
        emojisAllowed: { type: DataTypes.BOOLEAN, defaultValue: true },
        formalityLevel: { type: DataTypes.INTEGER, defaultValue: 3 },
        readingLevel: { type: DataTypes.STRING, defaultValue: 'standard' }
    }, {
        sequelize,
        modelName: 'WineryBrandProfile',
    });
    return WineryBrandProfile;
};
