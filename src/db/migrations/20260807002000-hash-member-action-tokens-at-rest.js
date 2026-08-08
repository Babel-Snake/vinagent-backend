'use strict';

const crypto = require('crypto');

function digest(token) {
  return crypto.createHash('sha256').update(String(token), 'utf8').digest('hex');
}

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('MemberActionTokens');
    if (!table.tokenHash) {
      await queryInterface.addColumn('MemberActionTokens', 'tokenHash', {
        type: Sequelize.STRING(64),
        allowNull: true
      });
    }

    const rows = await queryInterface.sequelize.query(
      'SELECT id, token FROM MemberActionTokens WHERE token IS NOT NULL',
      { type: Sequelize.QueryTypes.SELECT }
    );
    for (const row of rows) {
      await queryInterface.bulkUpdate(
        'MemberActionTokens',
        { tokenHash: digest(row.token) },
        { id: row.id }
      );
    }

    const indexes = await queryInterface.showIndex('MemberActionTokens');
    if (!indexes.some(index => index.name === 'member_action_tokens_token_hash_unique')) {
      await queryInterface.addIndex('MemberActionTokens', ['tokenHash'], {
        name: 'member_action_tokens_token_hash_unique',
        unique: true
      });
    }

    await queryInterface.changeColumn('MemberActionTokens', 'token', {
      type: Sequelize.STRING(64),
      allowNull: true
    });
    await queryInterface.bulkUpdate(
      'MemberActionTokens',
      { token: null },
      { token: { [Sequelize.Op.ne]: null } }
    );
    await queryInterface.changeColumn('MemberActionTokens', 'tokenHash', {
      type: Sequelize.STRING(64),
      allowNull: false
    });
  },

  async down(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('MemberActionTokens');
    if (!table.tokenHash) return;

    const rows = await queryInterface.sequelize.query(
      'SELECT id, tokenHash FROM MemberActionTokens WHERE tokenHash IS NOT NULL',
      { type: Sequelize.QueryTypes.SELECT }
    );
    for (const row of rows) {
      // The original bearer cannot be recovered. Restoring the digest keeps the
      // old schema structurally valid, but pre-migration links are invalidated.
      await queryInterface.bulkUpdate(
        'MemberActionTokens',
        { token: row.tokenHash },
        { id: row.id }
      );
    }

    await queryInterface.changeColumn('MemberActionTokens', 'token', {
      type: Sequelize.STRING(64),
      allowNull: false
    });
    const indexes = await queryInterface.showIndex('MemberActionTokens');
    if (indexes.some(index => index.name === 'member_action_tokens_token_hash_unique')) {
      await queryInterface.removeIndex('MemberActionTokens', 'member_action_tokens_token_hash_unique');
    }
    await queryInterface.removeColumn('MemberActionTokens', 'tokenHash');
  }
};
