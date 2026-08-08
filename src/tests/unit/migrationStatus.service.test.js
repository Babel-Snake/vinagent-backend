const {
  inspectMigrationStatus,
  normalizeTableName
} = require('../../services/migrationStatus.service');
const { DataTypes, Sequelize } = require('sequelize');

function mockSequelize({ tables = ['SequelizeMeta'], applied = [] } = {}) {
  const queryInterface = {
    showAllTables: jest.fn().mockResolvedValue(tables),
    select: jest.fn().mockResolvedValue(applied.map(name => ({ name })))
  };
  return {
    sequelize: { getQueryInterface: () => queryInterface },
    queryInterface
  };
}

describe('migrationStatus service', () => {
  test('reports an exact migration match as ready using read-only metadata calls', async () => {
    const { sequelize, queryInterface } = mockSequelize({ applied: ['001-first.js', '002-second.js'] });
    const result = await inspectMigrationStatus({
      sequelize,
      migrationNames: ['001-first.js', '002-second.js']
    });

    expect(result).toMatchObject({
      ready: true,
      pendingCount: 0,
      unknownAppliedCount: 0,
      appliedCount: 2
    });
    expect(queryInterface.showAllTables).toHaveBeenCalledTimes(1);
    expect(queryInterface.select).toHaveBeenCalledWith(null, 'SequelizeMeta', {
      attributes: ['name'],
      raw: true
    });
  });

  test('fails closed when metadata is absent or the image and database disagree', async () => {
    const missingMetadata = mockSequelize({ tables: [], applied: [] });
    const noMetadataResult = await inspectMigrationStatus({
      sequelize: missingMetadata.sequelize,
      migrationNames: ['001-first.js']
    });
    expect(noMetadataResult).toMatchObject({ ready: false, metadataTablePresent: false, pendingCount: 1 });
    expect(missingMetadata.queryInterface.select).not.toHaveBeenCalled();

    const mismatch = mockSequelize({ applied: ['001-first.js', '999-unknown.js'] });
    const mismatchResult = await inspectMigrationStatus({
      sequelize: mismatch.sequelize,
      migrationNames: ['001-first.js', '002-second.js']
    });
    expect(mismatchResult).toMatchObject({ ready: false, pendingCount: 1, unknownAppliedCount: 1 });
  });

  test('normalizes table names returned by different Sequelize dialects', () => {
    expect(normalizeTableName('SequelizeMeta')).toBe('SequelizeMeta');
    expect(normalizeTableName({ tableName: 'SequelizeMeta' })).toBe('SequelizeMeta');
    expect(normalizeTableName({ table_name: 'SequelizeMeta' })).toBe('SequelizeMeta');
  });

  test('reads real Sequelize metadata without mutating migration state', async () => {
    const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
    const queryInterface = sequelize.getQueryInterface();
    try {
      await queryInterface.createTable('SequelizeMeta', {
        name: { type: DataTypes.STRING, allowNull: false, primaryKey: true }
      });
      await queryInterface.bulkInsert('SequelizeMeta', [{ name: '001-first.js' }]);

      const result = await inspectMigrationStatus({
        sequelize,
        migrationNames: ['001-first.js']
      });
      expect(result).toMatchObject({ ready: true, appliedCount: 1, pendingCount: 0 });

      const rows = await queryInterface.select(null, 'SequelizeMeta', { raw: true });
      expect(rows).toEqual([{ name: '001-first.js' }]);
    } finally {
      await sequelize.close();
    }
  });
});
