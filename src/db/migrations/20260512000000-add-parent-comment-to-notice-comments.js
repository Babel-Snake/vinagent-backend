'use strict';

async function hasColumn(queryInterface, tableName, columnName) {
  const table = await queryInterface.describeTable(tableName);
  return Boolean(table[columnName]);
}

async function hasIndex(queryInterface, tableName, indexName) {
  const indexes = await queryInterface.showIndex(tableName);
  return indexes.some((index) => index.name === indexName);
}

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await hasColumn(queryInterface, 'NoticeComments', 'parentCommentId'))) {
      await queryInterface.addColumn('NoticeComments', 'parentCommentId', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'NoticeComments', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        after: 'userId'
      });
    }

    if (!(await hasIndex(queryInterface, 'NoticeComments', 'idx_notice_comments_parent_comment'))) {
      await queryInterface.addIndex('NoticeComments', ['parentCommentId', 'createdAt'], {
        name: 'idx_notice_comments_parent_comment'
      });
    }
  },

  async down(queryInterface) {
    if (await hasIndex(queryInterface, 'NoticeComments', 'idx_notice_comments_parent_comment')) {
      await queryInterface.removeIndex('NoticeComments', 'idx_notice_comments_parent_comment');
    }

    if (await hasColumn(queryInterface, 'NoticeComments', 'parentCommentId')) {
      await queryInterface.removeColumn('NoticeComments', 'parentCommentId');
    }
  }
};
