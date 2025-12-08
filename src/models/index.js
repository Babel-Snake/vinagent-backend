const fs = require('fs');
const path = require('path');
const { sequelize } = require('../config/db');

const db = {};
const basename = path.basename(__filename);

// Read all files in this directory (except index.js and hidden files)
fs.readdirSync(__dirname)
    .filter((file) => {
        return (
            file.indexOf('.') !== 0 &&
            file !== basename &&
            file.slice(-3) === '.js'
        );
    })
    .forEach((file) => {
        // Import the model
        const modelDef = require(path.join(__dirname, file));
        // Check if it exports a function (standard sequelize pattern)
        // or a class directly. We assume standard 'module.exports = (sequelize, DataTypes) => ...'
        // or 'module.exports = class X extends Model ...'
        // For simplicity in this project, we'll assume the files export a mechanism to init.
        // NOTE: If using the class pattern, we might need manual init.
        // Let's assume the AGENT_GUIDE implies standard definition.
        // We will stick to the pattern: each file exports a function receiving sequelize.

        // Safety check just in case
        if (typeof modelDef === 'function') {
            const model = modelDef(sequelize, require('sequelize').DataTypes);
            db[model.name] = model;
        }
    });

// Setup associations
Object.keys(db).forEach((modelName) => {
    if (db[modelName].associate) {
        db[modelName].associate(db);
    }
});

db.sequelize = sequelize;
db.Sequelize = require('sequelize');

module.exports = db;
