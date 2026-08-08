'use strict';

const INDEX_NAME = 'messages_winery_source_external_id_unique';
const WINERY_INDEX_NAME = 'messages_winery_id_idx';

async function ensureWineryIndex(queryInterface) {
  if (queryInterface.sequelize.getDialect() !== 'mysql') return;
  const indexes = await queryInterface.showIndex('Messages');
  if (indexes.some(index => index.name === WINERY_INDEX_NAME)) return;

  await queryInterface.addIndex('Messages', ['wineryId'], {
    name: WINERY_INDEX_NAME
  });
}

module.exports = {
  async up(queryInterface) {
    const [duplicates] = await queryInterface.sequelize.query(`
      SELECT wineryId, source, externalId, COUNT(*) AS duplicateCount
      FROM Messages
      WHERE externalId IS NOT NULL
      GROUP BY wineryId, source, externalId
      HAVING COUNT(*) > 1
      LIMIT 1
    `);

    if (duplicates.length > 0) {
      throw new Error(
        'Cannot enforce webhook idempotency: duplicate Messages exist for the same winery, source and externalId. Resolve the duplicates before retrying this migration.'
      );
    }

    // Keep an explicit single-column index for the winery foreign key. MySQL
    // may otherwise replace its implicit FK index with the composite unique
    // index, which makes this migration impossible to roll back safely.
    await ensureWineryIndex(queryInterface);
    await queryInterface.addIndex('Messages', ['wineryId', 'source', 'externalId'], {
      name: INDEX_NAME,
      unique: true
    });
  },

  async down(queryInterface) {
    await ensureWineryIndex(queryInterface);
    await queryInterface.removeIndex('Messages', INDEX_NAME);
  }
};
