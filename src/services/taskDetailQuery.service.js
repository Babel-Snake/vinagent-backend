const { Member, Message, Task, TaskAction, TaskStep, User } = require('../models');
const noticeService = require('./notice.service');
const recordVisibility = require('./recordVisibility.service');
const taskDeadlineService = require('./taskDeadline.service');
const { getTaskAreaInclude } = require('./taskArea.service');

async function getTaskById({ taskId, wineryId, userId = null, userRole = null }) {
  const task = await Task.findOne({
    where: { id: taskId, wineryId },
    include: [
      { model: Member },
      { model: Message },
      {
        model: Task,
        as: 'ParentTask',
        attributes: ['id', 'category', 'subType', 'status', 'resolvedAs', 'resolutionType', 'customerOutcome', 'resolvedAt']
      },
      {
        model: Message,
        as: 'Messages',
        separate: true,
        order: [['receivedAt', 'ASC'], ['id', 'ASC']],
        limit: 100
      },
      { model: User, as: 'Creator', attributes: ['id', 'displayName'] },
      { model: User, as: 'Assignee', attributes: ['id', 'displayName', 'email', 'role'] },
      getTaskAreaInclude(),
      {
        model: TaskStep,
        as: 'TaskSteps',
        separate: true,
        order: [['sortOrder', 'ASC'], ['id', 'ASC']],
        include: [{ model: User, as: 'Owner', attributes: ['id', 'displayName', 'email', 'role'] }]
      },
      {
        model: TaskAction,
        separate: true,
        order: [['createdAt', 'DESC']],
        limit: 50,
        include: [{ model: User, attributes: ['id', 'displayName', 'role'] }]
      },
      {
        model: Task,
        as: 'SubTasks',
        separate: true,
        order: [['dueAt', 'ASC'], ['id', 'ASC']],
        include: [
          { model: User, as: 'Assignee', attributes: ['id', 'displayName', 'email', 'role'] },
          { model: Member, attributes: ['id', 'firstName', 'lastName', 'email', 'phone'] }
        ]
      },
      noticeService.getLinkedNoticeInclude()
    ]
  });

  if (!task) {
    const err = new Error('Task not found');
    err.statusCode = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  if (userId && userRole) {
    await recordVisibility.assertCanViewTask(task, { wineryId, userId, userRole });
    const visibleNotices = [];
    for (const notice of task.LinkedNotices || []) {
      if (await recordVisibility.canViewNotice(notice, { wineryId, userId, userRole })) {
        visibleNotices.push(notice);
      }
    }
    task.setDataValue('LinkedNotices', visibleNotices);
  }

  return taskDeadlineService.attachDeadlineState(task);
}

module.exports = {
  getTaskById
};
