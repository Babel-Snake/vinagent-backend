'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Temporarily change column to VARCHAR to safely update data without ENUM constraints
    await queryInterface.sequelize.query(`ALTER TABLE Tasks MODIFY COLUMN status VARCHAR(255) NOT NULL DEFAULT 'PENDING';`);

    // 2. Map existing data to the new statuses
    await queryInterface.sequelize.query(`UPDATE Tasks SET status = 'PENDING' WHERE status IN ('PENDING_REVIEW', 'IN_PROGRESS', 'AWAITING_MEMBER_ACTION');`);
    await queryInterface.sequelize.query(`UPDATE Tasks SET status = 'ACTIONED' WHERE status IN ('APPROVED', 'EXECUTED');`);
    await queryInterface.sequelize.query(`UPDATE Tasks SET status = 'REJECTED' WHERE status = 'CANCELLED';`);

    // 2b. Map TaskAction data
    await queryInterface.sequelize.query(`ALTER TABLE TaskActions MODIFY COLUMN actionType VARCHAR(255) NOT NULL;`);
    await queryInterface.sequelize.query(`UPDATE TaskActions SET actionType = 'ACTIONED' WHERE actionType IN ('APPROVED', 'EXECUTED');`);

    // 3. Re-apply ENUM constraint with only the 3 permitted statuses
    await queryInterface.sequelize.query(`ALTER TABLE Tasks MODIFY COLUMN status ENUM('PENDING', 'ACTIONED', 'REJECTED') NOT NULL DEFAULT 'PENDING';`);
    await queryInterface.sequelize.query(`ALTER TABLE TaskActions MODIFY COLUMN actionType ENUM('CREATED', 'ACTIONED', 'REJECTED', 'EXECUTION_TRIGGERED', 'UPDATED_PAYLOAD', 'NOTE_ADDED', 'MANUAL_CREATED', 'MANUAL_UPDATE', 'ASSIGNED', 'LINKED_TASK') NOT NULL;`);
  },

  async down(queryInterface, Sequelize) {
    // For local dev, a simple down structure. In a real environment restoring exactly is hard
    // because we lost the granularity of 'AWAITING_MEMBER_ACTION' vs 'PENDING_REVIEW'.
    await queryInterface.sequelize.query(`ALTER TABLE Tasks MODIFY COLUMN status VARCHAR(255) NOT NULL DEFAULT 'PENDING_REVIEW';`);
    await queryInterface.sequelize.query(`UPDATE Tasks SET status = 'PENDING_REVIEW' WHERE status = 'PENDING';`);
    await queryInterface.sequelize.query(`UPDATE Tasks SET status = 'EXECUTED' WHERE status = 'ACTIONED';`);
    await queryInterface.sequelize.query(`ALTER TABLE Tasks MODIFY COLUMN status ENUM('PENDING_REVIEW', 'IN_PROGRESS', 'APPROVED', 'AWAITING_MEMBER_ACTION', 'REJECTED', 'EXECUTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING_REVIEW';`);
  }
};
