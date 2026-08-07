'use strict';

const LEAD_AUDIT_EVENTS = ['LEAD_ASSIGNED', 'LEAD_CHANGED', 'LEAD_REVOKED', 'TASK_DELEGATED'];
const PROJECT_AUDIT_EVENTS = [
  'CREATED', 'UPDATED', 'STATUS_CHANGED', 'OWNER_CHANGED', 'DATES_CHANGED',
  'RISK_CHANGED', 'PARTICIPANT_ADDED', 'PARTICIPANT_UPDATED', 'PARTICIPANT_REMOVED', 'AREA_CHANGED',
  'ITEM_LINKED', 'ITEM_UPDATED', 'ITEM_UNLINKED', 'DEPENDENCY_ADDED',
  'DEPENDENCY_REMOVED', 'ATTACHMENT_ADDED', 'ATTACHMENT_DELETED',
  'COMPLETED', 'COMPLETION_OVERRIDDEN', 'REOPENED', 'CANCELLED'
];

async function hasTable(queryInterface, tableName) {
  const expected = String(tableName).toLowerCase();
  return (await queryInterface.showAllTables()).some(table => {
    const name = typeof table === 'object' ? table.tableName || table.name : table;
    return String(name).toLowerCase() === expected;
  });
}

async function hasIndex(queryInterface, tableName, indexName) {
  return (await queryInterface.showIndex(tableName)).some(index => index.name === indexName);
}

const nullableUserReference = Sequelize => ({
  type: Sequelize.INTEGER,
  allowNull: true,
  references: { model: 'Users', key: 'id' },
  onUpdate: 'CASCADE',
  onDelete: 'SET NULL'
});

module.exports = {
  async up(queryInterface, Sequelize) {
    if (await hasTable(queryInterface, 'Projects')) {
      const projectColumns = await queryInterface.describeTable('Projects');
      if (!projectColumns.leadUserId) {
        await queryInterface.addColumn('Projects', 'leadUserId', nullableUserReference(Sequelize));
      }
      if (!projectColumns.leadGrantedByUserId) {
        await queryInterface.addColumn('Projects', 'leadGrantedByUserId', nullableUserReference(Sequelize));
      }
      if (!projectColumns.leadGrantedAt) {
        await queryInterface.addColumn('Projects', 'leadGrantedAt', { type: Sequelize.DATE, allowNull: true });
      }
      if (!(await hasIndex(queryInterface, 'Projects', 'projects_winery_lead_status'))) {
        await queryInterface.addIndex('Projects', ['wineryId', 'leadUserId', 'status'], {
          name: 'projects_winery_lead_status'
        });
      }
    }

    if (await hasTable(queryInterface, 'ProjectItems')) {
      const itemColumns = await queryInterface.describeTable('ProjectItems');
      if (!itemColumns.linkType) {
        await queryInterface.addColumn('ProjectItems', 'linkType', {
          type: Sequelize.ENUM('REFERENCE', 'DELEGATED_WORK'),
          allowNull: false,
          defaultValue: 'REFERENCE'
        });
      }
      if (!(await hasIndex(queryInterface, 'ProjectItems', 'project_items_delegated_lookup'))) {
        await queryInterface.addIndex('ProjectItems', ['wineryId', 'linkType', 'itemType', 'itemId'], {
          name: 'project_items_delegated_lookup'
        });
      }
    }

    if (await hasTable(queryInterface, 'ProjectAuditEvents')) {
      await queryInterface.changeColumn('ProjectAuditEvents', 'eventType', {
        type: Sequelize.ENUM(...PROJECT_AUDIT_EVENTS, ...LEAD_AUDIT_EVENTS),
        allowNull: false
      });
    }
  },

  async down(queryInterface, Sequelize) {
    if (await hasTable(queryInterface, 'ProjectAuditEvents')) {
      await queryInterface.bulkDelete('ProjectAuditEvents', { eventType: LEAD_AUDIT_EVENTS });
      await queryInterface.changeColumn('ProjectAuditEvents', 'eventType', {
        type: Sequelize.ENUM(...PROJECT_AUDIT_EVENTS),
        allowNull: false
      });
    }

    if (await hasTable(queryInterface, 'ProjectItems')) {
      if (await hasIndex(queryInterface, 'ProjectItems', 'project_items_delegated_lookup')) {
        await queryInterface.removeIndex('ProjectItems', 'project_items_delegated_lookup');
      }
      const itemColumns = await queryInterface.describeTable('ProjectItems');
      if (itemColumns.linkType) await queryInterface.removeColumn('ProjectItems', 'linkType');
    }

    if (await hasTable(queryInterface, 'Projects')) {
      if (await hasIndex(queryInterface, 'Projects', 'projects_winery_lead_status')) {
        await queryInterface.removeIndex('Projects', 'projects_winery_lead_status');
      }
      const projectColumns = await queryInterface.describeTable('Projects');
      for (const columnName of ['leadGrantedAt', 'leadGrantedByUserId', 'leadUserId']) {
        if (projectColumns[columnName]) await queryInterface.removeColumn('Projects', columnName);
      }
    }
  }
};
