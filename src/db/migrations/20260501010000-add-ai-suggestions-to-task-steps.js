'use strict';

async function addColumnIfMissing(queryInterface, tableName, columnName, definition) {
    const table = await queryInterface.describeTable(tableName);
    if (!table[columnName]) {
        await queryInterface.addColumn(tableName, columnName, definition);
    }
}

async function removeColumnIfPresent(queryInterface, tableName, columnName) {
    const table = await queryInterface.describeTable(tableName);
    if (table[columnName]) {
        await queryInterface.removeColumn(tableName, columnName);
    }
}

module.exports = {
    async up(queryInterface, Sequelize) {
        await addColumnIfMissing(queryInterface, 'TaskSteps', 'suggestedReplyBody', {
            type: Sequelize.TEXT,
            allowNull: true
        });
        await addColumnIfMissing(queryInterface, 'TaskSteps', 'suggestedReplySubject', {
            type: Sequelize.STRING,
            allowNull: true
        });
        await addColumnIfMissing(queryInterface, 'TaskSteps', 'suggestedChannel', {
            type: Sequelize.STRING,
            allowNull: true
        });
        await addColumnIfMissing(queryInterface, 'TaskSteps', 'suggestedAction', {
            type: Sequelize.TEXT,
            allowNull: true
        });
        await addColumnIfMissing(queryInterface, 'TaskSteps', 'suggestedRecipientEmail', {
            type: Sequelize.STRING,
            allowNull: true
        });
        await addColumnIfMissing(queryInterface, 'TaskSteps', 'suggestedCc', {
            type: Sequelize.STRING,
            allowNull: true
        });
        await addColumnIfMissing(queryInterface, 'TaskSteps', 'suggestionStatus', {
            type: Sequelize.STRING,
            allowNull: true
        });
        await addColumnIfMissing(queryInterface, 'TaskSteps', 'suggestionGeneratedAt', {
            type: Sequelize.DATE,
            allowNull: true
        });
        await addColumnIfMissing(queryInterface, 'TaskSteps', 'suggestionError', {
            type: Sequelize.TEXT,
            allowNull: true
        });
    },

    async down(queryInterface) {
        await removeColumnIfPresent(queryInterface, 'TaskSteps', 'suggestionError');
        await removeColumnIfPresent(queryInterface, 'TaskSteps', 'suggestionGeneratedAt');
        await removeColumnIfPresent(queryInterface, 'TaskSteps', 'suggestionStatus');
        await removeColumnIfPresent(queryInterface, 'TaskSteps', 'suggestedCc');
        await removeColumnIfPresent(queryInterface, 'TaskSteps', 'suggestedRecipientEmail');
        await removeColumnIfPresent(queryInterface, 'TaskSteps', 'suggestedAction');
        await removeColumnIfPresent(queryInterface, 'TaskSteps', 'suggestedChannel');
        await removeColumnIfPresent(queryInterface, 'TaskSteps', 'suggestedReplySubject');
        await removeColumnIfPresent(queryInterface, 'TaskSteps', 'suggestedReplyBody');
    }
};
