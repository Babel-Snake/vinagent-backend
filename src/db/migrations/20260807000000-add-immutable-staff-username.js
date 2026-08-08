'use strict';

const { QueryTypes } = require('sequelize');
const WINERY_INDEX_NAME = 'users_winery_id_idx';

async function ensureWineryIndex(queryInterface) {
    if (queryInterface.sequelize.getDialect() !== 'mysql') return;
    const indexes = await queryInterface.showIndex('Users');
    if (indexes.some(index => index.name === WINERY_INDEX_NAME)) return;

    await queryInterface.addIndex('Users', ['wineryId'], {
        name: WINERY_INDEX_NAME
    });
}

function normalizeUsername(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

function preferredUsername(user) {
    const managedEmailMatch = String(user.email || '')
        .match(/^([a-z0-9]+)\.w([0-9]+)@vinagent\.internal$/i);
    if (managedEmailMatch && Number(managedEmailMatch[2]) === Number(user.wineryId)) {
        return normalizeUsername(managedEmailMatch[1]);
    }

    const displayName = normalizeUsername(user.displayName);
    if (displayName.length >= 3) return displayName;

    const emailLocalPart = normalizeUsername(String(user.email || '').split('@')[0]);
    if (emailLocalPart.length >= 3) return emailLocalPart;

    return `staff${user.id}`;
}

function uniqueUsername(baseValue, userId, usedUsernames) {
    const base = normalizeUsername(baseValue).slice(0, 64) || `staff${userId}`;
    if (base.length >= 3 && !usedUsernames.has(base)) return base;

    let suffix = String(userId);
    let candidate = `${base.slice(0, 64 - suffix.length)}${suffix}`;
    let attempt = 2;
    while (usedUsernames.has(candidate)) {
        suffix = `${userId}${attempt}`;
        candidate = `${base.slice(0, 64 - suffix.length)}${suffix}`;
        attempt += 1;
    }
    return candidate;
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn('Users', 'username', {
            type: Sequelize.STRING(64),
            allowNull: true
        });

        const users = await queryInterface.sequelize.query(
            'SELECT id, wineryId, email, displayName FROM Users WHERE role = :role AND wineryId IS NOT NULL',
            {
                replacements: { role: 'staff' },
                type: QueryTypes.SELECT
            }
        );

        const usedByWinery = new Map();
        const orderedUsers = [...users].sort((left, right) => Number(left.id) - Number(right.id));

        for (const user of orderedUsers) {
            const wineryKey = String(user.wineryId);
            const usedUsernames = usedByWinery.get(wineryKey) || new Set();
            const username = uniqueUsername(preferredUsername(user), user.id, usedUsernames);
            usedUsernames.add(username);
            usedByWinery.set(wineryKey, usedUsernames);

            await queryInterface.bulkUpdate(
                'Users',
                { username },
                { id: user.id }
            );
        }

        // Preserve a dedicated index for the winery foreign key. MySQL can
        // discard its implicit FK index when the composite index is created.
        await ensureWineryIndex(queryInterface);
        await queryInterface.addIndex('Users', ['wineryId', 'username'], {
            name: 'users_winery_username_unique',
            unique: true
        });
    },

    async down(queryInterface) {
        await ensureWineryIndex(queryInterface);
        await queryInterface.removeIndex('Users', 'users_winery_username_unique');
        await queryInterface.removeColumn('Users', 'username');
    }
};
