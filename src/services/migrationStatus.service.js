const fs = require('fs/promises');
const path = require('path');

const DEFAULT_MIGRATIONS_DIRECTORY = path.resolve(__dirname, '..', 'db', 'migrations');
const METADATA_TABLE = 'SequelizeMeta';

function normalizeTableName(table) {
  if (typeof table === 'string') return table;
  if (!table || typeof table !== 'object') return '';
  return table.tableName || table.table_name || table.name || '';
}

async function loadMigrationNames(migrationsDirectory = DEFAULT_MIGRATIONS_DIRECTORY) {
  const entries = await fs.readdir(migrationsDirectory, { withFileTypes: true });
  return entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.js'))
    .map(entry => entry.name)
    .sort();
}

async function loadAppliedMigrationNames(sequelize) {
  const queryInterface = sequelize.getQueryInterface();
  const tables = await queryInterface.showAllTables();
  const metadataTablePresent = tables.some(
    table => normalizeTableName(table).toLowerCase() === METADATA_TABLE.toLowerCase()
  );

  if (!metadataTablePresent) {
    return { metadataTablePresent: false, appliedNames: [] };
  }

  const rows = await queryInterface.select(null, METADATA_TABLE, {
    attributes: ['name'],
    raw: true
  });
  const appliedNames = rows
    .map(row => String(row.name || '').trim())
    .filter(Boolean)
    .sort();

  return { metadataTablePresent: true, appliedNames };
}

async function inspectMigrationStatus({
  sequelize,
  migrationNames = null,
  migrationsDirectory = DEFAULT_MIGRATIONS_DIRECTORY
}) {
  if (!sequelize) throw new Error('A Sequelize connection is required to inspect migrations.');

  const expectedNames = migrationNames || await loadMigrationNames(migrationsDirectory);
  const { metadataTablePresent, appliedNames } = await loadAppliedMigrationNames(sequelize);
  const expectedSet = new Set(expectedNames);
  const appliedSet = new Set(appliedNames);
  const pendingNames = expectedNames.filter(name => !appliedSet.has(name));
  const unknownAppliedNames = appliedNames.filter(name => !expectedSet.has(name));

  return {
    ready: metadataTablePresent && pendingNames.length === 0 && unknownAppliedNames.length === 0,
    metadataTablePresent,
    expectedCount: expectedNames.length,
    appliedCount: appliedNames.length,
    pendingCount: pendingNames.length,
    unknownAppliedCount: unknownAppliedNames.length,
    pendingNames,
    unknownAppliedNames
  };
}

module.exports = {
  DEFAULT_MIGRATIONS_DIRECTORY,
  inspectMigrationStatus,
  loadAppliedMigrationNames,
  loadMigrationNames,
  normalizeTableName
};
